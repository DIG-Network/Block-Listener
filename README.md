# Chia Block Listener

A high-performance Chia blockchain listener for Node.js, built with Rust and NAPI bindings. This library provides real-time monitoring of the Chia blockchain with efficient peer connections and block parsing capabilities.

## Features

- **Real-time Block Monitoring**: Listen for new blocks as they're produced on the Chia network
- **Peer Management**: Connect to multiple Chia full nodes simultaneously
- **Efficient Parsing**: Fast extraction of coin spends, additions, and removals from blocks
- **Event-Driven Architecture**: TypeScript-friendly event system with full type safety
- **Transaction Analysis**: Parse CLVM puzzles and solutions from coin spends
- **Historical Block Access**: Retrieve blocks by height or ranges
- **Connection Pool**: ChiaPeerPool provides automatic load balancing and rate limiting for historical queries
- **Cross-platform Support**: Works on Windows, macOS, and Linux (x64 and ARM64)
- **TypeScript Support**: Complete TypeScript definitions with IntelliSense

## Installation

```bash
npm install @dignetwork/chia-block-listener
```

## Quick Start

```javascript
const { ChiaBlockListener, initTracing } = require('@dignetwork/chia-block-listener')

// Initialize tracing for debugging (optional)
initTracing()

// Create a new listener instance
const listener = new ChiaBlockListener()

// Listen for block events
listener.on('blockReceived', (block) => {
  console.log(`New block received: ${block.height}`)
  console.log(`Header hash: ${block.headerHash}`)
  console.log(`Timestamp: ${new Date(block.timestamp * 1000)}`)
  console.log(`Coin additions: ${block.coinAdditions.length}`)
  console.log(`Coin removals: ${block.coinRemovals.length}`)
  console.log(`Coin spends: ${block.coinSpends.length}`)
})

// Listen for peer connection events
listener.on('peerConnected', (peer) => {
  console.log(`Connected to peer: ${peer.peerId} (${peer.host}:${peer.port})`)
})

listener.on('peerDisconnected', (peer) => {
  console.log(`Disconnected from peer: ${peer.peerId}`)
  if (peer.message) {
    console.log(`Reason: ${peer.message}`)
  }
})

// Connect to a Chia full node
const peerId = listener.addPeer('localhost', 8444, 'mainnet')
console.log(`Added peer: ${peerId}`)

// Keep the process running
process.on('SIGINT', () => {
  console.log('Shutting down...')
  listener.disconnectAllPeers()
  process.exit(0)
})
```

## API Reference

### ChiaBlockListener Class

#### Constructor

```javascript
const listener = new ChiaBlockListener()
```

Creates a new Chia block listener instance.

#### Methods

##### `addPeer(host, port, networkId): string`

Connects to a Chia full node and starts listening for blocks.

**Parameters:**
- `host` (string): The hostname or IP address of the Chia node
- `port` (number): The port number (typically 8444 for mainnet)
- `networkId` (string): The network identifier ('mainnet', 'testnet', etc.)

**Returns:** A unique peer ID string for this connection

##### `disconnectPeer(peerId): boolean`

Disconnects from a specific peer.

**Parameters:**
- `peerId` (string): The peer ID returned by `addPeer()`

**Returns:** `true` if the peer was successfully disconnected, `false` otherwise

##### `disconnectAllPeers(): void`

Disconnects from all connected peers.

##### `getConnectedPeers(): string[]`

Returns an array of currently connected peer IDs.

##### `getBlockByHeight(peerId, height): BlockReceivedEvent`

Retrieves a specific block by its height from a connected peer.

**Parameters:**
- `peerId` (string): The peer ID to query
- `height` (number): The block height to retrieve

**Returns:** A `BlockReceivedEvent` object containing the block data

##### `getBlocksRange(peerId, startHeight, endHeight): BlockReceivedEvent[]`

Retrieves a range of blocks from a connected peer.

**Parameters:**
- `peerId` (string): The peer ID to query
- `startHeight` (number): The starting block height (inclusive)
- `endHeight` (number): The ending block height (inclusive)

**Returns:** An array of `BlockReceivedEvent` objects

### ChiaPeerPool Class

The `ChiaPeerPool` provides a managed pool of peer connections for retrieving historical blocks with automatic load balancing and rate limiting.

#### Constructor

```javascript
const pool = new ChiaPeerPool()
```

Creates a new peer pool instance with built-in rate limiting (500ms per peer).

#### Methods

##### `addPeer(host, port, networkId): Promise<string>`

Adds a peer to the connection pool.

**Parameters:**
- `host` (string): The hostname or IP address of the Chia node
- `port` (number): The port number (typically 8444 for mainnet)
- `networkId` (string): The network identifier ('mainnet', 'testnet', etc.)

**Returns:** A Promise that resolves to a unique peer ID string

##### `getBlockByHeight(height): Promise<BlockReceivedEvent>`

Retrieves a specific block by height using automatic peer selection and load balancing.

**Parameters:**
- `height` (number): The block height to retrieve

**Returns:** A Promise that resolves to a `BlockReceivedEvent` object

##### `removePeer(peerId): Promise<boolean>`

Removes a peer from the pool.

**Parameters:**
- `peerId` (string): The peer ID to remove

**Returns:** A Promise that resolves to `true` if the peer was removed, `false` otherwise

##### `shutdown(): Promise<void>`

Shuts down the pool and disconnects all peers.

##### `getConnectedPeers(): Promise<string[]>`

Returns a list of connected peer IDs.

##### `on(event, callback): void`

Registers an event handler for pool events.

**Parameters:**
- `event` (string): The event name ('peerConnected' or 'peerDisconnected')
- `callback` (function): The event handler function

##### `off(event, callback): void`

Removes an event handler.

**Parameters:**
- `event` (string): The event name to stop listening for

### Events

The `ChiaBlockListener` emits the following events:

#### `blockReceived`

Fired when a new block is received from any connected peer.

**Callback:** `(event: BlockReceivedEvent) => void`

#### `peerConnected`

Fired when a connection to a peer is established.

**Callback:** `(event: PeerConnectedEvent) => void`

#### `peerDisconnected`

Fired when a peer connection is lost.

**Callback:** `(event: PeerDisconnectedEvent) => void`

### ChiaPeerPool Events

The `ChiaPeerPool` emits the following events:

#### `peerConnected`

Fired when a peer is successfully added to the pool.

**Callback:** `(event: PeerConnectedEvent) => void`

#### `peerDisconnected`

Fired when a peer is removed from the pool or disconnects.

**Callback:** `(event: PeerDisconnectedEvent) => void`

### Event Data Types

#### `BlockReceivedEvent`

```typescript
interface BlockReceivedEvent {
  peerId: string                    // IP address of the peer that sent this block
  height: number                     // Block height
  weight: string                     // Block weight as string
  headerHash: string               // Block header hash (hex)
  timestamp: number                 // Block timestamp (Unix time)
  coinAdditions: CoinRecord[]      // New coins created in this block
  coinRemovals: CoinRecord[]       // Coins spent in this block
  coinSpends: CoinSpend[]         // Detailed spend information
  coinCreations: CoinRecord[]      // Coins created by puzzles
  hasTransactionsGenerator: boolean // Whether block has a generator
  generatorSize: number            // Size of the generator bytecode
}
```

#### `PeerConnectedEvent`

```typescript
interface PeerConnectedEvent {
  peerId: string  // Peer IP address
  host: string     // Peer hostname/IP
  port: number     // Peer port number
}
```

#### `PeerDisconnectedEvent`

```typescript
interface PeerDisconnectedEvent {
  peerId: string   // Peer IP address
  host: string      // Peer hostname/IP
  port: number      // Peer port number
  message?: string  // Optional disconnection reason
}
```

#### `CoinRecord`

```typescript
interface CoinRecord {
  parentCoinInfo: string  // Parent coin ID (hex)
  puzzleHash: string       // Puzzle hash (hex)
  amount: string            // Coin amount as string
}
```

#### `CoinSpend`

```typescript
interface CoinSpend {
  coin: CoinRecord         // The coin being spent
  puzzleReveal: string    // CLVM puzzle bytecode (hex)
  solution: string         // CLVM solution bytecode (hex)
  offset: number           // Offset in the generator bytecode
}
```

## ChiaPeerPool Usage

The `ChiaPeerPool` is designed for efficiently retrieving historical blocks with automatic load balancing across multiple peers.

### Basic Usage

```javascript
const { ChiaPeerPool, initTracing } = require('@dignetwork/chia-block-listener')

async function main() {
  // Initialize tracing
  initTracing()
  
  // Create a peer pool
  const pool = new ChiaPeerPool()
  
  // Listen for pool events
  pool.on('peerConnected', (event) => {
    console.log(`Peer connected to pool: ${event.peerId}`)
  })
  
  pool.on('peerDisconnected', (event) => {
    console.log(`Peer disconnected from pool: ${event.peerId}`)
  })
  
  // Add multiple peers
  await pool.addPeer('node1.chia.net', 8444, 'mainnet')
  await pool.addPeer('node2.chia.net', 8444, 'mainnet')
  await pool.addPeer('node3.chia.net', 8444, 'mainnet')
  
  // Fetch blocks with automatic load balancing
  const block1 = await pool.getBlockByHeight(5000000)
  const block2 = await pool.getBlockByHeight(5000001)
  const block3 = await pool.getBlockByHeight(5000002)
  
  console.log(`Block ${block1.height}: ${block1.coinSpends.length} spends`)
  console.log(`Block ${block2.height}: ${block2.coinSpends.length} spends`)
  console.log(`Block ${block3.height}: ${block3.coinSpends.length} spends`)
  
  // Shutdown the pool
  await pool.shutdown()
}

main().catch(console.error)
```

### Advanced Pool Features

#### Rate Limiting

The pool automatically enforces a 500ms rate limit per peer to prevent overwhelming any single node:

```javascript
// Rapid requests are automatically queued and distributed
const promises = []
for (let i = 5000000; i < 5000100; i++) {
  promises.push(pool.getBlockByHeight(i))
}

// All requests will be processed efficiently across all peers
const blocks = await Promise.all(promises)
console.log(`Retrieved ${blocks.length} blocks`)
```

#### Dynamic Peer Management

```javascript
// Monitor pool health
const peers = await pool.getConnectedPeers()
console.log(`Active peers in pool: ${peers.length}`)

// Remove underperforming peers
if (slowPeer) {
  await pool.removePeer(slowPeer)
  console.log('Removed slow peer from pool')
}

// Add new peers dynamically
if (peers.length < 3) {
  await pool.addPeer('backup-node.chia.net', 8444, 'mainnet')
}
```

#### Error Handling

```javascript
try {
  const block = await pool.getBlockByHeight(5000000)
  console.log(`Retrieved block ${block.height}`)
} catch (error) {
  console.error('Failed to retrieve block:', error)
  
  // The pool will automatically try other peers
  // You can also add more peers if needed
  const peers = await pool.getConnectedPeers()
  if (peers.length === 0) {
    console.log('No peers available, adding new ones...')
    await pool.addPeer('node1.chia.net', 8444, 'mainnet')
  }
}
```

### When to Use ChiaPeerPool vs ChiaBlockListener

- **Use ChiaPeerPool when:**
  - You need to fetch historical blocks
  - You want automatic load balancing across multiple peers
  - You're making many block requests and need rate limiting
  - You don't need real-time block notifications

- **Use ChiaBlockListener when:**
  - You need real-time notifications of new blocks
  - You want to monitor the blockchain as it grows
  - You need to track specific addresses or puzzle hashes in real-time
  - You're building applications that react to blockchain events

Both classes can be used together in the same application for different purposes.

## TypeScript Usage

```typescript
import { 
  ChiaBlockListener, 
  ChiaPeerPool,
  BlockReceivedEvent, 
  PeerConnectedEvent, 
  PeerDisconnectedEvent,
  CoinRecord,
  CoinSpend,
  initTracing,
  getEventTypes
} from '@dignetwork/chia-block-listener'

// Initialize tracing for debugging
initTracing()

// Create listener with proper typing
const listener = new ChiaBlockListener()

// Type-safe event handlers
listener.on('blockReceived', (block: BlockReceivedEvent) => {
  console.log(`Block ${block.height} from peer ${block.peerId}`)
  
  // Process coin additions
  block.coin_additions.forEach((coin: CoinRecord) => {
    console.log(`New coin: ${coin.amount} mojos`)
  })
  
  // Process coin spends
  block.coin_spends.forEach((spend: CoinSpend) => {
    console.log(`Spend: ${spend.coin.amount} mojos`)
    console.log(`Puzzle: ${spend.puzzle_reveal}`)
    console.log(`Solution: ${spend.solution}`)
  })
})

listener.on('peerConnected', (peer: PeerConnectedEvent) => {
  console.log(`Connected: ${peer.peerId} at ${peer.host}:${peer.port}`)
})

listener.on('peerDisconnected', (peer: PeerDisconnectedEvent) => {
  console.log(`Disconnected: ${peer.peerId}`)
  if (peer.message) {
    console.log(`Reason: ${peer.message}`)
  }
})

// Connect to peers
const mainnetPeer = listener.addPeer('localhost', 8444, 'mainnet')
const testnetPeer = listener.addPeer('testnet-node.chia.net', 58444, 'testnet')

// Get historical blocks
async function getHistoricalBlocks() {
  try {
    const block = listener.getBlockByHeight(mainnetPeer, 1000000)
    console.log(`Block 1000000 hash: ${block.header_hash}`)
    
    const blocks = listener.getBlocksRange(mainnetPeer, 1000000, 1000010)
    console.log(`Retrieved ${blocks.length} blocks`)
  } catch (error) {
    console.error('Error getting blocks:', error)
  }
}

// Get event type constants
const eventTypes = getEventTypes()
console.log('Available events:', eventTypes)

// TypeScript support for ChiaPeerPool
const pool = new ChiaPeerPool()

// Type-safe event handling
pool.on('peerConnected', (event: PeerConnectedEvent) => {
  console.log(`Pool peer connected: ${event.peerId}`)
})

// Async/await with proper typing
async function fetchHistoricalData() {
  const block: BlockReceivedEvent = await pool.getBlockByHeight(5000000)
  const peers: string[] = await pool.getConnectedPeers()
  
  console.log(`Block ${block.height} has ${block.coinSpends.length} spends`)
  console.log(`Pool has ${peers.length} active peers`)
}
```

## Advanced Usage

### Monitoring Specific Transactions

```javascript
// Monitor all coin spends for a specific puzzle hash
listener.on('blockReceived', (block) => {
  const targetPuzzleHash = '0x1234...' // Your puzzle hash
  
  block.coin_spends.forEach((spend) => {
    if (spend.coin.puzzle_hash === targetPuzzleHash) {
      console.log('Found spend for our puzzle!')
      console.log('Amount:', spend.coin.amount)
      console.log('Solution:', spend.solution)
    }
  })
})
```

### Multiple Network Monitoring

```javascript
// Monitor both mainnet and testnet
const mainnetPeer = listener.addPeer('localhost', 8444, 'mainnet')
const testnetPeer = listener.addPeer('localhost', 58444, 'testnet')

listener.on('blockReceived', (block) => {
  if (block.peerId === mainnetPeer) {
    console.log(`Mainnet block ${block.height}`)
  } else if (block.peerId === testnetPeer) {
    console.log(`Testnet block ${block.height}`)
  }
})
```

### Connection Management

```javascript
// Automatic reconnection
listener.on('peerDisconnected', (peer) => {
  console.log(`Lost connection to ${peer.peerId}, reconnecting...`)
  
  // Reconnect after 5 seconds
  setTimeout(() => {
    try {
      listener.addPeer(peer.host, peer.port, 'mainnet')
      console.log('Reconnected successfully')
    } catch (error) {
      console.error('Reconnection failed:', error)
    }
  }, 5000)
})
```

## Utility Functions

### `initTracing(): void`

Initializes the Rust tracing system for debugging purposes. Call this before creating any `ChiaBlockListener` instances if you want to see debug output.

### `getEventTypes(): EventTypes`

Returns an object containing the event type constants:

```javascript
const eventTypes = getEventTypes()
console.log(eventTypes)
// Output: { blockReceived: "blockReceived", peerConnected: "peerConnected", peerDisconnected: "peerDisconnected" }
```

## Performance Tips

1. **Use specific event handlers**: Only listen for the events you need
2. **Process blocks efficiently**: Avoid heavy computation in event handlers
3. **Manage connections**: Don't create too many peer connections simultaneously
4. **Handle errors gracefully**: Always wrap peer operations in try-catch blocks

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (20 or later)
- [npm](https://www.npmjs.com/)

### Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd chia-block-listener
npm install

# Build the native module
npm run build

# Run tests
npm test
```

### Project Structure

```
chia-block-listener/
├── src/                     # Rust source code
│   ├── lib.rs              # Main NAPI bindings
│   ├── peer.rs             # Peer connection management
│   ├── protocol.rs         # Chia protocol implementation
│   ├── event_emitter.rs    # Event system
│   └── tls.rs              # TLS connection handling
├── crate/                  # Additional Rust crates
│   └── chia-generator-parser/ # CLVM parser
├── __test__/               # Test suite
├── npm/                    # Platform-specific binaries
├── .github/workflows/      # CI/CD pipeline
├── Cargo.toml              # Rust configuration
├── package.json            # Node.js configuration
└── index.d.ts              # TypeScript definitions
```

## CI/CD & Publishing

This project uses GitHub Actions for:
- Cross-platform builds (Windows, macOS, Linux)
- Multiple architectures (x64, ARM64)
- Automated testing on all platforms
- npm publishing based on git tags

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Support

For issues and questions:
- GitHub Issues: [Report bugs or request features](https://github.com/DIG-Network/chia-block-listener/issues)
- Documentation: Check the TypeScript definitions in `index.d.ts`
- Examples: See the `examples/` directory for more usage examples 