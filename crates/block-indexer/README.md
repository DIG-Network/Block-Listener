# Block Indexer

A self-contained crate for indexing blocks on the Chia Blockchain. This crate provides functionality to store and query block data, coin additions/removals, and maintain balance information.

## Features

- **Block Storage**: Store block information with height, hash, timestamp, and transaction counts
- **Coin Tracking**: Track coin additions and removals by height with efficient indexing
- **Balance Calculation**: Automatically maintain balances per puzzle hash using database triggers
- **Event System**: Emit events when coins or balances are updated
- **Multi-Database Support**: Works with both SQLite and PostgreSQL
- **Efficient Queries**: Optimized indexes for common queries by height and puzzle hash

## Database Schema

### Tables

1. **blocks**: Stores block metadata
   - `height` (PRIMARY KEY)
   - `header_hash`
   - `prev_header_hash`
   - `timestamp`
   - `additions_count`
   - `removals_count`
   - `created_at`

2. **conditions**: Stores coin additions and removals
   - `id` (PRIMARY KEY)
   - `height` (FOREIGN KEY to blocks)
   - `puzzle_hash` (INDEXED)
   - `parent_coin_info`
   - `amount`
   - `is_addition`
   - `coin_id` (INDEXED)
   - `created_at`

3. **coins**: Materialized view of current coin state
   - `coin_id` (PRIMARY KEY)
   - `puzzle_hash` (INDEXED)
   - `parent_coin_info`
   - `amount`
   - `created_height`
   - `spent_height`
   - `is_spent` (INDEXED)

4. **balances**: Materialized view of balances per puzzle hash
   - `puzzle_hash` (PRIMARY KEY)
   - `total_amount`
   - `coin_count`
   - `last_updated_height`

### Automatic Updates

Database triggers automatically update the `coins` and `balances` tables when new conditions are inserted, ensuring data consistency without manual intervention.

## Usage

```rust
use block_indexer::{BlockIndexer, BlockInput, CoinInput};
use database_connector::{DatabaseConfig, DatabaseType, ConnectionPool};
use chrono::Utc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create database connection
    let config = DatabaseConfig {
        database_type: DatabaseType::Sqlite,
        connection_string: "chia_blocks.db".to_string(),
        max_connections: 10,
        min_connections: 1,
        connect_timeout_seconds: 30,
        idle_timeout_seconds: 600,
        max_lifetime_seconds: 3600,
    };
    
    let pool = ConnectionPool::new(&config).await?;
    let indexer = BlockIndexer::new(pool.get_connection()).await?;
    
    // Subscribe to events
    let mut subscriber = indexer.subscribe_events();
    tokio::spawn(async move {
        while let Ok(event) = subscriber.recv().await {
            match event {
                IndexerEvent::CoinsUpdated(e) => {
                    println!("Coins updated at height {}", e.height);
                }
                IndexerEvent::BalanceUpdated(e) => {
                    println!("Balances updated at height {}", e.height);
                }
            }
        }
    });
    
    // Insert a block
    let block = BlockInput {
        height: 1000,
        header_hash: "0x...".to_string(),
        prev_header_hash: "0x...".to_string(),
        timestamp: Utc::now(),
        additions: vec![
            CoinInput {
                puzzle_hash: "0xabc...".to_string(),
                parent_coin_info: "0xdef...".to_string(),
                amount: 1000000000,
            }
        ],
        removals: vec![],
    };
    
    indexer.insert_block(block).await?;
    
    // Query coins
    let coins = indexer.get_coins_by_puzzlehash("0xabc...").await?;
    println!("Found {} coins", coins.len());
    
    // Query balance
    if let Some(balance) = indexer.get_balance_by_puzzlehash("0xabc...").await? {
        println!("Balance: {} mojos", balance.total_amount);
    }
    
    Ok(())
}
```

## API

### Main Functions

- `BlockIndexer::new(db: DatabaseConnection)` - Create a new indexer with database connection
- `insert_block(block: BlockInput)` - Insert a block with its additions and removals
- `get_coins_by_puzzlehash(puzzle_hash: &str)` - Get all unspent coins for a puzzle hash
- `get_balance_by_puzzlehash(puzzle_hash: &str)` - Get the balance for a puzzle hash
- `subscribe_events()` - Subscribe to indexer events

### Events

- `CoinsUpdated` - Emitted when coins are added or removed
- `BalanceUpdated` - Emitted when balances change

## Performance Considerations

- The crate uses database triggers for automatic updates, reducing round trips
- Indexes are created on commonly queried fields (height, puzzle_hash, coin_id)
- Transactions are used to ensure atomic block insertions
- Events are emitted asynchronously to avoid blocking insertions