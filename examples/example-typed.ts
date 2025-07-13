import { ChiaBlockListener, initTracing } from '../index.js';

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  // Set up typed event listeners with inline types (auto-generated interfaces use camelCase)
  listener.on('blockReceived', (block) => {
    console.log(`📦 New block received from peer ${block.peerId}`);
    console.log(`   Height: ${block.height}`);
    console.log(`   Weight: ${block.weight}`);
    console.log(`   Header Hash: ${block.headerHash}`);
    console.log(`   Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
    console.log(`   Coin Additions: ${block.coinAdditions.length}`);
    console.log(`   Coin Removals: ${block.coinRemovals.length}`);
    console.log(`   Has Generator: ${block.hasTransactionsGenerator}`);
    console.log(`   Generator Size: ${block.generatorSize} bytes`);
    if (block.generatorBytecode) {
      console.log(`   Generator Bytecode: ${block.generatorBytecode.substring(0, 100)}...`);
    }
    console.log('---');
  });

  listener.on('peerConnected', (peer) => {
    console.log(`✅ Peer ${peer.peerId} connected: ${peer.host}:${peer.port}`);
  });

  listener.on('peerDisconnected', (peer) => {
    console.log(`❌ Peer ${peer.peerId} disconnected: ${peer.host}:${peer.port}`);
    if (peer.message) {
      console.log(`   Reason: ${peer.message}`);
    }
  });

  try {
    // Add a peer
    console.log('Adding peer...');
    const peerId = listener.addPeer('localhost', 8444, 'mainnet');
    console.log('Added peer with ID:', peerId);

    // Get connected peers (typed as number[])
    const connectedPeers: number[] = listener.getConnectedPeers();
    console.log('Connected peers:', connectedPeers);

    // Try to get a block (typed as Block)
    try {
      const block = listener.getBlockByHeight(peerId, 1);
      console.log('Block height:', block.height);
      console.log('Block header hash:', block.headerHash);
      console.log('Coin additions:', block.coinAdditions.length);
      console.log('Coin removals:', block.coinRemovals.length);
    } catch (err) {
      console.log('Block error:', err);
    }

    // Try to get blocks range (typed as Block[])
    try {
      const blocks = listener.getBlocksRange(peerId, 1, 5);
      console.log(`Received ${blocks.length} blocks`);
      blocks.forEach((block, index) => {
        console.log(`Block ${index + 1}: height ${block.height}, hash ${block.headerHash}`);
      });
    } catch (err) {
      console.log('Blocks range error:', err);
    }

    // Process transaction generator (typed as TransactionGeneratorResult)
    try {
      const result = listener.processTransactionGenerator('ff01...');
      console.log('Generator result:', typeof result);
    } catch (err) {
      console.log('Generator error:', err);
    }

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Disconnect peer
    listener.disconnectPeer(peerId);
    
    // Disconnect all peers
    listener.disconnectAllPeers();

  } catch (error) {
    console.error('Error:', error);
  }

  console.log('TypeScript example complete.');
}

// Run the example
main().catch(console.error); 