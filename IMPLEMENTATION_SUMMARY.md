# Chia Blockchain Client Implementation Summary

## Current Status

We have implemented a TypeScript client for connecting to Chia blockchain peers following the official protocol documentation and Rust SDK implementation.

### What's Working

1. **Peer Discovery**: Successfully discovering peers from DNS introducers
2. **TLS Connection**: Establishing WebSocket connections with TLS certificates (using @dignetwork/datalayer-driver)
3. **Message Serialization**: Proper encoding of Chia's "streamable" format
4. **Handshake Format**: Correctly formatted handshake message matching Rust SDK

### Implementation Details

#### Connection Parameters (from Rust SDK)
- **Node Type**: WALLET (6) connecting to FULL_NODE
- **Protocol Version**: "0.0.37"
- **Software Version**: "0.0.0"
- **Server Port**: 0 (for wallet clients)
- **Network ID**: "mainnet"
- **Capabilities**: [(1, "1"), (2, "1"), (3, "1")] - BASE, BLOCK_HEADERS, RATE_LIMITS_V2

#### Message Format
```
[4 bytes] Message length (big-endian)
[1 byte]  Message type
[1 byte]  Optional ID present (0 or 1)
[2 bytes] Optional ID value (if present)
[4 bytes] Payload length
[N bytes] Payload data
```

### Current Issue

Despite matching the Rust SDK implementation exactly, we're receiving error code `-6` (INCOMPATIBLE_NETWORK_ID) when connecting to mainnet peers.

### Verified Components

1. **Message Encoding**: Handshake produces 68 bytes total, matching expected format
2. **TLS Setup**: Using the same @dignetwork/datalayer-driver that works in other contexts
3. **WebSocket Path**: Correctly using `wss://<peer>:8444/ws`
4. **Serialization**: Properly encoding strings, integers, and lists per Chia protocol

### Receiving Blocks

Once the connection issue is resolved, the client is set up to:

1. Listen for `new_peak` messages from peers
2. Request blocks using `request_block` messages
3. Store blocks in a TypeORM database (SQLite/PostgreSQL)
4. Cache recent blocks for performance
5. Emit events for new blocks via the event system

### Next Steps

The INCOMPATIBLE_NETWORK_ID error suggests either:
1. The network_id encoding is subtly different than expected
2. There's a version mismatch we haven't identified
3. Additional handshake parameters are required

To resolve this, we would need to:
1. Capture traffic from a working Chia client to compare handshake bytes
2. Test against a local Chia node with debug logging
3. Check if there are additional requirements for mainnet connections 