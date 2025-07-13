# Proof of Work

A high-performance Bitcoin-compatible proof of work library for Node.js, built with Rust and NAPI bindings. This library provides efficient mining capabilities using Bitcoin's target-based difficulty system with double SHA-256 hashing.

## Features

- **Bitcoin-Compatible**: Uses Bitcoin's target-based difficulty system with double SHA-256 hashing
- **High Performance**: Written in Rust for maximum mining efficiency
- **Asynchronous Mining**: Non-blocking proof of work computation that won't freeze your application
- **Cancellable Operations**: Start mining with ability to cancel anytime using handles
- **Progress Tracking**: Real-time progress monitoring with attempt counts and timing
- **Unlimited Attempts**: Mine until solution is found (unless explicitly limited)
- **Nonce Verification**: Verify that a nonce meets difficulty requirements
- **Standardized Verification**: Consensus-critical verification with algorithm version validation
- **Difficulty Analysis**: Calculate difficulty levels from hash values
- **Security Features**: Tamper-resistant verification with algorithm immutability
- **Cross-platform Support**: Builds for Windows, macOS, and Linux
- **Multiple Architectures**: Supports x64 and ARM64 architectures
- **TypeScript Support**: Full TypeScript definitions included

## Installation

```bash
npm install @dignetwork/chia-block-listener
```

## Quick Start

```javascript
const { computeProofOfWorkAsync } = require('@dignetwork/chia-block-listener')

async function mine() {
  const entropySeed = Buffer.from('my_plot_entropy_seed', 'utf-8')
  const difficulty = 1.0 // Bitcoin difficulty (1.0 = easiest)
  
  // Start mining (returns immediately with a handle)
  const handle = computeProofOfWorkAsync(entropySeed, difficulty)
  
  // Set up Ctrl+C handling for cancellation
  process.on('SIGINT', () => {
    console.log('\nCancelling mining...')
    handle.cancel()
    process.exit(0)
  })
  
  // Wait for completion
  while (!handle.isCompleted() && !handle.hasError()) {
    console.log(`Mining... attempts: ${handle.getAttempts()}`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  if (handle.hasError()) {
    console.log('Mining failed:', handle.getError())
  } else {
    const result = handle.getResult()
    console.log('Solution found!')
    console.log('Nonce:', result.nonce)
    console.log('Hash:', result.hash)
    console.log('Attempts:', result.attempts)
    console.log('Time:', result.time_ms, 'ms')
  }
}

mine().catch(console.error)
```

## API Reference

### Main Functions

#### `computeProofOfWorkAsync(entropySeed, difficulty, maxAttempts?, logAttempts?, doubleSha?): ProofOfWorkHandle`

Computes proof of work asynchronously using Bitcoin's target-based difficulty system. Returns immediately with a handle for cancellation and progress tracking.

**Parameters:**
- `entropySeed` (Buffer): The entropy seed (plotId) to bind the work to
- `difficulty` (number): Bitcoin-style difficulty level (1.0 = easiest, higher = harder)
- `maxAttempts` (number, optional): Maximum attempts before giving up (default: unlimited)
- `logAttempts` (boolean, optional): Whether to log each hash attempt (default: false)
- `doubleSha` (boolean, optional): Whether to use double SHA-256 like Bitcoin (default: true)

**Returns:** `ProofOfWorkHandle` for cancellation and progress tracking

#### `verifyProofOfWork(entropySeed, nonce, difficulty, doubleSha?): boolean`

Verifies that a nonce produces a hash that meets the Bitcoin difficulty target.

**Parameters:**
- `entropySeed` (Buffer): The entropy seed that was used
- `nonce` (number): The nonce to verify
- `difficulty` (number): The required difficulty level
- `doubleSha` (boolean, optional): Whether to use double SHA-256 (default: true)

**Returns:** `true` if the nonce is valid for the given difficulty

#### `verifyProofOfWorkStandardized(entropySeed, nonce, difficulty, expectedVersion?, doubleSha?): boolean`

**CONSENSUS CRITICAL:** Standardized verification with algorithm validation. This function verifies both the proof of work AND the algorithm compatibility.

**Parameters:**
- `entropySeed` (Buffer): The entropy seed that was used
- `nonce` (number): The nonce to verify
- `difficulty` (number): The required difficulty level
- `expectedVersion` (number, optional): Expected algorithm version (default: current)
- `doubleSha` (boolean, optional): Whether to use double SHA-256 (default: true)

**Returns:** `true` if the nonce is valid AND algorithm is correct

**Security Note:** Use this function for network consensus validation. It validates algorithm version compatibility and prevents tampering.

### Utility Functions

#### `difficultyToTargetHex(difficulty): string`

Convert a Bitcoin-style difficulty to the corresponding target value as hex.

**Parameters:**
- `difficulty` (number): The difficulty level

**Returns:** The target as a hex string

#### `hashToDifficulty(hash): number`

Calculate the difficulty that a given hash would satisfy.

**Parameters:**
- `hash` (Buffer): The hash to analyze (32 bytes)

**Returns:** The difficulty level this hash would satisfy

### Consensus & Security Functions

#### `getAlgorithmVersion(): number`

Get the current difficulty algorithm version. This version number is part of the network consensus.

**Returns:** The algorithm version number

#### `getAlgorithmSpec(): string`

Get the algorithm specification hash. This hash identifies the exact algorithm implementation.

**Returns:** The algorithm specification identifier

#### `getAlgorithmParameters(): AlgorithmParameters`

Get the standardized difficulty algorithm parameters. These parameters are part of the network consensus.

**Returns:** Algorithm parameters object containing:
- `version` (number): Algorithm version number
- `specHash` (string): Algorithm specification hash
- `baseZeroBits` (number): Base number of zero bits for difficulty 1.0
- `logMultiplier` (number): Logarithmic multiplier for difficulty scaling
- `maxZeroBits` (number): Maximum allowed zero bits

### ProofOfWorkHandle Methods

The handle returned by `computeProofOfWorkAsync` provides these methods:

#### `cancel(): void`
Cancels the running proof of work computation.

#### `isCancelled(): boolean`
Returns `true` if the computation has been cancelled.

#### `isCompleted(): boolean`
Returns `true` if the computation has found a valid solution.

#### `hasError(): boolean`
Returns `true` if there was an error (cancelled or max attempts reached).

#### `getError(): string | null`
Returns the error message if there was an error, or `null` if no error.

#### `getResult(): ProofOfWorkResult | null`
Returns the result if computation completed successfully, or `null` if not completed.

#### `getAttempts(): bigint`
Returns the current number of attempts made (approximate).

#### `getProgress(): ProofOfWorkProgress`
Returns detailed progress information (attempts, elapsed time, etc.).

#### `getDifficulty(): number`
Returns the difficulty level for this computation.

### Result Types

#### `ProofOfWorkResult`
- `nonce` (bigint): The nonce that was found
- `hash` (string): The resulting hash as hex string
- `attempts` (bigint): Number of attempts made
- `time_ms` (number): Time taken in milliseconds
- `difficulty` (number): The difficulty that was satisfied
- `target` (string): The target that was used (as hex string)

#### `ProofOfWorkProgress`
- `attempts` (bigint): Current number of attempts
- `nonce` (bigint): Current nonce being tested
- `elapsed_ms` (number): Time elapsed in milliseconds
- `attempts_per_second` (number): Estimated attempts per second

## TypeScript Usage

```typescript
import { 
  computeProofOfWorkAsync, 
  verifyProofOfWork,
  verifyProofOfWorkStandardized,
  getAlgorithmVersion,
  getAlgorithmParameters,
  hashToDifficulty,
  ProofOfWorkResult,
  ProofOfWorkHandle,
  AlgorithmParameters
} from '@dignetwork/chia-block-listener'

async function mineWithTypes(): Promise<void> {
  const entropySeed = Buffer.from('my_plot_entropy_seed', 'utf-8')
  const difficulty = 2.0
  
  const handle: ProofOfWorkHandle = computeProofOfWorkAsync(entropySeed, difficulty)
  
  // Wait for completion with proper typing
  const waitForCompletion = async (handle: ProofOfWorkHandle): Promise<ProofOfWorkResult> => {
    while (!handle.isCompleted() && !handle.hasError()) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    if (handle.hasError()) {
      throw new Error(handle.getError() || 'Unknown error')
    }
    
    const result = handle.getResult()
    if (!result) {
      throw new Error('No result available')
    }
    
    return result
  }
  
  const result: ProofOfWorkResult = await waitForCompletion(handle)
  
  // Standard verification
  const isValid: boolean = verifyProofOfWork(
    entropySeed, 
    Number(result.nonce), 
    difficulty
  )
  
  // Standardized verification (recommended for networks)
  const isStandardValid: boolean = verifyProofOfWorkStandardized(
    entropySeed,
    Number(result.nonce),
    difficulty
  )
  
  // Check algorithm parameters
  const params: AlgorithmParameters = getAlgorithmParameters()
  console.log(`Algorithm version: ${params.version}`)
  console.log(`Algorithm spec: ${params.specHash}`)
  
  console.log('Mining completed, valid:', isValid)
  console.log('Consensus valid:', isStandardValid)
}
```

## Difficulty System

This library uses Bitcoin's target-based difficulty system:

- **Difficulty 1.0**: Easiest level, requires 8 leading zero bits in hash
- **Difficulty 2.0**: Requires 12 leading zero bits
- **Difficulty 4.0**: Requires 16 leading zero bits (2 zero bytes)
- **Higher difficulties**: Exponentially more difficult

The difficulty directly corresponds to how computationally expensive it is to find a valid nonce.

## Security & Consensus

This library implements a **consensus-critical verification system** to prevent tampering and ensure network compatibility.

### Algorithm Standardization

- **Version 1 Specification**: `DIG_POW_V1_SMOOTH_LOG_DIFFICULTY_2024`
- **Formula**: `zero_bits = 8 + log2(difficulty) * 2`
- **Immutable Parameters**: All difficulty calculation parameters are locked constants
- **Version Validation**: Algorithm version must match across all network participants

### Security Guarantees

1. **Tamper Detection**: Algorithm spec hash prevents silent modifications
2. **Version Enforcement**: Mismatched versions are rejected automatically
3. **Consensus Compliance**: All parameters are immutable constants
4. **Network Compatibility**: Ensures identical verification across nodes
5. **Upgrade Safety**: Algorithm changes require coordinated hard forks

### Usage for Network Consensus

```javascript
// For production networks: Always use standardized verification
const isValid = verifyProofOfWorkStandardized(entropySeed, nonce, difficulty)

// Check algorithm compatibility
const version = getAlgorithmVersion()  // Returns: 1
const spec = getAlgorithmSpec()        // Returns: "DIG_POW_V1_SMOOTH_LOG_DIFFICULTY_2024"

// Validate all proofs with version checking
function validateNetworkProof(entropySeed, nonce, difficulty) {
  return verifyProofOfWorkStandardized(entropySeed, nonce, difficulty, 1)
}
```

### Network Upgrade Process

To change the difficulty algorithm:
1. Define new algorithm version (e.g., version 2)
2. Update consensus parameters and spec hash
3. Coordinate hard fork across all network participants
4. Validate version compatibility on peer connections

## Performance Tips

1. **Use appropriate difficulty levels**: Start with 1.0-4.0 for testing
2. **Monitor progress**: Use the handle to track mining progress
3. **Set reasonable limits**: Use `maxAttempts` for time-critical applications
4. **Handle cancellation**: Always provide a way to cancel long-running operations

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (16 or later)
- [npm](https://www.npmjs.com/)

### Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd chia-block-listener
npm install

# Build the native module
npm run build

# Run tests
npm test
```

### Project Structure

```
chia-block-listener/
├── src/
│   └── lib.rs          # Rust implementation with NAPI bindings
├── __test__/
│   └── index.spec.mjs  # Test suite
├── npm/                # Platform-specific native binaries
├── .github/workflows/  # CI/CD pipeline
├── Cargo.toml          # Rust configuration
├── package.json        # Node.js configuration
└── index.d.ts          # TypeScript definitions
```

## CI/CD & Publishing

This project uses GitHub Actions for:
- Cross-platform builds (Windows, macOS, Linux)
- Multiple architectures (x64, ARM64)
- Automated testing
- npm publishing based on commit messages

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request
