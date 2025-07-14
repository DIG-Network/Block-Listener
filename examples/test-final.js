const { ChiaBlockListener } = require('../');

// Create listener instance
const listener = new ChiaBlockListener();

// From the live blockchain output, we saw this transaction generator hex (truncated for even length)
const testGeneratorHex = "ff01ffffffa095f0995da5f7d5ac1076aa9c18d382579ca11e55b8ecf7d21b6f73b9637ef50bffff02ffff01ff02ffff01ff02ffff03ffff18ff2fff3480ffff01ff04ffff04ff20ffff04ff2fff808080ffff04ffff02ff3effff04ff02ffff04ff05ffff04ffff02ff2affff04ff02ffff04ff27ffff04ffff02ffff03ff77ffff01ff02ff36ffff04ff02ffff04ff09ffff04ff57ffff04ffff02ff2effff04ff02ffff04ff05ff80808080ff808080808080ffff011d80ff0180ffff04ffff02ffff03ff77ffff0181b7ffff015780ff0180ff808080808080ffff04ff77ff808080808080ffff02ff3affff04ff02ffff04ff05ffff04ffff02ff0bff5f80ffff01ff8080808080808080ffff01ff088080ff0180ffff04ffff01ffffffff4947ff0233ffff0401ff0102ffffff20ff02ffff03ff05ffff01ff02ff32ffff04ff02ffff04ff0dffff04ffff0bff3cffff0bff34ff2480ffff0bff3cffff0bff3cffff0bff34ff2c80ff0980ffff0bff3cff0bffff0bff34ff8080808080ff8080808080ffff010b80ff0180ffff02ffff03ffff22ffff09ffff0dff0580ff2280ffff09ffff0dff0b80ff2280ffff15ff17ffff0181ff8080ffff01ff0bff05ff0bff1780ffff01ff088080ff0180ffff02ffff03ff0bffff01ff02ffff03ffff02ff26ffff04ff02ffff04ff13ff80808080ffff01ff02ffff03ffff20ff1780ffff01ff02ffff03ffff09ff81b3ffff01818f80ffff01ff02ff3affff04ff02ffff04ff05ffff04ff1bffff04ff34ff808080808080ffff01ff04ffff04ff23ffff04ffff02ff36ffff04ff02ffff04ff09ffff04ff53ffff04ffff02ff2effff04ff02ffff04ff05ff80808080ff808080808080ff738080ffff02ff3affff04ff02ffff04ff05ffff04ff1bffff04ff34ff8080808080808080ff0180ffff01ff088080ff0180ffff01ff04ff13ffff02ff3affff04ff02ffff04ff05ffff04ffff02ff2affff04ff02ffff04ff27ffff04ffff02ffff03ff77ffff01ff02ff36ffff04ff02ffff04ff09ffff04ff57ffff04ffff02ff2effff04ff02ffff04ff05ff80808080ff808080808080ffff011d80ff0180ffff04ffff02ffff03ff77ffff0181b7ffff015780ff0180ff808080808080ffff04ff77ff808080808080ffff02ff3affff04ff02ffff04ff05ffff04ffff02ff0bff5f80ffff01ff8080808080808080ffff01ff088080ff0180ff018080ffff04ffff01a07faa3253bfddd1e0decb0906b2dc6247bbc4cf608f58345d173adb63e8b47c9fffffff02ffff03ffff07ff0580ffff01ff0bffff0102ffff02ff2effff04ff02ffff04ff09ff80808080ffff02ff2effff04ff02ffff04ff0dff8080808080ffff01ff0bffff0101ff058080ff0180ff02ffff03ff5fffff01ff04ffff04ff12ffff04ff2fffff04ff81bfffff04ffff04ffff04ff10ffff04ffff0bffff02ff2effff04ff02ffff04ff09ff80808080ff1780ff8080808080ffff04ff81bfffff04ff82017fffff04ffff02ffff03ffff07ff0580ffff01ff0bffff0102ffff02ff2effff04ff02ffff04ff09ff80808080ffff02ff2effff04ff02ffff04ff0dff8080808080ffff01ff0bffff0101ff058080ff0180ffff04ff17ffff04ff81bfffff04ff82017fffff04ffff04ff2fffff04ff0bff808080808080808080808080ffff04ffff04ff05ffff04ffff02ff3effff04ff02ffff04ff27ffff04ffff02ff2effff04ff02ffff04ff09ff80808080ff808080808080ffff02ff3effff04ff02ffff04ff05ffff04ff0bff808080808080ffff01ff8080808080808080ff0180ff018080ffff04ffff01a0a04d9f57764f54a43e4030befb4d80026e870519aaa66334aef8304f5d0393c2fffffff04ffff01a0ccd5bb71183532bff220ba46c268991a000000000000000000000000006fb968ffff01808080ff01808080808080ff0180808";

console.log('🎯 FINAL TEST: Transaction Generator Processing');
console.log('=====================================\n');

console.log(`Testing with generator hex length: ${testGeneratorHex.length}`);
console.log(`Generator hex (first 100 chars): ${testGeneratorHex.substring(0, 100)}...\n`);

try {
    console.log('🔄 Processing transaction generator...');
    const result = listener.processTransactionGenerator(testGeneratorHex);
    
    console.log('\n📊 === GENERATOR RESULT ===');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📏 Generator Size: ${result.generatorSize}`);
    console.log(`🔗 Generator Hex: ${result.generatorHex ? result.generatorHex.substring(0, 50) + '...' : 'N/A'}`);
    console.log(`📋 Extracted Spends: ${result.extractedSpends}`);
    
    if (result.coinSpends && Array.isArray(result.coinSpends)) {
        console.log(`\n🎯 COIN SPENDS FOUND: ${result.coinSpends.length}`);
        
        if (result.coinSpends.length > 0) {
            console.log('\n💰 === FIRST FEW COIN SPENDS ===');
            result.coinSpends.slice(0, 3).forEach((spend, index) => {
                console.log(`\n💎 Spend ${index + 1}:`);
                console.log(`   🔗 Parent Coin Info: ${spend.coin.parentCoinInfo}`);
                console.log(`   🧩 Puzzle Hash: ${spend.coin.puzzleHash}`);
                console.log(`   💰 Amount: ${spend.coin.amount} mojos`);
                
                // Convert amount to XCH for readability
                const amountInXCH = parseFloat(spend.coin.amount) / 1e12;
                console.log(`   💰 Amount in XCH: ${amountInXCH.toFixed(12)} XCH`);
                
                console.log(`   📝 Puzzle Reveal Length: ${spend.puzzleReveal.length} chars`);
                console.log(`   🔧 Solution Length: ${spend.solution.length} chars`);
                console.log(`   ✅ Real Data: ${spend.realData}`);
                console.log(`   ⚙️ Parsing Method: ${spend.parsingMethod}`);
                console.log(`   📍 Offset: ${spend.offset}`);
                
                if (spend.puzzleReveal.length > 0) {
                    console.log(`   🧩 Puzzle Reveal: ${spend.puzzleReveal.substring(0, 100)}...`);
                }
                if (spend.solution.length > 0) {
                    console.log(`   🔧 Solution: ${spend.solution.substring(0, 100)}...`);
                }
            });
            
            // Show parsing method distribution
            const methodCounts = {};
            result.coinSpends.forEach(spend => {
                methodCounts[spend.parsingMethod] = (methodCounts[spend.parsingMethod] || 0) + 1;
            });
            
            console.log('\n📈 PARSING METHOD DISTRIBUTION:');
            Object.entries(methodCounts).forEach(([method, count]) => {
                console.log(`   ${method}: ${count} spends`);
            });
            
            // Show amount distribution
            const amounts = result.coinSpends.map(spend => parseFloat(spend.coin.amount));
            const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);
            const avgAmount = totalAmount / amounts.length;
            
            console.log('\n💰 AMOUNT STATISTICS:');
            console.log(`   Total Amount: ${(totalAmount / 1e12).toFixed(12)} XCH`);
            console.log(`   Average Amount: ${(avgAmount / 1e12).toFixed(12)} XCH`);
            console.log(`   Min Amount: ${(Math.min(...amounts) / 1e12).toFixed(12)} XCH`);
            console.log(`   Max Amount: ${(Math.max(...amounts) / 1e12).toFixed(12)} XCH`);
            
        } else {
            console.log('\n❌ No coin spends found in generator result');
        }
    } else {
        console.log('\n❌ ISSUE: Coin spends field is missing or invalid');
        console.log(`   Type: ${typeof result.coinSpends}`);
        console.log(`   Available fields: ${Object.keys(result)}`);
    }

} catch (error) {
    console.error('\n💥 ERROR processing transaction generator:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
}

console.log('\n�� Test completed!'); 