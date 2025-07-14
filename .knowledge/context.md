# Project Context

## Current Status
- **Architecture**: Complete refactor with dedicated chia-generator-parser crate ✅
- **Block Parsing**: Using chia-protocol FullBlock types directly ✅
- **Build Status**: Successfully building without errors ✅
- **Generator Parsing**: ❌ NOT PRODUCTION READY - placeholder pattern matching
- **CLVM Integration**: ❌ NOT PRODUCTION READY - no execution capability

## Production Readiness: ❌ CRITICAL ISSUES
After implementing chia-protocol integration:
1. **No CLVM Execution**: Cannot run generators to extract coins
2. **No SpendBundleConditions**: Missing the core data structure from run_block_generator2
3. **Pattern Matching Only**: Looking for 0x33 bytes instead of executing CLVM
4. **No Generator Refs**: Cannot handle compressed blocks
5. **Incomplete Header**: Minor issue with header block creation

**Impact**: Will miss 99%+ of all coins and report incorrect blockchain state

## Recent Progress (2024-12-30)
1. **Fixed all compilation errors** in chia-generator-parser
2. **Refactored to use chia-protocol types directly** - no more manual byte parsing
3. **Eliminated redundant serialization** - working with FullBlock structs
4. **Aligned all dependencies** to version 0.26.0
5. **Successfully integrated** parser with main event flow
6. **Added IPv6 support** for peer connections
7. **Tested end-to-end** with real network connection
8. **Documented CLVM execution** in .knowledge/reference/clvm_execution.md
9. **Added basic CLVM parsing** using clvmr library
10. **Created implementation audit** comparing with Python
11. **Triple-checked coin extraction** - confirmed NOT working

## Architecture
The improved architecture now follows:
```
Network → peer.rs (receives FullBlock) → chia-generator-parser (processes FullBlock directly) → ParsedBlock → event_emitter.rs → JavaScript
```

## Key Improvements Made
- **Direct Type Usage**: Now using `chia_protocol::FullBlock` directly instead of manual parsing
- **Type Safety**: Leveraging Rust's type system with proper chia-protocol structs
- **No Redundant Conversion**: Eliminated `to_bytes()` → parse cycle
- **Dependency Alignment**: All chia crates use consistent versions (0.26.0)

## Key Data Structures
- **FullBlock**: From chia-protocol, the complete block structure
- **ParsedBlock**: Our simplified representation for JavaScript consumption
- **CoinInfo**: Basic coin representation (parent, puzzle_hash, amount)
- **CoinSpendInfo**: Should contain puzzle reveals and solutions (currently placeholder)
- **GeneratorBlockInfo**: Generator with reference list (refs not used)

## Critical Path to Production
1. Add chia_rs dependency properly
2. Implement proper process_generator_for_coins using run_block_generator2
3. Extract real SpendBundleConditions
4. Process conditions to get actual coins
5. Handle generator references for compressed blocks

## Dependencies Used
- **chia-protocol**: 0.26.0 - For blockchain data structures
- **chia-traits**: 0.26.0 - For Streamable serialization trait
- **clvmr**: 0.14.0 - For CLVM parsing (not execution)
- **clvm-traits**: 0.26.0 - CLVM type traits
- **clvm-utils**: 0.26.0 - CLVM utilities

## Testing
- Basic block parsing: ✅ Working
- Network connection: ✅ Working
- chia-protocol integration: ✅ Working
- Coin extraction: ❌ Not working (placeholder only)
- Generator execution: ❌ Not implemented
- Production blocks: ❌ Will fail to extract coins 