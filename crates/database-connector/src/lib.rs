//! Database Connector Crate
//! 
//! This crate provides an abstraction over SQLite and PostgreSQL databases,
//! allowing for easy switching between the two backends.

pub mod config;
pub mod connection;
pub mod error;
pub mod models;
pub mod traits;

// Re-export main types
pub use config::{DatabaseConfig, DatabaseType};
pub use connection::{DatabaseConnection, ConnectionPool};
pub use error::{DatabaseError, Result};
pub use traits::{DatabaseOperations, QueryBuilder};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        // Basic test to ensure the crate compiles
        assert_eq!(2 + 2, 4);
    }
}