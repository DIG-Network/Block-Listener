const { ChiaBlockListener, BlockIndexerNapi, initTracing } = require('./index.js');

// Initialize tracing
initTracing();

async function main() {
    // Create a block indexer with SQLite database
    const indexer = await BlockIndexerNapi.new('sqlite://chia_blocks.db');
    
    // Subscribe to indexer events
    indexer.subscribeEvents((event) => {
        console.log('Indexer event:', event.type);
        
        if (event.type === 'coins_updated') {
            console.log(`Coins updated at height ${event.height}`);
            console.log(`Affected puzzle hashes: ${event.puzzle_hashes.join(', ')}`);
            console.log(`Additions: ${event.additions.length}, Removals: ${event.removals.length}`);
        } else if (event.type === 'balance_updated') {
            console.log(`Balances updated at height ${event.height}`);
            for (const update of event.updates) {
                console.log(`  ${update.puzzle_hash}: ${update.old_amount} -> ${update.new_amount} (${update.old_coin_count} -> ${update.new_coin_count} coins)`);
            }
        }
    });
    
    // Create a Chia block listener
    const listener = new ChiaBlockListener();
    
    // Add mainnet peer
    const peerId = listener.addPeer("chia.ctrlaltdel.ch", 8444, "mainnet");
    console.log(`Added peer with ID: ${peerId}`);
    
    // Start listening for blocks
    listener.start(
        // Block callback - insert blocks into the indexer
        async (block) => {
            console.log(`Received block ${block.height} from peer ${block.peerId}`);
            
            try {
                await indexer.insertBlock(
                    block.height,
                    block.header_hash,
                    block.header_hash, // Using header_hash as prev_header_hash for simplicity
                    block.timestamp,
                    block.coin_additions,
                    block.coin_removals
                );
                console.log(`Block ${block.height} indexed successfully`);
                
                // Example: Query coins for a specific puzzle hash
                if (block.coin_additions.length > 0) {
                    const puzzleHash = block.coin_additions[0].puzzle_hash;
                    const coins = await indexer.getCoinsByPuzzlehash(puzzleHash);
                    console.log(`Coins for puzzle hash ${puzzleHash}:`, coins.length);
                    
                    const balance = await indexer.getBalanceByPuzzlehash(puzzleHash);
                    if (balance) {
                        console.log(`Balance for ${puzzleHash}: ${balance.total_amount} mojos (${balance.coin_count} coins)`);
                    }
                }
            } catch (error) {
                console.error(`Error indexing block ${block.height}:`, error);
            }
        },
        // Event callback
        (event) => {
            console.log(`Peer event: ${event.type} for peer ${event.peerId} (${event.host}:${event.port})`);
            if (event.message) {
                console.log(`Message: ${event.message}`);
            }
        }
    );
    
    // Handle shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        listener.stop();
        indexer.unsubscribeEvents();
        process.exit(0);
    });
    
    console.log('Block indexer running. Press Ctrl+C to stop.');
}

main().catch(console.error);