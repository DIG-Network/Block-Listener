const { ChiaPeerPool } = require('../index.js');

// Set log level to reduce noise
process.env.RUST_LOG = 'chia_block_listener=warn';

async function simplePerformanceTest() {
  const pool = new ChiaPeerPool();
  
  try {
    console.log('🚀 Simple ChiaPeerPool Performance Test');
    console.log('=====================================\n');
    
    // Use only one reliable peer to eliminate network variability
    console.log('🔌 Connecting to reliable peer...');
    const peerId = await pool.addPeer('3.131.166.83', 8444, 'mainnet'); // Known Chia node IP
    console.log(`✅ Connected: ${peerId}`);
    
    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test with a small number of sequential requests to the same peer
    const testBlocks = [3000000, 3000001, 3000002, 3000003, 3000004];
    console.log(`\n📋 Testing ${testBlocks.length} sequential requests to same peer...`);
    console.log('This tests if persistent connections are working.\n');
    
    const times = [];
    
    for (let i = 0; i < testBlocks.length; i++) {
      const height = testBlocks[i];
      console.log(`⏱️  Request ${i + 1}/${testBlocks.length}: Block ${height}...`);
      
      const start = Date.now();
      try {
        const block = await pool.getBlockByHeight(height);
        const elapsed = Date.now() - start;
        times.push(elapsed);
        
        console.log(`   ✅ Success: ${elapsed}ms (${block.coinAdditions.length} adds, ${block.coinSpends.length} spends)`);
        
        // Expected behavior:
        // - First request: ~800-1500ms (connection setup + block fetch)
        // - Subsequent requests: ~50-200ms (just block fetch using persistent connection)
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
      }
    }
    
    console.log('\n📊 Performance Analysis:');
    console.log('========================');
    
    if (times.length >= 2) {
      const firstRequest = times[0];
      const subsequentRequests = times.slice(1);
      const avgSubsequent = subsequentRequests.reduce((a, b) => a + b, 0) / subsequentRequests.length;
      
      console.log(`First request:     ${firstRequest}ms (includes connection setup)`);
      console.log(`Subsequent avg:    ${avgSubsequent.toFixed(0)}ms (should be much faster)`);
      console.log(`Speed improvement: ${(firstRequest / avgSubsequent).toFixed(1)}x faster`);
      
      if (avgSubsequent < 300) {
        console.log('🎉 EXCELLENT: Persistent connections are working!');
      } else if (avgSubsequent < 600) {
        console.log('⚡ GOOD: Some improvement, but could be better.');
      } else {
        console.log('🐌 SLOW: May still be creating new connections.');
      }
    } else {
      console.log('❌ Not enough successful requests to analyze');
    }
    
    console.log('\nDetailed times:', times.map(t => `${t}ms`).join(', '));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🛑 Shutting down...');
    await pool.shutdown();
    console.log('✅ Complete');
  }
}

simplePerformanceTest().catch(console.error); 