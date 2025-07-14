# Reference Index

## Reference Files

### 1. Block Parsing (./.knowledge/reference/block_parsing.md)
- **Description**: Comprehensive documentation on Chia blockchain block parsing
- **Key Concepts**: FullBlock structure, generator extraction, coin spends/creates, CREATE_COIN conditions
- **When to Consult**: 
  - Understanding block structure and fields
  - Implementing generator extraction from blocks
  - Parsing coin spends and creations
  - Understanding SpendBundleConditions

### 2. CLVM Execution (./.knowledge/reference/clvm_execution.md)
- **Description**: Guide for executing CLVM programs in Rust
- **Key Concepts**: clvmr runtime, run_block_generator2, SpendBundleConditions, coin extraction
- **When to Consult**:
  - Implementing CLVM execution in Rust
  - Running block generators
  - Extracting coins from generator execution
  - Understanding CLVM runtime architecture

### 3. Implementation Audit (./.knowledge/implementation_audit.md)
- **Description**: Audit comparing Rust implementation with Python full_node
- **Key Concepts**: Production readiness issues, missing implementations, critical gaps
- **When to Consult**:
  - Understanding what's missing for production
  - Comparing with Python implementation
  - Identifying critical issues

### 4. Critical Missing Implementation (./.knowledge/critical_missing_implementation.md)
- **Description**: Details on the missing process_generator_for_coins implementation
- **Key Concepts**: run_block_generator2, SpendBundleConditions, proper coin extraction
- **When to Consult**:
  - Implementing proper CLVM execution
  - Understanding why current implementation is wrong
  - Fixing coin extraction from generators 