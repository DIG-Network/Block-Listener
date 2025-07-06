const { ChiaBlockListener, loadChiaCerts, initTracing } = require('./index.js');
const os = require('os');
const path = require('path');
const dns = require('dns').promises;

/**
 * Discover Chia peers using DNS introducers
 */
async function discoverPeers() {
  const introducers = [
    'dns-introducer.chia.net',
    'chia.ctrlaltdel.ch',
    'seeder.dexie.space',
    'chia.hoffmang.com'
  ];
  
  const allPeers = [];
  
  for (const introducer of introducers) {
    try {
      const addresses = await dns.resolve4(introducer);
      const peers = addresses.map(ip => ({ 
        host: ip, 
        port: 8444,
        source: introducer 
      }));
      allPeers.push(...peers);
      console.log(`Found ${addresses.length} peers from ${introducer}`);
    } catch (err) {
      console.warn(`Failed to resolve ${introducer}:`, err.message);
    }
  }
  
  // Remove duplicates
  const uniquePeers = Array.from(
    new Map(allPeers.map(p => [p.host, p])).values()
  );
  
  console.log(`Discovered ${uniquePeers.length} unique peers total`);
  return uniquePeers;
}

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  try {
    // Load certificates from Chia installation
    const chiaRoot = process.env.CHIA_ROOT || path.join(os.homedir(), '.chia', 'mainnet');
    console.log('Loading certificates from:', chiaRoot);
    const certs = loadChiaCerts(chiaRoot);

    // Discover peers
    console.log('Discovering peers...');
    const peers = await discoverPeers();
    
    // Connect to a subset of discovered peers
    const maxPeers = 5;
    const selectedPeers = peers.slice(0, maxPeers);
    
    console.log(`Connecting to ${selectedPeers.length} peers...`);
    for (const peer of selectedPeers) {
      console.log(`Adding peer: ${peer.host}:${peer.port} (from ${peer.source})`);
      listener.addPeer(
        peer.host,
        peer.port,
        'mainnet',
        certs.cert,
        certs.key,
        certs.ca
      );
    }

    console.log('Starting block listener...');
    
    // Track some statistics
    let blockCount = 0;
    let lastBlockTime = Date.now();
    
    // Start listening for blocks
    listener.start((block) => {
      blockCount++;
      const now = Date.now();
      const timeSinceLastBlock = (now - lastBlockTime) / 1000;
      lastBlockTime = now;
      
      console.log(`\n🔗 Block #${blockCount} received!`);
      console.log('Height:', block.height);
      console.log('Weight:', block.weight);
      console.log('Header Hash:', block.header_hash);
      console.log('Timestamp:', new Date(block.timestamp * 1000).toISOString());
      console.log('Time since last block:', timeSinceLastBlock.toFixed(1), 'seconds');
      console.log('---');
    });

    console.log('Listening for blocks... Press Ctrl+C to stop\n');

    // Show periodic status
    setInterval(() => {
      if (listener.isRunning()) {
        console.log(`\n📊 Status: Running | Blocks received: ${blockCount}`);
      }
    }, 30000); // Every 30 seconds

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nStopping block listener...');
      listener.stop();
      console.log(`Total blocks received: ${blockCount}`);
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);