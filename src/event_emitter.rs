use crate::peer::PeerConnection;
use crate::error::ChiaError;
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, Env, JsObject,
};
use napi_derive::napi;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::{mpsc, RwLock, oneshot};
use tracing::{error, info};
use hex;

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
    coin_additions: Vec<CoinRecord>,
    coin_removals: Vec<CoinRecord>,
    has_transactions_generator: bool,
    generator_size: Option<u32>,
}

#[derive(Clone)]
struct CoinRecord {
    parent_coin_info: String,
    puzzle_hash: String,
    amount: u64,
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
    ) -> Result<u32> {
        let peer = PeerConnection::new(
            host.clone(),
            port,
            network_id,
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
    pub fn start(&self, _env: Env, block_callback: JsFunction, event_callback: JsFunction) -> Result<()> {
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
        let block_tsfn: ThreadsafeFunction<BlockEvent, ErrorStrategy::Fatal> = block_callback
            .create_threadsafe_function(0, |ctx| {
                let event: &BlockEvent = &ctx.value;
                let mut obj = ctx.env.create_object()?;
                
                obj.set_named_property("peerId", ctx.env.create_uint32(event.peer_id)?)?;
                obj.set_named_property("height", ctx.env.create_uint32(event.block.height)?)?;
                obj.set_named_property("weight", ctx.env.create_string(&event.block.weight)?)?;
                obj.set_named_property("header_hash", ctx.env.create_string(&event.block.header_hash)?)?;
                obj.set_named_property("timestamp", ctx.env.create_uint32(event.block.timestamp.unwrap_or(0))?)?;
                
                // Coin additions array
                let mut additions_array = ctx.env.create_array_with_length(event.block.coin_additions.len())?;
                for (i, coin) in event.block.coin_additions.iter().enumerate() {
                    let mut coin_obj = ctx.env.create_object()?;
                    coin_obj.set_named_property("parent_coin_info", ctx.env.create_string(&coin.parent_coin_info)?)?;
                    coin_obj.set_named_property("puzzle_hash", ctx.env.create_string(&coin.puzzle_hash)?)?;
                    coin_obj.set_named_property("amount", ctx.env.create_string(&coin.amount.to_string())?)?;
                    additions_array.set_element(i as u32, coin_obj)?;
                }
                obj.set_named_property("coin_additions", additions_array)?;
                
                // Coin removals array
                let mut removals_array = ctx.env.create_array_with_length(event.block.coin_removals.len())?;
                for (i, coin) in event.block.coin_removals.iter().enumerate() {
                    let mut coin_obj = ctx.env.create_object()?;
                    coin_obj.set_named_property("parent_coin_info", ctx.env.create_string(&coin.parent_coin_info)?)?;
                    coin_obj.set_named_property("puzzle_hash", ctx.env.create_string(&coin.puzzle_hash)?)?;
                    coin_obj.set_named_property("amount", ctx.env.create_string(&coin.amount.to_string())?)?;
                    removals_array.set_element(i as u32, coin_obj)?;
                }
                obj.set_named_property("coin_removals", removals_array)?;
                
                obj.set_named_property("has_transactions_generator", ctx.env.get_boolean(event.block.has_transactions_generator)?)?;
                obj.set_named_property("generator_size", ctx.env.create_uint32(event.block.generator_size.unwrap_or(0))?)?;
                
                Ok(vec![obj])
            })?;

        let event_tsfn: ThreadsafeFunction<PeerEvent, ErrorStrategy::Fatal> = event_callback
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
                    block_tsfn_clone.call(event, ThreadsafeFunctionCallMode::NonBlocking);
                }
            });
            
            // Spawn peer event handler
            let event_tsfn_clone = event_tsfn.clone();
            tokio::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    event_tsfn_clone.call(event, ThreadsafeFunctionCallMode::NonBlocking);
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
                            
                            // Send connected event after successful handshake
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
                                // Extract coin additions
                                let mut coin_additions = Vec::new();
                                let mut coin_removals = Vec::new();
                                
                                // Add farmer and pool reward coins if this is a transaction block
                                if block.foliage_transaction_block.is_some() {
                                    // Farmer reward coin (0.25 XCH)
                                    coin_additions.push(CoinRecord {
                                        parent_coin_info: hex::encode(&block.foliage.reward_block_hash),
                                        puzzle_hash: hex::encode(&block.foliage.foliage_block_data.farmer_reward_puzzle_hash),
                                        amount: 250000000000,
                                    });
                                    
                                    // Pool reward coin (1.75 XCH)
                                    coin_additions.push(CoinRecord {
                                        parent_coin_info: hex::encode(&block.foliage.reward_block_hash),
                                        puzzle_hash: hex::encode(&block.foliage.foliage_block_data.pool_target.puzzle_hash),
                                        amount: 1750000000000,
                                    });
                                }
                                
                                // Add any reward claims from transactions
                                if let Some(tx_info) = &block.transactions_info {
                                    // Reward claims are coins being spent (removed)
                                    for claim in &tx_info.reward_claims_incorporated {
                                        coin_removals.push(CoinRecord {
                                            parent_coin_info: hex::encode(&claim.parent_coin_info),
                                            puzzle_hash: hex::encode(&claim.puzzle_hash),
                                            amount: claim.amount,
                                        });
                                    }
                                }
                                
                                // Check for transactions generator
                                let has_generator = block.transactions_generator.is_some();
                                let generator_size = block.transactions_generator.as_ref().map(|g| g.len() as u32);
                                
                                // Log coin additions and removals
                                info!("Block {} has {} coin additions and {} coin removals", 
                                    block.reward_chain_block.height, coin_additions.len(), coin_removals.len());
                                
                                if !coin_additions.is_empty() {
                                    info!("Coin additions:");
                                    for (i, coin) in coin_additions.iter().enumerate() {
                                        info!("  Addition {}: puzzle_hash={}, amount={} mojos", 
                                            i + 1, &coin.puzzle_hash, coin.amount);
                                    }
                                }
                                
                                if !coin_removals.is_empty() {
                                    info!("Coin removals (reward claims):");
                                    for (i, coin) in coin_removals.iter().enumerate() {
                                        info!("  Removal {}: puzzle_hash={}, amount={} mojos", 
                                            i + 1, &coin.puzzle_hash, coin.amount);
                                    }
                                }
                                
                                if has_generator {
                                    info!("Block has transactions generator ({} bytes) - additional coin spends would need CLVM execution", 
                                        generator_size.unwrap_or(0));
                                }
                                
                                let block_data = BlockData {
                                    height: block.reward_chain_block.height,
                                    weight: block.reward_chain_block.weight.to_string(),
                                    header_hash: hex::encode(block.header_hash()),
                                    timestamp: block.foliage_transaction_block.as_ref().map(|f| f.timestamp as u32),
                                    coin_additions,
                                    coin_removals,
                                    has_transactions_generator: has_generator,
                                    generator_size,
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

    #[napi]
    pub fn get_block_by_height(&self, env: Env, peer_id: u32, height: u32) -> Result<JsObject> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        let block_result = rt.block_on(async {
            let guard = inner.read().await;
            
            if let Some(peer_info) = guard.peers.get(&peer_id) {
                let peer = peer_info.connection.clone();
                drop(guard); // Release the lock before connecting
                
                // Create a new connection for this request
                match peer.connect().await {
                    Ok(mut ws_stream) => {
                        // Perform handshake
                        if let Err(e) = peer.handshake(&mut ws_stream).await {
                            return Err(ChiaError::Protocol(format!("Handshake failed: {}", e)));
                        }
                        
                        // Request the block
                        peer.request_block_by_height(height as u64, &mut ws_stream).await
                    }
                    Err(e) => Err(e)
                }
            } else {
                Err(ChiaError::Connection(format!("Peer {} not found", peer_id)))
            }
        });
        
        match block_result {
            Ok(block) => {
                // Convert block to BlockData
                let mut coin_additions = Vec::new();
                let mut coin_removals = Vec::new();
                
                // Add farmer and pool reward coins if this is a transaction block
                if block.foliage_transaction_block.is_some() {
                    coin_additions.push(CoinRecord {
                        parent_coin_info: hex::encode(&block.foliage.reward_block_hash),
                        puzzle_hash: hex::encode(&block.foliage.foliage_block_data.farmer_reward_puzzle_hash),
                        amount: 250000000000,
                    });
                    
                    coin_additions.push(CoinRecord {
                        parent_coin_info: hex::encode(&block.foliage.reward_block_hash),
                        puzzle_hash: hex::encode(&block.foliage.foliage_block_data.pool_target.puzzle_hash),
                        amount: 1750000000000,
                    });
                }
                
                // Add any reward claims from transactions
                if let Some(tx_info) = &block.transactions_info {
                    for claim in &tx_info.reward_claims_incorporated {
                        coin_removals.push(CoinRecord {
                            parent_coin_info: hex::encode(&claim.parent_coin_info),
                            puzzle_hash: hex::encode(&claim.puzzle_hash),
                            amount: claim.amount,
                        });
                    }
                }
                
                let has_generator = block.transactions_generator.is_some();
                let generator_size = block.transactions_generator.as_ref().map(|g| g.len() as u32);
                
                let block_data = BlockData {
                    height: block.reward_chain_block.height,
                    weight: block.reward_chain_block.weight.to_string(),
                    header_hash: hex::encode(block.header_hash()),
                    timestamp: block.foliage_transaction_block.as_ref().map(|f| f.timestamp as u32),
                    coin_additions,
                    coin_removals,
                    has_transactions_generator: has_generator,
                    generator_size,
                };
                
                // Convert to JsObject
                let env = unsafe { Env::from_raw(env.raw()) };
                let mut obj = env.create_object()?;
                
                obj.set_named_property("height", env.create_uint32(block_data.height)?)?;
                obj.set_named_property("weight", env.create_string(&block_data.weight)?)?;
                obj.set_named_property("header_hash", env.create_string(&block_data.header_hash)?)?;
                obj.set_named_property("timestamp", env.create_uint32(block_data.timestamp.unwrap_or(0))?)?;
                
                // Coin additions array
                let mut additions_array = env.create_array_with_length(block_data.coin_additions.len())?;
                for (i, coin) in block_data.coin_additions.iter().enumerate() {
                    let mut coin_obj = env.create_object()?;
                    coin_obj.set_named_property("parent_coin_info", env.create_string(&coin.parent_coin_info)?)?;
                    coin_obj.set_named_property("puzzle_hash", env.create_string(&coin.puzzle_hash)?)?;
                    coin_obj.set_named_property("amount", env.create_string(&coin.amount.to_string())?)?;
                    additions_array.set_element(i as u32, coin_obj)?;
                }
                obj.set_named_property("coin_additions", additions_array)?;
                
                // Coin removals array
                let mut removals_array = env.create_array_with_length(block_data.coin_removals.len())?;
                for (i, coin) in block_data.coin_removals.iter().enumerate() {
                    let mut coin_obj = env.create_object()?;
                    coin_obj.set_named_property("parent_coin_info", env.create_string(&coin.parent_coin_info)?)?;
                    coin_obj.set_named_property("puzzle_hash", env.create_string(&coin.puzzle_hash)?)?;
                    coin_obj.set_named_property("amount", env.create_string(&coin.amount.to_string())?)?;
                    removals_array.set_element(i as u32, coin_obj)?;
                }
                obj.set_named_property("coin_removals", removals_array)?;
                
                obj.set_named_property("has_transactions_generator", env.get_boolean(block_data.has_transactions_generator)?)?;
                obj.set_named_property("generator_size", env.create_uint32(block_data.generator_size.unwrap_or(0))?)?;
                
                Ok(obj)
            }
            Err(e) => Err(Error::new(Status::GenericFailure, format!("Failed to get block: {}", e)))
        }
    }

    #[napi]
    pub fn get_blocks_range(&self, env: Env, peer_id: u32, start_height: u32, end_height: u32) -> Result<Vec<JsObject>> {
        if start_height > end_height {
            return Err(Error::new(Status::InvalidArg, "start_height must be <= end_height"));
        }
        
        let mut blocks = Vec::new();
        
        for height in start_height..=end_height {
            match self.get_block_by_height(env.clone(), peer_id, height) {
                Ok(block) => blocks.push(block),
                Err(e) => {
                    // Log error but continue with other blocks
                    error!("Failed to get block at height {}: {}", height, e);
                }
            }
        }
        
        Ok(blocks)
    }
}