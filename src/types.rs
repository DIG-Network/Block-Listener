use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChiaBlock {
    pub header_hash: String,
    pub height: u32,
    pub weight: u128,
    pub timestamp: u64,
    pub prev_header_hash: String,
    pub farmer_puzzle_hash: String,
    pub pool_puzzle_hash: String,
    pub transactions_generator: Option<String>,
    pub transactions_generator_ref_list: Vec<u32>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockEvent {
    pub header_hash: String,
    pub height: u32,
    pub weight: String, // String because u128 isn't supported in NAPI
    pub timestamp: u32, // u32 for JavaScript compatibility
    pub prev_header_hash: String,
    pub farmer_puzzle_hash: String,
    pub pool_puzzle_hash: String,
}

impl From<ChiaBlock> for BlockEvent {
    fn from(block: ChiaBlock) -> Self {
        Self {
            header_hash: block.header_hash,
            height: block.height,
            weight: block.weight.to_string(),
            timestamp: block.timestamp as u32,
            prev_header_hash: block.prev_header_hash,
            farmer_puzzle_hash: block.farmer_puzzle_hash,
            pool_puzzle_hash: block.pool_puzzle_hash,
        }
    }
}