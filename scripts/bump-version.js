const fs = require('fs');
const path = require('path');

// Package.json files that need version bumping
const packageFiles = [
  'package.json',
  'npm/darwin-arm64/package.json',
  'npm/darwin-x64/package.json', 
  'npm/linux-arm64-gnu/package.json',
  'npm/linux-x64-gnu/package.json',
  'npm/win32-x64-msvc/package.json'
];

function bumpPatchVersion(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`);
  }
  
  const major = parseInt(parts[0]);
  const minor = parseInt(parts[1]);
  const patch = parseInt(parts[2]) + 1;
  
  return `${major}.${minor}.${patch}`;
}

function updatePackageVersion(filePath, newVersion) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const oldVersion = packageJson.version;
    
    packageJson.version = newVersion;
    
    fs.writeFileSync(fullPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✅ Updated ${filePath}: ${oldVersion} → ${newVersion}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to update ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  try {
    // Read current version from main package.json
    const mainPackagePath = path.join(__dirname, '..', 'package.json');
    const mainPackage = JSON.parse(fs.readFileSync(mainPackagePath, 'utf8'));
    const currentVersion = mainPackage.version;
    
    console.log(`📦 Current version: ${currentVersion}`);
    
    // Bump patch version
    const newVersion = bumpPatchVersion(currentVersion);
    console.log(`🚀 New version: ${newVersion}\n`);
    
    // Update all package.json files
    let allSuccess = true;
    for (const filePath of packageFiles) {
      const success = updatePackageVersion(filePath, newVersion);
      if (!success) {
        allSuccess = false;
      }
    }
    
    if (allSuccess) {
      console.log(`\n✅ Successfully bumped all packages to version ${newVersion}`);
      console.log('\n💡 Next steps:');
      console.log('   1. Review the changes');
      console.log('   2. Commit the version bump');
      console.log('   3. Create a git tag: git tag v' + newVersion);
      console.log('   4. Push with tags: git push origin main --tags');
    } else {
      console.log('\n❌ Some packages failed to update');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Check if this is a dry run
if (process.argv.includes('--dry-run')) {
  console.log('🔍 DRY RUN MODE - No files will be modified\n');
  
  try {
    const mainPackagePath = path.join(__dirname, '..', 'package.json');
    const mainPackage = JSON.parse(fs.readFileSync(mainPackagePath, 'utf8'));
    const currentVersion = mainPackage.version;
    const newVersion = bumpPatchVersion(currentVersion);
    
    console.log(`📦 Current version: ${currentVersion}`);
    console.log(`🚀 Would bump to: ${newVersion}\n`);
    
    packageFiles.forEach(filePath => {
      console.log(`Would update: ${filePath}`);
    });
    
  } catch (error) {
    console.error('❌ Error during dry run:', error.message);
    process.exit(1);
  }
} else {
  main();
} 