# Chia Peer Connection Documentation

Based on analysis of the Rust SDK (`chia-wallet-sdk`) and the official Chia protocol documentation.

## Connection Process

### 1. WebSocket Connection
- **Protocol**: `wss://` (WebSocket Secure)
- **Port**: 8444 (for full nodes)
- **Path**: `/ws`
- **Full URI**: `wss://<peer_ip>:8444/ws`
- **TLS**: Self-signed certificates are acceptable (`rejectUnauthorized: false`)

### 2. Handshake Message

The Rust SDK shows that wallets connect to full nodes with:

```rust
Handshake {
    network_id: "mainnet",
    protocol_version: "0.0.37",
    software_version: "0.0.0",
    server_port: 0,  // 0 for wallet clients
    node_type: NodeType::Wallet,  // 6
    capabilities: vec![
        (1, "1"),  // BASE
        (2, "1"),  // BLOCK_HEADERS
        (3, "1"),  // RATE_LIMITS_V2
    ],
}
```

### 3. Message Format

All messages follow this structure:
1. **Length prefix** (4 bytes, big-endian): Total message length
2. **Message type** (1 byte): From ProtocolMessageTypes enum
3. **Message ID** (Optional[uint16]): 
   - For requests: Include a unique ID
   - For notifications/handshake: Omit (use None)
4. **Data** (bytes): Serialized message payload with 4-byte length prefix

### 4. Serialization

Chia uses "streamable" format:
- **Strings**: 4-byte length prefix + UTF-8 bytes
- **Lists**: 4-byte count + serialized items
- **Optional fields**: 1-byte boolean (0/1) + value if present
- **Integers**: Big-endian encoding
- **Capabilities**: List of tuples (uint16, string)

### 5. Connection Flow

1. Establish WebSocket connection with TLS
2. Send Handshake message (no ID)
3. Receive Handshake response from peer
4. Verify peer is a FullNode and network_id matches
5. Start receiving messages

### 6. Receiving Blocks

According to the [Chia Peer Protocol](https://docs.chia.net/chia-blockchain/protocol/peer-protocol/):

#### new_peak Message
When a peer's blockchain advances:
```
class NewPeak:
    header_hash: bytes32
    height: uint32
    weight: uint128
    fork_point_with_previous_peak: uint32
    unfinished_reward_block_hash: bytes32
```

#### Requesting Blocks
After receiving a `new_peak`:
1. Send `request_block` with the height
2. Receive `respond_block` with the full block data

```
class RequestBlock:
    height: uint32
    include_transaction_block: bool
```

#### Batch Syncing
For multiple blocks:
```
class RequestBlocks:
    start_height: uint32
    end_height: uint32
    include_transaction_block: bool
```

## Key Differences from Our Implementation

1. **Protocol Version**: Rust SDK uses "0.0.37" for wallets
2. **Node Type**: Connect as WALLET (6) to FULL_NODE, not FULL_NODE to FULL_NODE
3. **Server Port**: Use 0 for wallet clients, not 8449
4. **Message Handling**: Need to handle both solicited responses (with ID) and unsolicited messages (without ID)

## Error Codes

- `-6`: INCOMPATIBLE_NETWORK_ID - Network ID mismatch
- `1002`: WebSocket protocol error
- `403`: IP banned or connection limit reached 