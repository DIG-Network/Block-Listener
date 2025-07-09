# Block Indexer Implementation Summary

A new self-contained crate has been created for block indexing on the Chia Blockchain.

## Crate Location
- Path: `crates/block-indexer/`
- Name: `block-indexer`

## Key Features Implemented

### 1. Database Schema
- **Blocks table**: Stores block metadata (height, hashes, timestamp, addition/removal counts)
- **Conditions table**: Tracks coin additions and removals, indexed by height and puzzle_hash
- **Coins table**: Materialized view showing current UTXO set with automatic trigger updates
- **Balances table**: Materialized view showing cumulative amounts per puzzle_hash

### 2. Core Functionality
- `insert_block()`: Inserts a block with its additions and removals in a transaction
- `get_coins_by_puzzlehash()`: Retrieves all unspent coins for a puzzle hash
- `get_balance_by_puzzlehash()`: Gets the balance for a puzzle hash
- Database triggers automatically update coins and balances tables when conditions change

### 3. Event System
- **Events exposed**:
  - `coins_updated`: Emitted when coins are added or removed
  - `balance_updated`: Emitted when balances change
- Event subscription system using Tokio broadcast channels

### 4. NAPI Bindings
- Located in `src/block_indexer_napi.rs`
- Exposes all functionality to JavaScript/TypeScript
- Factory pattern for async constructor: `BlockIndexerNapi.new(databaseUrl)`
- Event subscription with JavaScript callbacks

### 5. Database Support
- Supports both SQLite and PostgreSQL through the database-connector crate
- Connection string format:
  - SQLite: `sqlite://path/to/database.db`
  - PostgreSQL: `postgres://user:password@host:port/database`

## Usage Example

```javascript
const { BlockIndexerNapi } = require('./index.js');

// Create indexer
const indexer = await BlockIndexerNapi.new('sqlite://chia_blocks.db');

// Subscribe to events
indexer.subscribeEvents((event) => {
    if (event.type === 'coins_updated') {
        console.log(`Coins updated at height ${event.height}`);
    }
});

// Insert a block
await indexer.insertBlock(
    height,
    headerHash,
    prevHeaderHash,
    timestamp,
    additions,  // Array of {puzzle_hash, parent_coin_info, amount}
    removals    // Array of {puzzle_hash, parent_coin_info, amount}
);

// Query data
const coins = await indexer.getCoinsByPuzzlehash(puzzleHash);
const balance = await indexer.getBalanceByPuzzlehash(puzzleHash);
```

## Architecture Decisions

1. **Database Triggers**: Used for automatic materialized view updates to ensure consistency
2. **Transaction Safety**: All block insertions are wrapped in database transactions
3. **Event System**: Asynchronous event emission to avoid blocking insertions
4. **Database Abstraction**: Uses the existing database-connector crate for multi-database support

## Files Created/Modified

### New Files
- `crates/block-indexer/Cargo.toml`
- `crates/block-indexer/src/lib.rs`
- `crates/block-indexer/src/error.rs`
- `crates/block-indexer/src/models.rs`
- `crates/block-indexer/src/migrations.rs`
- `crates/block-indexer/src/events.rs`
- `crates/block-indexer/src/indexer.rs`
- `crates/block-indexer/README.md`
- `src/block_indexer_napi.rs`
- `example-block-indexer.js`

### Modified Files
- `Cargo.toml` - Added block-indexer to workspace and dependencies
- `src/lib.rs` - Added block_indexer_napi module
- `index.d.ts` - Added TypeScript definitions for BlockIndexerNapi

## Testing
The crate includes a basic test in `indexer.rs` that creates an in-memory SQLite database and tests block insertion functionality.