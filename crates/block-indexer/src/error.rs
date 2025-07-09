//! Error types for the block indexer

use thiserror::Error;

#[derive(Error, Debug)]
pub enum BlockIndexerError {
    #[error("Database error: {0}")]
    Database(#[from] database_connector::DatabaseError),
    
    #[error("SQLx error: {0}")]
    Sqlx(#[from] sqlx::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Invalid block data: {0}")]
    InvalidBlockData(String),
    
    #[error("Invalid puzzle hash: {0}")]
    InvalidPuzzleHash(String),
    
    #[error("Block not found: height {0}")]
    BlockNotFound(u64),
    
    #[error("Migration error: {0}")]
    Migration(String),
    
    #[error("Event system error: {0}")]
    EventSystem(String),
    
    #[error("Other error: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, BlockIndexerError>;