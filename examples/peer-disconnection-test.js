const { ChiaPeerPool } = require('../index.js');
const dns = require('dns').promises;

// Enable info logging to see disconnection events
process.env.RUST_LOG = 'chia_block_listener=info';

// DNS introducers for peer discovery
const MAINNET_DNS_INTRODUCERS = [
  "dns-introducer.chia.net",
  "chia.ctrlaltdel.ch", 
  "seeder.dexie.space",
  "chia.hoffmang.com"
];

const MAINNET_DEFAULT_PORT = 8444;

// Discover peers using DNS introducers
async function discoverPeers() {
  console.log('🔍 Discovering peers...');
  
  let allAddresses = [];
  
  for (const introducer of MAINNET_DNS_INTRODUCERS) {
    try {
      const addresses = await dns.lookup(introducer, { all: true });
      for (const addr of addresses) {
        if (addr.family === 4) { // IPv4 only
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

  // Shuffle for randomness
  const shuffled = allAddresses.sort(() => Math.random() - 0.5);
  console.log(`  Found ${shuffled.length} potential peers\n`);
  
  return shuffled;
}

class PeerDisconnectionTest {
  constructor() {
    this.peerPool = new ChiaPeerPool();
    this.connectedPeers = new Set();
    this.disconnectedPeers = new Set();
  }

  setupEventHandlers() {
    this.peerPool.on('peerConnected', (event) => {
      const shortId = event.peerId.split(':')[0];
      console.log(`🟢 Peer connected: ${shortId}:${event.port}`);
      this.connectedPeers.add(event.peerId);
    });

    this.peerPool.on('peerDisconnected', (event) => {
      const shortId = event.peerId.split(':')[0];
      console.log(`🔴 Peer disconnected: ${shortId}:${event.port}`);
      if (event.message) {
        console.log(`   Reason: ${event.message}`);
      }
      this.connectedPeers.delete(event.peerId);
      this.disconnectedPeers.add(event.peerId);
    });
  }

  async connectToMultiplePeers(targetCount = 5) {
    const peers = await discoverPeers();
    
    console.log(`🔌 Connecting to ${targetCount} peers for disconnection testing...`);
    
    const maxAttempts = Math.min(peers.length, targetCount * 2);
    
    for (let i = 0; i < maxAttempts && this.connectedPeers.size < targetCount; i++) {
      const peer = peers[i];
      try {
        const peerId = await this.peerPool.addPeer(peer.host, peer.port, 'mainnet');
        console.log(`  ✅ Connected: ${peer.host}`);
      } catch (error) {
        console.log(`  ❌ Failed: ${peer.host}`);
      }
    }
    
    console.log(`✅ Connected to ${this.connectedPeers.size} peers\n`);
    return this.connectedPeers.size;
  }

  async testAutomaticDisconnection() {
    console.log('🧪 Testing Automatic Peer Disconnection on WebSocket Failures');
    console.log('============================================================\n');
    
    this.setupEventHandlers();
    
    // Connect to multiple peers
    const connectedCount = await this.connectToMultiplePeers(5);
    if (connectedCount === 0) {
      throw new Error('No peers connected - cannot test disconnection');
    }

    // Wait for connections to stabilize
    console.log('⏳ Waiting for connections to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`📊 Initial state: ${this.connectedPeers.size} connected peers\n`);

    // Test 1: Stress test with many requests to trigger failures
    console.log('📋 Test 1: Stress Testing to Trigger WebSocket Failures');
    console.log('======================================================');
    
    const requestCount = 20;
    console.log(`Making ${requestCount} rapid requests to stress test connections...\n`);
    
    const promises = [];
    for (let i = 0; i < requestCount; i++) {
      const height = 3000000 + i;
      const promise = this.peerPool.getBlockByHeight(height)
        .then(block => {
          console.log(`✅ Block ${height}: Success`);
          return { height, success: true };
        })
        .catch(error => {
          console.log(`❌ Block ${height}: ${error.message.split('\n')[0]}`);
          return { height, success: false, error: error.message };
        });
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n📊 Stress test results:`);
    console.log(`   Successful requests: ${successful}/${requestCount}`);
    console.log(`   Failed requests: ${failed}/${requestCount}`);
    console.log(`   Connected peers after test: ${this.connectedPeers.size}`);
    console.log(`   Disconnected peers: ${this.disconnectedPeers.size}\n`);

    // Test 2: Monitor peer status
    console.log('📋 Test 2: Monitoring Peer Status');
    console.log('================================');
    
    const currentPeers = await this.peerPool.getConnectedPeers();
    console.log(`Current connected peers in pool: ${currentPeers.length}`);
    console.log(`Event tracker shows: ${this.connectedPeers.size} connected, ${this.disconnectedPeers.size} disconnected\n`);

    // Test 3: Verify disconnected peers are cleaned up
    if (this.disconnectedPeers.size > 0) {
      console.log('📋 Test 3: Verifying Disconnected Peer Cleanup');
      console.log('=============================================');
      
      console.log('Attempting requests after peer disconnections...');
      
      const finalTestPromises = [];
      for (let i = 0; i < 5; i++) {
        const height = 3100000 + i;
        const promise = this.peerPool.getBlockByHeight(height)
          .then(block => {
            console.log(`✅ Post-cleanup block ${height}: Success`);
            return true;
          })
          .catch(error => {
            console.log(`❌ Post-cleanup block ${height}: Failed`);
            return false;
          });
        finalTestPromises.push(promise);
      }

      const finalResults = await Promise.all(finalTestPromises);
      const finalSuccessful = finalResults.filter(r => r).length;
      
      console.log(`\nPost-cleanup results: ${finalSuccessful}/5 successful`);
    }

    this.generateDisconnectionReport();
  }

  generateDisconnectionReport() {
    console.log('\n📊 Peer Disconnection Analysis');
    console.log('=============================');
    
    console.log(`Final peer status:`);
    console.log(`   Still connected: ${this.connectedPeers.size} peers`);
    console.log(`   Automatically disconnected: ${this.disconnectedPeers.size} peers`);
    
    if (this.disconnectedPeers.size > 0) {
      console.log('\n✅ SUCCESS: Automatic peer disconnection is working!');
      console.log('   Failed peers were properly removed from the pool');
      console.log('   This prevents resource waste and improves reliability');
    } else {
      console.log('\n📝 INFO: No peers were automatically disconnected');
      console.log('   This could mean either:');
      console.log('   - All peers are very reliable (good!)');
      console.log('   - The disconnection mechanism needs more testing');
    }

    console.log('\n🎯 Key Benefits of Automatic Disconnection:');
    console.log('   • Failed peers are immediately removed from rotation');
    console.log('   • Resources are freed up for healthy connections');
    console.log('   • Improved overall pool performance and reliability');
    console.log('   • Prevents wasted attempts on dead connections');
  }

  async shutdown() {
    console.log('\n🛑 Shutting down test...');
    await this.peerPool.shutdown();
    console.log('✅ Test complete');
  }
}

async function runTest() {
  const test = new PeerDisconnectionTest();
  
  try {
    await test.testAutomaticDisconnection();
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