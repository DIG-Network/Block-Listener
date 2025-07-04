# Chia Blockchain TypeScript Client

A production-ready TypeScript client for connecting to the Chia blockchain peer-to-peer network, receiving blocks in real-time, and caching them to a database.

## Features

- 🔌 **P2P Network Connection**: Connect directly to Chia fullnode peers using WebSocket protocol
- 📦 **Real-time Block Reception**: Receive and process new blocks as they're added to the blockchain
- 💾 **Database Caching**: Store blocks in PostgreSQL or SQLite with TypeORM
- ⚡ **In-Memory Cache**: Fast block retrieval with configurable TTL and size limits
- 🪝 **Event Hooks**: React to blockchain events with a type-safe event system
- 🔄 **Automatic Synchronization**: Sync missing blocks and handle chain reorganizations
- 📊 **Statistics & Monitoring**: Track connection stats, cache performance, and sync progress
- 🛡️ **Type Safety**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install @chia/blockchain-client
```

## Quick Start

```typescript
import { ChiaBlockchainClient } from '@chia/blockchain-client';

// Initialize the client
const client = new ChiaBlockchainClient({
  host: 'localhost',
  port: 8444,
  networkId: 'mainnet',
  database: {
    type: 'sqlite',
    database: './chia-blocks.db'
  },
  hooks: {
    onNewBlock: async (block) => {
      console.log(`New block: Height ${block.height}, Hash ${block.header_hash}`);
    },
    onError: (error) => {
      console.error('Client error:', error);
    }
  }
});

// Start the client
await client.initialize();

// Query blocks
const latestBlock = await client.getLatestBlock();
const block = await client.getBlock(12345);
const blocks = await client.getBlockRange(12000, 12100);

// Register event handlers
const unsubscribe = client.onBlock((block) => {
  console.log(`Processing block ${block.height}`);
});

// Clean up
await client.disconnect();
```

## Configuration

### Client Configuration

```typescript
interface ChiaClientConfig {
  // Network connection
  host?: string;              // Default: 'localhost'
  port?: number;              // Default: 8444
  networkId?: string;         // Default: 'mainnet'
  
  // Database configuration
  database: {
    type: 'postgres' | 'sqlite';
    database: string;
    host?: string;            // For PostgreSQL
    port?: number;            // For PostgreSQL
    username?: string;        // For PostgreSQL
    password?: string;        // For PostgreSQL
  };
  
  // Cache configuration
  cacheOptions?: {
    ttl?: number;             // Time to live in seconds (default: 3600)
    maxKeys?: number;         // Maximum cached blocks (default: 10000)
  };
  
  // Event hooks
  hooks?: {
    onNewBlock?: (block: ChiaBlock) => void | Promise<void>;
    onPeerConnected?: (peerId: string) => void;
    onPeerDisconnected?: (peerId: string) => void;
    onError?: (error: Error) => void;
  };
}
```

### Database Setup

#### SQLite (Development)

```typescript
{
  database: {
    type: 'sqlite',
    database: './chia-blocks.db'
  }
}
```

#### PostgreSQL (Production)

```typescript
{
  database: {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'chia_blocks',
    username: 'chia_user',
    password: 'secure_password'
  }
}
```

## API Reference

### Client Methods

#### `initialize(): Promise<void>`
Initialize the client, connect to the database, and establish peer connections.

#### `getBlock(height: number): Promise<ChiaBlock | null>`
Retrieve a block by its height.

#### `getBlockByHash(hash: string): Promise<ChiaBlock | null>`
Retrieve a block by its header hash.

#### `getBlockRange(start: number, end: number): Promise<ChiaBlock[]>`
Retrieve a range of blocks by height.

#### `getLatestBlock(): Promise<ChiaBlock | null>`
Get the most recent block in the local database.

#### `onBlock(callback: (block: ChiaBlock) => void): () => void`
Register a callback for new blocks. Returns an unsubscribe function.

#### `onSyncProgress(callback: (current: number, total: number) => void): () => void`
Monitor synchronization progress.

#### `getCacheStats(): CacheStats`
Get cache performance statistics.

#### `getConnectionStats(): Map<string, ConnectionStats>`
Get connection statistics for all peers.

#### `disconnect(): Promise<void>`
Gracefully disconnect from all peers and close database connections.

### Event System

The client emits various events that can be subscribed to:

```typescript
// Using the event emitter directly
import { ChiaEventEmitter } from '@chia/blockchain-client';

const emitter = ChiaEventEmitter.getInstance();

emitter.on('block:new', (block) => { /* ... */ });
emitter.on('block:confirmed', (block) => { /* ... */ });
emitter.on('block:reorganized', (oldBlock, newBlock) => { /* ... */ });
emitter.on('peer:connected', (peerId) => { /* ... */ });
emitter.on('peer:disconnected', (peerId) => { /* ... */ });
emitter.on('sync:started', () => { /* ... */ });
emitter.on('sync:completed', (height) => { /* ... */ });
emitter.on('sync:progress', (current, total) => { /* ... */ });
emitter.on('error', (error) => { /* ... */ });
```

### Block Data Structure

```typescript
interface ChiaBlock {
  header_hash: string;          // Block header hash (hex)
  height: number;               // Block height
  prev_header_hash: string;     // Previous block hash
  timestamp: string;            // Block timestamp (stored as string)
  weight: string;               // Cumulative difficulty (uint128 as string)
  total_iters: string;          // Total iterations (uint128 as string)
  signage_point_index: number;  // Signage point index
  is_transaction_block: boolean;// Contains transactions
  transaction_count: number;    // Number of transactions
  
  // Optional fields
  farmer_puzzle_hash?: string;
  pool_puzzle_hash?: string;
  proof_of_space?: any;
  reward_chain_block?: any;
  foliage?: any;
  transactions_info?: any;
  raw_data?: string;           // Serialized full block data
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
  
  // BigInt accessors
  weightBigInt: bigint;
  totalItersBigInt: bigint;
  timestampBigInt: bigint;
}
```

## Architecture

### Components

1. **Protocol Layer** (`src/protocol/`)
   - Message types and serialization
   - Chia protocol implementation
   - Streamable format encoding/decoding

2. **Core Layer** (`src/core/`)
   - WebSocket connection management
   - Peer communication
   - Main client orchestration

3. **Database Layer** (`src/database/`)
   - TypeORM entities and repositories
   - Block persistence
   - Query operations

4. **Cache Layer** (`src/cache/`)
   - In-memory block caching
   - LRU eviction strategy
   - Performance optimization

5. **Event System** (`src/events/`)
   - Type-safe event emitter
   - Hook registration
   - Event propagation

### Message Flow

```
Chia Network → WebSocket → Connection Handler → Message Decoder
                                                      ↓
Database ← Repository ← Block Processor ← Protocol Handler
    ↑                           ↓
    └── Cache Manager ← Event Emitter → Application Hooks
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/chia-blockchain-client.git
cd chia-blockchain-client

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Testing

The project includes comprehensive unit tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Example Usage

See the `example/usage.ts` file for a complete working example:

```bash
npm run dev
```

## Production Considerations

### Security

- **TLS/SSL**: The client uses self-signed certificates for development. In production, use proper certificates.
- **Input Validation**: All incoming messages are validated against the protocol specification.
- **Error Boundaries**: Errors in message processing don't crash the client.

### Performance

- **Connection Pooling**: Supports multiple peer connections for redundancy.
- **Batch Processing**: Blocks are processed in batches during synchronization.
- **Cache Strategy**: Two-tier caching (memory + database) for optimal performance.
- **Resource Management**: Automatic cleanup of stale connections and cache entries.

### Monitoring

- **Logging**: Comprehensive logging with configurable levels.
- **Metrics**: Built-in statistics for monitoring performance.
- **Health Checks**: Connection status and sync progress tracking.

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure Chia fullnode is running and accessible
   - Check firewall settings for port 8444
   - Verify network configuration

2. **Database Errors**
   - Ensure database server is running (for PostgreSQL)
   - Check database permissions
   - Verify connection string

3. **Memory Usage**
   - Adjust cache size with `cacheOptions.maxKeys`
   - Monitor cache statistics
   - Consider using PostgreSQL for large datasets

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Chia Network](https://www.chia.net/) for the blockchain protocol
- [TypeORM](https://typeorm.io/) for database abstraction
- [ws](https://github.com/websockets/ws) for WebSocket implementation

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/your-org/chia-blockchain-client/issues).