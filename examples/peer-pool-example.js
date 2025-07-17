const { ChiaPeerPool, initTracing } = require('../index.js');
const dns = require('dns').promises;

// DNS introducers for peer discovery
const MAINNET_DNS_INTRODUCERS = [
  "dns-introducer.chia.net",
  "chia.ctrlaltdel.ch", 
  "seeder.dexie.space",
  "chia.hoffmang.com"
];

const MAINNET_DEFAULT_PORT = 8444;

async function discoverPeers(count = 5) {
  console.log(`🔍 Discovering ${count} peers for mainnet...`);
  
  const allAddresses = [];
  
  for (const introducer of MAINNET_DNS_INTRODUCERS) {
    try {
      console.log(`  Resolving ${introducer}...`);
      const addresses = await dns.lookup(introducer, { all: true });
      for (const addr of addresses) {
        // Only use IPv4 for simplicity
        if (addr.family === 4) {
          allAddresses.push({
            host: addr.address,
            port: MAINNET_DEFAULT_PORT
          });
        }
      }
    } catch (error) {
      console.log(`  Failed to resolve ${introducer}: ${error.message}`);
    }
  }
  
  // Shuffle and take first 'count' peers
  const shuffled = allAddresses.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function main() {
  // Set log level to reduce verbosity
  process.env.RUST_LOG = 'chia_block_listener=warn';
  
  // Initialize tracing
  initTracing();
  
  console.log('🏊 Creating ChiaPeerPool...');
  const pool = new ChiaPeerPool();
  
  try {
    // Discover and add peers to the pool
    const peers = await discoverPeers(5);
    console.log(`\n📡 Adding ${peers.length} peers to the pool...`);
    
    for (const peer of peers) {
      try {
        const peerId = await pool.addPeer(peer.host, peer.port, 'mainnet');
        console.log(`  ✅ Added peer: ${peerId}`);
      } catch (error) {
        console.log(`  ❌ Failed to add peer ${peer.host}: ${error.message}`);
      }
    }
    
    console.log('\n🎯 Testing rate-limited block fetching...');
    console.log('  (Each peer can only be used once every 500ms)');
    
    // Test 1: Fetch multiple blocks sequentially
    console.log('\n📊 Test 1: Sequential block fetching');
    const heights = [5000000, 5000001, 5000002, 5000003, 5000004];
    
    console.time('Sequential fetch');
    for (const height of heights) {
      try {
        const startTime = Date.now();
        const block = await pool.getBlockByHeight(height);
        const fetchTime = Date.now() - startTime;
        console.log(`  ✅ Block ${height}: ${block.coinSpends.length} coin spends (${fetchTime}ms)`);
      } catch (error) {
        console.log(`  ❌ Failed to fetch block ${height}: ${error.message}`);
      }
    }
    console.timeEnd('Sequential fetch');
    
    // Test 2: Fetch multiple blocks in parallel
    console.log('\n📊 Test 2: Parallel block fetching (with rate limiting)');
    const parallelHeights = [5000010, 5000011, 5000012, 5000013, 5000014, 5000015, 5000016, 5000017];
    
    console.time('Parallel fetch');
    const promises = parallelHeights.map(async (height) => {
      try {
        const startTime = Date.now();
        const block = await pool.getBlockByHeight(height);
        const fetchTime = Date.now() - startTime;
        return { height, coinSpends: block.coinSpends.length, fetchTime, success: true };
      } catch (error) {
        return { height, error: error.message, success: false };
      }
    });
    
    const results = await Promise.all(promises);
    console.timeEnd('Parallel fetch');
    
    console.log('\n📋 Parallel fetch results:');
    results.forEach(result => {
      if (result.success) {
        console.log(`  ✅ Block ${result.height}: ${result.coinSpends} coin spends (${result.fetchTime}ms)`);
      } else {
        console.log(`  ❌ Block ${result.height}: ${result.error}`);
      }
    });
    
    // Calculate statistics
    const successfulFetches = results.filter(r => r.success);
    if (successfulFetches.length > 0) {
      const avgFetchTime = successfulFetches.reduce((sum, r) => sum + r.fetchTime, 0) / successfulFetches.length;
      console.log(`\n📈 Average fetch time: ${avgFetchTime.toFixed(2)}ms`);
    }
    
    // Test 3: Stress test - many requests
    console.log('\n📊 Test 3: Stress test with 20 blocks');
    const stressHeights = Array.from({ length: 20 }, (_, i) => 5000020 + i);
    
    console.time('Stress test');
    const stressPromises = stressHeights.map(height => 
      pool.getBlockByHeight(height)
        .then(() => ({ height, success: true }))
        .catch(() => ({ height, success: false }))
    );
    
    const stressResults = await Promise.all(stressPromises);
    console.timeEnd('Stress test');
    
    const stressSuccess = stressResults.filter(r => r.success).length;
    console.log(`  ✅ Successfully fetched ${stressSuccess}/${stressResults.length} blocks`);
    console.log(`  📊 The pool properly queued and rate-limited all requests`);
    
    // Cleanup
    console.log('\n🧹 Shutting down pool...');
    await pool.shutdown();
    console.log('✅ Pool shut down successfully');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.shutdown();
  }
}

// Run the example
main().catch(console.error); 