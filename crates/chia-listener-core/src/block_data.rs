//! Block data structures and utilities

use serde::{Deserialize, Serialize};
use chia_protocol::FullBlock;

/// Represents a processed block with extracted coin information
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlockData {
    pub height: u32,
    pub weight: String,
    pub header_hash: String,
    pub timestamp: Option<u32>,
    pub coin_additions: Vec<CoinRecord>,
    pub coin_removals: Vec<CoinRecord>,
    pub has_transactions_generator: bool,
    pub generator_size: Option<u32>,
}

/// Represents a coin record (addition or removal)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CoinRecord {
    pub parent_coin_info: String,
    pub puzzle_hash: String,
    pub amount: u64,
}

/// Processes a FullBlock and extracts coin information
pub fn process_block_to_data(block: &FullBlock) -> BlockData {
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
    
    BlockData {
        height: block.reward_chain_block.height,
        weight: block.reward_chain_block.weight.to_string(),
        header_hash: hex::encode(block.header_hash()),
        timestamp: block.foliage_transaction_block.as_ref().map(|f| f.timestamp as u32),
        coin_additions,
        coin_removals,
        has_transactions_generator: has_generator,
        generator_size,
    }
}