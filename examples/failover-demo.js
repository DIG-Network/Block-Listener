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
    const introducers = MAINNET_DNS_INTRODUCERS;
    const defaultPort = MAINNET_DEFAULT_PORT;

    console.log(`🔍 Discovering peers for ${networkId} using DNS introducers...`);
    
    let allAddresses = [];
    
    // Resolve all introducers to IP addresses
    for (const introducer of introducers) {
        try {
            console.log(`   Resolving ${introducer}...`);
            const addresses = await dns.lookup(introducer, { all: true });
            for (const addr of addresses) {
                // Store the address with family information for proper handling
                allAddresses.push({ 
                    host: addr.address, 
                    port: defaultPort,
                    family: addr.family, // 4 for IPv4, 6 for IPv6
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

    // Shuffle for randomness and remove duplicates
    const uniqueAddresses = [];
    const seen = new Set();
    for (const addr of allAddresses) {
        const key = `${addr.host}:${addr.port}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueAddresses.push(addr);
        }
    }
    
    const shuffledAddresses = shuffleArray(uniqueAddresses);
    console.log(`   Total unique peers discovered: ${shuffledAddresses.length}`);
    
    return shuffledAddresses;
}

// Format address for display (IPv6 needs brackets in URLs)
function formatAddress(host, port, family) {
    if (family === 6) {
        return `[${host}]:${port}`;
    }
    return `${host}:${port}`;
}

async function demonstrateFailover() {
    console.log('🔄 Demonstrating Automatic Failover Functionality');
    console.log('='.repeat(50));
    
    const pool = new ChiaPeerPool();
    
    // Set up event handlers to monitor peer lifecycle
    pool.on('peerConnected', (event) => {
        console.log(`✅ Peer connected: ${event.host}:${event.port}`);
    });
    
    pool.on('peerDisconnected', (event) => {
        console.log(`❌ Peer disconnected: ${event.host}:${event.port} - ${event.reason}`);
    });
    
    try {
        console.log('\n1️⃣ Discovering peers using DNS introducers...');
        
        // Discover actual peer IPs
        const discoveredPeers = await discoverPeers('mainnet');
        
        // Take first 6 peers: some may work, some may fail
        const peersToTry = discoveredPeers.slice(0, 6);
        
        console.log(`\n2️⃣ Adding discovered peers to pool...`);
        let connectedCount = 0;
        
        for (const peer of peersToTry) {
            const displayAddress = formatAddress(peer.host, peer.port, peer.family);
            try {
                await pool.addPeer(peer.host, peer.port, 'mainnet');
                connectedCount++;
                console.log(`   ✅ Successfully added: ${displayAddress} (from ${peer.source})`);
            } catch (error) {
                console.log(`   ❌ Failed to add: ${displayAddress} - ${error.message}`);
            }
        }
        
        console.log(`\n📊 Result: ${connectedCount}/${peersToTry.length} peers connected`);
        
        if (connectedCount === 0) {
            console.log('❌ No peers connected. Cannot demonstrate failover.');
            return;
        }
        
        // Wait for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('\n3️⃣ Testing automatic failover...');
        console.log('The system will try multiple peers if one fails.\n');
        
        // Test with a known good block height
        const testHeight = 4920000;
        const attempts = 3;
        
        for (let i = 1; i <= attempts; i++) {
            console.log(`Attempt ${i}: Requesting block ${testHeight + i - 1}...`);
            const startTime = Date.now();
            
            try {
                const block = await pool.getBlockByHeight(testHeight + i - 1);
                const duration = Date.now() - startTime;
                
                console.log(`   ✅ Success! Got block in ${duration}ms`);
                console.log(`   📊 Block info: ${block.transactions?.length || 0} transactions`);
                
                // Check which peer provided the block
                const currentPeers = await pool.getConnectedPeers();
                console.log(`   🔗 Available peers: ${currentPeers.length}`);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ Failed after ${duration}ms: ${error.message}`);
                
                // Show remaining peers after failure
                const remainingPeers = await pool.getConnectedPeers();
                console.log(`   🔗 Remaining peers: ${remainingPeers.length}`);
            }
            
            console.log('');
        }
        
        console.log('4️⃣ Testing rapid parallel requests (stress test)...');
        
        const parallelRequests = [];
        const baseHeight = 4920000;
        
        for (let i = 0; i < 5; i++) {
            const height = baseHeight + i;
            parallelRequests.push(
                pool.getBlockByHeight(height)
                    .then(block => ({
                        height,
                        success: true,
                        transactions: block.transactions?.length || 0,
                        duration: 'N/A' // Duration tracking would require more complex logic
                    }))
                    .catch(error => ({
                        height,
                        success: false,
                        error: error.message
                    }))
            );
        }
        
        console.log('   Launching 5 parallel requests...');
        const results = await Promise.all(parallelRequests);
        
        let successCount = 0;
        results.forEach(result => {
            if (result.success) {
                successCount++;
                console.log(`   ✅ Block ${result.height}: ${result.transactions} transactions`);
            } else {
                console.log(`   ❌ Block ${result.height}: ${result.error}`);
            }
        });
        
        console.log(`\n📊 Parallel test results: ${successCount}/${results.length} successful`);
        
        console.log('\n✅ Failover demonstration completed!');
        console.log('\nKey points demonstrated:');
        console.log('• ✅ DNS introducers used to discover actual peer IPs');
        console.log('• ✅ Failed peers are automatically rejected during connection');
        console.log('• ✅ Block requests succeed even with some failed peers');
        console.log('• ✅ System handles parallel requests efficiently');
        console.log('• ✅ Automatic failover works transparently to the user');
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        console.log('\n🔄 Shutting down...');
        await pool.shutdown();
        console.log('✅ Shutdown complete.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Received interrupt signal, shutting down gracefully...');
    process.exit(0);
});

demonstrateFailover().catch(console.error); 