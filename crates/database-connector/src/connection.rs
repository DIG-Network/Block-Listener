//! Database connection implementations

use async_trait::async_trait;
use sqlx::{Pool, Sqlite, Postgres, Row as SqlxRow};
use std::sync::Arc;
use std::time::Duration;

use crate::{
    config::{DatabaseConfig, DatabaseType},
    error::{DatabaseError, Result},
    traits::{DatabaseOperations, Transaction},
};

/// Enum wrapper for different database connection pools
pub enum ConnectionPool {
    Sqlite(Pool<Sqlite>),
    Postgres(Pool<Postgres>),
}

/// Main database connection structure
pub struct DatabaseConnection {
    pool: ConnectionPool,
    config: DatabaseConfig,
}

impl DatabaseConnection {
    /// Create a new database connection
    pub async fn new(config: DatabaseConfig) -> Result<Self> {
        let pool = match config.database_type {
            DatabaseType::Sqlite => {
                let url = config.connection_url()?;
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(config.max_connections)
                    .min_connections(config.min_connections)
                    .connect_timeout(Duration::from_secs(config.connection_timeout_seconds))
                    .idle_timeout(Duration::from_secs(config.idle_timeout_seconds))
                    .connect(&url)
                    .await?;
                ConnectionPool::Sqlite(pool)
            }
            DatabaseType::Postgres => {
                let url = config.connection_url()?;
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(config.max_connections)
                    .min_connections(config.min_connections)
                    .connect_timeout(Duration::from_secs(config.connection_timeout_seconds))
                    .idle_timeout(Duration::from_secs(config.idle_timeout_seconds))
                    .connect(&url)
                    .await?;
                ConnectionPool::Postgres(pool)
            }
        };
        
        Ok(Self {
            pool,
            config: config.clone(),
        })
    }
    
    /// Create a new connection with default SQLite configuration
    pub async fn default_sqlite() -> Result<Self> {
        Self::new(DatabaseConfig::default()).await
    }
    
    /// Get a reference to the configuration
    pub fn config(&self) -> &DatabaseConfig {
        &self.config
    }
    
    /// Close all connections in the pool
    pub async fn close(&self) -> Result<()> {
        match &self.pool {
            ConnectionPool::Sqlite(pool) => {
                pool.close().await;
                Ok(())
            }
            ConnectionPool::Postgres(pool) => {
                pool.close().await;
                Ok(())
            }
        }
    }
}

#[async_trait]
impl DatabaseOperations for DatabaseConnection {
    async fn query_raw(&self, query: &str, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        match &self.pool {
            ConnectionPool::Sqlite(pool) => {
                let mut sqlx_query = sqlx::query(query);
                
                // Bind parameters
                for param in params {
                    sqlx_query = match param {
                        serde_json::Value::String(s) => sqlx_query.bind(s),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                sqlx_query.bind(i)
                            } else if let Some(f) = n.as_f64() {
                                sqlx_query.bind(f)
                            } else {
                                return Err(DatabaseError::QueryError("Invalid number parameter".to_string()));
                            }
                        }
                        serde_json::Value::Bool(b) => sqlx_query.bind(b),
                        serde_json::Value::Null => sqlx_query.bind(None::<String>),
                        _ => return Err(DatabaseError::QueryError("Unsupported parameter type".to_string())),
                    };
                }
                
                let rows = sqlx_query
                    .fetch_all(pool)
                    .await?;
                
                // Convert rows to JSON
                let mut results = Vec::new();
                for row in rows {
                    let mut json_row = serde_json::Map::new();
                    for (i, column) in row.columns().iter().enumerate() {
                        let value = sqlite_row_to_json(&row, i)?;
                        json_row.insert(column.name().to_string(), value);
                    }
                    results.push(serde_json::Value::Object(json_row));
                }
                
                Ok(results)
            }
            ConnectionPool::Postgres(pool) => {
                let mut sqlx_query = sqlx::query(query);
                
                // Bind parameters
                for param in params {
                    sqlx_query = match param {
                        serde_json::Value::String(s) => sqlx_query.bind(s),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                sqlx_query.bind(i)
                            } else if let Some(f) = n.as_f64() {
                                sqlx_query.bind(f)
                            } else {
                                return Err(DatabaseError::QueryError("Invalid number parameter".to_string()));
                            }
                        }
                        serde_json::Value::Bool(b) => sqlx_query.bind(b),
                        serde_json::Value::Null => sqlx_query.bind(None::<String>),
                        _ => return Err(DatabaseError::QueryError("Unsupported parameter type".to_string())),
                    };
                }
                
                let rows = sqlx_query
                    .fetch_all(pool)
                    .await?;
                
                // Convert rows to JSON
                let mut results = Vec::new();
                for row in rows {
                    let mut json_row = serde_json::Map::new();
                    for (i, column) in row.columns().iter().enumerate() {
                        let value = postgres_row_to_json(&row, i)?;
                        json_row.insert(column.name().to_string(), value);
                    }
                    results.push(serde_json::Value::Object(json_row));
                }
                
                Ok(results)
            }
        }
    }
    
    async fn execute_raw(&self, query: &str, params: Vec<serde_json::Value>) -> Result<u64> {
        match &self.pool {
            ConnectionPool::Sqlite(pool) => {
                let mut sqlx_query = sqlx::query(query);
                
                for param in params {
                    sqlx_query = bind_param_sqlite(sqlx_query, param)?;
                }
                
                let result = sqlx_query.execute(pool).await?;
                Ok(result.rows_affected())
            }
            ConnectionPool::Postgres(pool) => {
                let mut sqlx_query = sqlx::query(query);
                
                for param in params {
                    sqlx_query = bind_param_postgres(sqlx_query, param)?;
                }
                
                let result = sqlx_query.execute(pool).await?;
                Ok(result.rows_affected())
            }
        }
    }
    
    async fn begin_transaction(&self) -> Result<Box<dyn Transaction>> {
        match &self.pool {
            ConnectionPool::Sqlite(pool) => {
                let tx = pool.begin().await?;
                Ok(Box::new(SqliteTransaction { tx }))
            }
            ConnectionPool::Postgres(pool) => {
                let tx = pool.begin().await?;
                Ok(Box::new(PostgresTransaction { tx }))
            }
        }
    }
    
    async fn health_check(&self) -> Result<()> {
        match &self.pool {
            ConnectionPool::Sqlite(pool) => {
                sqlx::query("SELECT 1").fetch_one(pool).await?;
                Ok(())
            }
            ConnectionPool::Postgres(pool) => {
                sqlx::query("SELECT 1").fetch_one(pool).await?;
                Ok(())
            }
        }
    }
    
    fn database_type(&self) -> DatabaseType {
        self.config.database_type.clone()
    }
}

/// SQLite transaction implementation
struct SqliteTransaction {
    tx: sqlx::Transaction<'static, Sqlite>,
}

#[async_trait]
impl Transaction for SqliteTransaction {
    async fn commit(self: Box<Self>) -> Result<()> {
        self.tx.commit().await?;
        Ok(())
    }
    
    async fn rollback(self: Box<Self>) -> Result<()> {
        self.tx.rollback().await?;
        Ok(())
    }
    
    async fn query_raw(&mut self, query: &str, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        let mut sqlx_query = sqlx::query(query);
        
        for param in params {
            sqlx_query = bind_param_sqlite(sqlx_query, param)?;
        }
        
        let rows = sqlx_query.fetch_all(&mut *self.tx).await?;
        
        let mut results = Vec::new();
        for row in rows {
            let mut json_row = serde_json::Map::new();
            for (i, column) in row.columns().iter().enumerate() {
                let value = sqlite_row_to_json(&row, i)?;
                json_row.insert(column.name().to_string(), value);
            }
            results.push(serde_json::Value::Object(json_row));
        }
        
        Ok(results)
    }
    
    async fn execute_raw(&mut self, query: &str, params: Vec<serde_json::Value>) -> Result<u64> {
        let mut sqlx_query = sqlx::query(query);
        
        for param in params {
            sqlx_query = bind_param_sqlite(sqlx_query, param)?;
        }
        
        let result = sqlx_query.execute(&mut *self.tx).await?;
        Ok(result.rows_affected())
    }
}

/// PostgreSQL transaction implementation
struct PostgresTransaction {
    tx: sqlx::Transaction<'static, Postgres>,
}

#[async_trait]
impl Transaction for PostgresTransaction {
    async fn commit(self: Box<Self>) -> Result<()> {
        self.tx.commit().await?;
        Ok(())
    }
    
    async fn rollback(self: Box<Self>) -> Result<()> {
        self.tx.rollback().await?;
        Ok(())
    }
    
    async fn query_raw(&mut self, query: &str, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>> {
        let mut sqlx_query = sqlx::query(query);
        
        for param in params {
            sqlx_query = bind_param_postgres(sqlx_query, param)?;
        }
        
        let rows = sqlx_query.fetch_all(&mut *self.tx).await?;
        
        let mut results = Vec::new();
        for row in rows {
            let mut json_row = serde_json::Map::new();
            for (i, column) in row.columns().iter().enumerate() {
                let value = postgres_row_to_json(&row, i)?;
                json_row.insert(column.name().to_string(), value);
            }
            results.push(serde_json::Value::Object(json_row));
        }
        
        Ok(results)
    }
    
    async fn execute_raw(&mut self, query: &str, params: Vec<serde_json::Value>) -> Result<u64> {
        let mut sqlx_query = sqlx::query(query);
        
        for param in params {
            sqlx_query = bind_param_postgres(sqlx_query, param)?;
        }
        
        let result = sqlx_query.execute(&mut *self.tx).await?;
        Ok(result.rows_affected())
    }
}

// Helper functions for parameter binding
fn bind_param_sqlite<'q>(
    query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    param: serde_json::Value,
) -> Result<sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>> {
    Ok(match param {
        serde_json::Value::String(s) => query.bind(s),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                return Err(DatabaseError::QueryError("Invalid number parameter".to_string()));
            }
        }
        serde_json::Value::Bool(b) => query.bind(b),
        serde_json::Value::Null => query.bind(None::<String>),
        _ => return Err(DatabaseError::QueryError("Unsupported parameter type".to_string())),
    })
}

fn bind_param_postgres<'q>(
    query: sqlx::query::Query<'q, Postgres, sqlx::postgres::PgArguments>,
    param: serde_json::Value,
) -> Result<sqlx::query::Query<'q, Postgres, sqlx::postgres::PgArguments>> {
    Ok(match param {
        serde_json::Value::String(s) => query.bind(s),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                return Err(DatabaseError::QueryError("Invalid number parameter".to_string()));
            }
        }
        serde_json::Value::Bool(b) => query.bind(b),
        serde_json::Value::Null => query.bind(None::<String>),
        _ => return Err(DatabaseError::QueryError("Unsupported parameter type".to_string())),
    })
}

// Helper functions for row conversion
fn sqlite_row_to_json(row: &sqlx::sqlite::SqliteRow, index: usize) -> Result<serde_json::Value> {
    use sqlx::TypeInfo;
    use sqlx::sqlite::SqliteTypeInfo;
    
    let type_info = row.column(index).type_info();
    let type_name = type_info.name();
    
    match type_name {
        "TEXT" => {
            let value: Option<String> = row.try_get(index)?;
            Ok(value.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null))
        }
        "INTEGER" | "BIGINT" => {
            let value: Option<i64> = row.try_get(index)?;
            Ok(value.map(|v| serde_json::Value::Number(v.into())).unwrap_or(serde_json::Value::Null))
        }
        "REAL" | "DOUBLE" => {
            let value: Option<f64> = row.try_get(index)?;
            Ok(value.and_then(|v| serde_json::Number::from_f64(v))
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null))
        }
        "BOOLEAN" => {
            let value: Option<bool> = row.try_get(index)?;
            Ok(value.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null))
        }
        _ => {
            // Try to get as string for unknown types
            let value: Option<String> = row.try_get(index).ok();
            Ok(value.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null))
        }
    }
}

fn postgres_row_to_json(row: &sqlx::postgres::PgRow, index: usize) -> Result<serde_json::Value> {
    use sqlx::TypeInfo;
    use sqlx::postgres::PgTypeInfo;
    
    let type_info = row.column(index).type_info();
    let type_name = type_info.name();
    
    match type_name {
        "TEXT" | "VARCHAR" | "CHAR" => {
            let value: Option<String> = row.try_get(index)?;
            Ok(value.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null))
        }
        "INT2" | "INT4" | "INT8" => {
            let value: Option<i64> = row.try_get(index)?;
            Ok(value.map(|v| serde_json::Value::Number(v.into())).unwrap_or(serde_json::Value::Null))
        }
        "FLOAT4" | "FLOAT8" => {
            let value: Option<f64> = row.try_get(index)?;
            Ok(value.and_then(|v| serde_json::Number::from_f64(v))
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null))
        }
        "BOOL" => {
            let value: Option<bool> = row.try_get(index)?;
            Ok(value.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null))
        }
        _ => {
            // Try to get as string for unknown types
            let value: Option<String> = row.try_get(index).ok();
            Ok(value.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null))
        }
    }
}