//! NAPI bindings for the block indexer

use block_indexer::{
    BlockIndexer, BlockInput, CoinInput, CoinsUpdatedEvent, BalanceUpdatedEvent,
    IndexerEvent, EventSubscriber, Coin, Balance,
};
use database_connector::{DatabaseConfig, DatabaseConnection};
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    Env, JsFunction, JsObject,
};
use napi_derive::napi;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use chrono::{DateTime, Utc};

#[napi]
pub struct BlockIndexerNapi {
    indexer: Arc<BlockIndexer>,
    event_task_handle: Option<tokio::task::JoinHandle<()>>,
}

#[napi]
impl BlockIndexerNapi {
    #[napi(factory)]
    pub async fn new(database_url: String) -> Result<Self> {
        // Parse database URL to determine type and create config
        let config = if database_url.starts_with("sqlite://") {
            let path = database_url.replace("sqlite://", "");
            DatabaseConfig::sqlite(path)
        } else if database_url.starts_with("postgres://") || database_url.starts_with("postgresql://") {
            // Parse PostgreSQL URL
            let url = database_url.replace("postgresql://", "postgres://");
            let parsed = url.replace("postgres://", "");
            
            // Simple URL parsing (in production, use a proper URL parser)
            let parts: Vec<&str> = parsed.split('@').collect();
            if parts.len() != 2 {
                return Err(Error::new(Status::InvalidArg, "Invalid PostgreSQL URL format"));
            }
            
            let auth_parts: Vec<&str> = parts[0].split(':').collect();
            if auth_parts.len() != 2 {
                return Err(Error::new(Status::InvalidArg, "Invalid PostgreSQL URL format"));
            }
            
            let user = auth_parts[0];
            let password = auth_parts[1];
            
            let host_db_parts: Vec<&str> = parts[1].split('/').collect();
            if host_db_parts.len() != 2 {
                return Err(Error::new(Status::InvalidArg, "Invalid PostgreSQL URL format"));
            }
            
            let host_port_parts: Vec<&str> = host_db_parts[0].split(':').collect();
            let host = host_port_parts[0];
            let port = if host_port_parts.len() > 1 {
                host_port_parts[1].parse().unwrap_or(5432)
            } else {
                5432
            };
            
            let database = host_db_parts[1];
            
            DatabaseConfig::postgres(host, port, user, password, database)
        } else {
            return Err(Error::new(Status::InvalidArg, "Invalid database URL. Must start with sqlite:// or postgres://"));
        };
        
        let db = DatabaseConnection::new(config).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create database connection: {}", e)))?;
        
        let indexer = BlockIndexer::new(db).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create indexer: {}", e)))?;
        
        Ok(Self {
            indexer: Arc::new(indexer),
            event_task_handle: None,
        })
    }
    
    #[napi]
    pub async fn insert_block(
        &self,
        height: i32,
        header_hash: String,
        prev_header_hash: String,
        timestamp: i32,
        additions: Vec<JsObject>,
        removals: Vec<JsObject>,
    ) -> Result<()> {
        // Convert JS objects to CoinInput
        let mut coin_additions = Vec::new();
        for add_obj in additions {
            let puzzle_hash: String = add_obj.get_named_property("puzzle_hash")?;
            let parent_coin_info: String = add_obj.get_named_property("parent_coin_info")?;
            let amount: String = add_obj.get_named_property("amount")?;
            
            coin_additions.push(CoinInput {
                puzzle_hash,
                parent_coin_info,
                amount: amount.parse().map_err(|_| Error::new(Status::InvalidArg, "Invalid amount"))?,
            });
        }
        
        let mut coin_removals = Vec::new();
        for rem_obj in removals {
            let puzzle_hash: String = rem_obj.get_named_property("puzzle_hash")?;
            let parent_coin_info: String = rem_obj.get_named_property("parent_coin_info")?;
            let amount: String = rem_obj.get_named_property("amount")?;
            
            coin_removals.push(CoinInput {
                puzzle_hash,
                parent_coin_info,
                amount: amount.parse().map_err(|_| Error::new(Status::InvalidArg, "Invalid amount"))?,
            });
        }
        
        let block_input = BlockInput {
            height: height as i64,
            header_hash,
            prev_header_hash,
            timestamp: DateTime::from_timestamp(timestamp as i64, 0)
                .unwrap_or_else(|| Utc::now()),
            additions: coin_additions,
            removals: coin_removals,
        };
        
        self.indexer.insert_block(block_input).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to insert block: {}", e)))?;
        
        Ok(())
    }
    
    #[napi]
    pub async fn get_coins_by_puzzlehash(&self, env: Env, puzzle_hash: String) -> Result<Vec<JsObject>> {
        let coins = self.indexer.get_coins_by_puzzlehash(&puzzle_hash).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get coins: {}", e)))?;
        
        // Convert to JS objects
        let mut result = Vec::new();
        
        for coin in coins {
            let mut obj = env.create_object()?;
            obj.set_named_property("coin_id", env.create_string(&coin.coin_id)?)?;
            obj.set_named_property("puzzle_hash", env.create_string(&coin.puzzle_hash)?)?;
            obj.set_named_property("parent_coin_info", env.create_string(&coin.parent_coin_info)?)?;
            obj.set_named_property("amount", env.create_string(&coin.amount.to_string())?)?;
            obj.set_named_property("created_height", env.create_int32(coin.created_height as i32)?)?;
            obj.set_named_property("is_spent", env.get_boolean(coin.is_spent)?)?;
            
            if let Some(spent_height) = coin.spent_height {
                obj.set_named_property("spent_height", env.create_int32(spent_height as i32)?)?;
            }
            
            result.push(obj);
        }
        
        Ok(result)
    }
    
    #[napi]
    pub async fn get_balance_by_puzzlehash(&self, env: Env, puzzle_hash: String) -> Result<Option<JsObject>> {
        let balance = self.indexer.get_balance_by_puzzlehash(&puzzle_hash).await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get balance: {}", e)))?;
        
        if let Some(balance) = balance {
            let mut obj = env.create_object()?;
            obj.set_named_property("puzzle_hash", env.create_string(&balance.puzzle_hash)?)?;
            obj.set_named_property("total_amount", env.create_string(&balance.total_amount.to_string())?)?;
            obj.set_named_property("coin_count", env.create_int32(balance.coin_count)?)?;
            obj.set_named_property("last_updated_height", env.create_int32(balance.last_updated_height as i32)?)?;
            
            Ok(Some(obj))
        } else {
            Ok(None)
        }
    }
    
    #[napi]
    pub fn subscribe_events(&mut self, env: Env, callback: JsFunction) -> Result<()> {
        if self.event_task_handle.is_some() {
            return Err(Error::new(Status::GenericFailure, "Already subscribed to events"));
        }
        
        let mut subscriber = self.indexer.subscribe_events();
        
        // Create threadsafe function for callback
        let tsfn: ThreadsafeFunction<IndexerEvent, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| {
                let event = &ctx.value;
                let mut obj = ctx.env.create_object()?;
                
                match event {
                    IndexerEvent::CoinsUpdated(coins_event) => {
                        obj.set_named_property("type", ctx.env.create_string("coins_updated")?)?;
                        obj.set_named_property("height", ctx.env.create_int32(coins_event.height as i32)?)?;
                        
                        // Puzzle hashes array
                        let mut ph_array = ctx.env.create_array_with_length(coins_event.puzzle_hashes.len())?;
                        for (i, ph) in coins_event.puzzle_hashes.iter().enumerate() {
                            ph_array.set_element(i as u32, ctx.env.create_string(ph)?)?;
                        }
                        obj.set_named_property("puzzle_hashes", ph_array)?;
                        
                        // Additions array
                        let mut additions_array = ctx.env.create_array_with_length(coins_event.additions.len())?;
                        for (i, coin) in coins_event.additions.iter().enumerate() {
                            let mut coin_obj = ctx.env.create_object()?;
                            coin_obj.set_named_property("coin_id", ctx.env.create_string(&coin.coin_id)?)?;
                            coin_obj.set_named_property("puzzle_hash", ctx.env.create_string(&coin.puzzle_hash)?)?;
                            coin_obj.set_named_property("parent_coin_info", ctx.env.create_string(&coin.parent_coin_info)?)?;
                            coin_obj.set_named_property("amount", ctx.env.create_string(&coin.amount.to_string())?)?;
                            additions_array.set_element(i as u32, coin_obj)?;
                        }
                        obj.set_named_property("additions", additions_array)?;
                        
                        // Removals array
                        let mut removals_array = ctx.env.create_array_with_length(coins_event.removals.len())?;
                        for (i, coin) in coins_event.removals.iter().enumerate() {
                            let mut coin_obj = ctx.env.create_object()?;
                            coin_obj.set_named_property("coin_id", ctx.env.create_string(&coin.coin_id)?)?;
                            coin_obj.set_named_property("puzzle_hash", ctx.env.create_string(&coin.puzzle_hash)?)?;
                            coin_obj.set_named_property("parent_coin_info", ctx.env.create_string(&coin.parent_coin_info)?)?;
                            coin_obj.set_named_property("amount", ctx.env.create_string(&coin.amount.to_string())?)?;
                            removals_array.set_element(i as u32, coin_obj)?;
                        }
                        obj.set_named_property("removals", removals_array)?;
                    }
                    
                    IndexerEvent::BalanceUpdated(balance_event) => {
                        obj.set_named_property("type", ctx.env.create_string("balance_updated")?)?;
                        obj.set_named_property("height", ctx.env.create_int32(balance_event.height as i32)?)?;
                        
                        // Updates array
                        let mut updates_array = ctx.env.create_array_with_length(balance_event.updates.len())?;
                        for (i, update) in balance_event.updates.iter().enumerate() {
                            let mut update_obj = ctx.env.create_object()?;
                            update_obj.set_named_property("puzzle_hash", ctx.env.create_string(&update.puzzle_hash)?)?;
                            update_obj.set_named_property("old_amount", ctx.env.create_string(&update.old_amount.to_string())?)?;
                            update_obj.set_named_property("new_amount", ctx.env.create_string(&update.new_amount.to_string())?)?;
                            update_obj.set_named_property("old_coin_count", ctx.env.create_int32(update.old_coin_count)?)?;
                            update_obj.set_named_property("new_coin_count", ctx.env.create_int32(update.new_coin_count)?)?;
                            updates_array.set_element(i as u32, update_obj)?;
                        }
                        obj.set_named_property("updates", updates_array)?;
                    }
                }
                
                Ok(vec![obj])
            })?;
        
        // Spawn task to listen for events
        let handle = tokio::spawn(async move {
            loop {
                match subscriber.recv().await {
                    Ok(event) => {
                        tsfn.call(event, ThreadsafeFunctionCallMode::NonBlocking);
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
        });
        
        self.event_task_handle = Some(handle);
        
        Ok(())
    }
    
    #[napi]
    pub fn unsubscribe_events(&mut self) -> Result<()> {
        if let Some(handle) = self.event_task_handle.take() {
            handle.abort();
        }
        Ok(())
    }
}