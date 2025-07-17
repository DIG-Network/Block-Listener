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
            port: MAINNET_DEFAULT_PORT,
            networkId: "mainnet"
          });
        }
      }
    } catch (err) {
      console.error(`  Failed to resolve ${introducer}: ${err.message}`);
    }
  }
  
  // Shuffle and return requested count
  const shuffled = allAddresses.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function demonstratePeerPoolEvents() {
  // Set log level to reduce verbosity
  process.env.RUST_LOG = 'chia_block_listener=warn';
  
  // Initialize tracing
  initTracing();
  
  console.log('🚀 Creating ChiaPeerPool with event handlers...\n');
  
  // Create peer pool
  const pool = new ChiaPeerPool();
  
  // Track connected peers
  const connectedPeers = new Set();
  
  // Set up event handlers
  pool.on('peerConnected', (event) => {
    console.log('✅ PEER CONNECTED EVENT:');
    console.log(`   Peer ID: ${event.peerId}`);
    console.log(`   Host: ${event.host}`);
    console.log(`   Port: ${event.port}`);
    console.log(`   Timestamp: ${new Date().toISOString()}\n`);
    connectedPeers.add(event.peerId);
  });
  
  pool.on('peerDisconnected', (event) => {
    console.log('❌ PEER DISCONNECTED EVENT:');
    console.log(`   Peer ID: ${event.peerId}`);
    console.log(`   Host: ${event.host}`);
    console.log(`   Port: ${event.port}`);
    if (event.message) {
      console.log(`   Message: ${event.message}`);
    }
    console.log(`   Timestamp: ${new Date().toISOString()}\n`);
    connectedPeers.delete(event.peerId);
  });
  
  // Discover and add peers
  const peers = await discoverPeers(3);
  console.log(`\n📡 Adding ${peers.length} peers to the pool...\n`);
  
  for (const peer of peers) {
    try {
      const peerId = await pool.addPeer(peer.host, peer.port, peer.networkId);
      console.log(`   Added peer: ${peerId}`);
    } catch (err) {
      console.error(`   Failed to add peer ${peer.host}:${peer.port}: ${err.message}`);
    }
  }
  
  // Wait for connections to establish
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`\n📊 Currently connected peers: ${connectedPeers.size}`);
  console.log('   Peer IDs:', Array.from(connectedPeers));
  
  // Test fetching blocks
  console.log('\n🔍 Testing block fetching with events...\n');
  
  try {
    const heights = [5000000, 5000001, 5000002];
    
    for (const height of heights) {
      console.log(`   Fetching block at height ${height}...`);
      const block = await pool.getBlockByHeight(height);
      console.log(`   ✓ Block ${height}: ${block.coinSpends.length} coin spends, timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
    }
  } catch (err) {
    console.error(`   Error fetching blocks: ${err.message}`);
  }
  
  // Get connected peers list
  console.log('\n📋 Getting connected peers list...');
  const peerList = await pool.getConnectedPeers();
  console.log(`   Connected peers: ${peerList.length}`);
  peerList.forEach(peerId => {
    console.log(`   - ${peerId}`);
  });
  
  // Demonstrate removing a peer
  if (peerList.length > 0) {
    console.log(`\n🔧 Removing peer ${peerList[0]}...`);
    const removed = await pool.removePeer(peerList[0]);
    console.log(`   Peer removed: ${removed}`);
    
    // Wait for disconnection event
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Clear event handlers
  console.log('\n🧹 Clearing event handlers...');
  pool.off('peerConnected');
  pool.off('peerDisconnected');
  
  // Test that events no longer fire
  console.log('   Adding another peer (no events should fire)...');
  const newPeers = await discoverPeers(1);
  if (newPeers.length > 0) {
    const peerId = await pool.addPeer(newPeers[0].host, newPeers[0].port, newPeers[0].networkId);
    console.log(`   Added peer ${peerId} (no event fired)`);
  }
  
  // Shutdown the pool
  console.log('\n🛑 Shutting down pool...');
  await pool.shutdown();
  
  console.log('\n✅ Demo complete!\n');
  
  // Summary
  console.log('📊 Summary:');
  console.log(`   - ChiaPeerPool supports peerConnected and peerDisconnected events`);
  console.log(`   - Events fire when peers are added, removed, or disconnect`);
  console.log(`   - Event handlers can be added with on() and removed with off()`);
  console.log(`   - Pool maintains rate limiting (500ms per peer) for requests`);
  console.log(`   - All requests are load balanced across available peers`);
}

// Run the demo
demonstratePeerPoolEvents().catch(err => {
  console.error('Error in demo:', err);
  process.exit(1);
}); 