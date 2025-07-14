const { ChiaBlockListener } = require('../');

// Create listener instance
const listener = new ChiaBlockListener();

// Known transaction generator hex (from the earlier output)
// Fixed: This hex had an odd number of digits - padding with 0 to make it even
const testGeneratorHex = "ff01ffffffa073b480028009fa28367e19fae98a23f767146c672f6f5da223e10a2d7fd3d8e1ffff02ffff01ff02ffff01ff02ffff03ffff18ff2fff3480ffff01ff04ffff04ff20ffff04ff2fff808080ffff04ffff02ff3effff04ff02ffff04ff05ffff04ffff02ff2affff04ff02ffff04ff27ffff04ffff02ffff03ff77ffff01ff02ff36ffff04ff02ffff04ff09ffff04ff57ffff04ffff02ff2effff04ff02ffff04ff05ff80808080ff808080808080ffff011d80ff0180ffff04ffff02ffff03ff77ffff0181b7ffff015780ff0180ff808080808080ffff04ff77ff808080808080ffff02ff3affff04ff02ffff04ff05ffff04ffff02ff0bff5f80ffff01ff8080808080808080ffff01ff088080ff0180ffff04ffff01ffffffff4947ff0233ffff0401ff0102ffffff20ff02ffff03ff05ffff01ff02ff32ffff04ff02ffff04ff0dffff04ffff0bff3cffff0bff34ff2480ffff0bff3cffff0bff3cffff0bff34ff2c80ff0980ffff0bff3cff0bffff0bff34ff8080808080ff8080808080ffff010b80ff0180ffff02ffff03ffff22ffff09ffff0dff0580ff2280ffff09ffff0dff0b80ff2280ffff15ff17ffff0181ff8080ffff01ff0bff05ff0bff1780ffff01ff088080ff0180ff02ffff03ff0bffff01ff02ffff03ffff02ff26ffff04ff02ffff04ff13ff80808080ffff01ff02ffff03ffff20ff1780ffff01ff02ffff03ffff09ff81b3ffff01818f80ffff01ff02ff3affff04ff02ffff04ff05ffff04ff1bffff04ff34ff808080808080ffff01ff04ffff04ff23ffff04ffff02ff36ffff04ff02ffff04ff09ffff04ff53ffff04ffff02ff2effff04ff02ffff04ff05ff80808080ff808080808080ff738080ffff02ff3affff04ff02ffff04ff05ffff04ff1bffff04ff34ff8080808080808080ff0180ffff01ff088080ff0180ffff01ff04ff13ffff02ff3affff04ff02ffff04ff05ffff04ffff02ff2affff04ff02ffff04ff27ffff04ffff02ffff03ff77ffff01ff02ff36ffff04ff02ffff04ff09ffff04ff57ffff04ffff02ff2effff04ff02ffff04ff05ff80808080ff808080808080ffff011d80ff0180ffff04ffff02ffff03ff77ffff0181b7ffff015780ff0180ff808080808080ffff04ff77ff808080808080ffff02ff3affff04ff02ffff04ff05ffff04ffff02ff0bff5f80ffff01ff8080808080808080ffff01ff088080ff0180ff018080ffff04ffff01a07faa3253bfddd1e0decb0906b2dc6247bbc4cf608f58345d173adb63e8b47c9fffffff02ffff03ffff07ff0580ffff01ff0bffff0102ffff02ff2effff04ff02ffff04ff09ff80808080ffff02ff2effff04ff02ffff04ff0dff8080808080ffff01ff0bffff0101ff058080ff0180ff02ffff03ff5fffff01ff04ffff04ff12ffff04ff2fffff04ff81bfffff04ffff04ffff04ff10ffff04ffff0bffff02ff2effff04ff02ffff04ff09ff80808080ff1780ff8080808080ffff04ff81bfffff04ff82017fffff04ffff02ffff03ffff07ff0580ffff01ff0bffff0102ffff02ff2effff04ff02ffff04ff09ff80808080ffff02ff2effff04ff02ffff04ff0dff8080808080ffff01ff0bffff0101ff058080ff0180ffff04ff17ffff04ff81bfffff04ff82017fffff04ffff04ff2fffff04ff0bff808080808080808080808080ffff04ffff04ff05ffff04ffff02ff3effff04ff02ffff04ff27ffff04ffff02ff2effff04ff02ffff04ff09ff80808080ff808080808080ffff02ff3effff04ff02ffff04ff05ffff04ff0bff808080808080ffff01ff8080808080808080ff0180ff018080ffff04ffff01a0a04d9f57764f54a43e4030befb4d80026e870519aaa66334aef8304f5d0393c2fffffff04ffff01a0ccd5bb71183532bff220ba46c268991a000000000000000000000000006fb955ffff01808080ff01808080808080ff018080800";

console.log('Testing transaction generator processing...');
console.log(`Generator hex length: ${testGeneratorHex.length}`);
console.log(`Generator hex (first 100 chars): ${testGeneratorHex.substring(0, 100)}...`);

try {
    console.log('\n=== CALLING processTransactionGenerator ===');
    const result = listener.processTransactionGenerator(testGeneratorHex);
    
    console.log(`\n=== RESULT ===`);
    console.log(`Success: ${result.success}`);
    console.log(`Generator Size: ${result.generator_size}`);
    console.log(`Generator Hex: ${result.generator_hex ? result.generator_hex.substring(0, 100) + '...' : 'N/A'}`);
    console.log(`Extracted Spends: ${result.extracted_spends}`);
    
    // Check if coin_spends exists (snake_case!)
    if (result.coin_spends) {
        console.log(`Coin Spends Type: ${typeof result.coin_spends}`);
        console.log(`Coin Spends Length: ${result.coin_spends.length}`);
        
        if (result.coin_spends.length > 0) {
            console.log(`\n=== COIN SPENDS ===`);
            result.coin_spends.forEach((spend, index) => {
                console.log(`\nSpend ${index + 1}:`);
                console.log(`  Parent Coin Info: ${spend.coin.parent_coin_info}`);
                console.log(`  Puzzle Hash: ${spend.coin.puzzle_hash}`);
                console.log(`  Amount: ${spend.coin.amount} mojos`);
                console.log(`  Puzzle Reveal Length: ${spend.puzzle_reveal ? spend.puzzle_reveal.length : 0} chars`);
                console.log(`  Solution Length: ${spend.solution ? spend.solution.length : 0} chars`);
                console.log(`  Real Data: ${spend.real_data}`);
                console.log(`  Parsing Method: ${spend.parsing_method}`);
                console.log(`  Offset: ${spend.offset}`);
                
                // Show first 100 chars of puzzle reveal and solution
                if (spend.puzzle_reveal && spend.puzzle_reveal.length > 0) {
                    console.log(`  Puzzle Reveal (first 100): ${spend.puzzle_reveal.substring(0, 100)}${spend.puzzle_reveal.length > 100 ? '...' : ''}`);
                }
                if (spend.solution && spend.solution.length > 0) {
                    console.log(`  Solution (first 100): ${spend.solution.substring(0, 100)}${spend.solution.length > 100 ? '...' : ''}`);
                }
            });
        } else {
            console.log('\nNo coin spends found in result');
        }
    } else {
        console.log('Coin spends field is null/undefined');
        console.log('Available result keys:', Object.keys(result));
    }

} catch (error) {
    console.error('\nError testing transaction generator:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
}

console.log('\nTest completed.'); 