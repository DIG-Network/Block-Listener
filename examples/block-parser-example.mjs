import { ChiaBlockParser } from '../index.js';

async function demonstrateBlockParser() {
    console.log('🔧 ChiaBlockParser Demo');
    console.log('=======================\n');

    // Create a new block parser instance
    const parser = new ChiaBlockParser();
    console.log('✅ Created ChiaBlockParser instance\n');

    // Example: Parse a block from hex (you would replace this with actual block data)
    try {
        console.log('📄 Available methods:');
        console.log('• parseFullBlockFromBytes(blockBytes: Buffer): ParsedBlockJs');
        console.log('• parseFullBlockFromHex(blockHex: string): ParsedBlockJs');
        console.log('• extractGeneratorFromBlockBytes(blockBytes: Buffer): string | null');
        console.log('• getHeightAndTxStatusFromBlockBytes(blockBytes: Buffer): BlockHeightInfoJs');
        console.log('• parseBlockInfoFromBytes(blockBytes: Buffer): GeneratorBlockInfoJs\n');

        console.log('💡 Example usage:');
        console.log(`
// Parse a block from hex string
const blockHex = "your_block_hex_here";
const parsedBlock = parser.parseFullBlockFromHex(blockHex);
console.log('Block height:', parsedBlock.height);
console.log('Coin additions:', parsedBlock.coinAdditions.length);
console.log('Coin spends:', parsedBlock.coinSpends.length);

// Parse from buffer
const blockBuffer = Buffer.from(blockHex, 'hex');
const parsedFromBuffer = parser.parseFullBlockFromBytes(blockBuffer);

// Extract just the generator
const generator = parser.extractGeneratorFromBlockBytes(blockBuffer);
if (generator) {
    console.log('Generator found:', generator.substring(0, 100) + '...');
} else {
    console.log('No generator in this block');
}

// Get height and transaction status
const heightInfo = parser.getHeightAndTxStatusFromBlockBytes(blockBuffer);
console.log('Height:', heightInfo.height, 'Is transaction block:', heightInfo.isTransactionBlock);
        `);

        console.log('\n🎯 The ChiaBlockParser provides direct access to the Rust parser');
        console.log('   with full type safety and all parsing methods available.');

    } catch (error) {
        console.error('❌ Error demonstrating parser:', error.message);
    }
}

// Run the demo
demonstrateBlockParser().catch(console.error); 