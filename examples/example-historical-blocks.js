const { ChiaBlockListener, initTracing } = require('../index.js');
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
      // Use dns.lookup with { all: true } to get both IPv4 and IPv6 addresses
      const addresses = await dns.lookup(introducer, { all: true });
      const peers = addresses.map(addr => ({
        host: addr.address,
        port: 8444,
        family: addr.family, // 4 for IPv4, 6 for IPv6
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

  console.log(`Discovered ${uniquePeers.length} unique peers total (IPv4 and IPv6)`);
  return uniquePeers;
}

// Format address for display (IPv6 needs brackets in URLs)
function formatAddress(host, port, family) {
  if (family === 6) {
    return `[${host}]:${port}`;
  }
  return `${host}:${port}`;
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

    // Add a peer
    const peer = peers[0];
    const displayAddress = formatAddress(peer.host, peer.port, peer.family);
    console.log(`\nAdding peer: ${displayAddress}`);
    const peerId = listener.addPeer(peer.host, peer.port, 'mainnet');

    console.log(`\n=== FETCHING HISTORICAL BLOCKS ===\n`);

    // Example 1: Get a single historical block
    console.log('Fetching block at height 7290000...');
    try {
      const block = listener.getBlockByHeight(peerId, 7290000);
      displayBlock(block);
    } catch (err) {
      console.error('Failed to get block:', err.message);
    }

    // Example 2: Get a range of blocks
    console.log('\nFetching blocks from height 7289990 to 7289995...');
    try {
      const blocks = listener.getBlocksRange(peerId, 7289990, 7289995);
      console.log(`\nReceived ${blocks.length} blocks:`);

      for (const block of blocks) {
        displayBlock(block);
      }
    } catch (err) {
      console.error('Failed to get block range:', err.message);
    }

    // Example 3: Get recent blocks
    console.log('\nFetching recent blocks...');
    try {
      // Get the current height first by starting the listener briefly
      let currentHeight = 0;

      await new Promise((resolve, reject) => {
        listener.on('blockReceived', (block) => {
          currentHeight = block.height;
          resolve();
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Timeout waiting for current block'));
        }, 10000);
      });

      if (currentHeight > 0) {
        console.log(`Current blockchain height: ${currentHeight}`);
        console.log(`Fetching last 5 blocks...`);

        const recentBlocks = listener.getBlocksRange(
          peerId,
          currentHeight - 4,
          currentHeight
        );

        for (const block of recentBlocks) {
          displayBlock(block);
        }
      }
    } catch (err) {
      console.error('Failed to get recent blocks:', err.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    listener.disconnectAllPeers();
    process.exit(0);
  }
}

function displayBlock(block) {
  console.log(`
================================================================================
📦 BLOCK HEIGHT: ${block.height}
================================================================================
Header Hash: ${block.header_hash}
Timestamp: ${block.timestamp > 0 ? new Date(block.timestamp * 1000).toISOString() : 'N/A'}
Weight: ${block.weight}

💰 COIN ADDITIONS (${block.coin_additions ? block.coin_additions.length : 0}):
${block.coin_additions && block.coin_additions.length > 0 ?
  block.coin_additions.map((coin, i) => `  ${i + 1}. ${coin.puzzle_hash}
     Amount: ${coin.amount} mojos (${coin.amount / 1e12} XCH)`).join('\n') :
  '  None'}

💸 COIN REMOVALS (${block.coin_removals ? block.coin_removals.length : 0}):
${block.coin_removals && block.coin_removals.length > 0 ?
  block.coin_removals.map((coin, i) => `  ${i + 1}. ${coin.puzzle_hash}
     Amount: ${coin.amount} mojos (${coin.amount / 1e12} XCH)`).join('\n') :
  '  None'}

Has Generator: ${block.has_transactions_generator}
Generator Size: ${block.generator_size} bytes
================================================================================
`);
}

// Run the example
main().catch(console.error);
