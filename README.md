# Chia Block Listener (Rust + NAPI)

A high-performance Chia blockchain block listener built in Rust with Node.js bindings via NAPI-rs. This library provides real-time block notifications through an event emitter interface.

## Features

- **High Performance**: Built in Rust for maximum efficiency
- **Real-time Block Events**: Get notified when new blocks arrive
- **Event Emitter Interface**: Familiar Node.js event-based API
- **WebSocket Connection**: Direct connection to Chia full nodes
- **Database Storage**: SQLite storage for block history
- **TLS Support**: Secure connections with certificate support
- **Cross-platform**: Works on Linux, macOS, and Windows

## Installation

```bash
npm install
npm run build:release
```

## Usage

```javascript
const { ChiaBlockListener } = require('chia-block-listener');

async function main() {
    const listener = new ChiaBlockListener();

    // Set up event handlers
    listener.on('newBlock', (block) => {
        console.log('New block:', block);
    });

    // Connect to Chia node
    await listener.connect('localhost', 8444, 'mainnet');
    
    // Start listening for blocks
    await listener.startListening();
}

main().catch(console.error);
```

## API Reference

### `new ChiaBlockListener()`

Creates a new instance of the block listener.

### `connect(host, port, networkId, certPath?, keyPath?)`

Connects to a Chia full node.

- `host`: The hostname or IP address of the Chia node
- `port`: The port number (usually 8444 for mainnet)
- `networkId`: The network ID ('mainnet', 'testnet10', 'testnet11')
- `certPath`: Optional path to client certificate
- `keyPath`: Optional path to client private key

### `startListening()`

Starts listening for new blocks. Must be called after `connect()`.

### `on(event, callback)`

Registers an event handler.

Events:
- `newBlock`: Fired when a new block is received
- `newPeak`: Fired when a new peak is announced
- `connected`: Fired when connected to the node
- `disconnected`: Fired when disconnected from the node
- `error`: Fired when an error occurs

### `off(event)`

Removes an event handler.

### `getBlockCount()`

Returns the number of blocks stored in the local database.

### `disconnect()`

Disconnects from the Chia node.

## Block Event Data

The `newBlock` event provides the following data:

```javascript
{
    header_hash: string,        // Block header hash
    height: number,             // Block height
    weight: string,             // Total weight (as string due to large numbers)
    timestamp: number,          // Unix timestamp
    prev_header_hash: string,   // Previous block's header hash
    farmer_puzzle_hash: string, // Farmer's puzzle hash
    pool_puzzle_hash: string    // Pool's puzzle hash
}
```

## Environment Variables

- `CHIA_HOST`: Default host for the Chia node
- `CHIA_PORT`: Default port for the Chia node
- `CHIA_NETWORK`: Default network ID
- `CHIA_CERT_PATH`: Path to client certificate
- `CHIA_KEY_PATH`: Path to client private key

## Building from Source

### Prerequisites

- Rust 1.70 or later
- Node.js 14 or later
- npm or yarn

### Build Steps

```bash
# Install dependencies
npm install

# Build debug version
npm run build

# Build release version
npm run build:release

# Run tests
npm test
```

## Example

See the `example/` directory for a complete example of using the library.

```bash
node example/index.js
```

## Technical Details

This library uses:
- **Rust**: Core implementation for performance and reliability
- **NAPI-rs**: Node.js bindings
- **tokio**: Async runtime
- **tokio-tungstenite**: WebSocket client
- **chia-protocol**: Chia protocol message handling
- **SQLite**: Local block storage

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.