//! Main block indexer implementation

use crate::error::Result;
use crate::events::{EventEmitter, EventSubscriber};
use crate::models::*;
use crate::migrations::run_migrations;
use database_connector::{DatabaseConnection, DatabaseOperations};
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Utc;

/// Block indexer for the Chia blockchain
pub struct BlockIndexer {
    db: DatabaseConnection,
    event_emitter: EventEmitter,
    state: Arc<RwLock<IndexerState>>,
}

#[derive(Default)]
struct IndexerState {
    last_indexed_height: Option<i64>,
}

impl BlockIndexer {
    /// Create a new block indexer with the given database connection
    pub async fn new(db: DatabaseConnection) -> Result<Self> {
        // Run migrations
        run_migrations(&db).await?;
        
        let indexer = Self {
            db,
            event_emitter: EventEmitter::default(),
            state: Arc::new(RwLock::new(IndexerState::default())),
        };
        
        // Load the last indexed height
        indexer.load_state().await?;
        
        Ok(indexer)
    }
    
    /// Get a reference to the event emitter
    pub fn event_emitter(&self) -> &EventEmitter {
        &self.event_emitter
    }
    
    /// Subscribe to events
    pub fn subscribe_events(&self) -> EventSubscriber {
        EventSubscriber::new(&self.event_emitter)
    }
    
    /// Load the indexer state from the database
    async fn load_state(&self) -> Result<()> {
        let query = "SELECT MAX(height) as max_height FROM blocks";
        
        let results = self.db.query_raw(query, vec![]).await?;
        
        let max_height: Option<i64> = if !results.is_empty() {
            results[0].get("max_height")
                .and_then(|v| v.as_i64())
        } else {
            None
        };
        
        let mut state = self.state.write().await;
        state.last_indexed_height = max_height;
        
        Ok(())
    }
    
    /// Insert a block with its additions and removals
    pub async fn insert_block(&self, block_input: BlockInput) -> Result<()> {
        // Start a transaction
        let mut tx = self.db.begin_transaction().await?;
        
        let now = Utc::now();
        let additions_count = block_input.additions.len() as i32;
        let removals_count = block_input.removals.len() as i32;
        
        // Insert block
        let block_query = "INSERT INTO blocks (height, header_hash, prev_header_hash, timestamp, additions_count, removals_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
        
        let params = vec![
            serde_json::json!(block_input.height),
            serde_json::json!(block_input.header_hash),
            serde_json::json!(block_input.prev_header_hash),
            serde_json::json!(block_input.timestamp.timestamp()),
            serde_json::json!(additions_count),
            serde_json::json!(removals_count),
            serde_json::json!(now.timestamp()),
        ];
        
        tx.execute_raw(block_query, params).await?;
        
        // Collect affected puzzle hashes for events
        let mut affected_puzzle_hashes = Vec::new();
        
        // Insert additions
        for addition in &block_input.additions {
            let coin_id = addition.coin_id();
            affected_puzzle_hashes.push(addition.puzzle_hash.clone());
            
            let condition_query = "INSERT INTO conditions (height, puzzle_hash, parent_coin_info, amount, is_addition, coin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
            
            let params = vec![
                serde_json::json!(block_input.height),
                serde_json::json!(addition.puzzle_hash),
                serde_json::json!(addition.parent_coin_info),
                serde_json::json!(addition.amount),
                serde_json::json!(true),
                serde_json::json!(coin_id),
                serde_json::json!(now.timestamp()),
            ];
            
            tx.execute_raw(condition_query, params).await?;
        }
        
        // Insert removals
        for removal in &block_input.removals {
            let coin_id = removal.coin_id();
            affected_puzzle_hashes.push(removal.puzzle_hash.clone());
            
            let condition_query = "INSERT INTO conditions (height, puzzle_hash, parent_coin_info, amount, is_addition, coin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
            
            let params = vec![
                serde_json::json!(block_input.height),
                serde_json::json!(removal.puzzle_hash),
                serde_json::json!(removal.parent_coin_info),
                serde_json::json!(removal.amount),
                serde_json::json!(false),
                serde_json::json!(coin_id),
                serde_json::json!(now.timestamp()),
            ];
            
            tx.execute_raw(condition_query, params).await?;
        }
        
        // Commit transaction
        tx.commit().await?;
        
        // Update state
        let mut state = self.state.write().await;
        state.last_indexed_height = Some(block_input.height);
        drop(state);
        
        // Prepare and emit events
        let unique_puzzle_hashes: Vec<String> = affected_puzzle_hashes
            .into_iter()
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        
        // Get updated coins for affected puzzle hashes
        let additions: Vec<Coin> = self.get_coins_for_event(&block_input.additions, block_input.height, false).await?;
        let removals: Vec<Coin> = self.get_coins_for_event(&block_input.removals, block_input.height, true).await?;
        
        // Emit coins updated event
        let coins_event = CoinsUpdatedEvent {
            height: block_input.height,
            puzzle_hashes: unique_puzzle_hashes.clone(),
            additions,
            removals,
        };
        self.event_emitter.emit_coins_updated(coins_event).await?;
        
        // Get balance updates
        let balance_updates = self.get_balance_updates_for_event(&unique_puzzle_hashes).await?;
        
        // Emit balance updated event
        if !balance_updates.is_empty() {
            let balance_event = BalanceUpdatedEvent {
                height: block_input.height,
                updates: balance_updates,
            };
            self.event_emitter.emit_balance_updated(balance_event).await?;
        }
        
        Ok(())
    }
    
    /// Convert coin inputs to coin models for events
    async fn get_coins_for_event(&self, coin_inputs: &[CoinInput], height: i64, is_spent: bool) -> Result<Vec<Coin>> {
        coin_inputs.iter().map(|input| {
            Ok(Coin {
                coin_id: input.coin_id(),
                puzzle_hash: input.puzzle_hash.clone(),
                parent_coin_info: input.parent_coin_info.clone(),
                amount: input.amount,
                created_height: if is_spent { 0 } else { height }, // Will be corrected by trigger
                spent_height: if is_spent { Some(height) } else { None },
                is_spent,
            })
        }).collect()
    }
    
    /// Get balance updates for affected puzzle hashes
    async fn get_balance_updates_for_event(&self, puzzle_hashes: &[String]) -> Result<Vec<BalanceUpdate>> {
        if puzzle_hashes.is_empty() {
            return Ok(vec![]);
        }
        
        // For now, return empty updates as the triggers handle the actual updates
        // In a future version, we could query the balances table for the actual values
        Ok(vec![])
    }
    
    /// Get coins by puzzle hash
    pub async fn get_coins_by_puzzlehash(&self, puzzle_hash: &str) -> Result<Vec<Coin>> {
        let query = "SELECT coin_id, puzzle_hash, parent_coin_info, amount, created_height, spent_height, is_spent FROM coins WHERE puzzle_hash = ? AND is_spent = 0";
        
        let params = vec![serde_json::json!(puzzle_hash)];
        let results = self.db.query_raw(query, params).await?;
        
        let coins = results.into_iter().map(|row| {
            Ok(Coin {
                coin_id: row.get("coin_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                puzzle_hash: row.get("puzzle_hash")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                parent_coin_info: row.get("parent_coin_info")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                amount: row.get("amount")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                created_height: row.get("created_height")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                spent_height: row.get("spent_height")
                    .and_then(|v| v.as_i64()),
                is_spent: row.get("is_spent")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            })
        }).collect::<Result<Vec<_>>>()?;
        
        Ok(coins)
    }
    
    /// Get balance by puzzle hash
    pub async fn get_balance_by_puzzlehash(&self, puzzle_hash: &str) -> Result<Option<Balance>> {
        let query = "SELECT puzzle_hash, total_amount, coin_count, last_updated_height FROM balances WHERE puzzle_hash = ?";
        
        let params = vec![serde_json::json!(puzzle_hash)];
        let results = self.db.query_raw(query, params).await?;
        
        if results.is_empty() {
            return Ok(None);
        }
        
        let row = &results[0];
        Ok(Some(Balance {
            puzzle_hash: row.get("puzzle_hash")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            total_amount: row.get("total_amount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
            coin_count: row.get("coin_count")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32,
            last_updated_height: row.get("last_updated_height")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
        }))
    }
    
    /// Get the last indexed block height
    pub async fn get_last_indexed_height(&self) -> Option<i64> {
        self.state.read().await.last_indexed_height
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use database_connector::{DatabaseConfig, DatabaseType};
    
    async fn create_test_indexer() -> Result<BlockIndexer> {
        let config = DatabaseConfig {
            database_type: DatabaseType::Sqlite,
            connection_string: ":memory:".to_string(),
            max_connections: 1,
            min_connections: 1,
            connect_timeout_seconds: 5,
            idle_timeout_seconds: 10,
            max_lifetime_seconds: 30,
        };
        
        let db = DatabaseConnection::new(config).await?;
        BlockIndexer::new(db).await
    }
    
    #[tokio::test]
    async fn test_insert_block() {
        let indexer = create_test_indexer().await.unwrap();
        
        let block = BlockInput {
            height: 100,
            header_hash: "hash100".to_string(),
            prev_header_hash: "hash99".to_string(),
            timestamp: Utc::now(),
            additions: vec![
                CoinInput {
                    puzzle_hash: "ph1".to_string(),
                    parent_coin_info: "parent1".to_string(),
                    amount: 1000,
                },
            ],
            removals: vec![],
        };
        
        indexer.insert_block(block).await.unwrap();
        
        let last_height = indexer.get_last_indexed_height().await;
        assert_eq!(last_height, Some(100));
    }
}