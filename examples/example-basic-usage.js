const { ChiaBlockListener, initTracing } = require('../index.js');

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  // Set up event listeners
  listener.on('blockReceived', (block) => {
    console.log(`New block received: ${block.height}`);
  });

  listener.on('peerConnected', (peer) => {
    console.log(`Peer connected: ${peer.host}:${peer.port}`);
  });

  listener.on('peerDisconnected', (peer) => {
    console.log(`Peer disconnected: ${peer.host}:${peer.port}`);
  });

  try {
    // Add a peer
    const peerId = listener.addPeer('localhost', 8444, 'mainnet');
    console.log('Added peer with ID:', peerId);

    // Get connected peers
    const peers = listener.getConnectedPeers();
    console.log('Connected peers:', peers);

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Disconnect
    listener.disconnectAllPeers();
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
