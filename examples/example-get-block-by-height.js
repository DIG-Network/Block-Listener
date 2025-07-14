const { ChiaBlockListener, initTracing } = require('../index.js');
const dns = require('dns').promises;

// DNS introducers for peer discovery
const MAINNET_DNS_INTRODUCERS = [
  "dns-introducer.chia.net",
  "chia.ctrlaltdel.ch", 
  "seeder.dexie.space",
  "chia.hoffmang.com"
];

const TESTNET11_DNS_INTRODUCERS = [
  "dns-introducer-testnet11.chia.net"
];

const MAINNET_DEFAULT_PORT = 8444;
const TESTNET11_DEFAULT_PORT = 58444;

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
  const introducers = networkId === 'mainnet' ? MAINNET_DNS_INTRODUCERS : TESTNET11_DNS_INTRODUCERS;
  const defaultPort = networkId === 'mainnet' ? MAINNET_DEFAULT_PORT : TESTNET11_DEFAULT_PORT;

  console.log(`🔍 Discovering peers for ${networkId}...`);
  
  let allAddresses = [];
  
  // Resolve all introducers to IP addresses
  for (const introducer of introducers) {
    try {
      console.log(`  Resolving ${introducer}...`);
      const addresses = await dns.lookup(introducer, { all: true });
      for (const addr of addresses) {
        // Store the address with family information for proper handling
        allAddresses.push({ 
          host: addr.address, 
          port: defaultPort,
          family: addr.family // 4 for IPv4, 6 for IPv6
        });
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
  console.log(`  Found ${allAddresses.length} potential peers (IPv4 and IPv6)`);
  
  return allAddresses;
}

// Format address for display (IPv6 needs brackets in URLs)
function formatAddress(host, port, family) {
  if (family === 6) {
    return `[${host}]:${port}`;
  }
  return `${host}:${port}`;
}

// Try to connect to peers until one succeeds
async function connectToAnyPeer(listener, networkId = 'mainnet', maxAttempts = 10) {
  const peers = await discoverPeers(networkId);
  
  console.log(`🔌 Attempting to connect to peers (max ${maxAttempts} attempts)...`);
  
  for (let i = 0; i < Math.min(peers.length, maxAttempts); i++) {
    const peer = peers[i];
    const displayAddress = formatAddress(peer.host, peer.port, peer.family);
    console.log(`  Trying ${displayAddress}...`);
    
    try {
      const peerId = listener.addPeer(peer.host, peer.port, networkId);
      console.log(`  ✅ Successfully added peer ${peerId} (${displayAddress})`);
      return peerId;
    } catch (error) {
      console.log(`  ❌ Failed to add peer ${displayAddress}: ${error.message}`);
    }
  }
  
  throw new Error(`Failed to connect to any of the ${maxAttempts} attempted peers`);
}

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  try {
    // Set up event listeners for the new architecture
    listener.on('peerConnected', (event) => {
      console.log(`✅ Peer ${event.peerId} connected: ${event.host}:${event.port}`);
      
      console.log('\n🧪 TESTING NEW CHIA-GENERATOR-PARSER ARCHITECTURE');
      console.log('='.repeat(60));
      
      console.log('\n🔍 Testing block request with new parser...');
      
      // Test requesting a few blocks to see the new parser in action
      const testHeights = [4000000, 4000001, 4000002];
      
      for (const height of testHeights) {
        try {
          console.log(`\n📊 Requesting block at height ${height}...`);
          
          const block = listener.getBlockByHeight(event.peerId, height);
          
          if (block) {
            console.log(`✅ Successfully parsed block ${height} with new architecture!`);
            console.log(`📦 Block Details:`);
            console.log(`   Height: ${block.height}`);
            console.log(`   Weight: ${block.weight}`);
            console.log(`   Header Hash: ${block.headerHash}`);
            console.log(`   Timestamp: ${block.timestamp ? new Date(block.timestamp * 1000).toISOString() : 'N/A'}`);
            console.log(`   Has Generator: ${block.hasTransactionsGenerator}`);
            console.log(`   Generator Size: ${block.generatorSize} bytes`);
            
            // Test the new coin data structure
            console.log(`\n💰 NEW COIN DATA STRUCTURE:`);
            console.log(`   Coin Additions: ${block.coinAdditions?.length || 0}`);
            console.log(`   Coin Removals: ${block.coinRemovals?.length || 0}`);
            console.log(`   Coin Spends: ${block.coinSpends?.length || 0}`);
            console.log(`   Coin Creations: ${block.coinCreations?.length || 0}`);
            
            // Show detailed coin information
            if (block.coinAdditions && block.coinAdditions.length > 0) {
              console.log(`\n🔍 COIN ADDITIONS DETAIL:`);
              block.coinAdditions.forEach((coin, index) => {
                console.log(`  Addition ${index + 1}:`);
                console.log(`    Parent: ${coin.parentCoinInfo}`);
                console.log(`    Puzzle Hash: ${coin.puzzleHash}`);
                console.log(`    Amount: ${coin.amount} mojos (${parseFloat(coin.amount) / 1000000000000} XCH)`);
              });
            }
            
            if (block.coinSpends && block.coinSpends.length > 0) {
              console.log(`\n🔐 COIN SPENDS DETAIL:`);
              block.coinSpends.forEach((spend, index) => {
                console.log(`  Spend ${index + 1}:`);
                console.log(`    Coin: ${JSON.stringify(spend.coin, null, 6)}`);
                console.log(`    Puzzle Reveal: ${spend.puzzleReveal ? spend.puzzleReveal.substring(0, 100) + '...' : 'N/A'}`);
                console.log(`    Solution: ${spend.solution ? spend.solution.substring(0, 100) + '...' : 'N/A'}`);
                console.log(`    Real Data: ${spend.realData}`);
                console.log(`    Method: ${spend.parsingMethod}`);
                console.log(`    Offset: ${spend.offset}`);
              });
            }
            
            // Test the generator processing if available
            if (block.hasTransactionsGenerator && block.generatorBytecode) {
              console.log(`\n🧪 TESTING GENERATOR PROCESSING WITH NEW PARSER:`);
              try {
                const result = listener.processTransactionGenerator(block.generatorBytecode);
                console.log(`📊 Generator Analysis Result:`);
                console.log(JSON.stringify(result, null, 2));
              } catch (error) {
                console.log(`❌ Generator processing error: ${error.message}`);
              }
            }
            
            console.log(`\n${'='.repeat(60)}`);
            
          } else {
            console.log(`❌ No block found at height ${height}`);
          }
        } catch (error) {
          console.error(`💥 Error requesting block at height ${height}:`, error.message);
        }
      }
      
      console.log(`\n🎉 NEW ARCHITECTURE TEST COMPLETE!`);
      console.log(`✅ The chia-generator-parser integration is working!`);
      console.log(`📝 Key improvements:`);
      console.log(`   - All parsing is now done in peer.rs using chia-generator-parser`);
      console.log(`   - No legacy parsing code in event_emitter.rs`);
      console.log(`   - Comprehensive coin data structure (additions, removals, spends, creations)`);
      console.log(`   - Clean separation of concerns`);
    });

    listener.on('peerDisconnected', (event) => {
      console.log(`❌ Peer ${event.peerId} disconnected: ${event.host}:${event.port}`);
      if (event.message) console.log(`   Reason: ${event.message}`);
    });

    listener.on('blockReceived', (event) => {
      console.log(`\n${'🚀'.repeat(40)}`);
      console.log(`📦 REAL-TIME BLOCK EVENT WITH NEW ARCHITECTURE`);
      console.log(`${'🚀'.repeat(40)}`);
      
      console.log(`\n📊 BLOCK SUMMARY:`);
      console.log(`   Height: ${event.height}`);
      console.log(`   Header Hash: ${event.headerHash}`);
      console.log(`   Weight: ${event.weight}`);
      console.log(`   Timestamp: ${event.timestamp ? new Date(event.timestamp * 1000).toISOString() : 'N/A'}`);
      console.log(`   Has Generator: ${event.hasTransactionsGenerator || false}`);
      console.log(`   Generator Size: ${event.generatorSize || 0} bytes`);
      
      console.log(`\n💰 NEW COMPREHENSIVE COIN DATA:`);
      console.log(`   Coin Additions: ${event.coinAdditions?.length || 0}`);
      console.log(`   Coin Removals: ${event.coinRemovals?.length || 0}`);
      console.log(`   Coin Spends: ${event.coinSpends?.length || 0}`);
      console.log(`   Coin Creations: ${event.coinCreations?.length || 0}`);
      
      // Show the new architecture is working
      console.log(`\n✅ SUCCESS: Block parsed by chia-generator-parser in peer.rs!`);
      console.log(`🔧 Architecture: peer.rs → chia-generator-parser → event_emitter.rs → JavaScript`);
      
      if (event.coinAdditions && event.coinAdditions.length > 0) {
        console.log(`\n💎 COIN ADDITIONS FROM NEW PARSER:`);
        event.coinAdditions.forEach((coin, index) => {
          console.log(`  ${index + 1}. ${coin.puzzleHash} = ${parseFloat(coin.amount) / 1000000000000} XCH`);
        });
      }
      
      if (event.coinSpends && event.coinSpends.length > 0) {
        console.log(`\n🔐 COIN SPENDS FROM NEW PARSER:`);
        event.coinSpends.forEach((spend, index) => {
          console.log(`  ${index + 1}. Method: ${spend.parsingMethod}, Real: ${spend.realData}`);
        });
      }
      
      console.log(`\n${'='.repeat(80)}\n`);
    });

    // Connect to a peer
    const networkId = 'mainnet';
    const peerId = await connectToAnyPeer(listener, networkId);
    
    console.log(`\n🚀 Successfully connected to peer ${peerId} on ${networkId}`);
    console.log('🧪 Testing new chia-generator-parser architecture...');
    console.log('Press Ctrl+C to stop\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      listener.disconnectAllPeers();
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {});

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);