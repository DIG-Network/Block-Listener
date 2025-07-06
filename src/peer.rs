use crate::{error::ChiaError, protocol::Message};
use chia_protocol::{ProtocolMessageTypes, Handshake as ChiaHandshake, NewPeakWallet, FullBlock, RequestBlock, NodeType};
use chia_traits::Streamable;
use futures_util::{SinkExt, StreamExt};
use native_tls::{Certificate, Identity, TlsConnector};

use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message as WsMessage, Connector, MaybeTlsStream, WebSocketStream};
use tracing::{debug, error, info, warn};

#[derive(Clone)]
pub struct PeerConnection {
    host: String,
    port: u16,
    network_id: String,
    tls_cert: Vec<u8>,
    tls_key: Vec<u8>,
    ca_cert: Vec<u8>,
}

impl PeerConnection {
    pub fn new(
        host: String,
        port: u16,
        network_id: String,
        tls_cert: Vec<u8>,
        tls_key: Vec<u8>,
        ca_cert: Vec<u8>,
    ) -> Self {
        Self {
            host,
            port,
            network_id,
            tls_cert,
            tls_key,
            ca_cert,
        }
    }
    
    pub fn host(&self) -> &str {
        &self.host
    }
    
    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn connect(&self) -> Result<WebSocketStream<MaybeTlsStream<TcpStream>>, ChiaError> {
        info!("Connecting to peer at {}:{}", self.host, self.port);

        // Create TLS connector
        let identity = Identity::from_pkcs8(&self.tls_cert, &self.tls_key)
            .map_err(|e| ChiaError::Tls(e.to_string()))?;
        
        let ca_cert = Certificate::from_pem(&self.ca_cert)
            .map_err(|e| ChiaError::Tls(e.to_string()))?;

        let tls_connector = TlsConnector::builder()
            .identity(identity)
            .add_root_certificate(ca_cert)
            .danger_accept_invalid_certs(true) // For Chia self-signed certs
            .build()
            .map_err(|e| ChiaError::Tls(e.to_string()))?;

        let connector = Connector::NativeTls(tls_connector);
        let url = format!("wss://{}:{}/ws", self.host, self.port);

        let (ws_stream, _) = connect_async_tls_with_config(
            &url,
            None,
            false,
            Some(connector),
        )
        .await
        .map_err(|e| ChiaError::WebSocket(e))?;

        info!("WebSocket connection established");
        Ok(ws_stream)
    }

    pub async fn handshake(
        &self,
        ws_stream: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    ) -> Result<(), ChiaError> {
        info!("Performing Chia handshake");

        // Create handshake message
        let handshake = ChiaHandshake {
            network_id: self.network_id.clone(),
            protocol_version: "0.0.36".to_string(),
            software_version: "2.4.0".to_string(),
            server_port: self.port,
            node_type: NodeType::FullNode,
            capabilities: vec![],
        };

        // Serialize handshake
        let handshake_bytes = handshake.to_bytes()
            .map_err(|e| ChiaError::Serialization(e.to_string()))?;

        // Create message
        let message = Message::new(
            ProtocolMessageTypes::Handshake,
            None,
            handshake_bytes,
        );

        let message_bytes = message.to_bytes()
            .map_err(|e| ChiaError::Protocol(e.to_string()))?;

        // Send handshake
        ws_stream
            .send(WsMessage::Binary(message_bytes))
            .await
            .map_err(|e| ChiaError::WebSocket(e))?;

        // Wait for handshake response
        if let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(WsMessage::Binary(data)) => {
                    let response = Message::from_bytes(&data)
                        .map_err(|e| ChiaError::Protocol(e.to_string()))?;
                    
                    if response.msg_type == ProtocolMessageTypes::Handshake {
                        info!("Received handshake from peer");
                        
                        // In newer protocol versions, handshake ack might be automatic
                        // or use a different message type
                        
                        info!("Handshake completed successfully");
                        Ok(())
                    } else {
                        Err(ChiaError::Protocol("Expected handshake response".to_string()))
                    }
                }
                Ok(_) => Err(ChiaError::Protocol("Unexpected message type".to_string())),
                Err(e) => Err(ChiaError::WebSocket(e)),
            }
        } else {
            Err(ChiaError::Connection("Connection closed during handshake".to_string()))
        }
    }

    pub async fn listen_for_blocks(
        mut ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
        block_sender: mpsc::Sender<FullBlock>,
    ) -> Result<(), ChiaError> {
        info!("Listening for blocks from peer");

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(WsMessage::Binary(data)) => {
                    match Message::from_bytes(&data) {
                        Ok(message) => {
                            match message.msg_type {
                                ProtocolMessageTypes::NewPeak => {
                                    if let Ok(new_peak) = NewPeakWallet::from_bytes(&message.data) {
                                        info!("Received new peak at height: {}", new_peak.height);
                                        // Request the full block
                                        let request = RequestBlock {
                                            height: new_peak.height,
                                            include_transaction_block: true,
                                        };
                                        
                                        if let Ok(request_bytes) = request.to_bytes() {
                                            let request_msg = Message::new(
                                                ProtocolMessageTypes::RequestBlock,
                                                None,
                                                request_bytes,
                                            );
                                            
                                            if let Ok(msg_bytes) = request_msg.to_bytes() {
                                                let _ = ws_stream.send(WsMessage::Binary(msg_bytes)).await;
                                            }
                                        }
                                    }
                                }
                                ProtocolMessageTypes::NewTransaction => {
                                    debug!("Received new transaction");
                                    // Could emit transaction events here
                                }

                                ProtocolMessageTypes::RespondBlock => {
                                    if let Ok(block) = FullBlock::from_bytes(&message.data) {
                                        info!("Received new block at height: {}", block.reward_chain_block.height);
                                        if let Err(e) = block_sender.send(block).await {
                                            error!("Failed to send block: {}", e);
                                        }
                                    }
                                }
                                _ => {
                                    debug!("Received message type: {:?}", message.msg_type);
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse message: {}", e);
                        }
                    }
                }
                Ok(WsMessage::Close(_)) => {
                    info!("Peer closed connection");
                    break;
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

        Ok(())
    }
}