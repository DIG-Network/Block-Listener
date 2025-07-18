/**
 * DNS Discovery client for Chia network peers
 * Provides both IPv4 (A records) and IPv6 (AAAA records) resolution
 */

export interface DnsDiscoveryErrorInfo {
  message: string;
  errorType: 'ResolutionFailed' | 'NoPeersFound' | 'ResolverCreationFailed';
}

export interface PeerAddressJS {
  /** IP address as string (IPv4 or IPv6) */
  host: string;
  /** Port number */
  port: number;
  /** True if this is an IPv6 address */
  isIpv6: boolean;
  /** Formatted address for display/URLs (IPv6 addresses have brackets) */
  displayAddress: string;
}

export interface DiscoveryResultJS {
  /** List of IPv4 peer addresses */
  ipv4Peers: PeerAddressJS[];
  /** List of IPv6 peer addresses */
  ipv6Peers: PeerAddressJS[];
  /** Total number of peers (IPv4 + IPv6) */
  totalCount: number;
}

export interface AddressResult {
  /** List of IP addresses as strings */
  addresses: string[];
  /** Number of addresses found */
  count: number;
}

/**
 * DNS Discovery client for Chia network peer discovery
 * Supports both IPv4 and IPv6 resolution using proper A/AAAA record lookups
 */
export declare class DnsDiscoveryClient {
  /** Create a new DNS discovery client */
  constructor();

  /** Discover peers for Chia mainnet */
  discoverMainnetPeers(): Promise<DiscoveryResultJS>;

  /** Discover peers for Chia testnet11 */
  discoverTestnet11Peers(): Promise<DiscoveryResultJS>;

  /** Discover peers using custom introducers */
  discoverPeers(introducers: string[], defaultPort: number): Promise<DiscoveryResultJS>;

  /** Resolve IPv4 addresses (A records) for a hostname */
  resolveIpv4(hostname: string): Promise<AddressResult>;

  /** Resolve IPv6 addresses (AAAA records) for a hostname */
  resolveIpv6(hostname: string): Promise<AddressResult>;

  /** Resolve both IPv4 and IPv6 addresses for a hostname */
  resolveBoth(hostname: string, port: number): Promise<DiscoveryResultJS>;
}





// Usage examples:
//
// // Method 1: Using client instance
// const client = new DnsDiscoveryClient();
// const result = await client.discoverMainnetPeers();
// console.log(`Found ${result.totalCount} peers`);
//
// // Method 2: Testnet discovery
// const testnetResult = await client.discoverTestnet11Peers();
// 
// // Method 3: Individual lookups
// const ipv4Addresses = await client.resolveIpv4('dns-introducer.chia.net');
// const ipv6Addresses = await client.resolveIpv6('dns-introducer.chia.net');
//
// // Method 4: Custom introducers
// const customResult = await client.discoverPeers(['seeder.dexie.space'], 8444); 