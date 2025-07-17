const { ChiaBlockListener, initTracing } = require('../index.js');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

// Create log file with timestamp
const logFileName = `connection-diagnostic-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.log`;
const logFilePath = path.join(__dirname, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Override console.log to also write to file
const originalConsoleLog = console.log;
console.log = function(...args) {
  // Write to console
  originalConsoleLog.apply(console, args);
  
  // Write to file
  const timestamp = new Date().toISOString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logStream.write(`[${timestamp}] ${message}\n`);
};

// Override console.error to also write to file
const originalConsoleError = console.error;
console.error = function(...args) {
  // Write to console
  originalConsoleError.apply(console, args);
  
  // Write to file
  const timestamp = new Date().toISOString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logStream.write(`[${timestamp}] [ERROR] ${message}\n`);
};

console.log(`📝 Logging to file: ${logFilePath}`);

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
  console.log(`🔍 Discovering peers for mainnet...`);
  
  let allAddresses = [];
  
  // Resolve all introducers to IP addresses
  for (const introducer of MAINNET_DNS_INTRODUCERS) {
    try {
      console.log(`  Resolving ${introducer}...`);
      const addresses = await dns.lookup(introducer, { all: true });
      for (const addr of addresses) {
        allAddresses.push({ 
          host: addr.address, 
          port: MAINNET_DEFAULT_PORT,
          family: addr.family
        });
      }
    } catch (error) {
      console.log(`  Failed to resolve ${introducer}: ${error.message}`);
    }
  }

  if (allAddresses.length === 0) {
    throw new Error('Failed to resolve any peer addresses from introducers');
  }

  console.log(`  Found ${allAddresses.length} potential peers`);
  return allAddresses;
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testConnection() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  let connectedPeerId = null;
  let connectionSuccess = false;

  try {
    // Set up event listeners
    listener.on('peerConnected', (event) => {
      console.log(`✅ Event: Peer connected - ${event.peerId}`);
      connectionSuccess = true;
    });

    listener.on('peerDisconnected', (event) => {
      console.log(`❌ Event: Peer disconnected - ${event.peerId}`);
      if (event.message) console.log(`   Reason: ${event.message}`);
    });

    listener.on('blockReceived', (event) => {
      console.log(`📦 Event: Block received - Height: ${event.height}`);
    });

    // Discover peers
    const peers = await discoverPeers();
    
    console.log('\n🔧 Testing Connection and Handshake Process\n');
    
    // Try multiple peers to ensure we get a good connection
    for (let i = 0; i < Math.min(10, peers.length); i++) {
      const peer = peers[i];
      console.log(`\n--- Attempt ${i + 1} ---`);
      console.log(`📡 Trying to connect to ${peer.host}:${peer.port}`);
      
      try {
        // Step 1: Add peer (this creates connection and performs handshake)
        console.log('Step 1: Adding peer (initiating connection)...');
        const startTime = Date.now();
        connectedPeerId = listener.addPeer(peer.host, peer.port, 'mainnet');
        const connectionTime = Date.now() - startTime;
        
        console.log(`Step 1 ✅: Peer added successfully in ${connectionTime}ms`);
        console.log(`   Peer ID: ${connectedPeerId}`);
        
        // Step 2: Wait a bit to ensure connection is established
        console.log('Step 2: Waiting for connection to stabilize...');
        await sleep(2000);
        
        // Step 3: Check if we received the connection event
        if (connectionSuccess) {
          console.log('Step 2 ✅: Connection event received');
        } else {
          console.log('Step 2 ⚠️: No connection event received yet');
        }
        
        // Step 4: Check connected peers
        console.log('Step 3: Checking connected peers list...');
        const connectedPeers = listener.getConnectedPeers();
        console.log(`   Connected peers: ${JSON.stringify(connectedPeers)}`);
        
        if (connectedPeers.includes(connectedPeerId)) {
          console.log('Step 3 ✅: Peer is in connected peers list');
        } else {
          console.log('Step 3 ❌: Peer NOT in connected peers list');
          continue;
        }
        
        // Step 5: Try to fetch a recent block
        console.log('Step 4: Testing block fetch...');
        try {
          // Try a recent block height
          const testHeight = 5000000;
          console.log(`   Requesting block at height ${testHeight}...`);
          const blockStartTime = Date.now();
          
          const block = listener.getBlockByHeight(connectedPeerId, testHeight);
          const blockFetchTime = Date.now() - blockStartTime;
          
          console.log(`Step 4 ✅: Block fetched successfully in ${blockFetchTime}ms`);
          console.log(`   Block height: ${block.height}`);
          console.log(`   Block timestamp: ${block.timestamp}`);
          console.log(`   Coin spends: ${block.coinSpends.length}`);
          
          // Try another block to ensure connection is stable
          console.log('\nStep 5: Testing connection stability with another block...');
          const anotherHeight = 5000001;
          console.log(`   Requesting block at height ${anotherHeight}...`);
          
          const block2 = listener.getBlockByHeight(connectedPeerId, anotherHeight);
          console.log('Step 5 ✅: Second block fetched successfully');
          console.log(`   Block height: ${block2.height}`);
          
          console.log('\n✅ Connection is working properly!');
          console.log(`Successfully connected to ${peer.host}:${peer.port}`);
          
          // Test a range of blocks
          console.log('\nStep 6: Testing block range fetch...');
          try {
            const rangeStart = 5000000;
            const rangeEnd = 5000002;
            console.log(`   Requesting blocks from ${rangeStart} to ${rangeEnd}...`);
            
            const blocks = listener.getBlocksRange(connectedPeerId, rangeStart, rangeEnd);
            console.log(`Step 6 ✅: Retrieved ${blocks.length} blocks`);
            blocks.forEach((b, idx) => {
              console.log(`   Block ${idx + 1}: Height ${b.height}, Spends: ${b.coinSpends.length}`);
            });
          } catch (rangeError) {
            console.log(`Step 6 ❌: Block range fetch failed: ${rangeError.message}`);
          }
          
          // Success - we found a working peer
          break;
          
        } catch (blockError) {
          console.log(`Step 4 ❌: Block fetch failed: ${blockError.message}`);
          console.log('   This might indicate:');
          console.log('   - Connection was lost after handshake');
          console.log('   - Peer rejected the block request');
          console.log('   - Network timeout');
          
          // Check if peer is still connected
          const stillConnected = listener.getConnectedPeers();
          console.log(`   Peer still in connected list: ${stillConnected.includes(connectedPeerId)}`);
          
          // Try to disconnect and move to next peer
          console.log('   Disconnecting from this peer...');
          listener.disconnectPeer(connectedPeerId);
          await sleep(1000);
          connectionSuccess = false;
          continue;
        }
        
      } catch (error) {
        console.log(`❌ Failed to connect: ${error.message}`);
        continue;
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('DIAGNOSTIC SUMMARY');
    console.log('='.repeat(80));
    
    const finalConnectedPeers = listener.getConnectedPeers();
    console.log(`Connected peers: ${finalConnectedPeers.length}`);
    if (finalConnectedPeers.length > 0) {
      console.log('✅ Connection and handshake are working correctly');
      console.log('✅ Block fetching is working correctly');
    } else {
      console.log('❌ Unable to maintain stable connection to any peer');
      console.log('\nPossible issues:');
      console.log('1. Network connectivity problems');
      console.log('2. Firewall blocking WebSocket connections');
      console.log('3. Peers rejecting connections from this client');
      console.log('4. WebSocket connection timing out');
    }
    
    // Cleanup
    console.log('\nDisconnecting all peers...');
    listener.disconnectAllPeers();
    
    // Close the log stream
    logStream.end(() => {
      console.log(`\n📄 Full log saved to: ${logFilePath}`);
      process.exit(0);
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    
    // Close the log stream on error
    logStream.end(() => {
      process.exit(1);
    });
  }
}

// Run the diagnostic
testConnection().catch(console.error); 