const fs = require('fs');
const path = require('path');

const indexDtsPath = path.join(__dirname, '..', 'index.d.ts');

// The typed method overloads to append
const typedOverloads = `
  // Typed method overloads for event handling (auto-appended by post-build script)
  on(event: 'blockReceived', callback: (block: BlockEvent) => void): void
  on(event: 'peerConnected', callback: (peer: PeerConnectedEvent) => void): void
  on(event: 'peerDisconnected', callback: (peer: PeerDisconnectedEvent) => void): void
  off(event: 'blockReceived', callback: (block: BlockEvent) => void): void
  off(event: 'peerConnected', callback: (peer: PeerConnectedEvent) => void): void
  off(event: 'peerDisconnected', callback: (peer: PeerDisconnectedEvent) => void): void`;

function addTypedOverloads() {
  try {
    // Read the auto-generated index.d.ts file
    let content = fs.readFileSync(indexDtsPath, 'utf8');
    
    // Check if typed overloads are already present (avoid duplicates)
    if (content.includes('Typed method overloads for event handling')) {
      console.log('✅ Typed event method overloads already present in index.d.ts');
      return;
    }
    
    // Find the ChiaBlockListener class definition
    const classRegex = /(export declare class ChiaBlockListener \{[^}]+)(\s+})/;
    const match = content.match(classRegex);
    
    if (!match) {
      console.error('❌ Could not find ChiaBlockListener class in index.d.ts');
      return;
    }
    
    // Insert the typed overloads before the closing brace
    const updatedContent = content.replace(
      classRegex,
      `$1${typedOverloads}$2`
    );
    
    // Write the updated content back to the file
    fs.writeFileSync(indexDtsPath, updatedContent, 'utf8');
    
    console.log('✅ Successfully added typed event method overloads to index.d.ts');
  } catch (error) {
    console.error('❌ Error adding typed overloads:', error.message);
    process.exit(1);
  }
}

// Run the script
addTypedOverloads(); 