use crate::{
    database::BlockDatabase,
    error::Result,
    event_emitter::BlockEventEmitter,
    types::{BlockEvent, ChiaBlock},
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

pub struct ChiaClient {
    database_path: String,
    host: String,
    port: u16,
    network_id: String,
    connected: Arc<RwLock<bool>>,
}

impl ChiaClient {
    pub async fn connect(
        host: String,
        port: u16,
        network_id: String,
        _cert_path: Option<String>,
        _key_path: Option<String>,
    ) -> Result<Self> {
        info!("Creating client for {}:{} on network {}", host, port, network_id);
        
        let client = Self {
            database_path: "chia-blocks.db".to_string(),
            host,
            port,
            network_id,
            connected: Arc::new(RwLock::new(true)),
        };

        Ok(client)
    }

    pub async fn start_listening(&self, emitter: BlockEventEmitter) -> Result<()> {
        let database_path = self.database_path.clone();
        let connected = self.connected.clone();

        tokio::spawn(async move {
            // Create database inside the spawned task
            let database = match BlockDatabase::new(&database_path) {
                Ok(db) => Arc::new(db),
                Err(e) => {
                    error!("Failed to create database: {}", e);
                    return;
                }
            };

            // Simulate receiving blocks for now
            let mut height = 0u32;
            loop {
                let is_connected = *connected.read().await;
                if !is_connected {
                    break;
                }

                // Simulate a new block every few seconds
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                height += 1;
                let block_event = BlockEvent {
                    header_hash: format!("0x{:064x}", height),
                    height,
                    weight: (height as u128 * 1000).to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() as u32,
                    prev_header_hash: format!("0x{:064x}", height - 1),
                    farmer_puzzle_hash: format!("0x{:064x}", height * 2),
                    pool_puzzle_hash: format!("0x{:064x}", height * 3),
                };

                let chia_block = ChiaBlock {
                    header_hash: block_event.header_hash.clone(),
                    height: block_event.height,
                    weight: height as u128 * 1000,
                    timestamp: block_event.timestamp as u64,
                    prev_header_hash: block_event.prev_header_hash.clone(),
                    farmer_puzzle_hash: block_event.farmer_puzzle_hash.clone(),
                    pool_puzzle_hash: block_event.pool_puzzle_hash.clone(),
                    transactions_generator: None,
                    transactions_generator_ref_list: vec![],
                };

                if let Err(e) = database.insert_block(&chia_block) {
                    error!("Failed to insert block: {}", e);
                }

                if let Err(e) = emitter.emit("newBlock".to_string(), block_event) {
                    error!("Failed to emit block event: {}", e);
                }

                info!("Simulated block at height {}", height);
            }
        });

        Ok(())
    }

    pub async fn get_block_count(&self) -> Result<u32> {
        let database = BlockDatabase::new(&self.database_path)?;
        database.get_block_count()
    }

    pub async fn disconnect(&self) -> Result<()> {
        let mut connected = self.connected.write().await;
        *connected = false;
        info!("Client disconnected");
        Ok(())
    }
}