# DNS Discovery NAPI Interface

A comprehensive Node.js interface for discovering Chia network peers using DNS introducers with proper IPv4/IPv6 support.

## Overview

The DNS Discovery NAPI interface exposes the functionality of the isolated `dns-discovery` Rust crate to JavaScript/TypeScript applications. It provides separate IPv4 (A records) and IPv6 (AAAA records) lookups, returning well-structured results that can be used directly with the IPv6-capable peer connection system.

## Key Features

- ✅ **Dual Stack Support**: Separate IPv4 and IPv6 peer discovery
- ✅ **Proper DNS Lookups**: Uses A records for IPv4, AAAA records for IPv6
- ✅ **Built-in Networks**: Ready-to-use configurations for mainnet and testnet11
- ✅ **Custom Introducers**: Support for custom DNS introducers
- ✅ **Type Safety**: Full TypeScript definitions included
- ✅ **Multiple Interfaces**: Both class-based and functional APIs
- ✅ **IPv6 URL Formatting**: Automatic bracket formatting for IPv6 addresses

## Installation

The DNS discovery interface is included in the main chia-block-listener package:

```javascript
const { 
  DnsDiscoveryClient
} = require('chia-block-listener');
```

## API Reference

### Class-Based Interface

#### `DnsDiscoveryClient`

Main class for DNS discovery operations:

```javascript
const client = new DnsDiscoveryClient();
```

**Methods:**

- `discoverMainnetPeers()` → `Promise<DiscoveryResultJS>`
- `discoverTestnet11Peers()` → `Promise<DiscoveryResultJS>`
- `discoverPeers(introducers: string[], port: number)` → `Promise<DiscoveryResultJS>`
- `resolveIpv4(hostname: string)` → `Promise<AddressResult>`
- `resolveIpv6(hostname: string)` → `Promise<AddressResult>`
- `resolveBoth(hostname: string, port: number)` → `Promise<DiscoveryResultJS>`



## Data Types

### `DiscoveryResultJS`

Main result type for peer discovery:

```typescript
interface DiscoveryResultJS {
  ipv4Peers: PeerAddressJS[];    // IPv4 peer addresses
  ipv6Peers: PeerAddressJS[];    // IPv6 peer addresses  
  totalCount: number;            // Total peers found
}
```

### `PeerAddressJS`

Individual peer address:

```typescript
interface PeerAddressJS {
  host: string;           // IP address as string
  port: number;           // Port number
  isIpv6: boolean;        // Protocol indicator
  displayAddress: string; // Formatted for display/URLs
}
```

### `AddressResult`

Result for individual hostname resolution:

```typescript
interface AddressResult {
  addresses: string[];    // List of IP addresses
  count: number;          // Number of addresses
}
```

## Usage Examples

### Basic Peer Discovery

```javascript
const { DnsDiscoveryClient } = require('chia-block-listener');

async function discoverPeers() {
  const client = new DnsDiscoveryClient();
  
  // Discover mainnet peers
  const result = await client.discoverMainnetPeers();
  
  console.log(`Found ${result.totalCount} total peers:`);
  console.log(`  IPv4: ${result.ipv4Peers.length}`);
  console.log(`  IPv6: ${result.ipv6Peers.length}`);
  
  // Use with peer connections
  for (const peer of result.ipv4Peers) {
    console.log(`IPv4 peer: ${peer.displayAddress}`);
    // Connect using: peer.host, peer.port
  }
  
  for (const peer of result.ipv6Peers) {
    console.log(`IPv6 peer: ${peer.displayAddress}`); // [2001:db8::1]:8444
    // Connect using: peer.host, peer.port
  }
}
```

### Simple Discovery

```javascript
const { DnsDiscoveryClient } = require('chia-block-listener');

// Simple mainnet discovery
const client = new DnsDiscoveryClient();
const peers = await client.discoverMainnetPeers();
console.log(`Found ${peers.ipv4Peers.length + peers.ipv6Peers.length} peers`);
```

### Custom Introducers

```javascript
const client = new DnsDiscoveryClient();

// Use custom introducers
const customIntroducers = [
  'seeder.dexie.space',
  'chia.hoffmang.com'
];

const result = await client.discoverPeers(customIntroducers, 8444);
console.log(`Custom discovery found ${result.totalCount} peers`);
```

### Individual DNS Resolution

```javascript
const client = new DnsDiscoveryClient();

// Resolve specific protocols
const hostname = 'dns-introducer.chia.net';

try {
  const ipv4 = await client.resolveIpv4(hostname);
  console.log(`IPv4 addresses: ${ipv4.addresses.join(', ')}`);
} catch (error) {
  console.log(`IPv4 resolution failed: ${error.message}`);
}

try {
  const ipv6 = await client.resolveIpv6(hostname);
  console.log(`IPv6 addresses: ${ipv6.addresses.join(', ')}`);
} catch (error) {
  console.log(`IPv6 resolution failed: ${error.message}`);
}

// Or resolve both at once
const both = await client.resolveBoth(hostname, 8444);
console.log(`Combined: ${both.totalCount} addresses`);
```

### Integration with Existing Peer Pool

```javascript
const { ChiaPeerPool, DnsDiscoveryClient } = require('chia-block-listener');

async function setupPeerPool() {
  const pool = new ChiaPeerPool();
  const discovery = new DnsDiscoveryClient();
  
  // Discover peers
  const peers = await discovery.discoverMainnetPeers();
  
  // Add IPv4 peers to pool
  for (const peer of peers.ipv4Peers.slice(0, 5)) {
    await pool.addPeer(peer.host, peer.port, 'mainnet');
    console.log(`Added IPv4 peer: ${peer.displayAddress}`);
  }
  
  // Add IPv6 peers to pool  
  for (const peer of peers.ipv6Peers.slice(0, 5)) {
    await pool.addPeer(peer.host, peer.port, 'mainnet');
    console.log(`Added IPv6 peer: ${peer.displayAddress}`);
  }
  
  return pool;
}
```

### Error Handling

```javascript
const client = new DnsDiscoveryClient();

try {
  const result = await client.discoverMainnetPeers();
  // Handle success
} catch (error) {
  console.error('Discovery failed:', error.message);
  
  // Error types: 'ResolutionFailed', 'NoPeersFound', 'ResolverCreationFailed'
  if (error.message.includes('NoPeersFound')) {
    console.log('No peers found from any introducer');
  }
}
```

### TypeScript Usage

```typescript
import { 
  DnsDiscoveryClient, 
  DiscoveryResultJS, 
  PeerAddressJS 
} from 'chia-block-listener';

async function typedDiscovery(): Promise<void> {
  const client = new DnsDiscoveryClient();
  
  const result: DiscoveryResultJS = await client.discoverMainnetPeers();
  
  // Type-safe access
  result.ipv4Peers.forEach((peer: PeerAddressJS) => {
    console.log(`IPv4: ${peer.host}:${peer.port}`);
  });
  
  result.ipv6Peers.forEach((peer: PeerAddressJS) => {
    console.log(`IPv6: ${peer.displayAddress}`);
  });
}
```

## Performance Considerations

- **Caching**: DNS results are not cached; implement your own caching if needed
- **Concurrency**: All DNS lookups are performed concurrently for maximum speed
- **Timeout**: DNS queries have built-in timeouts (configured in the Rust crate)
- **Randomization**: Peer lists are automatically shuffled for load distribution

## Troubleshooting

### Common Issues

1. **No peers found**: Check network connectivity and DNS resolution
2. **IPv6 resolution fails**: IPv6 may not be available in all environments
3. **Timeout errors**: Network or DNS server issues

### Debug Logging

Enable debug logging to see DNS resolution details:

```javascript
const { initTracing } = require('chia-block-listener');

// Initialize tracing for debug output
initTracing();
```

## Comparison with JavaScript Version

The Rust-based DNS discovery provides several advantages over the JavaScript version in `coin-monitor.js`:

| Feature | JavaScript Version | Rust NAPI Version |
|---------|-------------------|------------------|
| **DNS Lookups** | Generic `dns.lookup()` | Explicit A/AAAA records |
| **IPv6 Support** | Manual detection | Built-in IPv6 handling |
| **Type Safety** | Runtime checks | Compile-time guarantees |
| **Performance** | Single-threaded | Concurrent resolution |
| **Error Handling** | Basic try/catch | Detailed error types |
| **Address Formatting** | Manual brackets | Automatic formatting |

## Future Enhancements

Planned improvements:

- [ ] DNS caching with TTL support
- [ ] Custom DNS server configuration
- [ ] Peer health checking integration
- [ ] Metrics and monitoring hooks
- [ ] IPv6 preference configuration 