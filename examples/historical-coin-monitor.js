const { ChiaBlockListener, initTracing } = require('../index.js');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const dig = require('@dignetwork/datalayer-driver');

// Create log file with timestamp
const logFileName = `historical-coin-monitor-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.log`;
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
async function connectToAnyPeer(listener, networkId = 'mainnet', maxAttempts = 20) {
  const peers = await discoverPeers(networkId);
  
  console.log(`🔌 Attempting to connect to peers (max ${maxAttempts} attempts)...`);
  
  for (let i = 0; i < Math.min(peers.length, maxAttempts); i++) {
    const peer = peers[i];
    const displayAddress = formatAddress(peer.host, peer.port, peer.family);
    console.log(`  Trying ${displayAddress}...`);
    
    try {
      const peerId = listener.addPeer(peer.host, peer.port, networkId);
      console.log(`  ✅ Successfully added peer: ${peerId}`);
      return peerId;
    } catch (error) {
      console.log(`  ❌ Failed to add peer ${displayAddress}: ${error.message}`);
    }
  }
  
  throw new Error(`Failed to connect to any of the ${maxAttempts} attempted peers`);
}

// Process a single block's coin spends and extract puzzle hashes
function processBlockCoinSpends(block) {
  console.log('\n📦 Block Details:');
  console.log(`Block Height: ${block.height}, Timestamp: ${block.timestamp}`);
  console.log(`Header Hash: ${block.headerHash}`);
  console.log(`Coin Additions: ${block.coinAdditions.length}, Coin Removals: ${block.coinRemovals.length}`);
  console.log(`Coin Spends: ${block.coinSpends.length}, Coin Creations: ${block.coinCreations.length}`);
  
  // Extract and log puzzle hashes from coin spends
  if (block.coinSpends && block.coinSpends.length > 0) {
    const puzzleHashes = block.coinSpends.map(spend => spend.coin.puzzleHash);
    console.log('\n🧩 Puzzle Hashes from Coin Spends:');
    console.log(`Found ${puzzleHashes.length} puzzle hashes:`);
    puzzleHashes.forEach((hash, index) => {
      console.log(`  ${index + 1}. ${hash} (length: ${hash.length} chars, expected: 64)`);
      
      // Only try to convert to address if it's the right length
      if (hash.length === 64) {
        try {
          const address = dig.puzzleHashToAddress(Buffer.from(hash, 'hex'), 'xch');
          console.log(`    Address: ${address}`);
        } catch (e) {
          console.log(`    Address conversion failed: ${e.message}`);
        }
      } else {
        console.log(`    ❌ Invalid puzzle hash length (should be 64 hex chars for 32 bytes)`);
      }
    });
    
    // Also log unique puzzle hashes
    const uniquePuzzleHashes = [...new Set(puzzleHashes)];
    if (uniquePuzzleHashes.length !== puzzleHashes.length) {
      console.log(`\n🔍 Unique Puzzle Hashes (${uniquePuzzleHashes.length} unique):`);
      uniquePuzzleHashes.forEach((hash, index) => {
        console.log(`  ${index + 1}. ${hash} (length: ${hash.length} chars)`);
        
        // Only try to convert to address if it's the right length
        if (hash.length === 64) {
          try {
            const address = dig.puzzleHashToAddress(Buffer.from(hash, 'hex'), 'xch');
            console.log(`    Address: ${address}`);
          } catch (e) {
            console.log(`    Address conversion failed: ${e.message}`);
          }
        } else {
          console.log(`    ❌ Invalid puzzle hash length`);
        }
      });
    }
  } else {
    console.log('\n🧩 No coin spends found in this block');
  }
  
  return block;
}

// Fetch historical blocks by height
async function fetchHistoricalBlocks(listener, peerId, heights) {
  console.log(`\n📚 Fetching ${heights.length} historical blocks...`);
  
  const blocks = [];
  
  for (const height of heights) {
    try {
      console.log(`\n⏳ Fetching block at height ${height}...`);
      const block = listener.getBlockByHeight(peerId, height);
      
      processBlockCoinSpends(block);
      blocks.push(block);
      
      console.log('\n' + '='.repeat(80));
    } catch (error) {
      console.error(`❌ Failed to fetch block at height ${height}: ${error.message}`);
    }
  }
  
  return blocks;
}

// Fetch a range of blocks
async function fetchBlockRange(listener, peerId, startHeight, endHeight) {
  console.log(`\n📚 Fetching blocks from height ${startHeight} to ${endHeight}...`);
  
  try {
    const blocks = listener.getBlocksRange(peerId, startHeight, endHeight);
    console.log(`✅ Retrieved ${blocks.length} blocks`);
    
    blocks.forEach((block, index) => {
      console.log(`\n--- Block ${index + 1} of ${blocks.length} ---`);
      processBlockCoinSpends(block);
    });
    
    // Summary statistics
    const totalCoinSpends = blocks.reduce((sum, block) => sum + block.coinSpends.length, 0);
    const blocksWithSpends = blocks.filter(block => block.coinSpends.length > 0).length;
    
    console.log('\n📊 Summary Statistics:');
    console.log(`Total blocks processed: ${blocks.length}`);
    console.log(`Blocks with coin spends: ${blocksWithSpends}`);
    console.log(`Total coin spends: ${totalCoinSpends}`);
    console.log(`Average spends per block: ${(totalCoinSpends / blocks.length).toFixed(2)}`);
    
    return blocks;
  } catch (error) {
    console.error(`❌ Failed to fetch block range: ${error.message}`);
    return [];
  }
}

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  try {
    // Set up event listeners (still useful for connection status)
    listener.on('peerConnected', (event) => {
      console.log(`✅ Peer connected: ${event.peerId}`);
    });

    listener.on('peerDisconnected', (event) => {
      console.log(`❌ Peer ${event.peerId} disconnected: ${event.host}:${event.port}`);
      if (event.message) console.log(`   Reason: ${event.message}`);
    });

    // Connect to a peer
    const networkId = 'mainnet';
    const peerId = await connectToAnyPeer(listener, networkId);
    
    console.log(`\n🚀 Successfully connected to peer ${peerId} on ${networkId}`);
    
    // Example 1: Fetch specific historical blocks
    const specificHeights = [5000000, 5000001, 5000002, 5000003, 5000004];
    console.log('\n🔍 Example 1: Fetching specific historical blocks');
    await fetchHistoricalBlocks(listener, peerId, specificHeights);
    
    // Example 2: Fetch a range of recent blocks
    console.log('\n\n🔍 Example 2: Fetching a range of recent blocks');
    // Get blocks from 10 blocks ago to 5 blocks ago
    const currentHeight = 5500000; // You might want to get the actual current height from the peer
    const rangeStart = currentHeight - 10;
    const rangeEnd = currentHeight - 5;
    await fetchBlockRange(listener, peerId, rangeStart, rangeEnd);
    
    // Example 3: Fetch blocks with known interesting activity
    console.log('\n\n🔍 Example 3: Fetching blocks with known activity');
    const interestingHeights = [4000000, 4500000, 5000000]; // Milestone blocks
    await fetchHistoricalBlocks(listener, peerId, interestingHeights);
    
    // Disconnect when done
    console.log('\n🔌 Disconnecting from peer...');
    listener.disconnectAllPeers();
    
    // Close the log stream
    logStream.end(() => {
      console.log(`\n✅ Log saved to: ${logFilePath}`);
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    
    // Close the log stream on error
    logStream.end(() => {
      process.exit(1);
    });
  }
}

// Run the monitor
main().catch(console.error); 