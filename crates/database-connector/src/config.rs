//! Configuration types for the database connector

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    Sqlite,
    Postgres,
}

impl Default for DatabaseType {
    fn default() -> Self {
        DatabaseType::Sqlite
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    #[serde(default)]
    pub database_type: DatabaseType,
    
    // SQLite specific
    pub sqlite_path: Option<PathBuf>,
    
    // PostgreSQL specific
    pub postgres_host: Option<String>,
    pub postgres_port: Option<u16>,
    pub postgres_user: Option<String>,
    pub postgres_password: Option<String>,
    pub postgres_database: Option<String>,
    
    // Connection pool settings
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
    
    #[serde(default = "default_min_connections")]
    pub min_connections: u32,
    
    #[serde(default = "default_connection_timeout")]
    pub connection_timeout_seconds: u64,
    
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_seconds: u64,
}

fn default_max_connections() -> u32 {
    10
}

fn default_min_connections() -> u32 {
    1
}

fn default_connection_timeout() -> u64 {
    30
}

fn default_idle_timeout() -> u64 {
    600
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            database_type: DatabaseType::default(),
            sqlite_path: Some(PathBuf::from("database.db")),
            postgres_host: None,
            postgres_port: None,
            postgres_user: None,
            postgres_password: None,
            postgres_database: None,
            max_connections: default_max_connections(),
            min_connections: default_min_connections(),
            connection_timeout_seconds: default_connection_timeout(),
            idle_timeout_seconds: default_idle_timeout(),
        }
    }
}

impl DatabaseConfig {
    /// Create a new SQLite configuration
    pub fn sqlite(path: impl Into<PathBuf>) -> Self {
        Self {
            database_type: DatabaseType::Sqlite,
            sqlite_path: Some(path.into()),
            ..Default::default()
        }
    }
    
    /// Create a new PostgreSQL configuration
    pub fn postgres(
        host: impl Into<String>,
        port: u16,
        user: impl Into<String>,
        password: impl Into<String>,
        database: impl Into<String>,
    ) -> Self {
        Self {
            database_type: DatabaseType::Postgres,
            postgres_host: Some(host.into()),
            postgres_port: Some(port),
            postgres_user: Some(user.into()),
            postgres_password: Some(password.into()),
            postgres_database: Some(database.into()),
            ..Default::default()
        }
    }
    
    /// Get the connection URL based on the database type
    pub fn connection_url(&self) -> crate::Result<String> {
        match self.database_type {
            DatabaseType::Sqlite => {
                let path = self.sqlite_path.as_ref()
                    .ok_or_else(|| crate::DatabaseError::ConfigError(
                        "SQLite path not specified".to_string()
                    ))?;
                Ok(format!("sqlite://{}", path.display()))
            }
            DatabaseType::Postgres => {
                let host = self.postgres_host.as_ref()
                    .ok_or_else(|| crate::DatabaseError::ConfigError(
                        "PostgreSQL host not specified".to_string()
                    ))?;
                let port = self.postgres_port
                    .unwrap_or(5432);
                let user = self.postgres_user.as_ref()
                    .ok_or_else(|| crate::DatabaseError::ConfigError(
                        "PostgreSQL user not specified".to_string()
                    ))?;
                let password = self.postgres_password.as_ref()
                    .ok_or_else(|| crate::DatabaseError::ConfigError(
                        "PostgreSQL password not specified".to_string()
                    ))?;
                let database = self.postgres_database.as_ref()
                    .ok_or_else(|| crate::DatabaseError::ConfigError(
                        "PostgreSQL database not specified".to_string()
                    ))?;
                Ok(format!(
                    "postgres://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                ))
            }
        }
    }
}