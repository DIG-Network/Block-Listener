use thiserror::Error;

#[derive(Error, Debug)]
pub enum ChiaError {
    #[error("Connection error: {0}")]
    Connection(String),
    
    #[error("Protocol error: {0}")]
    Protocol(String),
    
    #[error("Serialization error: {0}")]
    Serialization(String),
    
    #[error("TLS error: {0}")]
    Tls(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),
    
    #[error("Other error: {0}")]
    Other(String),
}