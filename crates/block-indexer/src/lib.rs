//! Block indexer crate for the Chia blockchain
//! 
//! This crate provides functionality for indexing Chia blockchain blocks,
//! tracking coin additions and removals, and maintaining balances.

pub mod error;
pub mod events;
pub mod indexer;
pub mod migrations;
pub mod models;

// Re-export main types for convenience
pub use error::{BlockIndexerError, Result};
pub use events::{EventEmitter, EventSubscriber, IndexerEvent};
pub use indexer::BlockIndexer;
pub use models::{
    Balance, BalanceUpdate, BalanceUpdatedEvent, Block, BlockInput,
    Coin, CoinInput, CoinsUpdatedEvent, Condition,
};
