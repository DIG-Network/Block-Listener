const { ChiaPeerPool } = require('../index.js');

process.env.RUST_LOG = 'chia_block_listener=debug';

async function portTest() {
  const pool = new ChiaPeerPool();
  
  try {
    console.log('🔍 Port and Configuration Test');
    console.log('=============================\n');
    
    // Test different port configurations
    const testConfigs = [
      { host: '185.69.164.168', port: 8444, desc: 'Standard port 8444' },
      { host: '185.69.164.168', port: 8555, desc: 'Farmer port 8555' },
      { host: '1.2.3.4', port: 8444, desc: 'Invalid host (should fail)' },
    ];
    
    for (const config of testConfigs) {
      console.log(`Testing ${config.desc} (${config.host}:${config.port})...`);
      
      try {
        const peerId = await pool.addPeer(config.host, config.port, 'mainnet');
        console.log(`✅ Connected: ${peerId.split(':')[0]}`);
        
        // Wait for stabilization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try a block request
        try {
          const block = await pool.getBlockByHeight(3000000);
          console.log(`✅ Block request successful! Height: ${block.height}`);
          console.log('🎉 SUCCESS: This configuration works!\n');
          break; // Found working config
        } catch (blockError) {
          console.log(`❌ Block request failed: ${blockError.message.split('\n')[0]}`);
        }
        
      } catch (peerError) {
        console.log(`❌ Peer connection failed: ${peerError.message.split('\n')[0]}`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('🛑 Shutting down...');
    await pool.shutdown();
    console.log('✅ Test complete');
  }
}

portTest().catch(console.error); 