const { ChiaBlockListener } = require('./index.js');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Track sync statistics
let stats = {
    blocksProcessed: 0,
    startTime: Date.now(),
    lastBlockTime: Date.now(),
    currentPhase: 'starting',
    currentHeight: 0,
    targetHeight: null
};

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Print current sync status
function printStatus() {
    console.clear();
    console.log('=== Chia Blockchain Sync ===\n');
    
    console.log(`Phase: ${stats.currentPhase}`);
    console.log(`Current Height: ${stats.currentHeight}`);
    
    if (stats.targetHeight) {
        const progress = (stats.currentHeight / stats.targetHeight * 100).toFixed(2);
        console.log(`Target Height: ${stats.targetHeight}`);
        console.log(`Progress: ${progress}%`);
        
        // Progress bar
        const barLength = 50;
        const filled = Math.floor(barLength * stats.currentHeight / stats.targetHeight);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        console.log(`[${bar}]`);
    }
    
    const elapsed = Date.now() - stats.startTime;
    console.log(`\nElapsed Time: ${formatDuration(elapsed)}`);
    console.log(`Blocks Processed: ${stats.blocksProcessed}`);
    
    if (stats.blocksProcessed > 0) {
        const avgBlockTime = elapsed / stats.blocksProcessed;
        console.log(`Avg Block Time: ${avgBlockTime.toFixed(0)}ms`);
        
        if (stats.targetHeight && stats.currentHeight < stats.targetHeight) {
            const remainingBlocks = stats.targetHeight - stats.currentHeight;
            const eta = remainingBlocks * avgBlockTime;
            console.log(`ETA: ${formatDuration(eta)}`);
        }
    }
    
    if (stats.lastSyncStatus) {
        console.log(`\nBlocks/Second: ${stats.lastSyncStatus.blocksPerSecond.toFixed(2)}`);
    }
}

async function main() {
    // Ask user for starting height
    const startHeightStr = await new Promise(resolve => {
        rl.question('Enter starting block height (press Enter for block 1): ', resolve);
    });
    
    const startHeight = startHeightStr ? parseInt(startHeightStr) : undefined;
    
    console.log(`\nStarting sync from block ${startHeight || 1}...`);
    
    // Create block listener
    const listener = new ChiaBlockListener();
    
    // Discover peers - get 10 random peers for better load distribution
    console.log('Discovering peers...');
    const hosts = await listener.discoverPeers(10);
    console.log(`Got ${hosts.length} random peers`);
    
    if (hosts.length === 0) {
        console.log('No peers found!');
        process.exit(1);
    }
    
    // Add all discovered peers for better performance
    console.log('Adding peers for sync...');
    let addedPeers = 0;
    
    for (const host of hosts) { // Add all discovered peers
        const [hostname, port] = host.split(':');
        console.log(`Adding peer: ${hostname}:${port}...`);
        
        try {
            const peerId = listener.addPeer(hostname, parseInt(port), 'mainnet');
            if (peerId) {
                addedPeers++;
                console.log(`Added peer ${peerId}`);
            }
        } catch (err) {
            console.log(`Failed to add peer: ${err.message}`);
        }
    }
    
    if (addedPeers === 0) {
        console.log('Failed to add any peers!');
        process.exit(1);
    }
    
    console.log(`\nAdded ${addedPeers} peers for sync`);
    
    // Start the listener to handle peer connections
    listener.start(
        () => {}, // Empty block callback for now
        (event) => {
            if (event.type === 'connected') {
                console.log(`Peer ${event.peerId} connected`);
            }
        }
    );
    
    // Wait a bit for peers to connect
    console.log('Waiting for peers to connect...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start sync
    console.log('\nStarting blockchain sync...\n');
    
    try {
        await listener.sync(
            startHeight,
            // Block callback
            (block) => {
                stats.blocksProcessed++;
                stats.currentHeight = block.height;
                stats.lastBlockTime = Date.now();
                
                // Clear the status display to show block details
                console.clear();
                
                // Show block details
                console.log(`
================================================================================
🎯 BLOCK #${stats.blocksProcessed} - Height: ${block.height}
================================================================================

📍 IDENTIFICATION:
  Height: ${block.height}
  Header Hash: ${block.header_hash}
  Weight: ${block.weight}

⏱️  TIMING:
  Timestamp: ${block.timestamp > 0 ? new Date(block.timestamp * 1000).toISOString() : 'N/A'}
  
💰 COIN ADDITIONS (${block.coin_additions.length}):
${block.coin_additions.length > 0 ?
  block.coin_additions.map((coin, i) => `  ${i + 1}. Parent: ${coin.parent_coin_info}
     Puzzle: ${coin.puzzle_hash}
     Amount: ${coin.amount} mojos (${(coin.amount / 1e12).toFixed(12)} XCH)`).join('\n') :
  '  None'}

💸 COIN REMOVALS (${block.coin_removals.length}):
${block.coin_removals.length > 0 ?
  block.coin_removals.map((coin, i) => `  ${i + 1}. Parent: ${coin.parent_coin_info}
     Puzzle: ${coin.puzzle_hash}
     Amount: ${coin.amount} mojos (${(coin.amount / 1e12).toFixed(12)} XCH)`).join('\n') :
  '  None'}

📊 TRANSACTION INFO:
  Has Transactions Generator: ${block.has_transactions_generator}
  Generator Size: ${block.generator_size ? formatBytes(block.generator_size) : 'N/A'}

📈 SYNC PROGRESS:
  Phase: ${stats.currentPhase}
  Current Height: ${stats.currentHeight}${stats.targetHeight ? ` / ${stats.targetHeight}` : ''}
  Progress: ${stats.targetHeight ? ((stats.currentHeight / stats.targetHeight * 100).toFixed(2)) + '%' : 'Live'}
  Blocks Processed: ${stats.blocksProcessed}
  Elapsed Time: ${formatDuration(Date.now() - stats.startTime)}
================================================================================
`);
                
                // Brief pause to make output readable in fast sync
                if (stats.currentPhase === 'historical' && stats.blocksProcessed % 10 === 0) {
                    // Show status briefly every 10 blocks during historical sync
                    setTimeout(() => {}, 100);
                }
            },
            // Event callback
            (event) => {
                console.log(`\nPeer Event: ${event.type}`);
                if (event.message) {
                    console.log(`  Message: ${event.message}`);
                }
            },
            // Sync status callback
            (status) => {
                stats.currentPhase = status.phase;
                stats.currentHeight = status.currentHeight;
                stats.targetHeight = status.targetHeight;
                stats.lastSyncStatus = status;
                
                // Only log major phase changes
                if (status.phase === 'live' && stats.currentPhase !== 'live') {
                    console.log(`\n🎉 Caught up! Now listening for new blocks in real-time...`);
                }
            }
        );
    } catch (error) {
        console.error('Sync error:', error);
    } finally {
        rl.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    process.exit(0);
});

main().catch(console.error); 