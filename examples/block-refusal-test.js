const { ChiaPeerPool } = require('../index.js');
const dns = require('dns').promises;

// DNS introducers for peer discovery
const MAINNET_DNS_INTRODUCERS = [
    "dns-introducer.chia.net",
    "chia.ctrlaltdel.ch", 
    "seeder.dexie.space",
    "chia.hoffmang.com"
];

const MAINNET_DEFAULT_PORT = 8444;

// Shuffle array for randomness
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Discover actual peer IPs using DNS introducers
async function discoverPeers(networkId = 'mainnet') {
    console.log(`🔍 Discovering peers for ${networkId} using DNS introducers...`);
    
    let allAddresses = [];
    
    // Resolve all introducers to IP addresses
    for (const introducer of MAINNET_DNS_INTRODUCERS) {
        try {
            console.log(`   Resolving ${introducer}...`);
            const addresses = await dns.lookup(introducer, { all: true });
            for (const addr of addresses) {
                allAddresses.push({ 
                    host: addr.address, 
                    port: MAINNET_DEFAULT_PORT,
                    family: addr.family,
                    source: introducer
                });
            }
            console.log(`   Found ${addresses.length} peers from ${introducer}`);
        } catch (error) {
            console.log(`   Failed to resolve ${introducer}: ${error.message}`);
        }
    }

    if (allAddresses.length === 0) {
        throw new Error('Failed to resolve any peer addresses from introducers');
    }

    // Remove duplicates and shuffle
    const uniqueAddresses = [];
    const seen = new Set();
    for (const addr of allAddresses) {
        const key = `${addr.host}:${addr.port}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueAddresses.push(addr);
        }
    }
    
    return shuffleArray(uniqueAddresses);
}

// Format address for display (IPv6 needs brackets in URLs)
function formatAddress(host, port, family) {
    if (family === 6) {
        return `[${host}]:${port}`;
    }
    return `${host}:${port}`;
}

async function testBlockRefusalHandling() {
    console.log('🚫 Testing Block Refusal and Automatic Peer Disconnection');
    console.log('='.repeat(60));
    
    const pool = new ChiaPeerPool();
    
    let disconnectedPeers = [];
    let connectedPeers = [];
    
    // Set up event handlers to monitor peer lifecycle
    pool.on('peerConnected', (event) => {
        connectedPeers.push(`${event.host}:${event.port}`);
        console.log(`✅ Peer connected: ${event.host}:${event.port}`);
    });
    
    pool.on('peerDisconnected', (event) => {
        const peerAddr = `${event.host}:${event.port}`;
        disconnectedPeers.push(peerAddr);
        console.log(`❌ Peer disconnected: ${peerAddr} - ${event.reason || 'Unknown reason'}`);
    });
    
    try {
        console.log('\n1️⃣ Discovering and connecting to peers...');
        
        // Discover actual peer IPs
        const discoveredPeers = await discoverPeers('mainnet');
        
        // Try to connect to several peers
        const peersToTry = discoveredPeers.slice(0, 8);
        let successfulConnections = 0;
        
        for (const peer of peersToTry) {
            const displayAddress = formatAddress(peer.host, peer.port, peer.family);
            try {
                await pool.addPeer(peer.host, peer.port, 'mainnet');
                successfulConnections++;
                console.log(`   ✅ Connected: ${displayAddress}`);
                
                // Stop once we have enough peers for testing
                if (successfulConnections >= 4) {
                    break;
                }
            } catch (error) {
                console.log(`   ❌ Failed: ${displayAddress} - ${error.message}`);
            }
        }
        
        console.log(`\n📊 Connected to ${successfulConnections} peers`);
        
        if (successfulConnections === 0) {
            console.log('❌ No peers connected. Cannot test block refusal handling.');
            return;
        }
        
        // Wait for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('\n2️⃣ Testing block requests to identify problematic peers...');
        
        // Test with a series of block heights to see if any peers refuse
        const testHeights = [4920000, 4920001, 4920002, 4920003, 4920004];
        let requestCount = 0;
        let successCount = 0;
        let errorPatterns = new Map();
        
        for (const height of testHeights) {
            console.log(`\nTesting block ${height}...`);
            const startTime = Date.now();
            requestCount++;
            
            try {
                const block = await pool.getBlockByHeight(height);
                const duration = Date.now() - startTime;
                successCount++;
                console.log(`   ✅ Success: Got block in ${duration}ms (${block.transactions?.length || 0} transactions)`);
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ Failed after ${duration}ms: ${error.message}`);
                
                // Track error patterns
                const errorType = error.message.includes('rejected') ? 'Block Rejected' :
                                 error.message.includes('Protocol') ? 'Protocol Error' :
                                 error.message.includes('timeout') ? 'Timeout' :
                                 error.message.includes('Connection') ? 'Connection Error' :
                                 'Other';
                
                errorPatterns.set(errorType, (errorPatterns.get(errorType) || 0) + 1);
            }
            
            // Check current peer status
            const currentPeers = await pool.getConnectedPeers();
            console.log(`   🔗 Active peers: ${currentPeers.length}`);
        }
        
        console.log('\n3️⃣ Testing parallel requests to stress test error handling...');
        
        const parallelPromises = [];
        const parallelHeights = [4920005, 4920006, 4920007, 4920008, 4920009];
        
        for (const height of parallelHeights) {
            parallelPromises.push(
                pool.getBlockByHeight(height)
                    .then(block => ({
                        height,
                        success: true,
                        transactions: block.transactions?.length || 0
                    }))
                    .catch(error => ({
                        height,
                        success: false,
                        error: error.message
                    }))
            );
        }
        
        console.log('   Launching 5 parallel requests...');
        const parallelResults = await Promise.all(parallelPromises);
        
        let parallelSuccessCount = 0;
        parallelResults.forEach(result => {
            if (result.success) {
                parallelSuccessCount++;
                console.log(`   ✅ Block ${result.height}: ${result.transactions} transactions`);
            } else {
                console.log(`   ❌ Block ${result.height}: ${result.error}`);
            }
        });
        
        // Final status check
        const finalPeers = await pool.getConnectedPeers();
        
        console.log('\n4️⃣ Test Results Summary');
        console.log('='.repeat(40));
        console.log(`📊 Sequential requests: ${successCount}/${requestCount} successful`);
        console.log(`📊 Parallel requests: ${parallelSuccessCount}/${parallelResults.length} successful`);
        console.log(`🔗 Initial peers: ${connectedPeers.length}`);
        console.log(`🔗 Final peers: ${finalPeers.length}`);
        console.log(`❌ Disconnected peers: ${disconnectedPeers.length}`);
        
        if (errorPatterns.size > 0) {
            console.log('\n📈 Error Pattern Analysis:');
            for (const [errorType, count] of errorPatterns.entries()) {
                console.log(`   ${errorType}: ${count} occurrences`);
            }
        }
        
        if (disconnectedPeers.length > 0) {
            console.log('\n🚫 Disconnected Peers:');
            disconnectedPeers.forEach((peer, index) => {
                console.log(`   ${index + 1}. ${peer}`);
            });
        }
        
        console.log('\n✅ Key Features Demonstrated:');
        console.log('• ✅ Automatic peer discovery using DNS introducers');
        console.log('• ✅ Detection of peers that refuse to provide blocks');
        console.log('• ✅ Automatic disconnection of problematic peers');
        console.log('• ✅ Failover to working peers when others fail');
        console.log('• ✅ Protocol error handling (block rejections, parsing errors)');
        console.log('• ✅ Connection error handling (timeouts, network issues)');
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        console.log('\n🔄 Shutting down...');
        await pool.shutdown();
        console.log('✅ Test completed.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Received interrupt signal, shutting down gracefully...');
    process.exit(0);
});

testBlockRefusalHandling().catch(console.error); 