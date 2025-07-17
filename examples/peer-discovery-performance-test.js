const { ChiaPeerPool } = require('../index.js');
const dns = require('dns').promises;

// Set log level to see connection info but reduce noise
process.env.RUST_LOG = 'chia_block_listener=info';

// DNS introducers for peer discovery
const MAINNET_DNS_INTRODUCERS = [
  "dns-introducer.chia.net",
  "chia.ctrlaltdel.ch", 
  "seeder.dexie.space",
  "chia.hoffmang.com"
];

const MAINNET_DEFAULT_PORT = 8444;

// Shuffle array for randomness
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Discover peers using DNS introducers
async function discoverPeers(networkId = 'mainnet') {
  console.log(`🔍 Discovering peers for ${networkId}...`);
  
  let allAddresses = [];
  
  // Resolve all introducers to IP addresses
  for (const introducer of MAINNET_DNS_INTRODUCERS) {
    try {
      console.log(`  Resolving ${introducer}...`);
      const addresses = await dns.lookup(introducer, { all: true });
      for (const addr of addresses) {
        // Prefer IPv4 for better compatibility
        if (addr.family === 4) {
          allAddresses.push({ 
            host: addr.address, 
            port: MAINNET_DEFAULT_PORT,
            family: addr.family
          });
        }
      }
    } catch (error) {
      console.log(`  Failed to resolve ${introducer}: ${error.message}`);
    }
  }

  if (allAddresses.length === 0) {
    throw new Error('Failed to resolve any peer addresses from introducers');
  }

  // Shuffle for randomness
  allAddresses = shuffleArray(allAddresses);
  console.log(`  Found ${allAddresses.length} potential IPv4 peers\n`);
  
  return allAddresses;
}

// Try to connect to multiple peers
async function connectToMultiplePeers(pool, networkId = 'mainnet', targetPeers = 3) {
  const peers = await discoverPeers(networkId);
  
  console.log(`🔌 Attempting to connect to ${targetPeers} peers...`);
  
  const connectedPeers = [];
  const maxAttempts = Math.min(peers.length, targetPeers * 3); // Try 3x as many as needed
  
  for (let i = 0; i < maxAttempts && connectedPeers.length < targetPeers; i++) {
    const peer = peers[i];
    console.log(`  Trying ${peer.host}:${peer.port}...`);
    
    try {
      const peerId = await pool.addPeer(peer.host, peer.port, networkId);
      console.log(`  ✅ Connected: ${peerId.split(':')[0]}`);
      connectedPeers.push({ peerId, host: peer.host, port: peer.port });
    } catch (error) {
      console.log(`  ❌ Failed: ${peer.host} - ${error.message.split('\n')[0]}`);
    }
  }
  
  console.log(`✅ Successfully connected to ${connectedPeers.length}/${targetPeers} target peers\n`);
  return connectedPeers;
}

class PeerDiscoveryPerformanceTest {
  constructor() {
    this.peerPool = new ChiaPeerPool();
    this.results = [];
  }

  setupEventHandlers() {
    this.peerPool.on('peerConnected', (event) => {
      console.log(`🟢 Peer ${event.peerId.split(':')[0]} connected`);
    });

    this.peerPool.on('peerDisconnected', (event) => {
      console.log(`🔴 Peer ${event.peerId.split(':')[0]} disconnected`);
    });

    this.peerPool.on('newPeakHeight', (event) => {
      console.log(`📊 New peak: ${event.newPeak.toLocaleString()} (${event.peerId.split(':')[0]})`);
    });
  }

  async runComprehensiveTest() {
    console.log('🚀 ChiaPeerPool Performance Test with Peer Discovery');
    console.log('==================================================\n');
    
    this.setupEventHandlers();
    
    // Connect to multiple discovered peers
    const connectedPeers = await connectToMultiplePeers(this.peerPool, 'mainnet', 3);
    
    if (connectedPeers.length === 0) {
      throw new Error('No peers connected - cannot run performance test');
    }

    // Wait for connections to stabilize
    console.log('⏳ Waiting for connections to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get current peak height for testing
    const peakHeight = await this.peerPool.getPeakHeight();
    if (peakHeight) {
      console.log(`📊 Current network peak: ${peakHeight.toLocaleString()}\n`);
    }

    // Run different performance tests
    await this.testSequentialRequests(peakHeight);
    await this.testParallelRequests(peakHeight);
    await this.testBurstThroughput(peakHeight);
    
    this.generatePerformanceReport();
  }

  async testSequentialRequests(peakHeight) {
    console.log('📋 Test 1: Sequential Block Requests (Connection Reuse)');
    console.log('======================================================');
    
    // Test recent blocks for better success rate
    const startHeight = Math.max(3000000, (peakHeight || 3200000) - 1000);
    const heights = [startHeight, startHeight + 1, startHeight + 2, startHeight + 3, startHeight + 4];
    const times = [];
    
    console.log(`Testing blocks: ${heights.join(', ')}\n`);
    
    for (let i = 0; i < heights.length; i++) {
      const height = heights[i];
      console.log(`   Request ${i + 1}/${heights.length}: Block ${height.toLocaleString()}`);
      
      const start = Date.now();
      try {
        const block = await this.peerPool.getBlockByHeight(height);
        const elapsed = Date.now() - start;
        times.push(elapsed);
        
        console.log(`   ✅ Success: ${elapsed}ms (${block.coinAdditions.length} adds, ${block.coinSpends.length} spends)`);
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message.split('\n')[0]}`);
        times.push(null);
      }
    }
    
    this.results.push({
      test: 'Sequential',
      times: times.filter(t => t !== null),
      successful: times.filter(t => t !== null).length,
      total: times.length
    });
    
    console.log('');
  }

  async testParallelRequests(peakHeight) {
    console.log('📋 Test 2: Parallel Block Requests (Load Balancing)');
    console.log('==================================================');
    
    const startHeight = Math.max(3000000, (peakHeight || 3200000) - 1000);
    const heights = Array.from({length: 6}, (_, i) => startHeight + i + 10);
    
    console.log(`Requesting ${heights.length} blocks in parallel: ${heights.join(', ')}\n`);
    
    const startTime = Date.now();
    const promises = heights.map(height => 
      this.peerPool.getBlockByHeight(height)
        .then(block => {
          const elapsed = Date.now() - startTime;
          console.log(`   ✅ Block ${height.toLocaleString()}: ${elapsed}ms from start`);
          return elapsed;
        })
        .catch(error => {
          console.log(`   ❌ Block ${height.toLocaleString()}: ${error.message.split('\n')[0]}`);
          return null;
        })
    );
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r !== null);
    const totalTime = Date.now() - startTime;
    
    console.log(`\n   Total time: ${totalTime}ms`);
    if (successful.length > 0) {
      console.log(`   Effective rate: ${(successful.length / (totalTime / 1000)).toFixed(2)} blocks/sec`);
    }
    
    this.results.push({
      test: 'Parallel',
      times: successful,
      successful: successful.length,
      total: results.length,
      totalTime
    });
    
    console.log('');
  }

  async testBurstThroughput(peakHeight) {
    console.log('📋 Test 3: Burst Throughput (Maximum Speed)');
    console.log('==========================================');
    
    const startHeight = Math.max(3000000, (peakHeight || 3200000) - 1000);
    const blockCount = 10;
    const heights = Array.from({length: blockCount}, (_, i) => startHeight + i + 20);
    
    console.log(`Requesting ${blockCount} blocks as fast as possible...\n`);
    
    const startTime = Date.now();
    const promises = heights.map(async (height, index) => {
      try {
        const requestStart = Date.now();
        const block = await this.peerPool.getBlockByHeight(height);
        const elapsed = Date.now() - requestStart;
        
        if (index % 3 === 0) {
          console.log(`   ✅ Block ${height.toLocaleString()}: ${elapsed}ms`);
        }
        
        return elapsed;
      } catch (error) {
        console.log(`   ❌ Block ${height.toLocaleString()}: Failed`);
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r !== null);
    const totalTime = Date.now() - startTime;
    
    console.log(`\n   Completed: ${successful.length}/${blockCount} blocks`);
    console.log(`   Total time: ${totalTime}ms`);
    if (successful.length > 0) {
      console.log(`   Throughput: ${(successful.length / (totalTime / 1000)).toFixed(2)} blocks/sec`);
    }
    
    this.results.push({
      test: 'Burst',
      times: successful,
      successful: successful.length,
      total: results.length,
      totalTime
    });
    
    console.log('');
  }

  generatePerformanceReport() {
    console.log('📊 Performance Analysis Report');
    console.log('=============================\n');
    
    for (const result of this.results) {
      console.log(`${result.test} Test:`);
      console.log(`   Success Rate: ${result.successful}/${result.total} (${(result.successful/result.total*100).toFixed(1)}%)`);
      
      if (result.times.length > 0) {
        const avg = result.times.reduce((a, b) => a + b, 0) / result.times.length;
        const min = Math.min(...result.times);
        const max = Math.max(...result.times);
        
        console.log(`   Average Time: ${avg.toFixed(0)}ms`);
        console.log(`   Min/Max: ${min}ms / ${max}ms`);
        
        if (result.totalTime) {
          const throughput = result.successful / (result.totalTime / 1000);
          console.log(`   Throughput: ${throughput.toFixed(2)} blocks/sec`);
        }
      }
      console.log('');
    }
    
    // Overall assessment
    const allTimes = this.results.flatMap(r => r.times);
    const overallSuccessRate = this.results.reduce((acc, r) => acc + r.successful, 0) / 
                              this.results.reduce((acc, r) => acc + r.total, 0);
    
    if (allTimes.length > 0) {
      const overallAvg = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
      
      console.log('🎯 Performance Assessment:');
      console.log(`   Overall Success Rate: ${(overallSuccessRate * 100).toFixed(1)}%`);
      console.log(`   Overall Average: ${overallAvg.toFixed(0)}ms per block`);
      
      if (overallSuccessRate > 0.8 && overallAvg < 200) {
        console.log('   🚀 EXCELLENT: High success rate with fast responses!');
      } else if (overallSuccessRate > 0.6 && overallAvg < 500) {
        console.log('   ⚡ GOOD: Decent performance with room for improvement');
      } else if (overallSuccessRate > 0.4) {
        console.log('   📈 FAIR: Working but needs optimization');
      } else {
        console.log('   🐌 POOR: Connection or configuration issues');
      }
    }
  }

  async shutdown() {
    console.log('\n🛑 Shutting down...');
    await this.peerPool.shutdown();
    console.log('✅ Test complete');
  }
}

// Run the comprehensive test
async function runTest() {
  const test = new PeerDiscoveryPerformanceTest();
  
  try {
    await test.runComprehensiveTest();
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await test.shutdown();
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  console.log('\n⏹️  Test interrupted');
  process.exit(0);
});

runTest().catch(console.error); 