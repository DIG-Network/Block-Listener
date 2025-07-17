const { ChiaPeerPool } = require('../index.js');

// Set log level to see important info but reduce noise
process.env.RUST_LOG = 'chia_block_listener=info';

class OptimizedPerformanceTest {
  constructor() {
    this.peerPool = new ChiaPeerPool();
    this.results = [];
  }

  setupEventHandlers() {
    this.peerPool.on('peerConnected', (event) => {
      console.log(`✅ Peer connected: ${event.peerId.split(':')[0]}:${event.port}`);
    });

    this.peerPool.on('peerDisconnected', (event) => {
      console.log(`❌ Peer disconnected: ${event.peerId.split(':')[0]}:${event.port}`);
    });

    this.peerPool.on('newPeakHeight', (event) => {
      console.log(`📊 Peak: ${event.newPeak.toLocaleString()} (${event.peerId.split(':')[0]})`);
    });
  }

  async connectToPeers() {
    console.log('🔌 Connecting to multiple peers for load balancing...');
    
    // Use a mix of reliable peers
    const peerHosts = [
      '95.216.27.36',    // EU node
      '78.46.85.142',    // EU node  
      '144.76.30.35',    // EU node
      '159.69.46.28',    // EU node
    ];

    const connectionPromises = peerHosts.map(async (host) => {
      try {
        const peerId = await this.peerPool.addPeer(host, 8444, 'mainnet');
        console.log(`   Connected: ${host}`);
        return { peerId, host };
      } catch (error) {
        console.log(`   Failed: ${host} - ${error.message.split('\n')[0]}`);
        return null;
      }
    });

    const results = await Promise.all(connectionPromises);
    const successful = results.filter(r => r !== null);
    
    console.log(`✅ Connected to ${successful.length}/${peerHosts.length} peers\n`);
    
    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return successful.length;
  }

  async runParallelTest() {
    console.log('🚀 Optimized ChiaPeerPool Performance Test');
    console.log('==========================================\n');
    
    this.setupEventHandlers();
    
    const connectedPeers = await this.connectToPeers();
    if (connectedPeers === 0) {
      throw new Error('No peers connected');
    }

    // Test different scenarios
    await this.testSequentialRequests();
    await this.testParallelRequests(); 
    await this.testBurstRequests();
    
    this.generateReport();
  }

  async testSequentialRequests() {
    console.log('📋 Test 1: Sequential Requests (Connection Reuse Test)');
    console.log('=====================================================');
    
    const heights = [3100000, 3100001, 3100002, 3100003, 3100004];
    const times = [];
    
    for (let i = 0; i < heights.length; i++) {
      const height = heights[i];
      console.log(`   Request ${i + 1}/${heights.length}: Block ${height}...`);
      
      const start = Date.now();
      try {
        const block = await this.peerPool.getBlockByHeight(height);
        const elapsed = Date.now() - start;
        times.push(elapsed);
        
        console.log(`   ✅ ${elapsed}ms (${block.coinAdditions.length} adds, ${block.coinSpends.length} spends)`);
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

  async testParallelRequests() {
    console.log('📋 Test 2: Parallel Requests (Load Balancing Test)');
    console.log('=================================================');
    
    const heights = [3100010, 3100011, 3100012, 3100013, 3100014, 3100015];
    console.log(`   Requesting ${heights.length} blocks in parallel...`);
    
    const start = Date.now();
    const promises = heights.map(height => 
      this.peerPool.getBlockByHeight(height)
        .then(block => {
          const elapsed = Date.now() - start;
          console.log(`   ✅ Block ${height}: ${elapsed}ms`);
          return elapsed;
        })
        .catch(error => {
          console.log(`   ❌ Block ${height}: ${error.message.split('\n')[0]}`);
          return null;
        })
    );
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r !== null);
    const totalTime = Date.now() - start;
    
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Effective rate: ${(successful.length / (totalTime / 1000)).toFixed(2)} blocks/sec\n`);
    
    this.results.push({
      test: 'Parallel',
      times: successful,
      successful: successful.length,
      total: results.length,
      totalTime
    });
  }

  async testBurstRequests() {
    console.log('📋 Test 3: Burst Requests (Throughput Test)');
    console.log('===========================================');
    
    const startHeight = 3100020;
    const blockCount = 20;
    const heights = Array.from({length: blockCount}, (_, i) => startHeight + i);
    
    console.log(`   Requesting ${blockCount} blocks as fast as possible...`);
    
    const start = Date.now();
    const promises = heights.map(async (height, index) => {
      // Stagger the requests slightly to test queue handling
      await new Promise(resolve => setTimeout(resolve, index * 10));
      
      try {
        const blockStart = Date.now();
        const block = await this.peerPool.getBlockByHeight(height);
        const elapsed = Date.now() - blockStart;
        
        if (index % 5 === 0) {
          console.log(`   ✅ Block ${height}: ${elapsed}ms`);
        }
        
        return elapsed;
      } catch (error) {
        console.log(`   ❌ Block ${height}: ${error.message.split('\n')[0]}`);
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r !== null);
    const totalTime = Date.now() - start;
    
    console.log(`   Completed: ${successful.length}/${blockCount} blocks`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Throughput: ${(successful.length / (totalTime / 1000)).toFixed(2)} blocks/sec\n`);
    
    this.results.push({
      test: 'Burst',
      times: successful,
      successful: successful.length,
      total: results.length,
      totalTime
    });
  }

  generateReport() {
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
    if (allTimes.length > 0) {
      const overallAvg = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
      
      console.log('🎯 Performance Assessment:');
      if (overallAvg < 200) {
        console.log('   🚀 EXCELLENT: Persistent connections working perfectly!');
      } else if (overallAvg < 500) {
        console.log('   ⚡ GOOD: Significant improvement achieved!');
      } else if (overallAvg < 1000) {
        console.log('   📈 IMPROVED: Better than before, but room for optimization.');
      } else {
        console.log('   🐌 SLOW: Connection reuse may not be working properly.');
      }
      
      console.log(`   Overall Average: ${overallAvg.toFixed(0)}ms per block`);
    }
  }

  async shutdown() {
    console.log('\n🛑 Shutting down...');
    await this.peerPool.shutdown();
    console.log('✅ Test complete');
  }
}

// Run the test
async function runTest() {
  const test = new OptimizedPerformanceTest();
  
  try {
    await test.runParallelTest();
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