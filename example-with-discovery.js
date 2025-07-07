const { ChiaBlockListener, initTracing } = require('./index.js');
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
    // Discover peers
    console.log('Discovering peers...');
    const peers = await discoverPeers();
    
    // Connect to a subset of discovered peers
    const maxPeers = 5;
    const selectedPeers = peers.slice(0, maxPeers);
    
    console.log(`Connecting to ${selectedPeers.length} peers...`);
    const peerMap = new Map(); // Map peer IDs to peer info
    
    for (const peer of selectedPeers) {
      console.log(`Adding peer: ${peer.host}:${peer.port} (from ${peer.source})`);
      try {
        const peerId = listener.addPeer(
          peer.host,
          peer.port,
          'mainnet'
        );
        if (peerId) {
          peerMap.set(peerId, peer);
        }
      } catch (err) {
        console.error(`Failed to add peer ${peer.host}:${peer.port}:`, err.message);
      }
    }

    console.log('Starting block listener...');
    
    // Track some statistics
    let blockCount = 0;
    let blocksByPeer = new Map();
    let lastBlockTime = Date.now();
    let connectedPeers = new Set();
    
    // Start listening for blocks and peer events
    try {
      const result = listener.start(
        // Block callback
        (block) => {
          if (!block) {
            console.error('Received null block');
            return;
          }
          
          blockCount++;
          const now = Date.now();
          const timeSinceLastBlock = lastBlockTime ? ((now - lastBlockTime) / 1000).toFixed(1) : 0;
          lastBlockTime = now;
          
          // Track blocks per peer
          blocksByPeer.set(block.peerId, (blocksByPeer.get(block.peerId) || 0) + 1);
          const peerInfo = peerMap.get(block.peerId);
          const peerInfoStr = peerInfo ? `${peerInfo.host}:${peerInfo.port} via ${peerInfo.source}` : 'Unknown peer';
          
          // Display block info with coin data
          console.log(`
================================================================================
🎯 BLOCK #${blockCount} - Height: ${block.height}
================================================================================

📍 IDENTIFICATION:
  Height: ${block.height}
  Header Hash: ${block.header_hash}
  From Peer: ${block.peerId} (${peerInfoStr})

⏱️  TIMING & METRICS:
  Timestamp: ${block.timestamp > 0 ? new Date(block.timestamp * 1000).toISOString() : 'N/A'}
  Time Since Last Block: ${timeSinceLastBlock} seconds
  Weight: ${block.weight}

💰 COIN ADDITIONS (${block.coin_additions ? block.coin_additions.length : 0}):
${block.coin_additions && block.coin_additions.length > 0 ?
  block.coin_additions.map((coin, i) => `  ${i + 1}. Coin Addition:
     Parent Coin Info: ${coin.parent_coin_info}
     Puzzle Hash: ${coin.puzzle_hash}
     Amount: ${coin.amount} mojos (${coin.amount / 1e12} XCH)`).join('\n') :
  '  None'}

💸 COIN REMOVALS (${block.coin_removals ? block.coin_removals.length : 0}):
${block.coin_removals && block.coin_removals.length > 0 ?
  block.coin_removals.map((coin, i) => `  ${i + 1}. Coin Removal:
     Parent Coin Info: ${coin.parent_coin_info}
     Puzzle Hash: ${coin.puzzle_hash}
     Amount: ${coin.amount} mojos (${coin.amount / 1e12} XCH)`).join('\n') :
  '  None (requires CLVM execution to calculate)'}

📊 TRANSACTION INFO:
  Has Transactions Generator: ${block.has_transactions_generator !== undefined ? block.has_transactions_generator : 'N/A'}
  Generator Size: ${block.generator_size !== undefined ? block.generator_size + ' bytes' : 'N/A'}

================================================================================
`);
        },
        // Event callback
        (event) => {
          if (!event) {
            console.error('Received null event');
            return;
          }
          
          const peerInfo = peerMap.get(event.peerId);
          const peerDesc = peerInfo 
            ? `${event.peerId} (${event.host}:${event.port} via ${peerInfo.source})`
            : `${event.peerId} (${event.host || 'unknown'}:${event.port || 'unknown'})`;
          
          switch (event.type) {
            case 'connected':
              console.log(`\n✅ Peer ${peerDesc} connected`);
              connectedPeers.add(event.peerId);
              break;
            case 'disconnected':
              console.log(`\n❌ Peer ${peerDesc} disconnected`);
              if (event.message) console.log(`   Reason: ${event.message}`);
              connectedPeers.delete(event.peerId);
              break;
            case 'error':
              console.log(`\n⚠️  Peer ${peerDesc} error`);
              if (event.message) console.log(`   Error: ${event.message}`);
              break;
            default:
              console.log(`\n❓ Unknown event type: ${event.type}`);
          }
        }
      );
      
      console.log('listener.start() returned:', result);
    } catch (err) {
      console.error('Error starting listener:', err);
      throw err;
    }

    console.log('Listening for blocks... Press Ctrl+C to stop\n');

    // Show periodic status
    setInterval(() => {
      if (listener.isRunning()) {
        const peerStats = Array.from(blocksByPeer.entries())
          .map(([id, count]) => `Peer ${id}: ${count}`)
          .join(', ');
        console.log(`\n📊 Status: Running | Connected peers: ${connectedPeers.size} | Total blocks: ${blockCount}`);
        if (peerStats) console.log(`   Block distribution: ${peerStats}`);
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