# Project Architecture Index

## Module Structure

### Core Components
- `src/event_emitter.rs` - Main NAPI interface and event system
  - ChiaBlockListener class
  - Event handling (on/off methods)
  - Peer management (addPeer, disconnectPeer, etc.)
  - Block retrieval APIs

- `src/peer.rs` - WebSocket peer connection management
  - Connection handling
  - Block listening
  - Handshake protocol

- `src/protocol.rs` - Chia protocol implementation
  - Message types
  - Handshake structures

### Parser Module (`crate/chia-generator-parser/`)
- `src/parser.rs` - Block parsing with CLVM execution
  - Uses chia-consensus for generator execution
  - Extracts coin spends with puzzle reveals/solutions
  - Handles CREATE_COIN conditions

### TypeScript Integration
- `index.d.ts` - Auto-generated TypeScript definitions
  - Enhanced with typed event overloads via post-build script
  - Full IntelliSense support for event handlers

- `scripts/post-build.js` - Adds typed event method overloads
  - Runs automatically after build
  - Provides type-safe event handling

## Key Interfaces

### Events
- `BlockReceivedEvent` - Contains peerId + all block data
- `PeerConnectedEvent` - peerId, host, port
- `PeerDisconnectedEvent` - peerId, host, port, optional message

### Data Types  
- `BlockReceivedEvent` - Used everywhere for consistency (includes peerId)
- `CoinRecord` - Parent info, puzzle hash, amount
- `CoinSpend` - Full spend with puzzle reveal and solution

## Event System
```typescript
// Typed event handlers
listener.on('blockReceived', (event: BlockReceivedEvent) => { });
listener.on('peerConnected', (event: PeerConnectedEvent) => { });
listener.on('peerDisconnected', (event: PeerDisconnectedEvent) => { });
```

## Peer Identification
- Peer IDs are now `"IP:port"` strings (e.g., `"192.168.1.100:8444"`)
- Makes peer identification clearer in logs and events 