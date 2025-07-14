# Known Implementation Gaps

## Critical CLVM Execution Gap (PARTIALLY ADDRESSED)
- **Issue**: Using pattern matching instead of proper CLVM execution
- **Current**: Pattern matching extracts puzzle reveals and solutions from bytecode
- **Missing**: Cannot extract CREATE_COIN conditions or handle block references
- **Impact**: Will miss coins created by transactions and compressed blocks
- **Required**: Full integration with chia-consensus run_block_generator2
- **Blocker**: chia-consensus module paths not publicly exposed
- **Status**: Documented with workaround implemented

## Compressed Block References (UNRESOLVED)
- **Issue**: Cannot handle blocks that reference previous generators
- **Impact**: Many blocks will fail to parse completely
- **Required**: Generator reference resolution system
- **Status**: Placeholder returns empty results

## Real-time Block Coin Spend Extraction (RESOLVED)
- **Issue**: coin_spends array is empty even when generator_bytecode is present
- **Resolution**: parse_block() now calls process_generator_for_coins
- **Current**: Pattern matching extracts basic coin spends
- **Limitation**: Missing CREATE_COIN conditions 