const { ChiaPeerPool } = require('../index.js');

// Minimal logging for clean output
process.env.RUST_LOG = 'chia_block_listener=warn';

async function quickTest() {
  const pool = new ChiaPeerPool();
  
  try {
    console.log('⚡ Quick Performance Test - Optimized ChiaPeerPool');
    console.log('================================================\n');
    
    // Connect to one reliable peer
    console.log('🔌 Connecting to reliable peer...');
    
    // Try multiple peers until we find one that works
    const testPeers = [
      '185.69.164.168',  // Known working peer
      '78.47.229.125',   // Alternative
      '95.216.27.36',    // Alternative
    ];
    
    let connectedPeer = null;
    for (const host of testPeers) {
      try {
        console.log(`   Trying ${host}...`);
        const peerId = await pool.addPeer(host, 8444, 'mainnet');
        console.log(`   ✅ Connected: ${peerId.split(':')[0]}`);
        connectedPeer = host;
        break;
      } catch (error) {
        console.log(`   ❌ Failed: ${host}`);
      }
    }
    
    if (!connectedPeer) {
      throw new Error('Could not connect to any peer');
    }
    
    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 1: Sequential requests to test connection reuse
    console.log('\n📋 Sequential Requests Test (Connection Reuse)');
    console.log('   Testing if persistent connections are working...\n');
    
    const heights = [3200000, 3200001, 3200002];
    const times = [];
    
    for (let i = 0; i < heights.length; i++) {
      const height = heights[i];
      console.log(`   Request ${i + 1}/${heights.length}: Block ${height}`);
      
      const start = Date.now();
      try {
        const block = await pool.getBlockByHeight(height);
        const elapsed = Date.now() - start;
        times.push(elapsed);
        
        console.log(`   ✅ Success: ${elapsed}ms (${block.coinAdditions.length} adds)`);
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message.split('.')[0]}`);
        times.push(null);
      }
    }
    
    // Analyze results
    const successfulTimes = times.filter(t => t !== null);
    if (successfulTimes.length >= 2) {
      const firstRequest = successfulTimes[0];
      const subsequentAvg = successfulTimes.slice(1).reduce((a, b) => a + b, 0) / (successfulTimes.length - 1);
      
      console.log('\n📊 Performance Analysis:');
      console.log(`   First request: ${firstRequest}ms (connection setup + block fetch)`);
      console.log(`   Subsequent avg: ${subsequentAvg.toFixed(0)}ms (should be much faster)`);
      
      if (subsequentAvg < firstRequest * 0.5) {
        const improvement = (firstRequest / subsequentAvg).toFixed(1);
        console.log(`   🚀 EXCELLENT: ${improvement}x faster! Persistent connections working!`);
      } else if (subsequentAvg < firstRequest * 0.8) {
        console.log(`   ⚡ GOOD: Some improvement, connections partially reused`);
      } else {
        console.log(`   🐌 ISSUE: No significant improvement, may still be creating new connections`);
      }
      
      // Overall assessment
      const avgTime = successfulTimes.reduce((a, b) => a + b, 0) / successfulTimes.length;
      console.log(`   Average time per block: ${avgTime.toFixed(0)}ms`);
      
      if (avgTime < 300) {
        console.log(`   💯 Performance: EXCELLENT`);
      } else if (avgTime < 600) {
        console.log(`   ✅ Performance: GOOD`);
      } else if (avgTime < 1200) {
        console.log(`   ⚠️  Performance: FAIR`);
      } else {
        console.log(`   ❌ Performance: POOR`);
      }
    } else {
      console.log('\n❌ Not enough successful requests to analyze performance');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    console.log('\n🛑 Shutting down...');
    await pool.shutdown();
    console.log('✅ Test complete');
  }
}

quickTest().catch(console.error); 