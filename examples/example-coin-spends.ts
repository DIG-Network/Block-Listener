import { ChiaBlockListener, initTracing } from '../index.js';

async function main() {
  // Initialize logging
  initTracing();

  // Create a new block listener
  const listener = new ChiaBlockListener();

  try {
    // Add a peer
    console.log('Adding peer...');
    const peerId = listener.addPeer('localhost', 8444, 'mainnet');
    console.log('Added peer with ID:', peerId);

    // Example transaction generator hex (you would get this from a real block)
    const exampleGeneratorHex = "ff01ffffffffa0ec19ed7cd7daf648548269e15ab4f473013a35635e7c7f3751362ed780fa1607ffff02ffff01ff02ffff01ff04ffff04ff14ffff04ffff0bffff0bff56ffff0bff0affff0bff0aff66ff0580ffff0bff0affff0bff76ffff0bff0affff0bff0aff66ffff02ff1effff04ff02ffff04ffff04ff05ffff04ff0bff178080ff8080808080ffff0bff0affff0bff76ffff0bff0affff0bff0aff66ff2f80ffff0bff0aff66ff46808080ff46808080ff46808080ff5f80ff808080ffff04ffff04ff1cffff01ff248080ffff04ffff04ff08ffff04ff5fff808080ff81bf808080ff0180ff018080";

    // Process the transaction generator to extract coin spends
    console.log('\n=== Processing Transaction Generator ===');
    const result = listener.processTransactionGenerator(exampleGeneratorHex);
    
    console.log(`Processing result: ${result.success ? 'Success' : 'Failed'}`);
    console.log(`Generator size: ${result.generatorSize} bytes`);
    console.log(`Found ${result.coinSpends.length} coin spends`);
    console.log(`Extracted spends: ${result.extractedSpends}`);
    
    // Process each coin spend with proper typing
    result.coinSpends.forEach((coinSpend, index) => {
      console.log(`\n--- Coin Spend ${index + 1} ---`);
      
      // Coin information (properly typed)
      console.log('📍 Coin:');
      console.log(`  Parent Coin Info: ${coinSpend.coin.parentCoinInfo}`);
      console.log(`  Puzzle Hash: ${coinSpend.coin.puzzleHash}`);
      console.log(`  Amount: ${coinSpend.coin.amount} mojos`);
      
      // Puzzle reveal (CLVM program)
      console.log('🧩 Puzzle Reveal:');
      console.log(`  ${coinSpend.puzzleReveal.substring(0, 100)}${coinSpend.puzzleReveal.length > 100 ? '...' : ''}`);
      
      // Solution (CLVM data/arguments)
      console.log('🔑 Solution:');
      console.log(`  ${coinSpend.solution.substring(0, 100)}${coinSpend.solution.length > 100 ? '...' : ''}`);
      
      // Metadata
      console.log('ℹ️  Metadata:');
      console.log(`  Real Data: ${coinSpend.realData}`);
      console.log(`  Parsing Method: ${coinSpend.parsingMethod}`);
      console.log(`  Offset: ${coinSpend.offset}`);
    });

    // Show how to work with the typed data
    console.log('\n=== Working with Typed Data ===');
    if (result.coinSpends.length > 0) {
      const firstSpend = result.coinSpends[0];
      
      // Convert amount to XCH (with proper typing)
      const amountInXCH = parseInt(firstSpend.coin.amount) / 1e12;
      console.log(`First coin amount: ${amountInXCH} XCH`);
      
      // Check if it's a real parsed coin spend
      if (firstSpend.realData) {
        console.log('✅ This is real parsed data from the transaction generator');
        console.log(`📍 Puzzle reveal length: ${firstSpend.puzzleReveal.length / 2} bytes`);
        console.log(`🔑 Solution length: ${firstSpend.solution.length / 2} bytes`);
      } else {
        console.log('⚠️  This is synthetic/placeholder data');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    listener.disconnectAllPeers();
  }

  console.log('\nCoin spend example complete.');
}

// Run the example
main().catch(console.error); 