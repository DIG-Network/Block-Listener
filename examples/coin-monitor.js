const { ChiaBlockListener, initTracing } = require('../index.js');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

// Create log file with timestamp
const logFileName = `coin-monitor-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.log`;
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
async function connectToAnyPeer(listener, networkId = 'mainnet', maxAttempts = 10) {
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

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  try {
    // Set up event listeners
    listener.on('peerConnected', (event) => {
      console.log(`✅ Peer connected: ${event.peerId}`);
      console.log(`🔊 Listening for real-time blocks...`);
    });

    listener.on('peerDisconnected', (event) => {
      console.log(`❌ Peer ${event.peerId} disconnected: ${event.host}:${event.port}`);
      if (event.message) console.log(`   Reason: ${event.message}`);
    });

    // Log every block as it's received
    listener.on('blockReceived', (event) => {
      console.log('\n📦 Real-time Block Event:');
      console.log(JSON.stringify(event, null, 2));
      console.log('\n' + '='.repeat(80) + '\n');
    });

    // Connect to a peer
    const networkId = 'mainnet';
    const peerId = await connectToAnyPeer(listener, networkId);
    
    console.log(`\n🚀 Successfully connected to peer ${peerId} on ${networkId}`);
    console.log('Monitoring real-time blocks...');
    console.log('Press Ctrl+C to stop\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      listener.disconnectAllPeers();
      
      // Close the log stream
      logStream.end(() => {
        console.log(`Log saved to: ${logFilePath}`);
        process.exit(0);
      });
    });

    // Keep the process running
    await new Promise(() => {});

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