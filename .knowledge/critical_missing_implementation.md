# Critical Missing Implementation: process_generator_for_coins

## Current State ❌
The `process_generator_for_coins` function in `parser.rs` uses placeholder pattern matching instead of proper CLVM execution.

## Required Implementation

### 1. Add chia_rs dependency
```toml
chia_rs = "0.11.0"  # or appropriate version
```

### 2. Use run_block_generator2
```rust
use chia_rs::{run_block_generator2, SpendBundleConditions};

fn process_generator_for_coins(
    &self, 
    generator_bytes: &[u8],
    block_refs: &[u32],  // generator references
    max_cost: u64,
    height: u32,
) -> Result<(Vec<CoinInfo>, Vec<CoinSpendInfo>, Vec<CoinInfo>)> {
    // Call run_block_generator2 to execute the generator
    let (err, conds) = run_block_generator2(
        generator_bytes,
        block_refs,
        max_cost,
        flags,
        None,  // aggregated_signature
        None,  // bls_cache
        &constants,
    );
    
    if let Some(error) = err {
        return Err(GeneratorParserError::GeneratorError(error));
    }
    
    let conditions = conds.ok_or(GeneratorParserError::NoConditions)?;
    
    // Extract coins from SpendBundleConditions
    let mut coin_removals = Vec::new();
    let mut coin_additions = Vec::new();
    let mut coin_spends = Vec::new();
    
    // Process each spend
    for spend in conditions.spends {
        // Each spend removes the coin being spent
        coin_removals.push(CoinInfo::from(spend.coin));
        
        // Process CREATE_COIN conditions (opcode 51)
        for condition in spend.conditions {
            if condition.opcode == 51 {  // CREATE_COIN
                let new_coin = Coin::new(
                    spend.coin.coin_id(),  // parent
                    condition.puzzle_hash,
                    condition.amount,
                );
                coin_additions.push(CoinInfo::from(new_coin));
            }
        }
        
        // Build coin spend info
        coin_spends.push(CoinSpendInfo {
            coin: spend.coin,
            puzzle_reveal: spend.puzzle_reveal,
            solution: spend.solution,
            // ... other fields
        });
    }
    
    Ok((coin_removals, coin_spends, coin_additions))
}
```

### 3. Key Points
- SpendBundleConditions contains all spends from the generator
- Each spend has:
  - The coin being spent (removal)
  - Conditions including CREATE_COIN (additions)
  - Puzzle reveal and solution
- Must handle generator references for compressed blocks
- Must pass proper constants and flags

### 4. Missing Dependencies
Without proper CLVM execution via run_block_generator2:
- Cannot extract accurate coin data
- Cannot validate transactions
- Cannot build functional block explorers or wallets
- Will report incorrect blockchain state 