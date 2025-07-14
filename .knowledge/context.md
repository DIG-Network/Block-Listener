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
- Discovered coin_spends not being extracted for real-time blocks

## Critical Issue
- **Real-time blocks have empty coin_spends arrays** even when generator_bytecode is present
- Pattern matching in parser returns placeholder data
- No actual CLVM execution implemented
- Missing 99%+ of blockchain data (puzzle reveals, solutions, conditions)

## Dependencies
- chia-protocol = "0.26.0"
- chia-traits = "0.26.0"  
- chia-ssl = "0.26.0"
- clvmr = "0.8.0" (added but not used)
- Need chia_rs for proper CLVM execution

## Testing
- example-get-block-by-height.js: Requests specific blocks
- coin-monitor.js: Monitors real-time blocks
- Both show generator_bytecode but empty coin_spends 