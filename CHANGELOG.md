# Changelog

## [0.2.0] - 2024-01-07

### Added
- **Peer Events**: New event system for tracking peer connection lifecycle
  - `peerConnected` - Emitted when a peer successfully connects
  - `peerDisconnected` - Emitted when a peer disconnects
  - `peerErrored` - Emitted when a peer encounters an error
- **Peer Management**:
  - `addPeer()` now returns a unique peer ID for tracking
  - `disconnectPeer(peerId)` - Disconnect a specific peer by ID
  - `getConnectedPeers()` - Get list of currently connected peer IDs
- **Enhanced Block Events**: Block events now include the peer ID that sent the block

### Changed
- `start()` method now takes two callbacks: one for blocks and one for peer events
- Block event data now includes `peerId` field
- Improved error handling and logging throughout

### Examples
- Updated `example.js` to demonstrate peer events
- Updated `example-with-discovery.js` to track blocks per peer
- Added `example-disconnect.js` to demonstrate peer management

## [0.1.0] - Initial Release

### Features
- Connect to Chia full nodes using WebSocket over TLS
- Implement Chia handshake protocol
- Listen for new block announcements
- Emit JavaScript events when blocks are received
- Support multiple peer connections
- TypeScript definitions
- Certificate loading helper