//! Data models for the block indexer

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Represents a block in the blockchain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub height: i64,
    pub header_hash: String,
    pub prev_header_hash: String,
    pub timestamp: DateTime<Utc>,
    pub additions_count: i32,
    pub removals_count: i32,
    pub created_at: DateTime<Utc>,
}

/// Represents a coin condition (addition or removal)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    pub id: i64,
    pub height: i64,
    pub puzzle_hash: String,
    pub parent_coin_info: String,
    pub amount: i64,
    pub is_addition: bool,
    pub coin_id: String,
    pub created_at: DateTime<Utc>,
}

/// Represents a coin in the UTXO set
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coin {
    pub coin_id: String,
    pub puzzle_hash: String,
    pub parent_coin_info: String,
    pub amount: i64,
    pub created_height: i64,
    pub spent_height: Option<i64>,
    pub is_spent: bool,
}

/// Represents a balance for a puzzle hash
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub puzzle_hash: String,
    pub total_amount: i64,
    pub coin_count: i32,
    pub last_updated_height: i64,
}

/// Input data for inserting a block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockInput {
    pub height: i64,
    pub header_hash: String,
    pub prev_header_hash: String,
    pub timestamp: DateTime<Utc>,
    pub additions: Vec<CoinInput>,
    pub removals: Vec<CoinInput>,
}

/// Input data for a coin (addition or removal)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinInput {
    pub puzzle_hash: String,
    pub parent_coin_info: String,
    pub amount: i64,
}

impl CoinInput {
    /// Calculate the coin ID from the coin data
    pub fn coin_id(&self) -> String {
        // In Chia, coin_id is sha256(parent_coin_info + puzzle_hash + amount)
        // For now, we'll use a simple concatenation as placeholder
        // In production, this should use proper SHA256 hashing
        format!("{}-{}-{}", self.parent_coin_info, self.puzzle_hash, self.amount)
    }
}

/// Event data for coin updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinsUpdatedEvent {
    pub height: i64,
    pub puzzle_hashes: Vec<String>,
    pub additions: Vec<Coin>,
    pub removals: Vec<Coin>,
}

/// Event data for balance updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceUpdatedEvent {
    pub height: i64,
    pub updates: Vec<BalanceUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceUpdate {
    pub puzzle_hash: String,
    pub old_amount: i64,
    pub new_amount: i64,
    pub old_coin_count: i32,
    pub new_coin_count: i32,
}