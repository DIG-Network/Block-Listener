const { ChiaBlockListener } = require('../index.js');

async function main() {
    // Create a new instance of the Chia block listener
    const listener = new ChiaBlockListener();

    // Set up event handlers
    listener.on('newBlock', (block) => {
        console.log('New block received:');
        console.log('  Height:', block.height);
        console.log('  Header Hash:', block.header_hash);
        console.log('  Weight:', block.weight);
        console.log('  Timestamp:', new Date(block.timestamp * 1000).toISOString());
        console.log('  Previous Hash:', block.prev_header_hash);
        console.log('  Farmer Puzzle Hash:', block.farmer_puzzle_hash);
        console.log('  Pool Puzzle Hash:', block.pool_puzzle_hash);
        console.log('---');
    });

    listener.on('newPeak', (peak) => {
        console.log('New peak:', peak);
    });

    listener.on('error', (error) => {
        console.error('Error:', error);
    });

    listener.on('connected', () => {
        console.log('Connected to Chia node');
    });

    listener.on('disconnected', () => {
        console.log('Disconnected from Chia node');
    });

    try {
        // Connect to a Chia full node
        // You'll need to adjust these parameters based on your setup
        const host = process.env.CHIA_HOST || 'localhost';
        const port = parseInt(process.env.CHIA_PORT || '8444');
        const networkId = process.env.CHIA_NETWORK || 'mainnet';
        
        // Optional: Provide paths to certificate files if needed
        const certPath = process.env.CHIA_CERT_PATH;
        const keyPath = process.env.CHIA_KEY_PATH;

        console.log(`Connecting to Chia node at ${host}:${port} on ${networkId}...`);
        
        await listener.connect(host, port, networkId, certPath, keyPath);
        
        // Start listening for new blocks
        await listener.startListening();
        
        // Get current block count
        const blockCount = await listener.getBlockCount();
        console.log(`Current block count in database: ${blockCount}`);
        
        // Keep the process running
        process.on('SIGINT', async () => {
            console.log('\nShutting down...');
            await listener.disconnect();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('Failed to connect:', error);
        process.exit(1);
    }
}

// Run the example
main().catch(console.error);