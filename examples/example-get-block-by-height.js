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
        allAddresses.push({ host: addr.address, port: defaultPort });
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
  console.log(`  Found ${allAddresses.length} potential peers`);
  
  return allAddresses;
}

// Try to connect to peers until one succeeds
async function connectToAnyPeer(listener, networkId = 'mainnet', maxAttempts = 10) {
  const peers = await discoverPeers(networkId);
  
  console.log(`🔌 Attempting to connect to peers (max ${maxAttempts} attempts)...`);
  
  for (let i = 0; i < Math.min(peers.length, maxAttempts); i++) {
    const peer = peers[i];
    console.log(`  Trying ${peer.host}:${peer.port}...`);
    
    try {
      const peerId = listener.addPeer(peer.host, peer.port, networkId);
      console.log(`  ✅ Successfully added peer ${peerId} (${peer.host}:${peer.port})`);
      return peerId;
    } catch (error) {
      console.log(`  ❌ Failed to add peer ${peer.host}:${peer.port}: ${error.message}`);
    }
  }
  
  throw new Error(`Failed to connect to any of the ${maxAttempts} attempted peers`);
}

// Reconnection helper function
async function attemptReconnection(listener, networkId = 'mainnet', isReconnectingRef, retryCount = 0) {
  const maxRetries = 3;
  const retryDelays = [5000, 30000, 60000]; // 5 seconds, 30 seconds, 1 minute
  
  console.log(`\n🔄 Reconnection attempt ${retryCount + 1}/${maxRetries}...`);
  
  try {
    const newPeerId = await connectToAnyPeer(listener, networkId);
    console.log(`🚀 Successfully reconnected with new peer ${newPeerId}`);
    isReconnectingRef.value = false;
    return newPeerId;
  } catch (error) {
    console.error(`💥 Reconnection attempt ${retryCount + 1} failed: ${error.message}`);
    
    if (retryCount < maxRetries - 1) {
      const delay = retryDelays[retryCount];
      console.log(`⏳ Will retry in ${delay / 1000} seconds...`);
      
      setTimeout(async () => {
        await attemptReconnection(listener, networkId, isReconnectingRef, retryCount + 1);
      }, delay);
    } else {
      console.log(`❌ All ${maxRetries} reconnection attempts failed. You may need to restart the application.`);
      isReconnectingRef.value = false;
    }
  }
}

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();
  
  // Track reconnection state to prevent multiple simultaneous attempts
  const reconnectionState = { value: false };

  try {
    // Set up event listeners
    listener.on('peerConnected', (event) => {
      console.log(`✅ Peer ${event.peerId} connected: ${event.host}:${event.port}`);
      
      // Check if this was a reconnection
      if (reconnectionState.value) {
        console.log(`🎉 Reconnection successful! Back online with new peer.`);
      }
      
      // Once connected, search for blocks with transaction generators
      console.log('\n🔍 Searching for blocks with transaction generators...');
      
      // Start searching from a known area with transaction activity
      let startHeight = 4000000;
      let maxSearchBlocks = 100;
      let blocksWithGenerators = 0;
      
      console.log(`Starting search from height ${startHeight}, will check up to ${maxSearchBlocks} blocks...`);
      
      // Search for blocks with generators
      for (let height = startHeight; height < startHeight + maxSearchBlocks; height++) {
        try {
          console.log(`\n📊 Checking block ${height}...`);
          
          const block = listener.getBlockByHeight(event.peerId, height);
          
          if (block && block.has_transactions_generator) {
            blocksWithGenerators++;
            
            console.log(`\n${'🎯'.repeat(40)}`);
            console.log(`FOUND BLOCK WITH TRANSACTION GENERATOR AT HEIGHT ${height}!`);
            console.log(`${'🎯'.repeat(40)}`);
            
            console.log(`\n📦 BLOCK DETAILS:`);
            console.log(`  Height: ${block.height}`);
            console.log(`  Header Hash: ${block.header_hash || 'N/A'}`);
            console.log(`  Weight: ${block.weight || 'N/A'}`);
            console.log(`  Timestamp: ${block.timestamp ? new Date(block.timestamp * 1000).toISOString() : 'N/A'}`);
            console.log(`  Generator Size: ${block.generator_size} bytes`);
            
            // Process the transaction generator to extract puzzle solutions and reveals
            if (block.generator_bytecode) {
              console.log(`\n🧪 PROCESSING TRANSACTION GENERATOR FOR PUZZLE SOLUTIONS:`);
              console.log(`    Generator bytecode: ${block.generator_bytecode.substring(0, 200)}...`);
              
              try {
                const generatorResult = listener.processTransactionGenerator(block.generator_bytecode);
                console.log(`\n🔓 TRANSACTION GENERATOR PROCESSING RESULT:`);
                console.log(JSON.stringify(generatorResult, null, 2));
                
                // If we successfully processed it and found coin spends, we're done
                if (generatorResult.success && generatorResult.coin_spends && generatorResult.coin_spends.length > 0) {
                  console.log(`\n✅ SUCCESS! Found ${generatorResult.coin_spends.length} coin spends with puzzle solutions!`);
                  console.log(`🔍 Detailed coin spend analysis:`);
                  
                  generatorResult.coin_spends.forEach((spend, index) => {
                    console.log(`\n  Spend ${index + 1}:`);
                    console.log(`    Coin: ${JSON.stringify(spend.coin, null, 6)}`);
                    console.log(`    Puzzle Reveal: ${spend.puzzle_reveal ? spend.puzzle_reveal.substring(0, 100) + '...' : 'N/A'}`);
                    console.log(`    Solution: ${spend.solution ? spend.solution.substring(0, 100) + '...' : 'N/A'}`);
                    console.log(`    Parsing Method: ${spend.parsing_method || 'N/A'}`);
                    console.log(`    Real Data: ${spend.real_data || false}`);
                  });
                  
                  // Found what we're looking for, stop searching
                  console.log(`\n🎉 Found block with extractable puzzle solutions at height ${height}!`);
                  break;
                }
              } catch (error) {
                console.error(`    💥 Error processing generator: ${error.message}`);
              }
            } else {
              console.log(`    ❌ Generator bytecode not available for manual block request`);
              console.log(`    This shouldn't happen - check the Rust implementation`);
            }
            
            // Show summary
            console.log(`\n📊 SEARCH PROGRESS:`);
            console.log(`    Blocks checked: ${height - startHeight + 1}`);
            console.log(`    Blocks with generators found: ${blocksWithGenerators}`);
            console.log(`    Continuing search for puzzle solutions...`);
            
          } else if (block) {
            // Just log a brief message for blocks without generators
            if (height % 10 === 0) {
              console.log(`    Block ${height}: No generator (${height - startHeight + 1}/${maxSearchBlocks} checked)`);
            }
          } else {
            console.log(`    ❌ No block found at height ${height}`);
          }
        } catch (error) {
          console.error(`    💥 Error getting block at height ${height}:`, error.message);
        }
      }
      
      console.log(`\n📋 SEARCH COMPLETE:`);
      console.log(`    Total blocks checked: ${maxSearchBlocks}`);
      console.log(`    Blocks with transaction generators: ${blocksWithGenerators}`);
      console.log(`    Search range: ${startHeight} - ${startHeight + maxSearchBlocks - 1}`);
    });

    listener.on('peerDisconnected', (event) => {
      console.log(`❌ Peer ${event.peerId} disconnected: ${event.host}:${event.port}`);
      if (event.message) console.log(`   Reason: ${event.message}`);
      
      // Check if we still have other connected peers
      const connectedPeers = listener.getConnectedPeers();
      console.log(`📊 Connected peers remaining: ${connectedPeers.length}`);
      
      // Only attempt reconnection if we have no connected peers and not already reconnecting
      if (connectedPeers.length === 0 && !reconnectionState.value) {
        console.log(`\n🔄 No peers connected. Starting automatic reconnection process...`);
        reconnectionState.value = true;
        
        // Start reconnection process
        setTimeout(async () => {
          await attemptReconnection(listener, 'mainnet', reconnectionState);
        }, 2000); // Wait 2 seconds before attempting reconnection
      } else if (connectedPeers.length > 0) {
        console.log(`✅ Other peers still connected, no reconnection needed`);
      } else if (reconnectionState.value) {
        console.log(`⏳ Reconnection already in progress, skipping...`);
      }
    });

    listener.on('blockReceived', (event) => {
      console.log(`\n${'🔥'.repeat(40)}`);
      console.log(`📦 NEW BLOCK RECEIVED FROM PEER ${event.peerId}`);
      console.log(`${'🔥'.repeat(40)}`);
      
      console.log(`\n📊 BLOCK SUMMARY:`);
      console.log(`   Height: ${event.height}`);
      console.log(`   Header Hash: ${event.header_hash}`);
      console.log(`   Weight: ${event.weight}`);
      console.log(`   Timestamp: ${event.timestamp ? new Date(event.timestamp * 1000).toISOString() : 'N/A'}`);
      console.log(`   Has Transactions Generator: ${event.has_transactions_generator || false}`);
      if (event.generator_size) {
        console.log(`   Generator Size: ${event.generator_size} bytes`);
      }
      
      // Log all event properties
      console.log(`\n🔍 ALL EVENT PROPERTIES:`);
      console.log(JSON.stringify(event, null, 2));
      
      // Detailed coin additions logging
      console.log(`\n💰 COIN ADDITIONS (${event.coin_additions.length}):`);
      if (event.coin_additions.length > 0) {
        event.coin_additions.forEach((coin, index) => {
          console.log(`  Addition ${index + 1}:`);
          console.log(`    Parent Coin Info: ${coin.parent_coin_info}`);
          console.log(`    Puzzle Hash: ${coin.puzzle_hash}`);
          console.log(`    Amount: ${coin.amount} mojos (${parseFloat(coin.amount) / 1000000000000} XCH)`);
          console.log(`    All coin properties:`, JSON.stringify(coin, null, 4));
        });
      } else {
        console.log('    No coin additions in this block');
      }
      
      // Detailed coin removals logging
      console.log(`\n💸 COIN REMOVALS (${event.coin_removals.length}):`);
      if (event.coin_removals.length > 0) {
        event.coin_removals.forEach((coin, index) => {
          console.log(`  Removal ${index + 1}:`);
          console.log(`    Parent Coin Info: ${coin.parent_coin_info}`);
          console.log(`    Puzzle Hash: ${coin.puzzle_hash}`);
          console.log(`    Amount: ${coin.amount} mojos (${parseFloat(coin.amount) / 1000000000000} XCH)`);
          console.log(`    All coin properties:`, JSON.stringify(coin, null, 4));
        });
      } else {
        console.log('    No coin removals in this block');
      }
      
      // Check for puzzle solutions and reveals
      console.log(`\n🔐 PUZZLE SOLUTIONS AND REVEALS:`);
      
      if (event.has_transactions_generator) {
        console.log(`    🎯 This block HAS a transactions generator (${event.generator_size} bytes)`);
        console.log(`    This means there are additional coin spends beyond the basic reward claims.`);
        
        // Process the transaction generator if we have the bytecode
        if (event.generator_bytecode) {
          console.log(`\n🧪 PROCESSING TRANSACTION GENERATOR (REAL-TIME):`);
          console.log(`    Generator bytecode available: ${event.generator_bytecode.substring(0, 100)}...`);
          
          try {
            const generatorResult = listener.processTransactionGenerator(event.generator_bytecode);
            console.log(`\n💎 REAL-TIME PUZZLE SOLUTIONS AND REVEALS:`);
            console.log(JSON.stringify(generatorResult, null, 2));
            
            if (generatorResult.success && generatorResult.coin_spends && generatorResult.coin_spends.length > 0) {
              console.log(`\n✅ SUCCESS! Found ${generatorResult.coin_spends.length} coin spends with puzzle solutions!`);
              console.log(`🔍 Detailed coin spend analysis from real-time event:`);
              
              generatorResult.coin_spends.forEach((spend, index) => {
                console.log(`\n  Spend ${index + 1}:`);
                console.log(`    Coin: ${JSON.stringify(spend.coin, null, 6)}`);
                console.log(`    Puzzle Reveal: ${spend.puzzle_reveal ? spend.puzzle_reveal.substring(0, 100) + '...' : 'N/A'}`);
                console.log(`    Solution: ${spend.solution ? spend.solution.substring(0, 100) + '...' : 'N/A'}`);
                console.log(`    Parsing Method: ${spend.parsing_method || 'N/A'}`);
                console.log(`    Real Data: ${spend.real_data || false}`);
              });
            } else {
              console.log(`    ⚠️  No coin spends extracted from generator`);
            }
          } catch (error) {
            console.error(`    💥 Error processing generator: ${error.message}`);
          }
        } else {
          console.log(`    ❌ Generator bytecode not available in real-time event`);
          console.log(`    This shouldn't happen - the Rust side should be sending the bytecode`);
        }
      } else {
        console.log(`    ✅ This block has NO transactions generator`);
        console.log(`    Only basic reward coin additions/removals are present.`);
      }
      
      console.log(`\n${'='.repeat(80)}\n`);
    });

    // Automatically discover and connect to a peer
    const networkId = 'mainnet'; // or 'testnet11'
    const peerId = await connectToAnyPeer(listener, networkId);
    
    console.log(`\n🚀 Successfully connected to peer ${peerId} on ${networkId}`);
    console.log('Waiting for connection establishment and block data...');
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