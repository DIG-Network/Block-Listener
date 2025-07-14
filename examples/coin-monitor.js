const { ChiaBlockListener } = require('../');

const listener = new ChiaBlockListener();

// Add peer
const peerId = listener.addPeer('node.chia.net', 8444, 'mainnet');
console.log(`Connected to peer ${peerId}`);

// Function to format coin info
function formatCoinInfo(coin, index, type) {
    const amountInXCH = parseFloat(coin.amount) / 1e12;
    let result = `${type} ${index + 1}:
  Parent Coin Info: ${coin.parent_coin_info}
  Puzzle Hash: ${coin.puzzle_hash}
  Amount: ${coin.amount} mojos (${amountInXCH.toFixed(12)} XCH)`;
    
    // Only coin removals (coins being spent) have solutions and reveals
    // Coin additions (newly created coins) don't have them yet
    if (type === 'Removal') {
        result += `
  Solution: (extracted from transaction generator)
  Reveal: (extracted from transaction generator)`;
    } else {
        result += `
  Status: Newly created coin (no solution/reveal until spent)`;
    }
    
    return result;
}

// Listen for blocks
listener.on('blockReceived', async (block) => {
    console.log('\n=== BLOCK RECEIVED ===');
    console.log(`Height: ${block.height}`);
    console.log(`Header Hash: ${block.header_hash}`);
    console.log(`Timestamp: ${block.timestamp}`);
    console.log(`Peer ID: ${block.peerId}`);
    console.log(`Weight: ${block.weight}`);
    console.log(`Has Transaction Generator: ${block.has_transactions_generator}`);
    console.log(`Generator Size: ${block.generator_size}`);
    
    if (block.has_transactions_generator && block.generator_bytecode) {
        console.log(`Generator Bytecode Length: ${block.generator_bytecode.length}`);
        console.log(`Generator Bytecode (first 100 chars): ${block.generator_bytecode.substring(0, 100)}...`);
        
        // Process the transaction generator to extract coin spends
        try {
            const generatorResult = listener.processTransactionGenerator(block.generator_bytecode);
            console.log(`\n=== TRANSACTION GENERATOR RESULT ===`);
            console.log(`Success: ${generatorResult.success}`);
            console.log(`Extracted Spends: ${generatorResult.extractedSpends}`);
            console.log(`Generator Hex: ${generatorResult.generatorHex ? generatorResult.generatorHex.substring(0, 50) + '...' : 'N/A'}`);
            
            if (generatorResult.coinSpends && Array.isArray(generatorResult.coinSpends)) {
                console.log(`Coin Spends Found: ${generatorResult.coinSpends.length}`);
                
                // Show parsing method breakdown
                const methodCounts = {};
                generatorResult.coinSpends.forEach(spend => {
                    methodCounts[spend.parsingMethod] = (methodCounts[spend.parsingMethod] || 0) + 1;
                });
                console.log(`Parsing methods used:`, methodCounts);
                
                // Try to correlate extracted spends with actual coin removals
                const coinRemovals = block.coin_removals || [];
                console.log(`\n🔍 CORRELATION ANALYSIS:`);
                console.log(`   Coin Removals (actual): ${coinRemovals.length}`);
                console.log(`   Coin Spends (extracted): ${generatorResult.coinSpends.length}`);
                
                if (coinRemovals.length > 0) {
                    console.log(`\n=== TRYING TO MATCH COIN REMOVALS WITH EXTRACTED SPENDS ===`);
                    
                    // Try to find spends that match our coin removals
                    const matchedSpends = [];
                    coinRemovals.forEach((removal, index) => {
                        console.log(`\n🔍 Looking for spend matching Removal ${index + 1}:`);
                        console.log(`   Parent: ${removal.parent_coin_info}`);
                        console.log(`   Puzzle Hash: ${removal.puzzle_hash}`);
                        console.log(`   Amount: ${removal.amount}`);
                        
                        // Look for spends with matching data
                        const possibleMatches = generatorResult.coinSpends.filter(spend => {
                            return spend.coin.parentCoinInfo === removal.parent_coin_info ||
                                   spend.coin.puzzleHash === removal.puzzle_hash ||
                                   spend.coin.amount === removal.amount;
                        });
                        
                        if (possibleMatches.length > 0) {
                            console.log(`   ✅ Found ${possibleMatches.length} possible matches:`);
                            possibleMatches.slice(0, 2).forEach((match, i) => {
                                console.log(`      Match ${i + 1}: Parent=${match.coin.parentCoinInfo}, Hash=${match.coin.puzzleHash}, Amount=${match.coin.amount}`);
                                console.log(`                 Method=${match.parsingMethod}, Reveal=${match.puzzleReveal.length}chars, Solution=${match.solution.length}chars`);
                                if (i === 0) matchedSpends.push({removal, spend: match});
                            });
                        } else {
                            console.log(`   ❌ No matching spends found`);
                        }
                    });
                    
                    if (matchedSpends.length > 0) {
                        console.log(`\n🎯 === MATCHED COIN REMOVALS WITH PUZZLE DATA ===`);
                        matchedSpends.forEach(({removal, spend}, index) => {
                            console.log(`\n💎 Matched Spend ${index + 1}:`);
                            console.log(`   🔗 Parent Coin Info: ${removal.parent_coin_info}`);
                            console.log(`   🧩 Puzzle Hash: ${removal.puzzle_hash}`);
                            console.log(`   💰 Amount: ${removal.amount} mojos`);
                            console.log(`   📝 Puzzle Reveal: ${spend.puzzleReveal.substring(0, 100)}...`);
                            console.log(`   🔧 Solution: ${spend.solution.substring(0, 100)}...`);
                            console.log(`   ⚙️ Parsing Method: ${spend.parsingMethod}`);
                            console.log(`   ✅ Real Data: ${spend.realData}`);
                        });
                    }
                } else {
                    console.log(`   ℹ️  No coin removals to correlate with`);
                }
                
                if (generatorResult.coinSpends.length > 0) {
                    console.log(`\n=== SAMPLE OF ALL EXTRACTED SPENDS (showing parsing quality) ===`);
                    generatorResult.coinSpends.slice(0, 3).forEach((spend, index) => {
                        console.log(`\nExtracted Spend ${index + 1}:`);
                        console.log(`  Parent Coin Info: ${spend.coin.parentCoinInfo}`);
                        console.log(`  Puzzle Hash: ${spend.coin.puzzleHash}`);
                        console.log(`  Amount: ${spend.coin.amount} mojos`);
                        console.log(`  Parsing Method: ${spend.parsingMethod}`);
                        console.log(`  Real Data: ${spend.realData}`);
                        console.log(`  Reveal Length: ${spend.puzzleReveal.length}, Solution Length: ${spend.solution.length}`);
      });
    } else {
                    console.log(`No coin spends found in generator result`);
                }
            } else {
                console.log(`Coin spends field is missing or invalid: ${typeof generatorResult.coinSpends}`);
                console.log(`Available fields:`, Object.keys(generatorResult));
            }
        } catch (error) {
            console.error('Error processing transaction generator:', error.message);
        }
    }
    
    // Get coin spends separately using wallet protocol (for removed coins only)
    if (block.coin_removals && block.coin_removals.length > 0) {
        console.log(`\n=== GETTING COIN SPENDS VIA WALLET PROTOCOL ===`);
        console.log(`Note: Requesting puzzle reveals & solutions for ${block.coin_removals.length} removed coins`);
        
        try {
            const coinSpends = await listener.getCoinSpendsForBlock(block.peerId, block.height, block.header_hash);
            
            if (coinSpends && coinSpends.length > 0) {
                console.log(`\n=== COIN SPENDS VIA WALLET PROTOCOL (${coinSpends.length}) ===`);
                console.log(`Note: These represent coins being SPENT (removed) with their puzzle reveals & solutions`);
                
                coinSpends.slice(0, 3).forEach((spend, index) => {
                    console.log(`\nWallet Protocol Spend ${index + 1}:`);
                    console.log(`  Parent Coin Info: ${spend.coin.parent_coin_info}`);
                    console.log(`  Puzzle Hash: ${spend.coin.puzzle_hash}`);
                    console.log(`  Amount: ${spend.coin.amount} mojos`);
                    console.log(`  Puzzle Reveal: ${spend.puzzle_reveal.substring(0, 100)}...`);
                    console.log(`  Solution: ${spend.solution.substring(0, 100)}...`);
                    console.log(`  Real Data: ${spend.real_data}`);
                    console.log(`  Parsing Method: ${spend.parsing_method}`);
                    console.log(`  Offset: ${spend.offset}`);
                });
                
                // Update correlation analysis with wallet protocol spends
                console.log(`\n🔍 WALLET PROTOCOL CORRELATION:`);
                console.log(`   Coin Removals (wallet protocol): ${block.coin_removals.length}`);
                console.log(`   Coin Spends (wallet protocol): ${coinSpends.length}`);
                
                if (coinSpends.length === block.coin_removals.length) {
                    console.log(`   ✅ Perfect match! All removals have corresponding spends`);
                } else if (coinSpends.length > block.coin_removals.length) {
                    console.log(`   ✨ More spends than removals (${coinSpends.length - block.coin_removals.length} ephemeral coins)`);
                } else {
                    console.log(`   ⚠️  Fewer spends than removals (${block.coin_removals.length - coinSpends.length} missing)`);
                }
            } else {
                console.log(`\n❌ No coin spends returned from wallet protocol`);
            }
        } catch (error) {
            console.error(`\n❌ Error getting coin spends via wallet protocol:`, error.message);
        }
    }
    
    const coinAdditions = block.coin_additions || [];
    const coinRemovals = block.coin_removals || [];
    
    console.log(`\n=== COIN ADDITIONS (${coinAdditions.length}) ===`);
    console.log(`Note: These are newly created coins (outputs) - no puzzle reveals/solutions until spent`);
    coinAdditions.slice(0, 2).forEach((coin, index) => {
        console.log(formatCoinInfo(coin, index, 'Addition'));
    });
    
    console.log(`\n=== COIN REMOVALS (${coinRemovals.length}) ===`);
    console.log(`Note: These are coins being spent (inputs) - puzzle reveals/solutions extracted from generator`);
    coinRemovals.slice(0, 2).forEach((coin, index) => {
        console.log(formatCoinInfo(coin, index, 'Removal'));
    });
    
    console.log('\n' + '='.repeat(50));
});

// Listen for peer events
listener.on('peerConnected', (peer) => {
    console.log(`Peer connected: ${peer.host}:${peer.port} (ID: ${peer.peer_id})`);
});

listener.on('peerDisconnected', (peer) => {
    console.log(`Peer disconnected: ${peer.host}:${peer.port} (ID: ${peer.peer_id})`);
    if (peer.message) {
        console.log(`Reason: ${peer.message}`);
    }
});

console.log('Block listener started. Waiting for blocks...'); 