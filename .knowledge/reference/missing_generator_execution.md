# Missing Generator Execution Implementation

## Overview
The current implementation of `process_generator_for_coins` in `parser.rs` uses pattern matching to extract coin spends from generator bytecode. To properly extract coin spends from generators, we need to execute the CLVM bytecode using `run_block_generator2` from the chia-consensus crate.

## Current Implementation Status
- **Pattern Matching**: The parser uses byte pattern matching similar to event_emitter.rs to extract coin spends
- **Partial Data**: Can extract puzzle reveals and solutions, but misses coins created by CREATE_COIN conditions
- **No Block References**: Cannot handle compressed blocks that reference previous generators

## What's Missing

### 1. Required Dependencies
To properly execute generators, we need:
- `chia-consensus` crate (version 0.26.0 or compatible) with:
  - `run_block_generator2` function
  - `solution_generator_backrefs` for handling block references
  - `ConsensusConstants` for network parameters
- Proper module paths (the `gen` module may not be publicly exposed)

### 2. The run_block_generator2 Function
From the Python implementation, `run_block_generator2` requires:
```python
err, conds = run_block_generator2(
    bytes(block.transactions_generator),      # Generator bytecode
    generator_args,                          # List of referenced generators
    COST_PER_BYTE,                          # Cost constant
    mempool_mode=False,                     # Block mode vs mempool mode
    height=block_height,                    # Current block height
)
```

### 3. Block Reference Resolution
Compressed blocks can reference previous generators using:
- `transactions_generator_ref_list`: List of block heights
- Need to fetch referenced generators from previous blocks
- Build generator arguments list for execution

### 4. SpendBundleConditions Processing
The result of `run_block_generator2` is a `SpendBundleConditions` object containing:
- `spends`: List of coin spends with:
  - Parent coin ID
  - Puzzle hash
  - Amount
  - Puzzle reveal
  - Solution
  - Conditions (including CREATE_COIN)
- `cost`: Total CLVM cost
- `removal_amount`: Total coins removed
- `addition_amount`: Total coins created

### 5. Coin Extraction
From SpendBundleConditions, extract:
1. **Coins Spent**: Direct from spends list
2. **Coins Created**: From CREATE_COIN (opcode 51) conditions in each spend
3. **Full Spend Info**: Including puzzle reveals, solutions, and conditions

## Implementation Path

### Option 1: Full chia-consensus Integration
```rust
use chia_consensus::gen::{run_block_generator2, solution_generator_backrefs};
use chia_consensus::consensus_constants::ConsensusConstants;
use chia_consensus::allocator::make_allocator;

fn process_generator_for_coins(...) -> Result<...> {
    let mut allocator = make_allocator(CLVM_BUFFER_SIZE);
    
    // Build generator args from block refs
    let generator_args = build_generator_args(block_refs)?;
    
    // Execute generator
    let conditions = run_block_generator2(
        &mut allocator,
        generator_bytes,
        generator_args,
        COST_PER_BYTE,
        false, // block mode
        height,
    )?;
    
    // Extract coins from conditions
    extract_coins_from_conditions(conditions)
}
```

### Option 2: Direct CLVM Execution
Use `clvmr` directly to:
1. Parse generator as CLVM program
2. Execute with proper environment
3. Extract coin spends from result

### Option 3: Enhanced Pattern Matching
Current implementation - fast but incomplete:
- Extracts puzzle reveals and solutions
- Misses CREATE_COIN conditions
- Cannot handle block references

## Module Path Issues

The chia-consensus crate may not expose the `gen` module publicly. Possible solutions:
1. Use a different version that exposes needed functions
2. Fork chia-consensus and expose modules
3. Use the Python wheel bindings through FFI
4. Implement minimal CLVM execution locally

## Testing Requirements

To verify correct implementation:
1. Compare output with Python implementation on same blocks
2. Test with blocks containing:
   - Simple spends
   - CREATE_COIN conditions
   - Block references (compressed blocks)
   - Complex CLVM programs
3. Verify all coins created/spent are captured 