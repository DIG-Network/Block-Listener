const { ChiaBlockListener, loadChiaCerts, initTracing } = require('./index.js');
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

    // Add a peer (you can add multiple peers)
    // Replace with actual peer addresses
    const peerId = listener.addPeer(
      'localhost',           // or IP address of a Chia full node
      8444,                  // default Chia port
      'mainnet',             // or 'testnet11'
      certs.cert,
      certs.key,
      certs.ca
    );
    console.log('Added peer with ID:', peerId);

    console.log('Starting block listener...');
    
    // Start listening for blocks and peer events
    listener.start(
      // Block callback
      (block) => {
        console.log('New block received from peer', block.peerId);
        console.log('Height:', block.height);
        console.log('Weight:', block.weight);
        console.log('Header Hash:', block.header_hash);
        console.log('Timestamp:', new Date(block.timestamp * 1000).toISOString());
        console.log('---');
      },
      // Event callback
      (event) => {
        switch (event.type) {
          case 'connected':
            console.log(`✅ Peer ${event.peerId} connected: ${event.host}:${event.port}`);
            break;
          case 'disconnected':
            console.log(`❌ Peer ${event.peerId} disconnected: ${event.host}:${event.port}`);
            if (event.message) console.log(`   Reason: ${event.message}`);
            break;
          case 'error':
            console.log(`⚠️  Peer ${event.peerId} error: ${event.host}:${event.port}`);
            if (event.message) console.log(`   Error: ${event.message}`);
            break;
        }
      }
    );

    console.log('Listening for blocks... Press Ctrl+C to stop');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nStopping block listener...');
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