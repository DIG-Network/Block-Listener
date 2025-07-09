use chia_listener_core::{
    PeerConnection, 
    ChiaError,
    BlockData, 
    CoinRecord, 
    process_block_to_data,
};

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
use hex;
use chia_protocol::FullBlock;

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
    is_connected: bool,
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
                is_connected: false,
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
                            
                            // Mark peer as connected
                            {
                                let mut guard = inner_clone.write().await;
                                if let Some(peer_info) = guard.peers.get_mut(&peer_id) {
                                    peer_info.is_connected = true;
                                }
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
                                    host: host_for_listener.clone(),
                                    port,
                                    message: Some("Connection closed".to_string()),
                                }).await;
                                drop(guard);
                                
                                // Mark peer as disconnected
                                let mut guard = inner_for_listener.write().await;
                                if let Some(peer_info) = guard.peers.get_mut(&peer_id) {
                                    peer_info.is_connected = false;
                                }
                            });
                            
                            // Forward blocks with peer ID
                            while let Some(block) = block_rx.recv().await {
                                let block_data = process_block_to_data(&block);
                                
                                // Log coin additions and removals
                                info!("Block {} has {} coin additions and {} coin removals", 
                                    block_data.height, block_data.coin_additions.len(), block_data.coin_removals.len());
                                
                                if !block_data.coin_additions.is_empty() {
                                    info!("Coin additions:");
                                    for (i, coin) in block_data.coin_additions.iter().enumerate() {
                                        info!("  Addition {}: puzzle_hash={}, amount={} mojos", 
                                            i + 1, &coin.puzzle_hash, coin.amount);
                                    }
                                }
                                
                                if !block_data.coin_removals.is_empty() {
                                    info!("Coin removals (reward claims):");
                                    for (i, coin) in block_data.coin_removals.iter().enumerate() {
                                        info!("  Removal {}: puzzle_hash={}, amount={} mojos", 
                                            i + 1, &coin.puzzle_hash, coin.amount);
                                    }
                                }
                                
                                if block_data.has_transactions_generator {
                                    info!("Block has transactions generator ({} bytes) - additional coin spends would need CLVM execution", 
                                        block_data.generator_size.unwrap_or(0));
                                }
                                
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
            guard.peers.iter()
                .filter(|(_, info)| info.is_connected)
                .map(|(id, _)| *id)
                .collect()
        }))
    }

    #[napi]
    pub fn get_block_by_height(&self, env: Env, peer_id: u32, height: u32) -> Result<JsObject> {
        let rt = tokio::runtime::Handle::current();
        let inner = self.inner.clone();
        
        let promise = env.create_promise()?;
        let (deferred, promise_obj) = promise;
        
        rt.spawn(async move {
            let guard = inner.read().await;
            let result = if let Some(peer_info) = guard.peers.get(&peer_id) {
                if !peer_info.is_connected {
                    Err(anyhow::anyhow!("Peer {} is not connected", peer_id))
                } else {
                    match peer_info.connection.get_block_by_height(height).await {
                        Ok(block) => {
                            let block_data = process_block_to_data(&block);
                            Ok(serde_json::to_value(block_data)?)
                        }
                        Err(e) => Err(e),
                    }
                }
            } else {
                Err(anyhow::anyhow!("Peer {} not found", peer_id))
            };
            
            drop(guard);
            
            match result {
                Ok(block_value) => {
                    deferred.resolve(move |env| {
                        let mut obj = env.create_object()?;
                        
                        if let serde_json::Value::Object(map) = block_value {
                            for (key, value) in map {
                                match value {
                                    serde_json::Value::Number(n) => {
                                        if let Some(i) = n.as_u64() {
                                            obj.set_named_property(&key, env.create_uint32(i as u32)?)?;
                                        } else if let Some(i) = n.as_i64() {
                                            obj.set_named_property(&key, env.create_int32(i as i32)?)?;
                                        }
                                    }
                                    serde_json::Value::String(s) => {
                                        obj.set_named_property(&key, env.create_string(&s)?)?;
                                    }
                                    serde_json::Value::Bool(b) => {
                                        obj.set_named_property(&key, env.get_boolean(b)?)?;
                                    }
                                    serde_json::Value::Null => {
                                        obj.set_named_property(&key, env.get_null()?)?;
                                    }
                                    serde_json::Value::Array(arr) => {
                                        let mut js_arr = env.create_array_with_length(arr.len())?;
                                        for (i, item) in arr.iter().enumerate() {
                                            if let serde_json::Value::Object(coin_map) = item {
                                                let mut coin_obj = env.create_object()?;
                                                for (coin_key, coin_value) in coin_map {
                                                    match coin_value {
                                                        serde_json::Value::String(s) => {
                                                            coin_obj.set_named_property(coin_key, env.create_string(s)?)?;
                                                        }
                                                        serde_json::Value::Number(n) => {
                                                            if let Some(amount) = n.as_u64() {
                                                                coin_obj.set_named_property(coin_key, env.create_string(&amount.to_string())?)?;
                                                            }
                                                        }
                                                        _ => {}
                                                    }
                                                }
                                                js_arr.set_element(i as u32, coin_obj)?;
                                            }
                                        }
                                        obj.set_named_property(&key, js_arr)?;
                                    }
                                    _ => {}
                                }
                            }
                        }
                        
                        Ok(obj)
                    });
                }
                Err(e) => {
                    deferred.reject(Error::new(Status::GenericFailure, e.to_string()));
                }
            }
        });
        
        Ok(promise_obj)
    }

    #[napi]
    pub fn get_blocks_range(&self, env: Env, peer_id: u32, start_height: u32, end_height: u32) -> Result<Vec<JsObject>> {
        // TODO: Implement this method to get a range of blocks
        // This would need to be added to the core crate's PeerConnection
        Err(Error::new(Status::GenericFailure, "Not implemented yet"))
    }

    #[napi]
    pub async fn discover_peers(&self, count: Option<u32>) -> Result<Vec<String>> {
        Self::discover_peers_static(count).await.map_err(|e| Error::new(Status::GenericFailure, e))
    }

    async fn discover_peers_static(count: Option<u32>) -> Result<Vec<String>, String> {
        use chia_listener_core::protocol::DNS_INTRODUCERS;
        use rand::seq::SliceRandom;
        use std::net::ToSocketAddrs;
        
        let count = count.unwrap_or(5) as usize;
        let mut discovered_peers = Vec::new();
        let mut rng = rand::thread_rng();
        
        // Shuffle DNS introducers
        let mut shuffled_introducers = DNS_INTRODUCERS.to_vec();
        shuffled_introducers.shuffle(&mut rng);
        
        for introducer in shuffled_introducers {
            match tokio::net::lookup_host(introducer).await {
                Ok(addrs) => {
                    let resolved_addrs: Vec<_> = addrs.collect();
                    info!("Resolved {} to {} addresses", introducer, resolved_addrs.len());
                    
                    for addr in resolved_addrs {
                        discovered_peers.push(addr.ip().to_string());
                        if discovered_peers.len() >= count {
                            return Ok(discovered_peers);
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to resolve {}: {}", introducer, e);
                }
            }
        }
        
        if discovered_peers.is_empty() {
            Err("Failed to discover any peers".to_string())
        } else {
            Ok(discovered_peers)
        }
    }

    #[napi]
    pub fn sync(
        &self, 
        _env: Env,
        start_height: Option<u32>,
        block_callback: JsFunction,
        event_callback: JsFunction,
        sync_status_callback: JsFunction,
    ) -> Result<()> {
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

        #[derive(Clone)]
        struct SyncStatus {
            phase: String,
            current_height: u32,
            target_height: Option<u32>,
            blocks_per_second: f64,
        }

        let sync_status_tsfn: ThreadsafeFunction<SyncStatus, ErrorStrategy::Fatal> = sync_status_callback
            .create_threadsafe_function(0, |ctx| {
                let status = &ctx.value;
                let mut obj = ctx.env.create_object()?;
                
                obj.set_named_property("phase", ctx.env.create_string(&status.phase)?)?;
                obj.set_named_property("currentHeight", ctx.env.create_uint32(status.current_height)?)?;
                
                if let Some(target) = status.target_height {
                    obj.set_named_property("targetHeight", ctx.env.create_uint32(target)?)?;
                } else {
                    obj.set_named_property("targetHeight", ctx.env.get_null()?)?;
                }
                
                obj.set_named_property("blocksPerSecond", ctx.env.create_double(status.blocks_per_second)?)?;
                
                Ok(vec![obj])
            })?;

        // Start sync process
        let inner_clone = self.inner.clone();
        rt.spawn(async move {
            // Mark as running
            {
                let mut guard = inner_clone.write().await;
                guard.is_running = true;
            }

            // Initialize channels
            let (block_tx, mut block_rx) = mpsc::channel(100);
            let (event_tx, _event_rx) = mpsc::channel(100);
            
            {
                let mut guard = inner_clone.write().await;
                guard.block_sender = block_tx.clone();
                guard.event_sender = event_tx.clone();
            }

            // Spawn block event handler
            let block_tsfn_clone = block_tsfn.clone();
            let inner_for_blocks = inner_clone.clone();
            tokio::spawn(async move {
                while let Some(event) = block_rx.recv().await {
                    block_tsfn_clone.call(event, ThreadsafeFunctionCallMode::NonBlocking);
                }
                
                // When channel closes, mark as not running
                let mut guard = inner_for_blocks.write().await;
                guard.is_running = false;
            });

            // Get connected peers
            let peers = {
                let guard = inner_clone.read().await;
                guard.peers.iter()
                    .filter(|(_, info)| info.is_connected)
                    .map(|(id, info)| (*id, info.connection.clone()))
                    .collect::<Vec<_>>()
            };

            if peers.is_empty() {
                error!("No connected peers available for sync");
                let _ = event_tx.send(PeerEvent {
                    event_type: PeerEventType::Error,
                    peer_id: 0,
                    host: "".to_string(),
                    port: 0,
                    message: Some("No connected peers available for sync".to_string()),
                }).await;
                return;
            }

            // Use the first connected peer for sync
            let (peer_id, peer) = &peers[0];
            info!("Starting sync with peer ID {}", peer_id);

            // Send sync starting status
            sync_status_tsfn.call(SyncStatus {
                phase: "starting".to_string(),
                current_height: 0,
                target_height: None,
                blocks_per_second: 0.0,
            }, ThreadsafeFunctionCallMode::NonBlocking);

            // Get current peak height
            let peak_height = match peer.get_peak_height().await {
                Ok(height) => height,
                Err(e) => {
                    error!("Failed to get peak height: {}", e);
                    let _ = event_tx.send(PeerEvent {
                        event_type: PeerEventType::Error,
                        peer_id: *peer_id,
                        host: peer.host().to_string(),
                        port: peer.port(),
                        message: Some(format!("Failed to get peak height: {}", e)),
                    }).await;
                    return;
                }
            };

            let start_height = start_height.unwrap_or(0);
            info!("Syncing from height {} to {}", start_height, peak_height);

            // Send sync status update
            sync_status_tsfn.call(SyncStatus {
                phase: "syncing".to_string(),
                current_height: start_height,
                target_height: Some(peak_height),
                blocks_per_second: 0.0,
            }, ThreadsafeFunctionCallMode::NonBlocking);

            let start_time = std::time::Instant::now();
            let mut blocks_processed = 0;

            // Sync blocks
            for height in start_height..=peak_height {
                match peer.get_block_by_height(height).await {
                    Ok(block) => {
                        let block_data = process_block_to_data(&block);
                        
                        let _ = block_tx.send(BlockEvent {
                            peer_id: *peer_id,
                            block: block_data,
                        }).await;
                        
                        blocks_processed += 1;
                        
                        // Update sync status every 100 blocks
                        if blocks_processed % 100 == 0 {
                            let elapsed = start_time.elapsed().as_secs_f64();
                            let blocks_per_second = blocks_processed as f64 / elapsed;
                            
                            sync_status_tsfn.call(SyncStatus {
                                phase: "syncing".to_string(),
                                current_height: height,
                                target_height: Some(peak_height),
                                blocks_per_second,
                            }, ThreadsafeFunctionCallMode::NonBlocking);
                        }
                    }
                    Err(e) => {
                        warn!("Failed to get block at height {}: {}", height, e);
                        // Continue with next block
                    }
                }
            }

            // Send sync completed status
            let elapsed = start_time.elapsed().as_secs_f64();
            let blocks_per_second = blocks_processed as f64 / elapsed;
            
            sync_status_tsfn.call(SyncStatus {
                phase: "completed".to_string(),
                current_height: peak_height,
                target_height: Some(peak_height),
                blocks_per_second,
            }, ThreadsafeFunctionCallMode::NonBlocking);

            info!("Sync completed. Processed {} blocks in {:.2} seconds ({:.2} blocks/sec)", 
                blocks_processed, elapsed, blocks_per_second);
        });

        Ok(())
    }
}