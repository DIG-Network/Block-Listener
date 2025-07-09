//! Integration tests for the database-connector crate

use database_connector::{
    DatabaseConfig, DatabaseConnection, DatabaseOperations,
    config::DatabaseType,
};
use serde_json::json;
use std::path::PathBuf;

#[tokio::test]
async fn test_sqlite_connection() {
    let config = DatabaseConfig::sqlite(":memory:");
    let conn = DatabaseConnection::new(config).await.unwrap();
    
    // Test health check
    conn.health_check().await.unwrap();
    
    // Test database type
    assert!(matches!(conn.database_type(), DatabaseType::Sqlite));
    
    conn.close().await.unwrap();
}

#[tokio::test]
async fn test_sqlite_create_table_and_insert() {
    let config = DatabaseConfig::sqlite(":memory:");
    let conn = DatabaseConnection::new(config).await.unwrap();
    
    // Create table
    let result = conn.execute_raw(
        "CREATE TABLE test_table (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            value INTEGER
        )",
        vec![],
    ).await.unwrap();
    
    assert_eq!(result, 0);
    
    // Insert data
    let rows_affected = conn.execute_raw(
        "INSERT INTO test_table (name, value) VALUES (?, ?)",
        vec![json!("test"), json!(42)],
    ).await.unwrap();
    
    assert_eq!(rows_affected, 1);
    
    conn.close().await.unwrap();
}

#[tokio::test]
async fn test_sqlite_query() {
    let config = DatabaseConfig::sqlite(":memory:");
    let conn = DatabaseConnection::new(config).await.unwrap();
    
    // Create and populate table
    conn.execute_raw(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
        vec![],
    ).await.unwrap();
    
    conn.execute_raw(
        "INSERT INTO users (name, age) VALUES (?, ?), (?, ?), (?, ?)",
        vec![
            json!("Alice"), json!(30),
            json!("Bob"), json!(25),
            json!("Charlie"), json!(35),
        ],
    ).await.unwrap();
    
    // Query data
    let results = conn.query_raw(
        "SELECT * FROM users WHERE age > ? ORDER BY age",
        vec![json!(25)],
    ).await.unwrap();
    
    assert_eq!(results.len(), 2);
    
    // Check first result
    let first = &results[0];
    assert_eq!(first.get("name"), Some(&json!("Alice")));
    assert_eq!(first.get("age"), Some(&json!(30)));
    
    conn.close().await.unwrap();
}

#[tokio::test]
async fn test_sqlite_transaction_commit() {
    let config = DatabaseConfig::sqlite(":memory:");
    let conn = DatabaseConnection::new(config).await.unwrap();
    
    // Create table
    conn.execute_raw(
        "CREATE TABLE test_tx (id INTEGER PRIMARY KEY, value TEXT)",
        vec![],
    ).await.unwrap();
    
    // Begin transaction
    let mut tx = conn.begin_transaction().await.unwrap();
    
    // Insert data in transaction
    tx.execute_raw(
        "INSERT INTO test_tx (value) VALUES (?)",
        vec![json!("test_value")],
    ).await.unwrap();
    
    // Commit transaction
    tx.commit().await.unwrap();
    
    // Verify data was committed
    let results = conn.query_raw("SELECT * FROM test_tx", vec![]).await.unwrap();
    assert_eq!(results.len(), 1);
    
    conn.close().await.unwrap();
}

#[tokio::test]
async fn test_sqlite_transaction_rollback() {
    let config = DatabaseConfig::sqlite(":memory:");
    let conn = DatabaseConnection::new(config).await.unwrap();
    
    // Create table
    conn.execute_raw(
        "CREATE TABLE test_rollback (id INTEGER PRIMARY KEY, value TEXT)",
        vec![],
    ).await.unwrap();
    
    // Begin transaction
    let mut tx = conn.begin_transaction().await.unwrap();
    
    // Insert data in transaction
    tx.execute_raw(
        "INSERT INTO test_rollback (value) VALUES (?)",
        vec![json!("should_be_rolled_back")],
    ).await.unwrap();
    
    // Rollback transaction
    tx.rollback().await.unwrap();
    
    // Verify data was not committed
    let results = conn.query_raw("SELECT * FROM test_rollback", vec![]).await.unwrap();
    assert_eq!(results.len(), 0);
    
    conn.close().await.unwrap();
}

#[tokio::test]
async fn test_config_default() {
    let config = DatabaseConfig::default();
    assert!(matches!(config.database_type, DatabaseType::Sqlite));
    assert_eq!(config.sqlite_path, Some(PathBuf::from("database.db")));
    assert_eq!(config.max_connections, 10);
    assert_eq!(config.min_connections, 1);
}

#[tokio::test]
async fn test_config_sqlite() {
    let config = DatabaseConfig::sqlite("custom.db");
    assert!(matches!(config.database_type, DatabaseType::Sqlite));
    assert_eq!(config.sqlite_path, Some(PathBuf::from("custom.db")));
}

#[tokio::test]
async fn test_config_postgres() {
    let config = DatabaseConfig::postgres("localhost", 5432, "user", "pass", "db");
    assert!(matches!(config.database_type, DatabaseType::Postgres));
    assert_eq!(config.postgres_host, Some("localhost".to_string()));
    assert_eq!(config.postgres_port, Some(5432));
    assert_eq!(config.postgres_user, Some("user".to_string()));
    assert_eq!(config.postgres_password, Some("pass".to_string()));
    assert_eq!(config.postgres_database, Some("db".to_string()));
}

#[tokio::test]
async fn test_connection_url_sqlite() {
    let config = DatabaseConfig::sqlite("test.db");
    let url = config.connection_url().unwrap();
    assert_eq!(url, "sqlite://test.db");
}

#[tokio::test]
async fn test_connection_url_postgres() {
    let config = DatabaseConfig::postgres("localhost", 5432, "user", "pass", "testdb");
    let url = config.connection_url().unwrap();
    assert_eq!(url, "postgres://user:pass@localhost:5432/testdb");
}

#[tokio::test]
async fn test_query_builder() {
    use database_connector::traits::{SelectQuery, InsertQuery, UpdateQuery, DeleteQuery};
    
    // Test SELECT query builder
    let select = SelectQuery::new("users")
        .columns(vec!["id", "name", "email"])
        .where_clause("age > 18")
        .order_by("name", false)
        .limit(10)
        .offset(5);
    
    assert_eq!(
        select.build(),
        "SELECT id, name, email FROM users WHERE age > 18 ORDER BY name ASC LIMIT 10 OFFSET 5"
    );
    
    // Test INSERT query builder
    let insert = InsertQuery::new("users")
        .columns(vec!["name", "email"])
        .values(vec!["'John'", "'john@example.com'"]);
    
    assert_eq!(
        insert.build(),
        "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')"
    );
    
    // Test UPDATE query builder
    let update = UpdateQuery::new("users")
        .set("name", "'Jane'")
        .set("email", "'jane@example.com'")
        .where_clause("id = 1");
    
    assert_eq!(
        update.build(),
        "UPDATE users SET name = 'Jane', email = 'jane@example.com' WHERE id = 1"
    );
    
    // Test DELETE query builder
    let delete = DeleteQuery::new("users")
        .where_clause("active = false");
    
    assert_eq!(
        delete.build(),
        "DELETE FROM users WHERE active = false"
    );
}