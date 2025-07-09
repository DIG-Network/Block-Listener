//! Error types for the database connector

use thiserror::Error;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Connection error: {0}")]
    ConnectionError(String),
    
    #[error("Query error: {0}")]
    QueryError(String),
    
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Migration error: {0}")]
    MigrationError(String),
    
    #[error("Transaction error: {0}")]
    TransactionError(String),
    
    #[error("Database error: {0}")]
    SqlxError(#[from] sqlx::Error),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    SerdeError(#[from] serde_json::Error),
    
    #[error("Unknown error: {0}")]
    Unknown(String),
}

pub type Result<T> = std::result::Result<T, DatabaseError>;