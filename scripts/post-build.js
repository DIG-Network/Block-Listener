const fs = require('fs');
const path = require('path');

const indexDtsPath = path.join(__dirname, '..', 'index.d.ts');

function fixFieldNames() {
  try {
    // Read the auto-generated index.d.ts file
    let content = fs.readFileSync(indexDtsPath, 'utf8');
    
    console.log('✅ Field names should now be camelCase from NAPI js_name attributes');
    return content;
    
  } catch (error) {
    console.error('❌ Error fixing field names:', error.message);
    process.exit(1);
  }
}

function addTypedOverloads() {
  try {
    // Read the auto-generated index.d.ts file (or use fixed content from field name correction)
    let content = fixFieldNames();
    
    // Check if typed overloads are already present (avoid duplicates)
    if (content.includes('Typed event method overloads')) {
      console.log('✅ Typed event method overloads already present in index.d.ts');
      return;
    }
    
    // Add NewPeakHeightEvent interface if not present
    if (!content.includes('NewPeakHeightEvent')) {
      const insertPosition = content.indexOf('export declare function initTracing(): void');
      if (insertPosition !== -1) {
        const newInterface = `export interface NewPeakHeightEvent {
  oldPeak?: number | null
  newPeak: number
  peerId: string
}
`;
        content = content.substring(0, insertPosition) + newInterface + content.substring(insertPosition);
        console.log('✅ Added NewPeakHeightEvent interface');
      }
    }
    
    // Handle ChiaBlockListener events - find the class and add typed overloads
    let blockListenerMatch = content.match(/(export declare class ChiaBlockListener \{[\s\S]*?)(\s+)(on\(event: string, callback: \(\.\.\.args: any\[\]\) => any\): void)/);
    if (blockListenerMatch) {
      const replacement = `${blockListenerMatch[1]}${blockListenerMatch[2]}// Typed event method overloads for ChiaBlockListener
${blockListenerMatch[2]}on(event: 'blockReceived', callback: (event: BlockReceivedEvent) => void): void
${blockListenerMatch[2]}on(event: 'peerConnected', callback: (event: PeerConnectedEvent) => void): void
${blockListenerMatch[2]}on(event: 'peerDisconnected', callback: (event: PeerDisconnectedEvent) => void): void
${blockListenerMatch[2]}${blockListenerMatch[3]}`;
      content = content.replace(blockListenerMatch[0], replacement);
      
      // Also add off method overloads
      content = content.replace(
        /(export declare class ChiaBlockListener \{[\s\S]*?)(\s+)(off\(event: string, callback: \(\.\.\.args: any\[\]\) => any\): void)/,
        `$1$2off(event: 'blockReceived', callback: (event: BlockReceivedEvent) => void): void
$2off(event: 'peerConnected', callback: (event: PeerConnectedEvent) => void): void
$2off(event: 'peerDisconnected', callback: (event: PeerDisconnectedEvent) => void): void
$2$3`
      );
    }
    
    // Handle ChiaPeerPool events - find the class and add typed overloads
    let peerPoolMatch = content.match(/(export declare class ChiaPeerPool \{[\s\S]*?)(\s+)(on\(event: string, callback: \(\.\.\.args: any\[\]\) => any\): void)/);
    if (peerPoolMatch) {
      const replacement = `${peerPoolMatch[1]}${peerPoolMatch[2]}// Typed event method overloads for ChiaPeerPool
${peerPoolMatch[2]}on(event: 'peerConnected', callback: (event: PeerConnectedEvent) => void): void
${peerPoolMatch[2]}on(event: 'peerDisconnected', callback: (event: PeerDisconnectedEvent) => void): void
${peerPoolMatch[2]}on(event: 'newPeakHeight', callback: (event: NewPeakHeightEvent) => void): void
${peerPoolMatch[2]}${peerPoolMatch[3]}`;
      content = content.replace(peerPoolMatch[0], replacement);
      
      // Also add off method overloads
      content = content.replace(
        /(export declare class ChiaPeerPool \{[\s\S]*?)(\s+)(off\(event: string, callback: \(\.\.\.args: any\[\]\) => any\): void)/,
        `$1$2off(event: 'peerConnected', callback: (event: PeerConnectedEvent) => void): void
$2off(event: 'peerDisconnected', callback: (event: PeerDisconnectedEvent) => void): void
$2off(event: 'newPeakHeight', callback: (event: NewPeakHeightEvent) => void): void
$2$3`
      );
    }
    
    // Write the updated content back to the file
    fs.writeFileSync(indexDtsPath, content, 'utf8');
    
    console.log('✅ Successfully added typed event method overloads for both ChiaBlockListener and ChiaPeerPool');
  } catch (error) {
    console.error('❌ Error adding typed overloads:', error.message);
    process.exit(1);
  }
}

// Run the script
addTypedOverloads(); 