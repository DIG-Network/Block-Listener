const { ChiaPeerPool } = require('../index.js');

async function testFailover() {
    console.log('Testing automatic failover functionality...');
    
    const pool = new ChiaPeerPool();
    
    // Set up event handlers
    pool.on('peerConnected', (event) => {
        console.log(`✅ Peer connected: ${event.peer_id} (${event.host}:${event.port})`);
    });
    
    pool.on('peerDisconnected', (event) => {
        console.log(`❌ Peer disconnected: ${event.peer_id} - ${event.reason}`);
    });
    
    try {
        // Add multiple peers - some may be good, some may fail
        const peers = [
            // Mix of potentially working and definitely failing peers
            { host: 'node.chia.net', port: 8444 },
            { host: 'nonexistent-peer.invalid', port: 8444 }, // This will fail
            { host: 'chia.hoffmang.com', port: 8444 },
            { host: '192.168.1.999', port: 8444 }, // This will fail
            { host: 'introducer-eu.chia.net', port: 8444 },
        ];
        
        console.log('Adding peers to pool...');
        for (const peer of peers) {
            try {
                const peerId = await pool.addPeer(peer.host, peer.port, 'mainnet');
                console.log(`Added peer: ${peerId}`);
            } catch (error) {
                console.log(`Failed to add peer ${peer.host}:${peer.port}: ${error.message}`);
            }
        }
        
        // Wait for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const connectedPeers = await pool.getConnectedPeers();
        console.log(`\nConnected peers: ${connectedPeers.length}`);
        
        if (connectedPeers.length === 0) {
            console.log('No peers connected. Cannot test failover.');
            return;
        }
        
        // Test automatic failover by requesting blocks
        const testHeights = [4920000, 4920001, 4920002];
        
        console.log('\n🔄 Testing automatic failover with multiple block requests...');
        
        for (const height of testHeights) {
            console.log(`\nRequesting block ${height}...`);
            const startTime = Date.now();
            
            try {
                const block = await pool.getBlockByHeight(height);
                const duration = Date.now() - startTime;
                console.log(`✅ Got block ${height} in ${duration}ms from peer ${block.peer_id}`);
                console.log(`   Block hash: ${block.header_hash}`);
                console.log(`   Transactions: ${block.transactions?.length || 0}`);
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`❌ Failed to get block ${height} after ${duration}ms: ${error.message}`);
            }
        }
        
        // Test rapid requests to trigger failover scenarios
        console.log('\n🚀 Testing rapid requests (may trigger rate limiting and failover)...');
        
        const promises = [];
        for (let i = 0; i < 5; i++) {
            const height = 4920000 + i;
            promises.push(
                pool.getBlockByHeight(height)
                    .then(block => ({
                        success: true,
                        height,
                        peer_id: block.peer_id,
                        hash: block.header_hash
                    }))
                    .catch(error => ({
                        success: false,
                        height,
                        error: error.message
                    }))
            );
        }
        
        const results = await Promise.all(promises);
        
        console.log('\nRapid request results:');
        results.forEach(result => {
            if (result.success) {
                console.log(`✅ Block ${result.height}: ${result.hash} (peer: ${result.peer_id})`);
            } else {
                console.log(`❌ Block ${result.height}: ${result.error}`);
            }
        });
        
        // Show final peer status
        const finalPeers = await pool.getConnectedPeers();
        console.log(`\nFinal connected peers: ${finalPeers.length}`);
        
    } catch (error) {
        console.error('Test error:', error);
    } finally {
        console.log('\nShutting down pool...');
        await pool.shutdown();
        console.log('Test completed.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    process.exit(0);
});

testFailover().catch(console.error); 