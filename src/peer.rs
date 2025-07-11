use crate::{error::ChiaError, tls};
use chia_protocol::{
    FullBlock, Handshake as ChiaHandshake, NewPeakWallet, NodeType, ProtocolMessageTypes,
    RequestBlock, RespondBlock,
};
use chia_traits::Streamable;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async_tls_with_config, tungstenite::Message as WsMessage, Connector, MaybeTlsStream,
    WebSocketStream,
};
use tracing::{debug, error, info, warn};

type WebSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

// Add PeerSession to manage persistent connections
pub struct PeerSession {
    peer: PeerConnection,
    ws_stream: Option<WebSocket>,
    last_request_time: std::time::Instant,
}

impl PeerSession {
    pub fn new(peer: PeerConnection) -> Self {
        Self {
            peer,
            ws_stream: None,
            last_request_time: std::time::Instant::now() - std::time::Duration::from_secs(1), // Allow immediate first request
        }
    }

    pub async fn ensure_connected(&mut self) -> Result<&mut WebSocket, ChiaError> {
        if self.ws_stream.is_none() {
            info!(
                "Creating new connection to {}:{}",
                self.peer.host, self.peer.port
            );
            let mut ws_stream = self.peer.connect().await?;
            self.peer.handshake(&mut ws_stream).await?;
            self.ws_stream = Some(ws_stream);
        }

        Ok(self.ws_stream.as_mut().unwrap())
    }

    pub async fn request_block_by_height(&mut self, height: u64) -> Result<FullBlock, ChiaError> {
        // Enforce rate limiting - wait if necessary
        let elapsed = self.last_request_time.elapsed();
        let min_interval = std::time::Duration::from_millis(200);
        if elapsed < min_interval {
            let wait_time = min_interval - elapsed;
            tokio::time::sleep(wait_time).await;
        }

        // Update last request time
        self.last_request_time = std::time::Instant::now();

        // Ensure we're connected first
        self.ensure_connected().await?;

        // Try to request the block using the existing connection
        let result = {
            let ws_stream = self.ws_stream.as_mut().unwrap();
            self.peer.request_block_by_height(height, ws_stream).await
        };

        match result {
            Ok(block) => Ok(block),
            Err(e) => {
                // If the request failed, try reconnecting once
                warn!("Block request failed, attempting to reconnect: {}", e);
                self.ws_stream = None;
                self.ensure_connected().await?;
                let ws_stream = self.ws_stream.as_mut().unwrap();
                self.peer.request_block_by_height(height, ws_stream).await
            }
        }
    }

    pub async fn get_peak_height(&mut self) -> Result<u32, ChiaError> {
        let ws_stream = self.ensure_connected().await?;

        // Send request for sync status or wait for NewPeakWallet
        // For now, just wait for the first NewPeakWallet message
        // In a real implementation, we might want to send a specific request

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(WsMessage::Binary(data)) => {
                    if let Ok(message) = chia_protocol::Message::from_bytes(&data) {
                        if message.msg_type == ProtocolMessageTypes::NewPeakWallet {
                            if let Ok(new_peak) = NewPeakWallet::from_bytes(&message.data) {
                                return Ok(new_peak.height);
                            }
                        }
                    }
                }
                Ok(WsMessage::Close(_)) => {
                    self.ws_stream = None;
                    return Err(ChiaError::Connection("Connection closed".to_string()));
                }
                Err(e) => {
                    self.ws_stream = None;
                    return Err(ChiaError::Connection(format!("WebSocket error: {}", e)));
                }
                _ => {}
            }
        }

        Err(ChiaError::Connection(
            "Failed to get peak height".to_string(),
        ))
    }

    pub fn close(&mut self) {
        self.ws_stream = None;
    }
}

#[derive(Clone)]
pub struct PeerConnection {
    host: String,
    port: u16,
    network_id: String,
}

impl PeerConnection {
    pub fn new(host: String, port: u16, network_id: String) -> Self {
        Self {
            host,
            port,
            network_id,
        }
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn connect(&self) -> Result<WebSocket, ChiaError> {
        info!("Connecting to peer at {}:{}", self.host, self.port);

        // Load or generate certificates
        let cert = tls::load_or_generate_cert()?;
        let tls_connector = tls::create_tls_connector(&cert)?;
        let connector = Connector::NativeTls(tls_connector);

        let url = format!("wss://{}:{}/ws", self.host, self.port);

        let (ws_stream, _) = connect_async_tls_with_config(&url, None, false, Some(connector))
            .await
            .map_err(ChiaError::WebSocket)?;

        info!("WebSocket connection established to {}", self.host);
        Ok(ws_stream)
    }

    pub async fn handshake(&self, ws_stream: &mut WebSocket) -> Result<(), ChiaError> {
        info!("Performing Chia handshake with {}", self.host);

        // Send our handshake - matching SDK exactly
        let handshake = ChiaHandshake {
            network_id: self.network_id.clone(),
            protocol_version: "0.0.37".to_string(),
            software_version: "0.0.0".to_string(),
            server_port: 0,              // 0 for wallet clients
            node_type: NodeType::Wallet, // Connect as wallet
            capabilities: vec![
                (1, "1".to_string()), // BASE
                (2, "1".to_string()), // BLOCK_HEADERS
                (3, "1".to_string()), // RATE_LIMITS_V2
            ],
        };

        // Serialize and send handshake
        let handshake_bytes = handshake
            .to_bytes()
            .map_err(|e| ChiaError::Serialization(e.to_string()))?;

        let message = chia_protocol::Message {
            msg_type: ProtocolMessageTypes::Handshake,
            id: None,
            data: handshake_bytes.into(),
        };

        let message_bytes = message
            .to_bytes()
            .map_err(|e| ChiaError::Protocol(e.to_string()))?;

        ws_stream
            .send(WsMessage::Binary(message_bytes))
            .await
            .map_err(ChiaError::WebSocket)?;

        // Wait for peer's handshake
        if let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(WsMessage::Binary(data)) => {
                    let response = chia_protocol::Message::from_bytes(&data)
                        .map_err(|e| ChiaError::Protocol(e.to_string()))?;

                    if response.msg_type == ProtocolMessageTypes::Handshake {
                        // Parse and validate peer's handshake
                        let peer_handshake = ChiaHandshake::from_bytes(&response.data)
                            .map_err(|e| ChiaError::Protocol(e.to_string()))?;

                        if peer_handshake.node_type != NodeType::FullNode {
                            return Err(ChiaError::Protocol(format!(
                                "Expected FullNode, got {:?}",
                                peer_handshake.node_type
                            )));
                        }

                        if peer_handshake.network_id != self.network_id {
                            return Err(ChiaError::Protocol(format!(
                                "Network ID mismatch: expected {}, got {}",
                                self.network_id, peer_handshake.network_id
                            )));
                        }

                        info!(
                            "Handshake successful with {} (protocol: {})",
                            self.host, peer_handshake.protocol_version
                        );
                        Ok(())
                    } else {
                        Err(ChiaError::Protocol(format!(
                            "Expected handshake, got message type {:?}",
                            response.msg_type
                        )))
                    }
                }
                Ok(WsMessage::Close(_)) => Err(ChiaError::Connection(
                    "Peer closed connection during handshake".to_string(),
                )),
                Ok(_) => Err(ChiaError::Protocol("Unexpected message type".to_string())),
                Err(e) => Err(ChiaError::WebSocket(e)),
            }
        } else {
            Err(ChiaError::Connection(
                "Connection closed during handshake".to_string(),
            ))
        }
    }

    pub async fn listen_for_blocks(
        mut ws_stream: WebSocket,
        block_sender: mpsc::Sender<FullBlock>,
    ) -> Result<(), ChiaError> {
        info!("Listening for blocks and messages");

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(WsMessage::Binary(data)) => {
                    match chia_protocol::Message::from_bytes(&data) {
                        Ok(message) => {
                            debug!("Received message type: {:?}", message.msg_type);

                            match message.msg_type {
                                ProtocolMessageTypes::NewPeakWallet => {
                                    if let Ok(new_peak) = NewPeakWallet::from_bytes(&message.data) {
                                        info!(
                                            "New peak at height {} from wallet perspective",
                                            new_peak.height
                                        );

                                        // Request the full block
                                        let request = RequestBlock {
                                            height: new_peak.height,
                                            include_transaction_block: true,
                                        };

                                        if let Ok(request_bytes) = request.to_bytes() {
                                            let request_msg = chia_protocol::Message {
                                                msg_type: ProtocolMessageTypes::RequestBlock,
                                                id: Some(1), // Add request ID
                                                data: request_bytes.into(),
                                            };

                                            if let Ok(msg_bytes) = request_msg.to_bytes() {
                                                if let Err(e) = ws_stream
                                                    .send(WsMessage::Binary(msg_bytes))
                                                    .await
                                                {
                                                    error!("Failed to request block: {}", e);
                                                }
                                            }
                                        }
                                    }
                                }

                                ProtocolMessageTypes::NewPeak => {
                                    // This is for full nodes - we might see this too
                                    debug!("Received NewPeak (full node message)");
                                }

                                ProtocolMessageTypes::RespondBlock => {
                                    match RespondBlock::from_bytes(&message.data) {
                                        Ok(respond_block) => {
                                            let block = respond_block.block;
                                            info!(
                                                "Received block at height {}",
                                                block.reward_chain_block.height
                                            );

                                            if let Err(e) = block_sender.send(block).await {
                                                error!(
                                                    "Failed to send block through channel: {}",
                                                    e
                                                );
                                                break;
                                            }
                                        }
                                        Err(e) => {
                                            error!("Failed to parse RespondBlock: {}", e);
                                        }
                                    }
                                }

                                ProtocolMessageTypes::CoinStateUpdate => {
                                    debug!("Received coin state update");
                                }

                                _ => {
                                    debug!("Received other message type: {:?}", message.msg_type);
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse message: {}", e);
                        }
                    }
                }
                Ok(WsMessage::Close(frame)) => {
                    info!("Peer closed connection: {:?}", frame);
                    break;
                }
                Ok(WsMessage::Ping(data)) => {
                    // Respond to ping
                    if let Err(e) = ws_stream.send(WsMessage::Pong(data)).await {
                        error!("Failed to send pong: {}", e);
                    }
                }
                Ok(_) => {
                    // Ignore other message types
                }
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    return Err(ChiaError::WebSocket(e));
                }
            }
        }

        info!("Connection closed");
        Ok(())
    }

    pub async fn request_block_by_height(
        &self,
        height: u64,
        ws_stream: &mut WebSocket,
    ) -> Result<FullBlock, ChiaError> {
        info!("Requesting block at height {}", height);

        let request = RequestBlock {
            height: height as u32,
            include_transaction_block: true,
        };

        let request_bytes = request
            .to_bytes()
            .map_err(|e| ChiaError::Serialization(e.to_string()))?;

        let request_msg = chia_protocol::Message {
            msg_type: ProtocolMessageTypes::RequestBlock,
            id: Some(1), // Add request ID
            data: request_bytes.into(),
        };

        let request_bytes = request_msg
            .to_bytes()
            .map_err(|e| ChiaError::Serialization(e.to_string()))?;

        ws_stream
            .send(WsMessage::Binary(request_bytes))
            .await
            .map_err(ChiaError::WebSocket)?;

        // Wait for the response, handling other messages in between
        let mut attempts = 0;
        const MAX_ATTEMPTS: u32 = 100; // Prevent infinite loops

        while attempts < MAX_ATTEMPTS {
            attempts += 1;

            if let Some(msg) = ws_stream.next().await {
                match msg {
                    Ok(WsMessage::Binary(data)) => {
                        match chia_protocol::Message::from_bytes(&data) {
                            Ok(response) => {
                                debug!(
                                    "Received message type: {:?} while waiting for block",
                                    response.msg_type
                                );

                                match response.msg_type {
                                    ProtocolMessageTypes::RespondBlock => {
                                        match RespondBlock::from_bytes(&response.data) {
                                            Ok(respond_block) => {
                                                let block = respond_block.block;
                                                info!(
                                                    "Received block at height {}",
                                                    block.reward_chain_block.height
                                                );
                                                return Ok(block);
                                            }
                                            Err(e) => {
                                                error!("Failed to parse RespondBlock: {}", e);
                                                return Err(ChiaError::Protocol(e.to_string()));
                                            }
                                        }
                                    }
                                    ProtocolMessageTypes::RejectBlock => {
                                        error!("Block request rejected by peer");
                                        return Err(ChiaError::Protocol(
                                            "Block request rejected".to_string(),
                                        ));
                                    }
                                    ProtocolMessageTypes::NewPeakWallet => {
                                        // Just log and continue waiting for our response
                                        if let Ok(new_peak) =
                                            NewPeakWallet::from_bytes(&response.data)
                                        {
                                            debug!("Received NewPeakWallet at height {} while waiting for block", new_peak.height);
                                        }
                                        continue;
                                    }
                                    ProtocolMessageTypes::CoinStateUpdate => {
                                        debug!("Received CoinStateUpdate while waiting for block");
                                        continue;
                                    }
                                    _ => {
                                        debug!("Received other message type while waiting for block: {:?}", response.msg_type);
                                        continue;
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse message while waiting for block: {}", e);
                                continue;
                            }
                        }
                    }
                    Ok(WsMessage::Close(_)) => {
                        error!("Peer closed connection during block request");
                        return Err(ChiaError::Connection(
                            "Peer closed connection during block request".to_string(),
                        ));
                    }
                    Ok(WsMessage::Ping(data)) => {
                        // Respond to ping
                        if let Err(e) = ws_stream.send(WsMessage::Pong(data)).await {
                            error!("Failed to send pong: {}", e);
                        }
                        continue;
                    }
                    Ok(_) => {
                        debug!("Unexpected WebSocket message type during block request");
                        continue;
                    }
                    Err(e) => {
                        error!("WebSocket error: {}", e);
                        return Err(ChiaError::WebSocket(e));
                    }
                }
            } else {
                error!("Connection closed during block request");
                return Err(ChiaError::Connection(
                    "Connection closed during block request".to_string(),
                ));
            }
        }

        error!(
            "Timeout waiting for block response after {} attempts",
            MAX_ATTEMPTS
        );
        Err(ChiaError::Protocol(
            "Timeout waiting for block response".to_string(),
        ))
    }

    pub async fn get_peak_height(&self) -> Result<u32, ChiaError> {
        // Connect and get peak height
        let mut ws_stream = self.connect().await?;
        self.handshake(&mut ws_stream).await?;

        // Wait for NewPeakWallet message
        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(WsMessage::Binary(data)) => {
                    if let Ok(message) = chia_protocol::Message::from_bytes(&data) {
                        if message.msg_type == ProtocolMessageTypes::NewPeakWallet {
                            if let Ok(new_peak) = NewPeakWallet::from_bytes(&message.data) {
                                return Ok(new_peak.height);
                            }
                        }
                    }
                }
                Ok(WsMessage::Close(_)) => {
                    return Err(ChiaError::Connection("Connection closed".to_string()));
                }
                Err(e) => {
                    return Err(ChiaError::Connection(format!("WebSocket error: {}", e)));
                }
                _ => {}
            }
        }

        Err(ChiaError::Connection(
            "Failed to get peak height".to_string(),
        ))
    }

    pub async fn request_blocks_range(
        &self,
        _start_height: u64,
        _end_height: u64,
    ) -> Result<Vec<FullBlock>, ChiaError> {
        // ... existing code ...
        Ok(Vec::new())
    }
}
