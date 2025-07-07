# Chia Block Listener

A Rust-based event emitter for Chia blockchain that listens for new blocks from peers and emits events to Node.js applications via NAPI bindings.

## Overview

This project provides a native Node.js module written in Rust that:
- Connects to Chia full nodes using the native Chia peer protocol
- Performs the Chia handshake with TLS certificates
- Listens for new block announcements
- Emits JavaScript events when new blocks are received
- Supports multiple peer connections

**Design Philosophy**: This module gives full control to the JavaScript side for peer management. This allows developers to:
- Implement custom peer discovery (DNS, static lists, etc.)
- Manage certificates from any source
- Add/remove peers dynamically based on their needs
- Build more complex peer selection strategies

## Features

- **Native Performance**: Written in Rust for optimal performance
- **Event-Based Architecture**: Uses Node.js event emitters for easy integration
- **TypeScript Support**: Full TypeScript definitions included
- **Async/Await API**: Modern async API design
- **Multiple Peers**: Connect to multiple Chia nodes simultaneously
- **TLS Support**: Full TLS certificate support for secure connections

## Installation

First, ensure you have Rust installed:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Install dependencies and build:
```bash
npm install
npm run build
```

## Usage

```javascript
const { ChiaBlockListener, loadChiaCerts, initTracing } = require('chia-block-listener');

async function main() {
  // Initialize logging (optional)
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  // Load certificates from your Chia installation
  const certs = loadChiaCerts('/home/user/.chia/mainnet');

  // Add one or more peers
  const peerId = listener.addPeer(
    '192.168.1.100',  // Peer IP address
    8444,             // Port (default: 8444)
    'mainnet',        // Network ID
    certs.cert,       // TLS certificate
    certs.key,        // TLS key
    certs.ca          // CA certificate
  );

  // Start listening for blocks and peer events
  listener.start(
    // Block callback
    (block) => {
      console.log('New block from peer', block.peerId, {
        height: block.height,
        weight: block.weight,
        header_hash: block.header_hash,
        timestamp: new Date(block.timestamp * 1000)
      });
    },
    // Event callback
    (event) => {
      console.log('Peer event:', event.type, 'for peer', event.peerId);
      if (event.type === 'error') {
        console.error('Error:', event.message);
      }
    }
  );

  // Stop when done
  // listener.stop();
}

main().catch(console.error);
```

## API Reference

### `ChiaBlockListener`

The main class for listening to Chia blockchain events.

#### Constructor
```typescript
new ChiaBlockListener()
```

#### Methods

##### `addPeer(host, port, networkId, tlsCert, tlsKey, caCert)`
Add a peer to connect to.

- `host`: String - The IP address or hostname of the peer
- `port`: Number - The port number (typically 8444)
- `networkId`: String - The network ID ('mainnet' or 'testnet11')
- `tlsCert`: Buffer - The TLS certificate
- `tlsKey`: Buffer - The TLS private key
- `caCert`: Buffer - The CA certificate

Returns: `number` - The peer ID assigned to this peer

##### `disconnectPeer(peerId)`
Disconnect a specific peer.

- `peerId`: Number - The ID of the peer to disconnect

Returns: `boolean` - true if the peer was found and disconnected, false otherwise

##### `start(blockCallback, eventCallback)`
Start listening for blocks from all added peers.

- `blockCallback`: Function - Called when a new block is received
- `eventCallback`: Function - Called when peer events occur (connected, disconnected, error)

##### `stop()`
Stop listening for blocks and disconnect all peers.

##### `isRunning()`
Check if the listener is currently running.

Returns: `boolean`

##### `getConnectedPeers()`
Get a list of currently connected peer IDs.

Returns: `number[]` - Array of connected peer IDs

### discoverPeers(count?)

Discovers available Chia peers using DNS introducers and returns a random selection.

**Parameters:**
- `count` (number, optional): Number of random peers to return (defaults to 1)

**Returns:** Promise<string[]> - Array of peer addresses in format "host:port"

**Example:**
```javascript
// Get 1 random peer (default)
const peer = await listener.discoverPeers();

// Get 10 random peers
const peers = await listener.discoverPeers(10);
```

### Helper Functions

#### `loadChiaCerts(chiaRoot)`
Load Chia certificates from the filesystem.

- `chiaRoot`: String - The Chia root directory (e.g., `~/.chia/mainnet`)

Returns: `{ cert: Buffer, key: Buffer, ca: Buffer }`

#### `initTracing()`
Initialize logging/tracing. Set the `RUST_LOG` environment variable to control log levels.

## Event Data

### Block Event

When a new block is received, the block callback receives an object with:

```typescript
interface ChiaBlock {
  peerId: number;        // ID of the peer that sent the block
  height: number;        // Block height
  weight: string;        // Chain weight (as string due to large numbers)
  header_hash: string;   // Block header hash (hex)
  timestamp: number;     // Block timestamp (seconds since epoch)
}
```

### Peer Event

When peer connection events occur, the event callback receives an object with:

```typescript
interface PeerEvent {
  type: 'connected' | 'disconnected' | 'error';  // Event type
  peerId: number;        // ID of the peer
  host: string;          // Peer hostname/IP
  port: number;          // Peer port
  message?: string;      // Optional message (for errors or disconnect reasons)
}
```

## Protocol Details

This implementation:
1. Establishes WebSocket connections to Chia peers on port 8444
2. Performs TLS handshake using Chia certificates
3. Sends the Chia protocol handshake message
4. Listens for `NewPeak` messages from peers
5. Requests full block data when new peaks are announced
6. Emits events when `RespondBlock` messages are received

## Environment Variables

- `CHIA_ROOT`: Override the default Chia root directory
- `RUST_LOG`: Control logging levels (e.g., `debug`, `info`, `warn`, `error`)

Example:
```bash
RUST_LOG=chia_block_listener=debug node example.js
```

## Examples

Three example files are provided:

### `example.js`
A simple example that:
- Loads certificates from your Chia installation
- Connects to a local Chia full node
- Logs all received blocks and peer events
- Handles graceful shutdown

### `example-with-discovery.js`
A more advanced example that:
- Implements DNS-based peer discovery
- Connects to multiple discovered peers
- Tracks statistics about received blocks per peer
- Shows periodic status updates with peer connection info

### `example-disconnect.js`
Demonstrates peer management:
- Connects to multiple peers
- Shows how to disconnect specific peers
- Tracks peer connection status
- Displays connected peers periodically

### Peer Discovery Example

Here's how you might implement DNS-based peer discovery in Node.js:

```javascript
const dns = require('dns').promises;

async function discoverPeers() {
  const introducers = [
    'dns-introducer.chia.net',
    'chia.ctrlaltdel.ch',
    'seeder.dexie.space'
  ];
  
  const peers = [];
  
  for (const introducer of introducers) {
    try {
      const addresses = await dns.resolve4(introducer);
      peers.push(...addresses.map(ip => ({ host: ip, port: 8444 })));
    } catch (err) {
      console.warn(`Failed to resolve ${introducer}:`, err.message);
    }
  }
  
  return peers;
}

// Usage
const peers = await discoverPeers();
const listener = new ChiaBlockListener();

// Add discovered peers
for (const peer of peers.slice(0, 5)) { // Connect to first 5 peers
  listener.addPeer(peer.host, peer.port, 'mainnet', certs.cert, certs.key, certs.ca);
}
```

## Building from Source

1. Clone the repository
2. Install Rust and Node.js
3. Run `npm install`
4. Run `npm run build`

## Development

For development builds with debug symbols:
```bash
npm run build:debug
```

## Architecture

The project consists of:
- **Rust Core** (`src/`): Handles peer connections, protocol messages, and block parsing
- **NAPI Bindings**: Exposes Rust functionality to JavaScript
- **TypeScript Definitions** (`index.d.ts`): Provides type safety for TypeScript users

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

### Certificate Loading Issues
Make sure your `CHIA_ROOT` points to a valid Chia installation with certificates in:
- `config/ssl/full_node/private_full_node.crt`
- `config/ssl/full_node/private_full_node.key`
- `config/ssl/ca/chia_ca.crt`

### Connection Issues
- Ensure the peer is running and accessible
- Check firewall settings for port 8444
- Verify the network ID matches (mainnet vs testnet)

### Building Issues
- Ensure OpenSSL development libraries are installed: `sudo apt-get install libssl-dev pkg-config`
- Make sure you have a recent version of Rust (1.70+)

### sync(startHeight?, blockCallback, eventCallback, syncStatusCallback)

Synchronize the blockchain from a starting height to the current height, then switch to listening for new blocks. The sync method automatically distributes requests across all connected peers using round-robin load balancing.

**Parameters:**
- `startHeight` (number, optional): Starting block height (defaults to 1)
- `blockCallback` (function): Called for each block received
- `eventCallback` (function): Called for peer events
- `syncStatusCallback` (function): Called with sync progress updates

**Sync Status Object:**
- `phase` (string): Current phase - "historical" or "live"
- `currentHeight` (number): Current block height being processed
- `targetHeight` (number | null): Target height for historical sync
- `blocksPerSecond` (number): Current sync speed

**Example:**
```javascript
// Add multiple peers first
listener.addPeer('peer1.example.com', 8444, 'mainnet');
listener.addPeer('peer2.example.com', 8444, 'mainnet');
listener.addPeer('peer3.example.com', 8444, 'mainnet');

// Start the listener to establish connections
listener.start(() => {}, (event) => {
    console.log(`Peer event: ${event.type}`);
});

// Start syncing
await listener.sync(
    1000000, // Start from block 1,000,000
    (block) => {
        console.log(`Block ${block.height} from peer ${block.peerId}: ${block.header_hash}`);
    },
    (event) => {
        console.log(`Event: ${event.type}`);
    },
    (status) => {
        console.log(`Phase: ${status.phase}, Height: ${status.currentHeight}/${status.targetHeight || 'live'}`);
    }
);
```

## Examples

- `example.js` - Basic connection and block listening
- `example-with-discovery.js` - Automatic peer discovery
- `example-disconnect.js` - Handling disconnections
- `example-historical-blocks.js` - Fetching historical blocks
- `example-sync.js` - Full blockchain synchronization with progress tracking

## License

MIT