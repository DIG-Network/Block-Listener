const { ChiaPeerPool } = require('../index.js');

// Set log level to INFO to reduce noise but keep important info
process.env.RUST_LOG = 'chia_block_listener=info';

class PerformanceTestWorker {
  constructor() {
    this.peerPool = new ChiaPeerPool();
    this.isRunning = false;
    this.stopRequested = false;
    this.TARGET_PEERS = 10; // Fewer peers for testing
    this.networkId = 'mainnet';
    this.downloadStats = {
      totalBlocks: 0,
      downloadedBlocks: 0,
      failedBlocks: 0,
      startTime: 0,
      blocksPerSecond: 0
    };
    this.downloadQueue = [];
    this.activeDownloads = new Map();
    this.failedDownloads = new Map();
  }

  setupEventHandlers() {
    this.peerPool.on('peerConnected', async (event) => {
      const connectedPeers = await this.peerPool.getConnectedPeers();
      console.log(`✅ Peer connected: ${event.peerId} (${event.host}:${event.port})`);
      console.log(`   Total peers: ${connectedPeers.length}`);
      
      // Start download worker for this peer if we have blocks to download
      if (this.isRunning && this.downloadQueue.length > 0) {
        this.downloadWorker().catch(error => {
          console.error(`Download worker error:`, error.message);
        });
      }
    });

    this.peerPool.on('peerDisconnected', (event) => {
      console.log(`❌ Peer disconnected: ${event.peerId} (${event.host}:${event.port})`);
      if (event.message) {
        console.log(`   Reason: ${event.message}`);
      }
    });

    this.peerPool.on('newPeakHeight', (event) => {
      console.log(`📊 New peak height: ${event.newPeak.toLocaleString()} (from ${event.peerId})`);
    });
  }

  async connectToPeers() {
    console.log(`🔌 Connecting to ${this.TARGET_PEERS} peers...`);

    // Use some reliable Chia nodes
    const knownPeers = [
      'node1.chia.net',
      'node2.chia.net', 
      'node3.chia.net',
      'node4.chia.net',
      'node5.chia.net'
    ];

    // Also try DNS resolution for more peers
    try {
      const dns = require('dns').promises;
      const addresses = await dns.lookup('dns-introducer.chia.net', { all: true, family: 4 });
      addresses.slice(0, 10).forEach(addr => knownPeers.push(addr.address));
    } catch (error) {
      console.log('DNS resolution failed, using hardcoded peers only');
    }

    // Shuffle for randomness
    const shuffled = knownPeers.sort(() => Math.random() - 0.5);
    
    // Connect to peers in parallel
    const connectionPromises = shuffled.slice(0, this.TARGET_PEERS).map(host => 
      this.peerPool.addPeer(host, 8444, this.networkId)
        .then(peerId => {
          console.log(`Connected to: ${peerId} (${host})`);
          return peerId;
        })
        .catch(error => {
          console.log(`Failed to connect to ${host}: ${error.message}`);
          return null;
        })
    );

    const results = await Promise.all(connectionPromises);
    const successful = results.filter(r => r !== null);
    
    console.log(`✅ Connected to ${successful.length} out of ${this.TARGET_PEERS} attempted peers`);
    
    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const peakHeight = await this.peerPool.getPeakHeight();
    if (peakHeight) {
      console.log(`📊 Network peak height: ${peakHeight.toLocaleString()}`);
    }

    return successful.length;
  }

  async runPerformanceTest() {
    console.log('\n🚀 Starting ChiaPeerPool Performance Test');
    console.log('========================================');
    
    this.isRunning = true;
    this.setupEventHandlers();
    
    // Connect to peers
    const connectedCount = await this.connectToPeers();
    if (connectedCount === 0) {
      throw new Error('No peers connected - cannot run test');
    }

    // Test Parameters
    const startHeight = 3000000; // Recent blocks
    const blockCount = 100; // Test with 100 blocks
    
    console.log(`\n📋 Test Configuration:`);
    console.log(`   Start Height: ${startHeight.toLocaleString()}`);
    console.log(`   Block Count: ${blockCount}`);
    console.log(`   Connected Peers: ${connectedCount}`);
    console.log(`   Expected: ~${(blockCount / connectedCount * 0.5).toFixed(1)}s with persistent connections`);
    console.log(`   Previous: ~${(blockCount * 0.5).toFixed(1)}s with new connections per request\n`);

    // Setup download queue
    this.downloadQueue = [];
    for (let i = 0; i < blockCount; i++) {
      this.downloadQueue.push(startHeight + i);
    }

    // Reset stats
    this.downloadStats = {
      totalBlocks: blockCount,
      downloadedBlocks: 0,
      failedBlocks: 0,
      startTime: Date.now(),
      blocksPerSecond: 0
    };

    console.log('⏱️  Starting download test...\n');

    // Start multiple download workers (one per peer)
    const workers = [];
    for (let i = 0; i < connectedCount; i++) {
      workers.push(this.downloadWorker());
    }

    // Progress reporting
    const progressInterval = setInterval(() => {
      this.reportProgress();
    }, 2000);

    // Wait for completion
    await Promise.all(workers);
    clearInterval(progressInterval);
    
    // Final report
    this.reportFinalResults();
  }

  async downloadWorker() {
    while (this.downloadQueue.length > 0 && !this.stopRequested) {
      // Get next height to download
      const height = this.downloadQueue.shift();
      if (!height) continue;

      // Check if already downloading
      if (this.activeDownloads.has(height)) {
        this.downloadQueue.push(height);
        continue;
      }

      // Check retry count
      const retryCount = this.failedDownloads.get(height) || 0;
      if (retryCount >= 3) {
        console.error(`❌ Block ${height} failed ${retryCount} times, skipping`);
        this.downloadStats.failedBlocks++;
        continue;
      }

      this.activeDownloads.set(height, 'downloading');

      try {
        const requestStart = Date.now();
        
        // This now uses persistent connections!
        const block = await this.peerPool.getBlockByHeight(height);
        
        const requestTime = Date.now() - requestStart;
        
        // Log the block info instead of saving to DB
        console.log(`✅ Block ${height}: ${block.coinAdditions.length} adds, ${block.coinRemovals.length} removes, ${block.coinSpends.length} spends (${requestTime}ms)`);
        
        this.downloadStats.downloadedBlocks++;
        this.failedDownloads.delete(height);
        
      } catch (error) {
        console.warn(`⚠️  Failed to get block ${height}: ${error.message}`);
        
        // Increment retry count and requeue
        this.failedDownloads.set(height, retryCount + 1);
        this.downloadQueue.unshift(height);
      } finally {
        this.activeDownloads.delete(height);
      }
    }
  }

  reportProgress() {
    const elapsed = (Date.now() - this.downloadStats.startTime) / 1000;
    const blocksPerSecond = elapsed > 0 ? this.downloadStats.downloadedBlocks / elapsed : 0;
    const remaining = this.downloadQueue.length + this.activeDownloads.size;
    const eta = blocksPerSecond > 0 ? remaining / blocksPerSecond : 0;
    
    console.log(`📊 Progress: ${this.downloadStats.downloadedBlocks}/${this.downloadStats.totalBlocks} blocks ` +
                `(${blocksPerSecond.toFixed(2)} blocks/sec, ${remaining} remaining, ETA: ${eta.toFixed(0)}s)`);
  }

  reportFinalResults() {
    const totalTime = (Date.now() - this.downloadStats.startTime) / 1000;
    const finalRate = this.downloadStats.downloadedBlocks / totalTime;
    const successRate = (this.downloadStats.downloadedBlocks / this.downloadStats.totalBlocks) * 100;
    
    console.log('\n🎉 Performance Test Complete!');
    console.log('==============================');
    console.log(`📊 Results:`);
    console.log(`   Downloaded: ${this.downloadStats.downloadedBlocks}/${this.downloadStats.totalBlocks} blocks`);
    console.log(`   Failed: ${this.downloadStats.failedBlocks} blocks`);
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`   Total Time: ${totalTime.toFixed(2)} seconds`);
    console.log(`   Average Speed: ${finalRate.toFixed(2)} blocks/second`);
    console.log(`   Time per Block: ${(totalTime / this.downloadStats.downloadedBlocks * 1000).toFixed(0)}ms`);
    
    console.log('\n🚀 Performance Analysis:');
    if (finalRate > 1.5) {
      console.log(`   EXCELLENT: ${finalRate.toFixed(1)} blocks/sec indicates persistent connections are working!`);
    } else if (finalRate > 0.8) {
      console.log(`   GOOD: ${finalRate.toFixed(1)} blocks/sec shows improved performance.`);
    } else {
      console.log(`   SLOW: ${finalRate.toFixed(1)} blocks/sec - may still be creating new connections.`);
    }
  }

  async shutdown() {
    console.log('\n🛑 Shutting down test...');
    this.stopRequested = true;
    await this.peerPool.shutdown();
    console.log('✅ Shutdown complete');
  }
}

// Run the performance test
async function runTest() {
  const worker = new PerformanceTestWorker();
  
  try {
    await worker.runPerformanceTest();
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await worker.shutdown();
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n⏹️  Interrupted, shutting down...');
  process.exit(0);
});

runTest().catch(console.error); 