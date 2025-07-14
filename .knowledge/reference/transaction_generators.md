# Transaction Generators in Chia

## Overview
Transaction generators are CLVM programs that produce a list of coin spends when executed. They are used in blocks to efficiently store transaction data.

## Structure
- **Input**: Raw CLVM bytecode (hex-encoded)
- **Output**: List of coin spend tuples: `(coin, puzzle_reveal, solution)`
- **Execution**: CLVM runtime with proper solution arguments

## Current Issue
The block listener is incorrectly parsing the generator bytecode as a `chia_protocol::Program`, causing "bad encoding" errors.

## Correct Approach (from wallet SDK)
1. **Parse bytecode directly**: Use `clvmr::serde::node_from_bytes` on hex-decoded bytes
2. **Execute with proper solution**: Transaction generators typically expect nil or empty list as solution
3. **Parse output**: Extract coin spend tuples from CLVM output list

## Key Functions in wallet SDK
- `SpendContext::serialize()` - Serialize CLVM programs
- `node_from_bytes()` - Parse raw CLVM bytecode
- `run_program()` - Execute CLVM with solution
- `CoinSpend::new()` - Create coin spend from parsed data

## CLVM Output Format
```
[
  (coin1, puzzle_reveal1, solution1),
  (coin2, puzzle_reveal2, solution2),
  ...
]
```

Where each coin is: `(parent_coin_info, puzzle_hash, amount)` 