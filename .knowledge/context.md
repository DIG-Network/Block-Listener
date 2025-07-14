# Chia Block Listener Project Context

## Current State
- Rust-based WebSocket client connecting to Chia full nodes
- Uses NAPI for Node.js bindings
- Integrated chia-generator-parser crate for block parsing
- Can monitor real-time blocks but coin_spends extraction not working

## Architecture
- `src/peer.rs`: WebSocket connection and block handling
- `src/event_emitter.rs`: NAPI bindings and JS event system
- `crate/chia-generator-parser/`: Block parsing using chia-protocol types
- Direct integration with chia-protocol crate (v0.26.0)

## Recent Progress
- Successfully refactored to use chia-protocol types directly
- Eliminated manual byte parsing and redundant serialization
- Built and tested with real network connections
- Created real-time block monitor (coin-monitor.js)
- **FIXED: Implemented full CLVM execution using chia-consensus**
- **FIXED: TypeScript definitions now include all event types**

## Completed Implementations
- Full CLVM execution using run_block_generator2 for coin extraction
- Real puzzle reveals and solutions from generator bytecode
- Proper TypeScript event type definitions with constants
- Event interfaces for PeerConnected, PeerDisconnected, BlockReceived
- Removed generatorBytecode from block events (not needed)
- Log file streaming for coin-monitor.js
- Removed processTransactionGenerator method (replaced by chia-generator-parser)
- Changed peer IDs from numeric to IP:port strings for better identification
- Added typed event emitters with full TypeScript support via post-build script
- Removed redundant Block type - all APIs now use BlockReceivedEvent consistently

## Dependencies
- chia-protocol = "0.26.0"
- chia-traits = "0.26.0"  
- chia-ssl = "0.26.0"
- chia-consensus = "0.26.0" (for CLVM execution)
- chia-bls = "0.26.0" (for signature handling)
- clvmr = "0.8.0" (for low-level CLVM operations)
- clvm-utils = "0.26.0" (for tree hashing)
- hex = "0.4" (for hex encoding/decoding)

## Testing
- example-get-block-by-height.js: Requests specific blocks
- coin-monitor.js: Monitors real-time blocks
- Both show generator_bytecode but empty coin_spends 