# chia-listener-core

Core functionality for connecting to and listening to Chia blockchain nodes.

This crate provides the core logic for:
- Establishing secure WebSocket connections to Chia full nodes
- Performing the Chia protocol handshake
- Listening for new blocks
- Requesting specific blocks by height
- Processing block data to extract coin information

## Features

- **Peer Connections**: Manage connections to Chia full nodes
- **Block Processing**: Extract coin additions and removals from blocks
- **TLS/SSL**: Secure connections using Chia's certificate system
- **Protocol Support**: Implements necessary parts of the Chia protocol

## Usage

```rust
use chia_listener_core::{PeerConnection, process_block_to_data};
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create a peer connection
    let peer = PeerConnection::new(
        "node.chia.net".to_string(),
        8444,
        "mainnet".to_string(),
    );
    
    // Connect and perform handshake
    let mut ws_stream = peer.connect().await?;
    peer.handshake(&mut ws_stream).await?;
    
    // Listen for blocks
    let (tx, mut rx) = mpsc::channel(100);
    tokio::spawn(async move {
        PeerConnection::listen_for_blocks(ws_stream, tx).await
    });
    
    // Process received blocks
    while let Some(block) = rx.recv().await {
        let block_data = process_block_to_data(&block);
        println!("Block {} has {} coin additions", 
            block_data.height, 
            block_data.coin_additions.len()
        );
    }
    
    Ok(())
}
```

## License

This crate is part of the chia-block-listener project.