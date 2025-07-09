//! Core functionality for Chia blockchain listening
//! 
//! This crate provides the core logic for connecting to Chia network peers,
//! handling protocol messages, and listening for blockchain events.

pub mod block_data;
pub mod error;
pub mod peer;
pub mod protocol;
pub mod tls;

// Re-export commonly used types
pub use block_data::{BlockData, CoinRecord, process_block_to_data};
pub use error::ChiaError;
pub use peer::{PeerConnection, PeerSession};

// Re-export key dependencies that consumers might need
pub use chia_protocol;
pub use tokio_tungstenite;