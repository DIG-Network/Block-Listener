use crate::{error::Result, types::ChiaBlock};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct BlockDatabase {
    conn: Mutex<Connection>,
}

impl BlockDatabase {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS blocks (
                header_hash TEXT PRIMARY KEY,
                height INTEGER NOT NULL,
                weight INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                prev_header_hash TEXT NOT NULL,
                farmer_puzzle_hash TEXT NOT NULL,
                pool_puzzle_hash TEXT NOT NULL,
                transactions_generator TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks(height)",
            [],
        )?;

        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn insert_block(&self, block: &ChiaBlock) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO blocks (
                header_hash, height, weight, timestamp,
                prev_header_hash, farmer_puzzle_hash, pool_puzzle_hash,
                transactions_generator
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                block.header_hash,
                block.height,
                block.weight as i64,
                block.timestamp as i64,
                block.prev_header_hash,
                block.farmer_puzzle_hash,
                block.pool_puzzle_hash,
                block.transactions_generator,
            ],
        )?;
        Ok(())
    }

    pub fn get_latest_block(&self) -> Result<Option<ChiaBlock>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT header_hash, height, weight, timestamp,
                    prev_header_hash, farmer_puzzle_hash, pool_puzzle_hash,
                    transactions_generator
             FROM blocks
             ORDER BY height DESC
             LIMIT 1",
        )?;

        let mut rows = stmt.query_map([], |row| {
            Ok(ChiaBlock {
                header_hash: row.get(0)?,
                height: row.get(1)?,
                weight: row.get::<_, i64>(2)? as u128,
                timestamp: row.get::<_, i64>(3)? as u64,
                prev_header_hash: row.get(4)?,
                farmer_puzzle_hash: row.get(5)?,
                pool_puzzle_hash: row.get(6)?,
                transactions_generator: row.get(7)?,
                transactions_generator_ref_list: vec![],
            })
        })?;

        Ok(rows.next().transpose()?)
    }

    pub fn get_block_count(&self) -> Result<u32> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM blocks",
            [],
            |row| row.get(0),
        )?;
        Ok(count as u32)
    }
}