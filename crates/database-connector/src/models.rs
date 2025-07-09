//! Common models and data structures

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a database row as a generic structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Row {
    pub values: HashMap<String, serde_json::Value>,
}

impl Row {
    pub fn new() -> Self {
        Self {
            values: HashMap::new(),
        }
    }
    
    pub fn insert(&mut self, key: impl Into<String>, value: impl Serialize) {
        self.values.insert(
            key.into(),
            serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
        );
    }
    
    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        self.values.get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }
    
    pub fn get_string(&self, key: &str) -> Option<String> {
        self.get::<String>(key)
    }
    
    pub fn get_i64(&self, key: &str) -> Option<i64> {
        self.get::<i64>(key)
    }
    
    pub fn get_f64(&self, key: &str) -> Option<f64> {
        self.get::<f64>(key)
    }
    
    pub fn get_bool(&self, key: &str) -> Option<bool> {
        self.get::<bool>(key)
    }
}

impl Default for Row {
    fn default() -> Self {
        Self::new()
    }
}

/// Table metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
}

/// Column metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
}

/// Migration tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Migration {
    pub version: String,
    pub description: String,
    pub sql: String,
    pub checksum: String,
}

/// Database statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStats {
    pub total_connections: u32,
    pub active_connections: u32,
    pub idle_connections: u32,
    pub max_connections: u32,
    pub database_size_bytes: Option<u64>,
}

/// Query result metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub rows_affected: u64,
    pub last_insert_id: Option<i64>,
    pub execution_time_ms: u64,
}