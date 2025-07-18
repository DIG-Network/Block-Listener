const { 
  DnsDiscoveryClient, 
  initTracing
} = require('../index.js');

async function main() {
  // Initialize logging
  initTracing();
  
  console.log('🔍 DNS Discovery Example\n');

  try {

    // Method 1: Using client instance for mainnet discovery
    console.log('🌐 Method 1: Mainnet peer discovery');
    
    const client = new DnsDiscoveryClient();
    
    console.log('Discovering mainnet peers...');
    const mainnetResult = await client.discoverMainnetPeers();
    console.log(`✅ Found ${mainnetResult.totalCount} total peers:`);
    console.log(`   IPv4 peers: ${mainnetResult.ipv4Peers.length}`);
    console.log(`   IPv6 peers: ${mainnetResult.ipv6Peers.length}`);
    
    // Show first few peers
    if (mainnetResult.ipv4Peers.length > 0) {
      console.log('   First few IPv4 peers:');
      mainnetResult.ipv4Peers.slice(0, 3).forEach((peer, i) => {
        console.log(`     ${i + 1}. ${peer.displayAddress}`);
      });
    }
    
    if (mainnetResult.ipv6Peers.length > 0) {
      console.log('   First few IPv6 peers:');
      mainnetResult.ipv6Peers.slice(0, 3).forEach((peer, i) => {
        console.log(`     ${i + 1}. ${peer.displayAddress}`);
      });
    }
    console.log();

    // Method 2: Testnet discovery
    console.log('🔧 Method 2: Testnet discovery');
    
    console.log('Discovering testnet11 peers...');
    const testnetResult = await client.discoverTestnet11Peers();
    console.log(`✅ Found ${testnetResult.totalCount} total peers:`);
    console.log(`   IPv4 peers: ${testnetResult.ipv4Peers.length}`);
    console.log(`   IPv6 peers: ${testnetResult.ipv6Peers.length}`);
    console.log();

    // Method 3: Individual DNS lookups
    console.log('🔍 Method 3: Individual DNS lookups');
    
    const testHostname = 'dns-introducer.chia.net';
    console.log(`Resolving ${testHostname}...`);
    
    try {
      const ipv4Result = await client.resolveIpv4(testHostname);
      console.log(`✅ IPv4 addresses (${ipv4Result.count}):`);
      ipv4Result.addresses.forEach((addr, i) => {
        console.log(`   ${i + 1}. ${addr}`);
      });
    } catch (error) {
      console.log(`❌ IPv4 resolution failed: ${error.message}`);
    }
    
    try {
      const ipv6Result = await client.resolveIpv6(testHostname);
      console.log(`✅ IPv6 addresses (${ipv6Result.count}):`);
      ipv6Result.addresses.forEach((addr, i) => {
        console.log(`   ${i + 1}. ${addr}`);
      });
    } catch (error) {
      console.log(`❌ IPv6 resolution failed: ${error.message}`);
    }
    console.log();

    // Method 4: Resolve both protocols at once
    console.log('🌐 Method 4: Resolve both protocols');
    
    try {
      const bothResult = await client.resolveBoth(testHostname, 8444);
      console.log(`✅ Combined resolution for ${testHostname}:`);
      console.log(`   Total addresses: ${bothResult.totalCount}`);
      console.log(`   IPv4: ${bothResult.ipv4Peers.length}, IPv6: ${bothResult.ipv6Peers.length}`);
      
      if (bothResult.ipv4Peers.length > 0) {
        console.log('   IPv4 peers:');
        bothResult.ipv4Peers.forEach((peer, i) => {
          console.log(`     ${i + 1}. ${peer.displayAddress}`);
        });
      }
      
      if (bothResult.ipv6Peers.length > 0) {
        console.log('   IPv6 peers:');
        bothResult.ipv6Peers.forEach((peer, i) => {
          console.log(`     ${i + 1}. ${peer.displayAddress}`);
        });
      }
    } catch (error) {
      console.log(`❌ Combined resolution failed: ${error.message}`);
    }
    console.log();

    // Method 5: Custom introducers
    console.log('🛠️  Method 5: Custom introducers');
    
    const customIntroducers = ['seeder.dexie.space', 'chia.hoffmang.com'];
    console.log(`Using custom introducers: ${customIntroducers.join(', ')}`);
    
    try {
      const customResult = await client.discoverPeers(customIntroducers, 8444);
      console.log(`✅ Found ${customResult.totalCount} peers from custom introducers:`);
      console.log(`   IPv4 peers: ${customResult.ipv4Peers.length}`);
      console.log(`   IPv6 peers: ${customResult.ipv6Peers.length}`);
    } catch (error) {
      console.log(`❌ Custom discovery failed: ${error.message}`);
    }
    console.log();

    // Method 6: Testing hostname resolution directly
    console.log('🔬 Method 6: Testing individual hostname resolution');
    
    const testHosts = ['dns.google', 'google.com'];
    
    for (const hostname of testHosts) {
      console.log(`Testing ${hostname}:`);
      
      try {
        const ipv4 = await client.resolveIpv4(hostname);
        console.log(`  IPv4 (${ipv4.count}): ${ipv4.addresses.join(', ')}`);
      } catch (error) {
        console.log(`  IPv4: Failed - ${error.message}`);
      }
      
      try {
        const ipv6 = await client.resolveIpv6(hostname);
        console.log(`  IPv6 (${ipv6.count}): ${ipv6.addresses.join(', ')}`);
      } catch (error) {
        console.log(`  IPv6: Failed - ${error.message}`);
      }
    }

    console.log('\n🎉 DNS Discovery example completed successfully!');

  } catch (error) {
    console.error('❌ Example failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the example
main().catch(console.error); 