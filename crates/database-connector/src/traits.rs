//! Traits for database operations

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sqlx::{Row, FromRow};

/// Main trait for database operations
#[async_trait]
pub trait DatabaseOperations: Send + Sync {
    /// Execute a raw SQL query that returns rows
    async fn query_raw(&self, query: &str, params: Vec<serde_json::Value>) -> crate::Result<Vec<serde_json::Value>>;
    
    /// Execute a raw SQL command (INSERT, UPDATE, DELETE)
    async fn execute_raw(&self, query: &str, params: Vec<serde_json::Value>) -> crate::Result<u64>;
    
    /// Begin a transaction
    async fn begin_transaction(&self) -> crate::Result<Box<dyn Transaction>>;
    
    /// Check if the connection is healthy
    async fn health_check(&self) -> crate::Result<()>;
    
    /// Get the database type
    fn database_type(&self) -> crate::config::DatabaseType;
}

/// Transaction trait
#[async_trait]
pub trait Transaction: Send + Sync {
    /// Commit the transaction
    async fn commit(self: Box<Self>) -> crate::Result<()>;
    
    /// Rollback the transaction
    async fn rollback(self: Box<Self>) -> crate::Result<()>;
    
    /// Execute a query within the transaction
    async fn query_raw(&mut self, query: &str, params: Vec<serde_json::Value>) -> crate::Result<Vec<serde_json::Value>>;
    
    /// Execute a command within the transaction
    async fn execute_raw(&mut self, query: &str, params: Vec<serde_json::Value>) -> crate::Result<u64>;
}

/// Query builder trait for constructing database-agnostic queries
pub trait QueryBuilder {
    /// Create a SELECT query
    fn select(table: &str) -> SelectQuery {
        SelectQuery::new(table)
    }
    
    /// Create an INSERT query
    fn insert(table: &str) -> InsertQuery {
        InsertQuery::new(table)
    }
    
    /// Create an UPDATE query
    fn update(table: &str) -> UpdateQuery {
        UpdateQuery::new(table)
    }
    
    /// Create a DELETE query
    fn delete(table: &str) -> DeleteQuery {
        DeleteQuery::new(table)
    }
}

/// SELECT query builder
#[derive(Debug, Clone)]
pub struct SelectQuery {
    table: String,
    columns: Vec<String>,
    where_clause: Option<String>,
    order_by: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

impl SelectQuery {
    pub fn new(table: &str) -> Self {
        Self {
            table: table.to_string(),
            columns: vec!["*".to_string()],
            where_clause: None,
            order_by: None,
            limit: None,
            offset: None,
        }
    }
    
    pub fn columns(mut self, columns: Vec<&str>) -> Self {
        self.columns = columns.iter().map(|s| s.to_string()).collect();
        self
    }
    
    pub fn where_clause(mut self, clause: &str) -> Self {
        self.where_clause = Some(clause.to_string());
        self
    }
    
    pub fn order_by(mut self, column: &str, desc: bool) -> Self {
        self.order_by = Some(format!("{} {}", column, if desc { "DESC" } else { "ASC" }));
        self
    }
    
    pub fn limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }
    
    pub fn offset(mut self, offset: usize) -> Self {
        self.offset = Some(offset);
        self
    }
    
    pub fn build(&self) -> String {
        let mut query = format!("SELECT {} FROM {}", self.columns.join(", "), self.table);
        
        if let Some(ref where_clause) = self.where_clause {
            query.push_str(&format!(" WHERE {}", where_clause));
        }
        
        if let Some(ref order_by) = self.order_by {
            query.push_str(&format!(" ORDER BY {}", order_by));
        }
        
        if let Some(limit) = self.limit {
            query.push_str(&format!(" LIMIT {}", limit));
        }
        
        if let Some(offset) = self.offset {
            query.push_str(&format!(" OFFSET {}", offset));
        }
        
        query
    }
}

/// INSERT query builder
#[derive(Debug, Clone)]
pub struct InsertQuery {
    table: String,
    columns: Vec<String>,
    values: Vec<Vec<String>>,
}

impl InsertQuery {
    pub fn new(table: &str) -> Self {
        Self {
            table: table.to_string(),
            columns: Vec::new(),
            values: Vec::new(),
        }
    }
    
    pub fn columns(mut self, columns: Vec<&str>) -> Self {
        self.columns = columns.iter().map(|s| s.to_string()).collect();
        self
    }
    
    pub fn values(mut self, values: Vec<&str>) -> Self {
        self.values.push(values.iter().map(|s| s.to_string()).collect());
        self
    }
    
    pub fn build(&self) -> String {
        let columns = self.columns.join(", ");
        let values = self.values
            .iter()
            .map(|row| format!("({})", row.join(", ")))
            .collect::<Vec<_>>()
            .join(", ");
        
        format!("INSERT INTO {} ({}) VALUES {}", self.table, columns, values)
    }
}

/// UPDATE query builder
#[derive(Debug, Clone)]
pub struct UpdateQuery {
    table: String,
    set_clause: Vec<String>,
    where_clause: Option<String>,
}

impl UpdateQuery {
    pub fn new(table: &str) -> Self {
        Self {
            table: table.to_string(),
            set_clause: Vec::new(),
            where_clause: None,
        }
    }
    
    pub fn set(mut self, column: &str, value: &str) -> Self {
        self.set_clause.push(format!("{} = {}", column, value));
        self
    }
    
    pub fn where_clause(mut self, clause: &str) -> Self {
        self.where_clause = Some(clause.to_string());
        self
    }
    
    pub fn build(&self) -> String {
        let mut query = format!("UPDATE {} SET {}", self.table, self.set_clause.join(", "));
        
        if let Some(ref where_clause) = self.where_clause {
            query.push_str(&format!(" WHERE {}", where_clause));
        }
        
        query
    }
}

/// DELETE query builder
#[derive(Debug, Clone)]
pub struct DeleteQuery {
    table: String,
    where_clause: Option<String>,
}

impl DeleteQuery {
    pub fn new(table: &str) -> Self {
        Self {
            table: table.to_string(),
            where_clause: None,
        }
    }
    
    pub fn where_clause(mut self, clause: &str) -> Self {
        self.where_clause = Some(clause.to_string());
        self
    }
    
    pub fn build(&self) -> String {
        let mut query = format!("DELETE FROM {}", self.table);
        
        if let Some(ref where_clause) = self.where_clause {
            query.push_str(&format!(" WHERE {}", where_clause));
        }
        
        query
    }
}