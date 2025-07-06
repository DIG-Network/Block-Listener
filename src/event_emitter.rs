use crate::peer::PeerConnection;
use chia_protocol::FullBlock;
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, Env, JsObject,
};
use napi_derive::napi;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::{mpsc, RwLock, oneshot};
use tracing::{error, info, warn};

#[napi]
pub struct ChiaBlockListener {
    inner: Arc<RwLock<ChiaBlockListenerInner>>,
}

struct ChiaBlockListenerInner {
    peers: HashMap<u32, PeerConnectionInfo>,
    next_peer_id: u32,
    is_running: bool,
    block_sender: mpsc::Sender<BlockEvent>,
    event_sender: mpsc::Sender<PeerEvent>,
}

struct PeerConnectionInfo {
    connection: PeerConnection,
    disconnect_tx: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
struct BlockEvent {
    peer_id: u32,
    block: BlockData,
}

#[derive(Clone)]
struct PeerEvent {
    event_type: PeerEventType,
    peer_id: u32,
    host: String,
    port: u16,
    message: Option<String>,
}

#[derive(Clone)]
enum PeerEventType {
    Connected,
    Disconnected,
    Error,
}

#[derive(Clone)]
struct BlockData {
    height: u32,
    weight: String,
    header_hash: String,
    timestamp: Option<u32>,
}

#[napi]
impl ChiaBlockListener {
    #[napi(constructor)]
    pub fn new() -> Self {
        let (block_sender, _) = mpsc::channel(100);
        let (event_sender, _) = mpsc::channel(100);
        
        Self {
            inner: Arc::new(RwLock::new(ChiaBlockListenerInner {
                peers: HashMap::new(),
                next_peer_id: 1,
                is_running: false,
                block_sender,
                event_sender,
            })),
        }
    }

    #[napi]
    pub fn add_peer(
        &self,
        host: String,
        port: u16,
        network_id: String,
        tls_cert: Buffer,
        tls_key: Buffer,
        ca_cert: Buffer,
    ) -> Result<u32> {
        let peer = PeerConnection::new(
            host.clone(),
            port,
            network_id,
            tls_cert.to_vec(),
            tls_key.to_vec(),
            ca_cert.to_vec(),
        );
        
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        let peer_id = rt.block_on(async {
            let mut guard = inner.write().await;
            let peer_id = guard.next_peer_id;
            guard.next_peer_id += 1;
            
            guard.peers.insert(peer_id, PeerConnectionInfo {
                connection: peer,
                disconnect_tx: None,
            });
            
            peer_id
        });
        
        info!("Added peer {} with ID {}", host, peer_id);
        Ok(peer_id)
    }

    #[napi]
    pub fn disconnect_peer(&self, peer_id: u32) -> Result<bool> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        let disconnected = rt.block_on(async {
            let mut guard = inner.write().await;
            if let Some(mut peer_info) = guard.peers.remove(&peer_id) {
                if let Some(disconnect_tx) = peer_info.disconnect_tx.take() {
                    let _ = disconnect_tx.send(());
                }
                true
            } else {
                false
            }
        });
        
        Ok(disconnected)
    }

    #[napi]
    pub fn start(&self, env: Env, block_callback: JsFunction, event_callback: JsFunction) -> Result<()> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        let is_running = rt.block_on(async {
            let guard = inner.read().await;
            guard.is_running
        });
        
        if is_running {
            return Err(Error::new(Status::GenericFailure, "Already running"));
        }

        // Create threadsafe functions for callbacks
        let block_tsfn: ThreadsafeFunction<BlockEvent, ErrorStrategy::CalleeHandled> = block_callback
            .create_threadsafe_function(0, |ctx| {
                let event: &BlockEvent = &ctx.value;
                let mut obj = ctx.env.create_object()?;
                
                obj.set_named_property("peerId", ctx.env.create_uint32(event.peer_id)?)?;
                obj.set_named_property("height", ctx.env.create_uint32(event.block.height)?)?;
                obj.set_named_property("weight", ctx.env.create_string(&event.block.weight)?)?;
                obj.set_named_property("header_hash", ctx.env.create_string(&event.block.header_hash)?)?;
                obj.set_named_property("timestamp", ctx.env.create_uint32(event.block.timestamp.unwrap_or(0))?)?;
                
                Ok(vec![obj])
            })?;

        let event_tsfn: ThreadsafeFunction<PeerEvent, ErrorStrategy::CalleeHandled> = event_callback
            .create_threadsafe_function(0, |ctx| {
                let event: &PeerEvent = &ctx.value;
                let mut obj = ctx.env.create_object()?;
                
                let event_type = match event.event_type {
                    PeerEventType::Connected => "connected",
                    PeerEventType::Disconnected => "disconnected", 
                    PeerEventType::Error => "error",
                };
                
                obj.set_named_property("type", ctx.env.create_string(event_type)?)?;
                obj.set_named_property("peerId", ctx.env.create_uint32(event.peer_id)?)?;
                obj.set_named_property("host", ctx.env.create_string(&event.host)?)?;
                obj.set_named_property("port", ctx.env.create_uint32(event.port as u32)?)?;
                
                if let Some(msg) = &event.message {
                    obj.set_named_property("message", ctx.env.create_string(msg)?)?;
                }
                
                Ok(vec![obj])
            })?;

        // Start event listeners
        let inner_clone = self.inner.clone();
        rt.spawn(async move {
            let (mut block_rx, mut event_rx) = {
                let mut guard = inner_clone.write().await;
                guard.is_running = true;
                
                let (block_tx, block_rx) = mpsc::channel(100);
                let (event_tx, event_rx) = mpsc::channel(100);
                
                guard.block_sender = block_tx;
                guard.event_sender = event_tx;
                
                (block_rx, event_rx)
            };
            
            // Spawn block event handler
            let block_tsfn_clone = block_tsfn.clone();
            tokio::spawn(async move {
                while let Some(event) = block_rx.recv().await {
                    block_tsfn_clone.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
                }
            });
            
            // Spawn peer event handler
            let event_tsfn_clone = event_tsfn.clone();
            tokio::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    event_tsfn_clone.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
                }
            });
            
            // Start peer connections
            let peers_to_connect = {
                let guard = inner_clone.read().await;
                guard.peers.iter().map(|(id, info)| (*id, info.connection.clone())).collect::<Vec<_>>()
            };
            
            for (peer_id, peer) in peers_to_connect {
                let inner_clone = inner_clone.clone();
                let (disconnect_tx, disconnect_rx) = oneshot::channel();
                
                // Store disconnect channel
                {
                    let mut guard = inner_clone.write().await;
                    if let Some(peer_info) = guard.peers.get_mut(&peer_id) {
                        peer_info.disconnect_tx = Some(disconnect_tx);
                    }
                }
                
                tokio::spawn(async move {
                    let host = peer.host().to_string();
                    let port = peer.port();
                    
                    // Send connected event
                    {
                        let guard = inner_clone.read().await;
                        let _ = guard.event_sender.send(PeerEvent {
                            event_type: PeerEventType::Connected,
                            peer_id,
                            host: host.clone(),
                            port,
                            message: None,
                        }).await;
                    }
                    
                    match peer.connect().await {
                        Ok(mut ws_stream) => {
                            info!("Connected to peer {} (ID: {})", host, peer_id);
                            
                            if let Err(e) = peer.handshake(&mut ws_stream).await {
                                error!("Handshake failed for peer {} (ID: {}): {}", host, peer_id, e);
                                let guard = inner_clone.read().await;
                                let _ = guard.event_sender.send(PeerEvent {
                                    event_type: PeerEventType::Error,
                                    peer_id,
                                    host: host.clone(),
                                    port,
                                    message: Some(format!("Handshake failed: {}", e)),
                                }).await;
                                return;
                            }
                            
                            // Create block sender for this peer
                            let block_sender = {
                                let guard = inner_clone.read().await;
                                guard.block_sender.clone()
                            };
                            
                            let (block_tx, mut block_rx) = mpsc::channel(100);
                            
                            // Spawn block listener
                            let inner_for_listener = inner_clone.clone();
                            let host_for_listener = host.clone();
                            tokio::spawn(async move {
                                tokio::select! {
                                    result = PeerConnection::listen_for_blocks(ws_stream, block_tx) => {
                                        match result {
                                            Ok(_) => info!("Peer {} (ID: {}) disconnected normally", host_for_listener, peer_id),
                                            Err(e) => {
                                                error!("Error listening to peer {} (ID: {}): {}", host_for_listener, peer_id, e);
                                                let guard = inner_for_listener.read().await;
                                                let _ = guard.event_sender.send(PeerEvent {
                                                    event_type: PeerEventType::Error,
                                                    peer_id,
                                                    host: host_for_listener.clone(),
                                                    port,
                                                    message: Some(e.to_string()),
                                                }).await;
                                            }
                                        }
                                    }
                                    _ = disconnect_rx => {
                                        info!("Peer {} (ID: {}) disconnected by request", host_for_listener, peer_id);
                                    }
                                }
                                
                                // Send disconnected event
                                let guard = inner_for_listener.read().await;
                                let _ = guard.event_sender.send(PeerEvent {
                                    event_type: PeerEventType::Disconnected,
                                    peer_id,
                                    host: host_for_listener,
                                    port,
                                    message: Some("Connection closed".to_string()),
                                }).await;
                            });
                            
                            // Forward blocks with peer ID
                            while let Some(block) = block_rx.recv().await {
                                let block_data = BlockData {
                                    height: block.reward_chain_block.height,
                                    weight: block.reward_chain_block.weight.to_string(),
                                    header_hash: hex::encode(block.header_hash()),
                                    timestamp: block.foliage_transaction_block.as_ref().map(|f| f.timestamp as u32),
                                };
                                
                                let _ = block_sender.send(BlockEvent {
                                    peer_id,
                                    block: block_data,
                                }).await;
                            }
                        }
                        Err(e) => {
                            error!("Failed to connect to peer {} (ID: {}): {}", host, peer_id, e);
                            let guard = inner_clone.read().await;
                            let _ = guard.event_sender.send(PeerEvent {
                                event_type: PeerEventType::Error,
                                peer_id,
                                host,
                                port,
                                message: Some(format!("Connection failed: {}", e)),
                            }).await;
                        }
                    }
                });
            }
        });

        Ok(())
    }

    #[napi]
    pub fn stop(&self) -> Result<()> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        rt.block_on(async {
            let mut guard = inner.write().await;
            guard.is_running = false;
            
            // Disconnect all peers
            let peer_ids: Vec<u32> = guard.peers.keys().cloned().collect();
            for peer_id in peer_ids {
                if let Some(mut peer_info) = guard.peers.remove(&peer_id) {
                    if let Some(disconnect_tx) = peer_info.disconnect_tx.take() {
                        let _ = disconnect_tx.send(());
                    }
                }
            }
        });
        
        info!("Stopping block listener");
        Ok(())
    }

    #[napi]
    pub fn is_running(&self) -> Result<bool> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        Ok(rt.block_on(async {
            let guard = inner.read().await;
            guard.is_running
        }))
    }

    #[napi]
    pub fn get_connected_peers(&self) -> Result<Vec<u32>> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        Ok(rt.block_on(async {
            let guard = inner.read().await;
            guard.peers.keys().cloned().collect()
        }))
    }
}

// Helper function to load certificates from files
#[napi]
pub fn load_chia_certs(env: Env, chia_root: String) -> Result<JsObject> {
    use std::fs;
    
    let cert_path = format!("{}/config/ssl/full_node/private_full_node.crt", chia_root);
    let key_path = format!("{}/config/ssl/full_node/private_full_node.key", chia_root);
    let ca_path = format!("{}/config/ssl/ca/chia_ca.crt", chia_root);
    
    let cert = fs::read(&cert_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read cert: {}", e)))?;
    let key = fs::read(&key_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read key: {}", e)))?;
    let ca = fs::read(&ca_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read CA: {}", e)))?;
    
    let mut obj = env.create_object()?;
    obj.set_named_property("cert", env.create_buffer_with_data(cert)?.into_raw())?;
    obj.set_named_property("key", env.create_buffer_with_data(key)?.into_raw())?;
    obj.set_named_property("ca", env.create_buffer_with_data(ca)?.into_raw())?;
    
    Ok(obj)
}