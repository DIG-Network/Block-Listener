//! Database migrations for the block indexer

use crate::error::Result;
use database_connector::{DatabaseConnection, DatabaseOperations};

/// SQLite migration script for creating the schema
pub const SQLITE_MIGRATION: &str = r#"
-- Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
    height INTEGER PRIMARY KEY,
    header_hash TEXT NOT NULL UNIQUE,
    prev_header_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    additions_count INTEGER NOT NULL DEFAULT 0,
    removals_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create conditions table (for additions and removals)
CREATE TABLE IF NOT EXISTS conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    height INTEGER NOT NULL,
    puzzle_hash TEXT NOT NULL,
    parent_coin_info TEXT NOT NULL,
    amount INTEGER NOT NULL,
    is_addition BOOLEAN NOT NULL,
    coin_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (height) REFERENCES blocks(height),
    UNIQUE(coin_id, is_addition, height)
);

-- Create indexes on conditions table
CREATE INDEX IF NOT EXISTS idx_conditions_height ON conditions(height);
CREATE INDEX IF NOT EXISTS idx_conditions_puzzle_hash ON conditions(puzzle_hash);
CREATE INDEX IF NOT EXISTS idx_conditions_coin_id ON conditions(coin_id);

-- Create coins view (materialized as a table with triggers)
CREATE TABLE IF NOT EXISTS coins (
    coin_id TEXT PRIMARY KEY,
    puzzle_hash TEXT NOT NULL,
    parent_coin_info TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_height INTEGER NOT NULL,
    spent_height INTEGER,
    is_spent BOOLEAN NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_coins_puzzle_hash ON coins(puzzle_hash);
CREATE INDEX IF NOT EXISTS idx_coins_is_spent ON coins(is_spent);

-- Create balances view (materialized as a table with triggers)
CREATE TABLE IF NOT EXISTS balances (
    puzzle_hash TEXT PRIMARY KEY,
    total_amount INTEGER NOT NULL DEFAULT 0,
    coin_count INTEGER NOT NULL DEFAULT 0,
    last_updated_height INTEGER NOT NULL DEFAULT 0
);

-- Trigger to update coins table on new additions
CREATE TRIGGER IF NOT EXISTS update_coins_on_addition
AFTER INSERT ON conditions
WHEN NEW.is_addition = 1
BEGIN
    INSERT OR REPLACE INTO coins (coin_id, puzzle_hash, parent_coin_info, amount, created_height, spent_height, is_spent)
    VALUES (NEW.coin_id, NEW.puzzle_hash, NEW.parent_coin_info, NEW.amount, NEW.height, NULL, 0);
END;

-- Trigger to update coins table on new removals
CREATE TRIGGER IF NOT EXISTS update_coins_on_removal
AFTER INSERT ON conditions
WHEN NEW.is_addition = 0
BEGIN
    UPDATE coins 
    SET spent_height = NEW.height, is_spent = 1 
    WHERE coin_id = NEW.coin_id;
END;

-- Trigger to update balances on addition
CREATE TRIGGER IF NOT EXISTS update_balances_on_addition
AFTER INSERT ON conditions
WHEN NEW.is_addition = 1
BEGIN
    INSERT INTO balances (puzzle_hash, total_amount, coin_count, last_updated_height)
    VALUES (NEW.puzzle_hash, NEW.amount, 1, NEW.height)
    ON CONFLICT(puzzle_hash) DO UPDATE SET
        total_amount = total_amount + NEW.amount,
        coin_count = coin_count + 1,
        last_updated_height = NEW.height;
END;

-- Trigger to update balances on removal
CREATE TRIGGER IF NOT EXISTS update_balances_on_removal
AFTER INSERT ON conditions
WHEN NEW.is_addition = 0
BEGIN
    UPDATE balances 
    SET total_amount = total_amount - NEW.amount,
        coin_count = coin_count - 1,
        last_updated_height = NEW.height
    WHERE puzzle_hash = NEW.puzzle_hash;
END;
"#;

/// PostgreSQL migration script for creating the schema
pub const POSTGRES_MIGRATION: &str = r#"
-- Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
    height BIGINT PRIMARY KEY,
    header_hash TEXT NOT NULL UNIQUE,
    prev_header_hash TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    additions_count INTEGER NOT NULL DEFAULT 0,
    removals_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create conditions table (for additions and removals)
CREATE TABLE IF NOT EXISTS conditions (
    id BIGSERIAL PRIMARY KEY,
    height BIGINT NOT NULL,
    puzzle_hash TEXT NOT NULL,
    parent_coin_info TEXT NOT NULL,
    amount BIGINT NOT NULL,
    is_addition BOOLEAN NOT NULL,
    coin_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (height) REFERENCES blocks(height),
    UNIQUE(coin_id, is_addition, height)
);

-- Create indexes on conditions table
CREATE INDEX IF NOT EXISTS idx_conditions_height ON conditions(height);
CREATE INDEX IF NOT EXISTS idx_conditions_puzzle_hash ON conditions(puzzle_hash);
CREATE INDEX IF NOT EXISTS idx_conditions_coin_id ON conditions(coin_id);

-- Create coins table (will be updated by triggers)
CREATE TABLE IF NOT EXISTS coins (
    coin_id TEXT PRIMARY KEY,
    puzzle_hash TEXT NOT NULL,
    parent_coin_info TEXT NOT NULL,
    amount BIGINT NOT NULL,
    created_height BIGINT NOT NULL,
    spent_height BIGINT,
    is_spent BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_coins_puzzle_hash ON coins(puzzle_hash);
CREATE INDEX IF NOT EXISTS idx_coins_is_spent ON coins(is_spent);

-- Create balances table (will be updated by triggers)
CREATE TABLE IF NOT EXISTS balances (
    puzzle_hash TEXT PRIMARY KEY,
    total_amount BIGINT NOT NULL DEFAULT 0,
    coin_count INTEGER NOT NULL DEFAULT 0,
    last_updated_height BIGINT NOT NULL DEFAULT 0
);

-- Function to update coins on conditions insert
CREATE OR REPLACE FUNCTION update_coins_on_conditions()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_addition THEN
        INSERT INTO coins (coin_id, puzzle_hash, parent_coin_info, amount, created_height, spent_height, is_spent)
        VALUES (NEW.coin_id, NEW.puzzle_hash, NEW.parent_coin_info, NEW.amount, NEW.height, NULL, FALSE)
        ON CONFLICT (coin_id) DO NOTHING;
    ELSE
        UPDATE coins 
        SET spent_height = NEW.height, is_spent = TRUE 
        WHERE coin_id = NEW.coin_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update balances on conditions insert
CREATE OR REPLACE FUNCTION update_balances_on_conditions()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_addition THEN
        INSERT INTO balances (puzzle_hash, total_amount, coin_count, last_updated_height)
        VALUES (NEW.puzzle_hash, NEW.amount, 1, NEW.height)
        ON CONFLICT(puzzle_hash) DO UPDATE SET
            total_amount = balances.total_amount + NEW.amount,
            coin_count = balances.coin_count + 1,
            last_updated_height = NEW.height;
    ELSE
        UPDATE balances 
        SET total_amount = total_amount - NEW.amount,
            coin_count = coin_count - 1,
            last_updated_height = NEW.height
        WHERE puzzle_hash = NEW.puzzle_hash;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_coins
AFTER INSERT ON conditions
FOR EACH ROW
EXECUTE FUNCTION update_coins_on_conditions();

CREATE TRIGGER trigger_update_balances
AFTER INSERT ON conditions
FOR EACH ROW
EXECUTE FUNCTION update_balances_on_conditions();
"#;

/// Run migrations based on the database type
pub async fn run_migrations(conn: &DatabaseConnection) -> Result<()> {
    // Split migrations into individual statements and execute them
    let migration_sql = match conn.database_type() {
        database_connector::DatabaseType::Sqlite => SQLITE_MIGRATION,
        database_connector::DatabaseType::Postgres => POSTGRES_MIGRATION,
    };
    
    // Execute the migration as a raw query
    // Note: For production use, you might want to split this into individual statements
    // and execute them separately to handle errors better
    conn.execute_raw(migration_sql, vec![]).await
        .map_err(|e| crate::error::BlockIndexerError::Migration(format!("Failed to run migrations: {}", e)))?;
    
    log::info!("Database migrations completed successfully");
    Ok(())
}