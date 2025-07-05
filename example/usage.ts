import 'reflect-metadata';
import { ChiaBlockchainClient } from '../src';

async function main() {
  // Initialize client
  const client = new ChiaBlockchainClient({
    host: 'localhost',
    port: 8444,
    networkId: 'mainnet',
    database: {
      type: 'sqlite',
      database: './chia-blocks.db'
    },
    cacheOptions: {
      ttl: 3600, // 1 hour
      maxKeys: 5000
    },
    hooks: {
      onNewBlock: async (block) => {
        console.log(`New block received: Height ${block.height}, Hash ${block.header_hash}`);
        
        // Custom processing logic
        if (block.transaction_count > 0) {
          console.log(`Block contains ${block.transaction_count} transactions`);
        }
      },
      onPeerConnected: (peerId) => {
        console.log(`Connected to peer: ${peerId}`);
      },
      onPeerDisconnected: (peerId) => {
        console.log(`Disconnected from peer: ${peerId}`);
      },
      onError: (error) => {
        console.error('Client error:', error);
      }
    }
  });

  try {
    // Initialize the client
    await client.initialize();
    console.log('Client initialized successfully');

    // Register additional event handlers
    const unsubscribeBlock = client.onBlock(async (block) => {
      // Process block data
      console.log(`Processing block ${block.height}`);
      
      // Example: Check if block is a transaction block
      if (block.is_transaction_block) {
        console.log(`Transaction block found at height ${block.height}`);
      }
    });

    const unsubscribeProgress = client.onSyncProgress((current, total) => {
      console.log(`Sync progress: ${current}/${total}`);
    });

    // Query blocks
    const latestBlock = await client.getLatestBlock();
    console.log('Latest block:', latestBlock?.height);

    // Get a specific block
    if (latestBlock) {
      const block = await client.getBlock(latestBlock.height - 10);
      if (block) {
        console.log(`Block ${block.height}:`, {
          hash: block.header_hash,
          timestamp: new Date(parseInt(block.timestamp)).toISOString(),
          weight: block.weight
        });
      }
    }

    // Get block range
    const blockRange = await client.getBlockRange(100000, 100010);
    console.log(`Retrieved ${blockRange.length} blocks`);

    // Display cache statistics
    const cacheStats = client.getCacheStats();
    console.log('Cache statistics:', cacheStats);

    // Display connection statistics
    const connectionStats = client.getConnectionStats();
    connectionStats.forEach((stats, peerId) => {
      console.log(`Connection ${peerId}:`, stats);
    });

    // Keep running for demonstration
    console.log('Client is running. Press Ctrl+C to stop.');
    
    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      
      // Cleanup
      unsubscribeBlock();
      unsubscribeProgress();
      await client.disconnect();
      
      console.log('Goodbye!');
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});

  } catch (error) {
    console.error('Failed to run client:', error);
    await client.disconnect();
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);