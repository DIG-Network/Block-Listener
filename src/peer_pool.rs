use crate::error::ChiaError;
use crate::event_emitter::{
    BlockReceivedEvent, ChiaBlockListener, PeerConnectedEvent, PeerDisconnectedEvent,
};
use crate::peer::PeerConnection;
use chia_generator_parser::parser::BlockParser;
use chia_protocol::FullBlock;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio::time::sleep;
use tracing::{debug, error, info};

const RATE_LIMIT_MS: u64 = 500;

pub type PeerConnectedCallback = Box<dyn Fn(PeerConnectedEvent) + Send + Sync + 'static>;
pub type PeerDisconnectedCallback = Box<dyn Fn(PeerDisconnectedEvent) + Send + Sync + 'static>;
pub type NewPeakHeightCallback = Box<dyn Fn(NewPeakHeightEvent) + Send + Sync + 'static>;

#[derive(Debug, Clone)]
pub struct NewPeakHeightEvent {
    pub old_peak: Option<u32>,
    pub new_peak: u32,
    pub peer_id: String,
}

pub struct ChiaPeerPool {
    inner: Arc<RwLock<ChiaPeerPoolInner>>,
    request_sender: mpsc::Sender<PoolRequest>,
    connected_callback: Arc<RwLock<Option<PeerConnectedCallback>>>,
    disconnected_callback: Arc<RwLock<Option<PeerDisconnectedCallback>>>,
    new_peak_callback: Arc<RwLock<Option<NewPeakHeightCallback>>>,
}

struct ChiaPeerPoolInner {
    peers: HashMap<String, PeerInfo>,
    peer_ids: Vec<String>, // For round-robin
    current_index: usize,
    highest_peak: Option<u32>,
}

struct PeerInfo {
    last_used: Instant,
    is_connected: bool,
    worker_tx: Option<mpsc::Sender<WorkerRequest>>,
    peak_height: Option<u32>,
}

enum PoolRequest {
    GetBlockByHeight {
        height: u64,
        response_tx: oneshot::Sender<Result<BlockReceivedEvent, ChiaError>>,
    },
}

enum WorkerRequest {
    GetBlock {
        height: u64,
        response_tx: oneshot::Sender<Result<FullBlock, ChiaError>>,
    },
    Shutdown,
}

impl ChiaPeerPool {
    pub fn new() -> Self {
        let (request_sender, request_receiver) = mpsc::channel(100);
        let inner = Arc::new(RwLock::new(ChiaPeerPoolInner {
            peers: HashMap::new(),
            peer_ids: Vec::new(),
            current_index: 0,
            highest_peak: None,
        }));

        let pool = Self {
            inner: inner.clone(),
            request_sender,
            connected_callback: Arc::new(RwLock::new(None)),
            disconnected_callback: Arc::new(RwLock::new(None)),
            new_peak_callback: Arc::new(RwLock::new(None)),
        };

        // Start the request processor
        pool.start_request_processor(request_receiver);

        pool
    }

    pub fn set_event_callbacks(
        &self,
        connected_callback: PeerConnectedCallback,
        disconnected_callback: PeerDisconnectedCallback,
        new_peak_callback: NewPeakHeightCallback,
    ) {
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            *self.connected_callback.write().await = Some(connected_callback);
            *self.disconnected_callback.write().await = Some(disconnected_callback);
            *self.new_peak_callback.write().await = Some(new_peak_callback);
        });
    }

    async fn emit_peer_connected(&self, peer_id: String, host: String, port: u16) {
        if let Some(callback) = &*self.connected_callback.read().await {
            callback(PeerConnectedEvent {
                peer_id,
                host,
                port: port as u32,
            });
        }
    }

    pub async fn add_peer(
        &self,
        host: String,
        port: u16,
        network_id: String,
    ) -> Result<String, ChiaError> {
        info!("Adding peer to pool: {}:{}", host, port);

        let peer_connection = PeerConnection::new(host.clone(), port, network_id);
        let peer_id = format!("{host}:{port}");

        // Create worker for this peer
        let (worker_tx, worker_rx) = mpsc::channel(10);
        let peer_conn_clone = peer_connection.clone();
        let peer_id_clone = peer_id.clone();
        let host_clone = host.clone();
        let disconnected_callback = self.disconnected_callback.clone();
        let new_peak_callback = self.new_peak_callback.clone();

        let inner_clone = self.inner.clone();
        tokio::spawn(async move {
            Self::peer_worker(
                worker_rx,
                peer_conn_clone,
                peer_id_clone,
                host_clone,
                port,
                disconnected_callback,
                inner_clone,
                new_peak_callback,
            )
            .await;
        });

        let mut guard = self.inner.write().await;
        guard.peers.insert(
            peer_id.clone(),
            PeerInfo {
                last_used: Instant::now()
                    .checked_sub(Duration::from_millis(RATE_LIMIT_MS))
                    .unwrap_or(Instant::now()),
                is_connected: true,
                worker_tx: Some(worker_tx),
                peak_height: None,
            },
        );
        guard.peer_ids.push(peer_id.clone());

        // Emit connected event
        self.emit_peer_connected(peer_id.clone(), host, port).await;

        Ok(peer_id)
    }

    pub async fn get_block_by_height(&self, height: u64) -> Result<BlockReceivedEvent, ChiaError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.request_sender
            .send(PoolRequest::GetBlockByHeight {
                height,
                response_tx,
            })
            .await
            .map_err(|_| ChiaError::Connection("Failed to send request to pool".to_string()))?;

        response_rx.await.map_err(|_| {
            ChiaError::Connection("Failed to receive response from pool".to_string())
        })?
    }

    pub async fn remove_peer(&self, peer_id: String) -> Result<bool, ChiaError> {
        let mut guard = self.inner.write().await;

        if let Some(mut peer_info) = guard.peers.remove(&peer_id) {
            if let Some(worker_tx) = peer_info.worker_tx.take() {
                let _ = worker_tx.send(WorkerRequest::Shutdown).await;
            }

            guard.peer_ids.retain(|id| id != &peer_id);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn shutdown(&self) -> Result<(), ChiaError> {
        let mut guard = self.inner.write().await;

        for (_, mut peer_info) in guard.peers.drain() {
            if let Some(worker_tx) = peer_info.worker_tx.take() {
                let _ = worker_tx.send(WorkerRequest::Shutdown).await;
            }
        }

        guard.peer_ids.clear();
        Ok(())
    }

    pub async fn get_connected_peers(&self) -> Result<Vec<String>, ChiaError> {
        let guard = self.inner.read().await;
        Ok(guard.peer_ids.clone())
    }

    pub async fn get_highest_peak(&self) -> Option<u32> {
        self.inner.read().await.highest_peak
    }

    fn start_request_processor(&self, mut receiver: mpsc::Receiver<PoolRequest>) {
        let inner = self.inner.clone();

        tokio::spawn(async move {
            let mut request_queue: VecDeque<PoolRequest> = VecDeque::new();

            loop {
                // Try to process queued requests
                if !request_queue.is_empty() {
                    let mut guard = inner.write().await;

                    // Find an available peer
                    let now = Instant::now();
                    let mut available_peer = None;

                    for _ in 0..guard.peer_ids.len() {
                        let peer_id = guard.peer_ids[guard.current_index].clone();
                        guard.current_index = (guard.current_index + 1) % guard.peer_ids.len();

                        if let Some(peer_info) = guard.peers.get(&peer_id) {
                            if peer_info.is_connected {
                                let time_since_last_use = now.duration_since(peer_info.last_used);
                                if time_since_last_use >= Duration::from_millis(RATE_LIMIT_MS) {
                                    available_peer = Some(peer_id);
                                    break;
                                }
                            }
                        }
                    }

                    if let Some(peer_id) = available_peer {
                        if let Some(request) = request_queue.pop_front() {
                            if let Some(peer_info) = guard.peers.get_mut(&peer_id) {
                                peer_info.last_used = now;

                                match request {
                                    PoolRequest::GetBlockByHeight {
                                        height,
                                        response_tx,
                                    } => {
                                        if let Some(worker_tx) = &peer_info.worker_tx {
                                            let (worker_response_tx, worker_response_rx) =
                                                oneshot::channel();

                                            if worker_tx
                                                .send(WorkerRequest::GetBlock {
                                                    height,
                                                    response_tx: worker_response_tx,
                                                })
                                                .await
                                                .is_err()
                                            {
                                                error!("Failed to send request to worker");
                                                let _ =
                                                    response_tx.send(Err(ChiaError::Connection(
                                                        "Worker channel closed".to_string(),
                                                    )));
                                                continue;
                                            }

                                            // Process response in background
                                            tokio::spawn(async move {
                                                match worker_response_rx.await {
                                                    Ok(Ok(full_block)) => {
                                                        // Parse the block
                                                        let parser = BlockParser::new();
                                                        match parser.parse_full_block(&full_block) {
                                                            Ok(parsed_block) => {
                                                                let block_event = ChiaBlockListener::convert_parsed_block_to_external(
                                                                    &parsed_block,
                                                                    peer_id,
                                                                );
                                                                let _ = response_tx
                                                                    .send(Ok(block_event));
                                                            }
                                                            Err(e) => {
                                                                let _ = response_tx.send(Err(
                                                                    ChiaError::Protocol(format!("Failed to parse block: {e}")),
                                                                ));
                                                            }
                                                        }
                                                    }
                                                    Ok(Err(e)) => {
                                                        let _ = response_tx.send(Err(e));
                                                    }
                                                    Err(_) => {
                                                        let _ = response_tx.send(Err(
                                                            ChiaError::Connection(
                                                                "Worker dropped response"
                                                                    .to_string(),
                                                            ),
                                                        ));
                                                    }
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }

                    drop(guard);
                }

                // Check for new requests or wait
                tokio::select! {
                    Some(request) = receiver.recv() => {
                        request_queue.push_back(request);
                    }
                    _ = sleep(Duration::from_millis(50)) => {
                        // Continue processing queue
                    }
                }
            }
        });
    }

    async fn peer_worker(
        mut receiver: mpsc::Receiver<WorkerRequest>,
        peer_connection: PeerConnection,
        peer_id: String,
        host: String,
        port: u16,
        disconnected_callback: Arc<RwLock<Option<PeerDisconnectedCallback>>>,
        inner: Arc<RwLock<ChiaPeerPoolInner>>,
        new_peak_callback: Arc<RwLock<Option<NewPeakHeightCallback>>>,
    ) {
        info!("Starting worker for peer {}", peer_id);

        while let Some(request) = receiver.recv().await {
            match request {
                WorkerRequest::GetBlock {
                    height,
                    response_tx,
                } => {
                    debug!("Worker {} fetching block at height {}", peer_id, height);

                    // Create a new connection for this request
                    match peer_connection.connect().await {
                        Ok(mut ws_stream) => {
                            // Perform handshake
                            if let Err(e) = peer_connection.handshake(&mut ws_stream).await {
                                error!("Handshake failed for {}: {}", peer_id, e);
                                let _ = response_tx.send(Err(e));
                                continue;
                            }

                            match peer_connection
                                .request_block_by_height(height, &mut ws_stream)
                                .await
                            {
                                Ok(block) => {
                                    match BlockParser::new().parse_full_block(&block) {
                                        Ok(parsed_block) => {
                                            info!(
                                                "Worker {} parsed block at height {}",
                                                peer_id, parsed_block.height
                                            );

                                            // Update peak height for this peer if this is higher than what we've seen
                                            let mut guard = inner.write().await;
                                            if let Some(peer_info) = guard.peers.get_mut(&peer_id) {
                                                match peer_info.peak_height {
                                                    Some(current_peak) => {
                                                        if parsed_block.height > current_peak {
                                                            peer_info.peak_height =
                                                                Some(parsed_block.height);
                                                        }
                                                    }
                                                    None => {
                                                        peer_info.peak_height =
                                                            Some(parsed_block.height);
                                                    }
                                                }
                                            }

                                            // Update global highest peak
                                            let old_peak = guard.highest_peak;
                                            match guard.highest_peak {
                                                Some(current_highest) => {
                                                    if parsed_block.height > current_highest {
                                                        guard.highest_peak =
                                                            Some(parsed_block.height);
                                                        info!(
                                                            "New highest peak from block fetch: {}",
                                                            parsed_block.height
                                                        );
                                                        drop(guard);

                                                        // Emit new peak event
                                                        if let Some(callback) =
                                                            &*new_peak_callback.read().await
                                                        {
                                                            callback(NewPeakHeightEvent {
                                                                old_peak,
                                                                new_peak: parsed_block.height,
                                                                peer_id: peer_id.clone(),
                                                            });
                                                        }
                                                    } else {
                                                        drop(guard);
                                                    }
                                                }
                                                None => {
                                                    guard.highest_peak = Some(parsed_block.height);
                                                    info!(
                                                        "Initial peak height from block fetch: {}",
                                                        parsed_block.height
                                                    );
                                                    drop(guard);

                                                    // Emit new peak event
                                                    if let Some(callback) =
                                                        &*new_peak_callback.read().await
                                                    {
                                                        callback(NewPeakHeightEvent {
                                                            old_peak,
                                                            new_peak: parsed_block.height,
                                                            peer_id: peer_id.clone(),
                                                        });
                                                    }
                                                }
                                            }

                                            let _ = response_tx.send(Ok(block));
                                        }
                                        Err(e) => {
                                            let _ = response_tx.send(Err(ChiaError::Protocol(
                                                format!("Failed to parse block: {e}"),
                                            )));
                                        }
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to get block: {}", e);
                                    let _ = response_tx.send(Err(e));
                                }
                            }
                        }
                        Err(e) => {
                            error!("Connection failed for {}: {}", peer_id, e);
                            let _ = response_tx.send(Err(e));
                        }
                    }
                }
                WorkerRequest::Shutdown => {
                    info!("Shutting down worker for peer {}", peer_id);
                    break;
                }
            }
        }

        // Emit disconnected event when worker shuts down
        if let Some(callback) = &*disconnected_callback.read().await {
            callback(PeerDisconnectedEvent {
                peer_id,
                host,
                port: port as u32,
                message: Some("Worker shutdown".to_string()),
            });
        }
    }
}
