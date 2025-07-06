use crate::peer::PeerConnection;
use chia_protocol::FullBlock;
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, Env, JsObject,
};
use napi_derive::napi;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info};

#[napi]
pub struct ChiaBlockListener {
    inner: Arc<RwLock<ChiaBlockListenerInner>>,
}

struct ChiaBlockListenerInner {
    peers: Vec<PeerConnection>,
    block_receiver: Option<mpsc::Receiver<FullBlock>>,
    block_sender: mpsc::Sender<FullBlock>,
    is_running: bool,
}

#[napi]
impl ChiaBlockListener {
    #[napi(constructor)]
    pub fn new() -> Self {
        let (block_sender, block_receiver) = mpsc::channel(100);
        
        Self {
            inner: Arc::new(RwLock::new(ChiaBlockListenerInner {
                peers: Vec::new(),
                block_receiver: Some(block_receiver),
                block_sender,
                is_running: false,
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
    ) -> Result<()> {
        let peer = PeerConnection::new(
            host,
            port,
            network_id,
            tls_cert.to_vec(),
            tls_key.to_vec(),
            ca_cert.to_vec(),
        );
        
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        rt.block_on(async {
            let mut guard = inner.write().await;
            guard.peers.push(peer);
        });
        
        Ok(())
    }

    #[napi]
    pub fn start(&self, env: Env, callback: JsFunction) -> Result<()> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        let is_running = rt.block_on(async {
            let guard = inner.read().await;
            guard.is_running
        });
        
        if is_running {
            return Err(Error::new(Status::GenericFailure, "Already running"));
        }

        // Create threadsafe function for callbacks
        let tsfn: ThreadsafeFunction<BlockData, ErrorStrategy::CalleeHandled> = callback
            .create_threadsafe_function(0, |ctx| {
                let block_data: &BlockData = &ctx.value;
                let mut obj = ctx.env.create_object()?;
                
                obj.set_named_property("height", ctx.env.create_uint32(block_data.height)?)?;
                obj.set_named_property("weight", ctx.env.create_string(&block_data.weight)?)?;
                obj.set_named_property("header_hash", ctx.env.create_string(&block_data.header_hash)?)?;
                obj.set_named_property("timestamp", ctx.env.create_uint32(block_data.timestamp.unwrap_or(0))?)?;
                
                Ok(vec![obj])
            })?;

        // Start peer connections
        let inner_clone = self.inner.clone();
        rt.spawn(async move {
            let (peers, mut receiver) = {
                let mut guard = inner_clone.write().await;
                guard.is_running = true;
                let peers = guard.peers.clone();
                let receiver = guard.block_receiver.take();
                (peers, receiver)
            };
            
            if let Some(mut block_receiver) = receiver {
                // Start peer connections
                for peer in peers {
                    let block_sender = {
                        let guard = inner_clone.read().await;
                        guard.block_sender.clone()
                    };
                    
                    tokio::spawn(async move {
                        match peer.connect().await {
                            Ok(mut ws_stream) => {
                                info!("Connected to peer");
                                
                                if let Err(e) = peer.handshake(&mut ws_stream).await {
                                    error!("Handshake failed: {}", e);
                                    return;
                                }
                                
                                if let Err(e) = PeerConnection::listen_for_blocks(ws_stream, block_sender).await {
                                    error!("Error listening for blocks: {}", e);
                                }
                            }
                            Err(e) => {
                                error!("Failed to connect to peer: {}", e);
                            }
                        }
                    });
                }
                
                // Listen for blocks
                while let Some(block) = block_receiver.recv().await {
                    let is_running = {
                        let guard = inner_clone.read().await;
                        guard.is_running
                    };
                    
                    if !is_running {
                        break;
                    }
                    
                    // Convert to simplified block data
                    let block_data = BlockData {
                        height: block.reward_chain_block.height,
                        weight: block.reward_chain_block.weight.to_string(),
                        header_hash: hex::encode(block.header_hash()),
                        timestamp: block.foliage_transaction_block.as_ref().map(|f| f.timestamp as u32),
                    };
                    
                    // Emit block event
                    tsfn.call(Ok(block_data), ThreadsafeFunctionCallMode::NonBlocking);
                }
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
}

struct BlockData {
    height: u32,
    weight: String,
    header_hash: String,
    timestamp: Option<u32>,
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