const { ChiaPeerPool } = require('../index.js');

// Enable debug logging to see what's happening
process.env.RUST_LOG = 'chia_block_listener=debug';

async function basicConnectionTest() {
  const pool = new ChiaPeerPool();
  
  try {
    console.log('🔍 Basic Connection Test');
    console.log('=======================\n');
    
    // Test with a single known-good peer
    console.log('Testing connection to a reliable peer...');
    
    try {
      console.log('1. Attempting to add peer...');
      const peerId = await pool.addPeer('185.69.164.168', 8444, 'mainnet');
      console.log(`✅ Peer added successfully: ${peerId}`);
      
      console.log('2. Waiting for connection to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const connectedPeers = await pool.getConnectedPeers();
      console.log(`✅ Connected peers: ${connectedPeers.length}`);
      
      if (connectedPeers.length > 0) {
        console.log('3. Attempting block request...');
        
        try {
          const block = await pool.getBlockByHeight(3200000);
          console.log(`✅ Block request successful! Height: ${block.height}`);
        } catch (blockError) {
          console.log(`❌ Block request failed: ${blockError.message}`);
          console.log('This suggests connection establishment worked but block fetching failed');
        }
      } else {
        console.log('❌ No connected peers - connection establishment failed');
      }
      
    } catch (peerError) {
      console.log(`❌ Failed to add peer: ${peerError.message}`);
      console.log('This suggests the initial connection setup is failing');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🛑 Shutting down...');
    await pool.shutdown();
    console.log('✅ Test complete');
  }
}

basicConnectionTest().catch(console.error); 