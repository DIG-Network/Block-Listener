const { ChiaPeerPool } = require('../index.js');

// Set log level to INFO to reduce debug noise
process.env.RUST_LOG = 'chia_block_listener=info';

async function demonstrateParallelFetching() {
    const pool = new ChiaPeerPool();
    
    try {
        // Add multiple peers
        console.log('Adding 3 peers to the pool...');
        const peers = [
            { host: 'node1.chia.net', port: 8555 },
            { host: 'node2.chia.net', port: 8555 },
            { host: 'node3.chia.net', port: 8555 }
        ];
        
        for (const peer of peers) {
            const peerId = await pool.addPeer(peer.host, peer.port, 'mainnet');
            console.log(`Added peer: ${peerId}`);
        }
        
        // Wait for connections
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('\nFetching multiple blocks in parallel...');
        const startTime = Date.now();
        
        // Fetch 6 blocks in parallel
        const heights = [3000000, 3000001, 3000002, 3000003, 3000004, 3000005];
        const promises = heights.map(height => 
            pool.getBlockByHeight(height)
                .then(block => {
                    const elapsed = Date.now() - startTime;
                    console.log(`Block ${height} fetched in ${elapsed}ms`);
                    return block;
                })
                .catch(err => {
                    console.error(`Failed to fetch block ${height}: ${err.message}`);
                    return null;
                })
        );
        
        // Wait for all requests to complete
        const results = await Promise.all(promises);
        
        const successCount = results.filter(r => r !== null).length;
        const totalTime = Date.now() - startTime;
        
        console.log(`\nFetched ${successCount}/${heights.length} blocks in ${totalTime}ms total`);
        console.log('With 3 peers, the first 3 requests run in parallel.');
        console.log('The next 3 requests wait for the rate limit (500ms) before reusing peers.');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.shutdown();
    }
}

demonstrateParallelFetching().catch(console.error); 