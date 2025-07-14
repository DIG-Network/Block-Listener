# Chia Block Listener

A high-performance Chia blockchain listener for Node.js, built with Rust and NAPI bindings. This library provides real-time monitoring of the Chia blockchain with efficient peer connections and block parsing capabilities.

## Features

- **Real-time Block Monitoring**: Listen for new blocks as they're produced on the Chia network
- **Peer Management**: Connect to multiple Chia full nodes simultaneously
- **Efficient Parsing**: Fast extraction of coin spends, additions, and removals from blocks
- **Event-Driven Architecture**: TypeScript-friendly event system with full type safety
- **Transaction Analysis**: Parse CLVM puzzles and solutions from coin spends
- **Historical Block Access**: Retrieve blocks by height or ranges
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

### Event Data Types

#### `BlockReceivedEvent`

```typescript
interface BlockReceivedEvent {
  peerId: string                    // ID of the peer that sent this block
  height: number                    // Block height
  weight: string                    // Block weight as string
  headerHash: string               // Block header hash (hex)
  timestamp: number                // Block timestamp (Unix time)
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
  peerId: string  // Unique peer identifier
  host: string    // Peer hostname/IP
  port: number    // Peer port number
}
```

#### `PeerDisconnectedEvent`

```typescript
interface PeerDisconnectedEvent {
  peerId: string    // Unique peer identifier
  host: string      // Peer hostname/IP
  port: number      // Peer port number
  message?: string  // Optional disconnection reason
}
```

#### `CoinRecord`

```typescript
interface CoinRecord {
  parentCoinInfo: string  // Parent coin ID (hex)
  puzzleHash: string      // Puzzle hash (hex)
  amount: string          // Coin amount as string
}
```

#### `CoinSpend`

```typescript
interface CoinSpend {
  coin: CoinRecord        // The coin being spent
  puzzleReveal: string    // CLVM puzzle bytecode (hex)
  solution: string        // CLVM solution bytecode (hex)
  realData: boolean       // Whether this is real spend data
  parsingMethod: string   // Method used to parse the spend
  offset: number          // Offset in the generator bytecode
}
```

## TypeScript Usage

```typescript
import { 
  ChiaBlockListener, 
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
  block.coinAdditions.forEach((coin: CoinRecord) => {
    console.log(`New coin: ${coin.amount} mojos`)
  })
  
  // Process coin spends
  block.coinSpends.forEach((spend: CoinSpend) => {
    console.log(`Spend: ${spend.coin.amount} mojos`)
    console.log(`Puzzle: ${spend.puzzleReveal}`)
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
    console.log(`Block 1000000 hash: ${block.headerHash}`)
    
    const blocks = listener.getBlocksRange(mainnetPeer, 1000000, 1000010)
    console.log(`Retrieved ${blocks.length} blocks`)
  } catch (error) {
    console.error('Error getting blocks:', error)
  }
}

// Get event type constants
const eventTypes = getEventTypes()
console.log('Available events:', eventTypes)
```

## Advanced Usage

### Monitoring Specific Transactions

```javascript
// Monitor all coin spends for a specific puzzle hash
listener.on('blockReceived', (block) => {
  const targetPuzzleHash = '0x1234...' // Your puzzle hash
  
  block.coinSpends.forEach((spend) => {
    if (spend.coin.puzzleHash === targetPuzzleHash) {
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