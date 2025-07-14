# Project Architecture Index

## Module Hierarchy

### Core Rust Implementation
- **`src/lib.rs`** - Library entry point
- **`src/event_emitter.rs`** - Main event handling and CLVM parsing logic
- **`src/peer.rs`** - Peer connection management
- **`src/protocol.rs`** - Chia network protocol implementation
- **`src/tls.rs`** - TLS connection handling
- **`src/error.rs`** - Error handling types

### Node.js Bindings
- **`index.js`** - JavaScript entry point
- **`index.d.ts`** - TypeScript type definitions
- **`build.rs`** - Rust build configuration

### Examples and Testing
- **`examples/coin-monitor.js`** - Example usage demonstrating CLVM parsing
- **`__test__/index.test.mjs`** - Test suite

### Build System
- **`package.json`** - Node.js package configuration
- **`Cargo.toml`** - Rust package configuration
- **`scripts/post-build.js`** - Build post-processing

## System Components

### 1. ChiaBlockListener (Main Interface)
- **Location**: `src/event_emitter.rs`
- **Purpose**: Primary API for blockchain monitoring
- **Key Methods**:
  - `add_peer()` - Connect to Chia peers
  - `on()/off()` - Event handling
  - `process_transaction_generator()` - **FIXED** CLVM parsing
  - `get_block_by_height()` - Block retrieval

### 2. Transaction Generator Processing ✅ FIXED
- **Location**: `src/event_emitter.rs:execute_transaction_generator`
- **Purpose**: Parse and execute CLVM transaction generators
- **Key Function**: `process_transaction_generator()`
- **Input**: Hex-encoded transaction generator bytecode
- **Output**: Extracted coin spends with puzzle reveals and solutions
- **Implementation**: Uses `clvmr::serde::node_from_bytes` + `run_program`

### 3. Event System
- **Location**: `src/event_emitter.rs`
- **Events**:
  - `blockReceived` - New block notifications
  - `peerConnected` - Peer connection events
  - `peerDisconnected` - Peer disconnection events

### 4. Protocol Layer
- **Location**: `src/protocol.rs`, `src/peer.rs`
- **Purpose**: Chia network protocol implementation
- **Features**: Handshake, message serialization, peer management

## Key Interfaces/APIs

### Rust Types
- **`BlockEvent`** - Block data structure
- **`TransactionGeneratorResult`** - CLVM parsing results
- **`CoinSpend`** - Parsed coin spend data
- **`CoinRecord`** - Coin information

### TypeScript Types
- **`ChiaBlockListener`** - Main class interface
- **`Block`** - Block data structure
- **`TransactionGeneratorResult`** - CLVM parsing results
- **`CoinSpend`** - Coin spend data

## Dependencies Between Modules

### Core Dependencies
- `clvmr` → CLVM runtime execution
- `chia-protocol` → Chia blockchain types
- `clvm-traits` → CLVM serialization
- `napi` → Node.js bindings

### Internal Dependencies
- `event_emitter` → `peer` (peer management)
- `event_emitter` → `protocol` (message handling)
- `event_emitter` → `tls` (secure connections)
- `examples` → `index.js` (API usage)

## Recent Architecture Changes

### CLVM Parsing Fix ✅
- **Before**: Used incorrect `chia_protocol::Program::from()` 
- **After**: Uses `clvmr::serde::node_from_bytes` directly
- **Impact**: Proper transaction generator parsing
- **Files Modified**: `src/event_emitter.rs`

### Code Quality
- **Status**: 19 build warnings (unused imports/functions)
- **Impact**: No functional issues, cleanup needed
- **Priority**: Low (maintenance) 