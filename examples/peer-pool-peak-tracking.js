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

async function discoverPeers(count = 3) {
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
      console.log(`  ⚠️  Failed to resolve ${introducer}: ${error.message}`);
    }
  }
  
  // Shuffle and take requested count
  const shuffled = allAddresses.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function demonstratePeakTracking() {
  // Set log level to reduce verbosity
  process.env.RUST_LOG = 'chia_block_listener=info';
  
  // Initialize tracing
  initTracing();
  
  console.log('🚀 Starting ChiaPeerPool Peak Tracking Demo');
  console.log('=' .repeat(50));
  
  // Create pool
  const pool = new ChiaPeerPool();
  console.log('✅ Created ChiaPeerPool instance');
  
  // Set up event handlers
  pool.on('peerConnected', (event) => {
    console.log(`\n🔗 Peer connected: ${event.peerId} (${event.host}:${event.port})`);
  });
  
  pool.on('peerDisconnected', (event) => {
    console.log(`\n🔌 Peer disconnected: ${event.peerId}`);
    if (event.message) {
      console.log(`   Reason: ${event.message}`);
    }
  });
  
  pool.on('newPeakHeight', (event) => {
    console.log(`\n🔺 New peak height detected!`);
    console.log(`   Previous peak: ${event.oldPeak === null ? 'None' : event.oldPeak}`);
    console.log(`   New peak: ${event.newPeak}`);
    console.log(`   Discovered by: ${event.peerId}`);
  });
  
  try {
    // Discover peers
    const peers = await discoverPeers(3);
    console.log(`\n📍 Found ${peers.length} peers`);
    
    // Add peers to pool
    console.log('\n🔄 Adding peers to pool...');
    const peerIds = [];
    for (const peer of peers) {
      try {
        const peerId = await pool.addPeer(peer.host, peer.port, 'mainnet');
        peerIds.push(peerId);
        console.log(`   ✅ Added peer: ${peerId}`);
      } catch (error) {
        console.log(`   ❌ Failed to add peer ${peer.host}:${peer.port}: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Successfully added ${peerIds.length} peers`);
    
    // Initial peak height (should be null since no blocks fetched yet)
    let peakHeight = await pool.getPeakHeight();
    console.log(`\n📊 Initial peak height: ${peakHeight === null ? 'No peaks yet' : peakHeight}`);
    
    // Fetch some blocks to trigger peak updates
    console.log('\n🔍 Fetching blocks to trigger peak updates...');
    
    // Try to fetch a recent block (adjust height as needed)
    const testHeights = [5000000, 5100000, 5200000];
    
    for (const height of testHeights) {
      try {
        console.log(`\n📦 Fetching block at height ${height}...`);
        const block = await pool.getBlockByHeight(height);
        console.log(`   ✅ Got block ${block.height} (${block.coinSpends.length} spends)`);
        
        // Check peak height after fetching block
        peakHeight = await pool.getPeakHeight();
        console.log(`   📊 Current peak height: ${peakHeight}`);
      } catch (error) {
        console.log(`   ❌ Failed to fetch block ${height}: ${error.message}`);
      }
    }
    
    // Monitor peak height changes
    console.log('\n📈 Monitoring peak height for 30 seconds...');
    console.log('   (Peers may receive new peaks during this time)');
    
    const startTime = Date.now();
    const monitorInterval = setInterval(async () => {
      const currentPeak = await pool.getPeakHeight();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      if (currentPeak !== peakHeight) {
        console.log(`\n🆕 Peak height changed: ${peakHeight} → ${currentPeak} (at ${elapsed}s)`);
        peakHeight = currentPeak;
      } else {
        process.stdout.write(`\r   ⏱️  ${elapsed}s - Current peak: ${currentPeak || 'None'}`);
      }
    }, 1000);
    
    // Wait for 30 seconds
    await new Promise(resolve => setTimeout(resolve, 30000));
    clearInterval(monitorInterval);
    
    // Final summary
    console.log('\n\n📊 Final Summary:');
    console.log('=' .repeat(50));
    
    const connectedPeers = await pool.getConnectedPeers();
    const finalPeak = await pool.getPeakHeight();
    
    console.log(`Connected peers: ${connectedPeers.length}`);
    console.log(`Highest peak seen: ${finalPeak || 'None'}`);
    
    if (finalPeak) {
      // Calculate approximate sync status
      const currentTime = Math.floor(Date.now() / 1000);
      const blocksPerDay = 4608; // ~18.75 seconds per block
      const estimatedCurrentHeight = 5200000 + Math.floor((currentTime - 1700000000) / 18.75);
      const syncPercentage = (finalPeak / estimatedCurrentHeight * 100).toFixed(2);
      
      console.log(`Estimated sync: ~${syncPercentage}%`);
    }
    
    // Cleanup
    console.log('\n🧹 Shutting down pool...');
    await pool.shutdown();
    console.log('✅ Pool shutdown complete');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

// Run the demo
demonstratePeakTracking()
  .then(() => {
    console.log('\n✅ Demo completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }); 