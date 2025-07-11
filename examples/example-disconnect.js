const { ChiaBlockListener, loadChiaCerts, initTracing } = require('../index.js');
const os = require('os');
const path = require('path');

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

    // Add multiple peers
    const peers = [
      { host: 'localhost', port: 8444 },
      { host: '127.0.0.1', port: 8444 },
      // Add more peer addresses here
    ];
    
    const peerIds = [];
    console.log('Adding peers...');
    for (const peer of peers) {
      const peerId = listener.addPeer(
        peer.host,
        peer.port,
        'mainnet',
        certs.cert,
        certs.key,
        certs.ca
      );
      peerIds.push(peerId);
      console.log(`Added peer ${peer.host}:${peer.port} with ID ${peerId}`);
    }

    console.log('\nStarting block listener...');
    
    // Track peer status
    const peerStatus = new Map();
    
    // Start listening
    listener.start(
      // Block callback
      (block) => {
        console.log(`\nBlock received from peer ${block.peerId}:`, block.height);
      },
      // Event callback
      (event) => {
        peerStatus.set(event.peerId, event.type);
        
        switch (event.type) {
          case 'connected':
            console.log(`\n✅ Peer ${event.peerId} connected: ${event.host}:${event.port}`);
            break;
          case 'disconnected':
            console.log(`\n❌ Peer ${event.peerId} disconnected: ${event.host}:${event.port}`);
            break;
          case 'error':
            console.log(`\n⚠️  Peer ${event.peerId} error: ${event.message}`);
            break;
        }
      }
    );

    console.log('Listening for blocks... Will disconnect peers after 30 seconds\n');

    // Demonstrate disconnecting specific peers after 30 seconds
    setTimeout(() => {
      console.log('\n🔌 Disconnecting first peer...');
      const disconnected = listener.disconnectPeer(peerIds[0]);
      console.log(`Peer ${peerIds[0]} disconnect result:`, disconnected);
    }, 30000);

    // Show connected peers periodically
    const statusInterval = setInterval(() => {
      const connectedPeers = listener.getConnectedPeers();
      const statusEntries = Array.from(peerStatus.entries())
        .map(([id, status]) => `${id}: ${status}`)
        .join(', ');
      console.log(`\n📊 Connected peers: [${connectedPeers.join(', ')}]`);
      console.log(`   Status: ${statusEntries || 'none'}`);
    }, 10000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(statusInterval);
      console.log('\n\nStopping block listener...');
      
      // Show final peer status
      const connectedPeers = listener.getConnectedPeers();
      console.log(`Final connected peers: [${connectedPeers.join(', ')}]`);
      
      listener.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);