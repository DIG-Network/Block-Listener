# CLVM Execution in Rust

This document explains how to execute CLVM (ChiaLisp Virtual Machine) programs in Rust, based on analysis of the chia-wallet-sdk.

## Dependencies

Add these to Cargo.toml:
```toml
clvmr = "0.14.0"
chia-consensus = "0.26.0"
clvm-traits = "0.26.0"
clvm-utils = "0.26.0"
```

## Core Components

### 1. clvmr - The CLVM Runtime

The `clvmr` crate is the core CLVM runtime for Rust. Key types:
- `Allocator` - Memory allocator for CLVM objects
- `NodePtr` - Pointer to a CLVM object in the allocator
- `ChiaDialect` - The Chia-specific CLVM dialect
- `run_program` - Function to execute CLVM programs

### 2. Basic CLVM Execution

```rust
use clvmr::{
    reduction::{EvalErr, Reduction},
    Allocator, NodePtr,
};

pub fn run_puzzle(
    allocator: &mut Allocator,
    puzzle: NodePtr,
    solution: NodePtr,
) -> Result<NodePtr, EvalErr> {
    let Reduction(_cost, output) = clvmr::run_program(
        allocator,
        &clvmr::ChiaDialect::new(0),
        puzzle,
        solution,
        11_000_000_000,  // max cost
    )?;
    Ok(output)
}
```

### 3. Converting Bytes to CLVM

```rust
use clvmr::serde::node_from_bytes;

// Deserialize CLVM program from bytes
let mut allocator = Allocator::new();
let program_ptr = node_from_bytes(&mut allocator, &program_bytes)?;
```

### 4. Converting CLVM to Bytes

```rust
use clvmr::serde::node_to_bytes;

// Serialize CLVM node back to bytes
let bytes = node_to_bytes(&allocator, node_ptr)?;
```

## Block Generator Execution

For executing block generators specifically:

### 1. chia-consensus Integration

The `chia-consensus` crate provides higher-level functions for block processing:

```rust
use chia_consensus::{
    gen::run_block_generator2,
    consensus_constants::ConsensusConstants,
};

// Execute block generator
let conditions = run_block_generator2(
    &mut allocator,
    &generator_bytes,
    &block_refs,  // Vec of referenced blocks
    max_cost,
    flags,
)?;
```

### 2. SpendBundleConditions

The result of generator execution is `SpendBundleConditions`:
```rust
pub struct SpendBundleConditions {
    pub spends: Vec<Spend>,
    pub reserve_fee: u64,
    pub height_absolute: u32,
    pub seconds_absolute: u64,
    pub before_height_absolute: Option<u32>,
    pub before_seconds_absolute: Option<u64>,
    pub agg_sig_unsafe: Vec<(PublicKey, Message)>,
    pub agg_sig_me: Vec<(PublicKey, Message)>,
    pub agg_sig_parent: Vec<(PublicKey, Message)>,
    pub agg_sig_puzzle: Vec<(PublicKey, Message)>,
    pub agg_sig_amount: Vec<(PublicKey, Message)>,
    pub agg_sig_puzzle_amount: Vec<(PublicKey, Message)>,
    pub agg_sig_parent_amount: Vec<(PublicKey, Message)>,
    pub agg_sig_parent_puzzle: Vec<(PublicKey, Message)>,
    pub flags: u32,
}
```

### 3. Individual Spend Structure

```rust
pub struct Spend {
    pub coin_id: Bytes32,
    pub parent_id: Bytes32,
    pub puzzle_hash: Bytes32,
    pub coin_amount: u64,
    pub height_relative: Option<u32>,
    pub seconds_relative: Option<u64>,
    pub before_height_relative: Option<u32>,
    pub before_seconds_relative: Option<u64>,
    pub birth_height: Option<u32>,
    pub birth_seconds: Option<u64>,
    pub create_coin: Vec<(Bytes32, u64, Vec<u8>)>,  // (puzzle_hash, amount, memo)
    pub agg_sig_me: Vec<(PublicKey, Message)>,
    pub agg_sig_parent: Vec<(PublicKey, Message)>,
    pub agg_sig_puzzle: Vec<(PublicKey, Message)>,
    pub agg_sig_amount: Vec<(PublicKey, Message)>,
    pub agg_sig_puzzle_amount: Vec<(PublicKey, Message)>,
    pub agg_sig_parent_amount: Vec<(PublicKey, Message)>,
    pub agg_sig_parent_puzzle: Vec<(PublicKey, Message)>,
    pub flags: u32,
}
```

## Implementation Steps

1. **Parse Generator**: Extract generator bytes from block
2. **Setup Allocator**: Create CLVM allocator
3. **Load Generator**: Convert bytes to NodePtr using `node_from_bytes`
4. **Get Block References**: Collect any referenced blocks
5. **Execute Generator**: Call `run_block_generator2`
6. **Extract Coins**: Process SpendBundleConditions

### Coin Extraction

From SpendBundleConditions:
- **Coin Removals**: The coins being spent (from spends list)
- **Coin Additions**: From CREATE_COIN conditions in each spend
- **Coin Spends**: Full spend data with puzzle reveals

```rust
// Extract coin removals (spent coins)
let coin_removals: Vec<CoinInfo> = conditions.spends.iter()
    .map(|spend| CoinInfo {
        parent_coin_info: spend.parent_id,
        puzzle_hash: spend.puzzle_hash,
        amount: spend.coin_amount,
    })
    .collect();

// Extract coin additions (created coins)
let coin_additions: Vec<CoinInfo> = conditions.spends.iter()
    .flat_map(|spend| {
        spend.create_coin.iter().map(|(puzzle_hash, amount, _memo)| {
            CoinInfo {
                parent_coin_info: spend.coin_id,  // Parent is the spent coin
                puzzle_hash: *puzzle_hash,
                amount: *amount,
            }
        })
    })
    .collect();
```

## CLVM Program Structure

CLVM programs are S-expressions with specific encoding:
- `0xff` prefix indicates a cons cell (pair)
- `0x80-0xbf` are single-byte atoms
- `<0x80` indicates atom with length prefix

## Error Handling

```rust
use clvmr::reduction::EvalErr;

match run_program(...) {
    Ok(reduction) => // Handle success
    Err(EvalErr(node_ptr, msg)) => // Handle CLVM error
}
```

## References

- clvmr crate: https://crates.io/crates/clvmr
- chia-consensus: Part of the chia ecosystem
- CLVM specification: https://chialisp.com/ 