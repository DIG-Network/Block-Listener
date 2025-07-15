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
    
    // Find the on and off method declarations and add overloads before them
    const onMethodRegex = /(\s+)(on\(event: string, callback: \(\.\.\.args: any\[\]\) => any\): void)/;
    const offMethodRegex = /(\s+)(off\(event: string, callback: \(\.\.\.args: any\[\]\) => any\): void)/;
    
    // Add typed overloads for 'on' method
    if (onMethodRegex.test(content)) {
      content = content.replace(
        onMethodRegex,
        `$1// Typed event method overloads
$1on(event: 'blockReceived', callback: (event: BlockReceivedEvent) => void): void
$1on(event: 'peerConnected', callback: (event: PeerConnectedEvent) => void): void
$1on(event: 'peerDisconnected', callback: (event: PeerDisconnectedEvent) => void): void
$1$2`
      );
    } else {
      console.error('❌ Could not find on() method in index.d.ts');
      return;
    }
    
    // Add typed overloads for 'off' method
    if (offMethodRegex.test(content)) {
      content = content.replace(
        offMethodRegex,
        `$1off(event: 'blockReceived', callback: (event: BlockReceivedEvent) => void): void
$1off(event: 'peerConnected', callback: (event: PeerConnectedEvent) => void): void
$1off(event: 'peerDisconnected', callback: (event: PeerDisconnectedEvent) => void): void
$1$2`
      );
    } else {
      console.error('❌ Could not find off() method in index.d.ts');
      return;
    }
    
    // Write the updated content back to the file
    fs.writeFileSync(indexDtsPath, content, 'utf8');
    
    console.log('✅ Successfully added typed event method overloads to index.d.ts');
  } catch (error) {
    console.error('❌ Error adding typed overloads:', error.message);
    process.exit(1);
  }
}

// Run the script
addTypedOverloads(); 