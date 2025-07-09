//! Basic usage example for the database-connector crate

use database_connector::{
    DatabaseConfig, DatabaseConnection, DatabaseOperations, QueryBuilder,
    config::DatabaseType,
    traits::{SelectQuery, InsertQuery, UpdateQuery, DeleteQuery},
};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Example 1: Using SQLite (default)
    println!("=== SQLite Example ===");
    sqlite_example().await?;
    
    // Example 2: Using PostgreSQL
    // Uncomment the following line to test PostgreSQL
    // println!("\n=== PostgreSQL Example ===");
    // postgres_example().await?;
    
    Ok(())
}

async fn sqlite_example() -> Result<(), Box<dyn std::error::Error>> {
    // Create a SQLite configuration
    let config = DatabaseConfig::sqlite("test.db");
    
    // Create a connection
    let conn = DatabaseConnection::new(config).await?;
    
    // Create a table
    conn.execute_raw(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            age INTEGER,
            active BOOLEAN DEFAULT 1
        )",
        vec![],
    ).await?;
    
    println!("Table created successfully");
    
    // Insert data using raw SQL
    let rows_affected = conn.execute_raw(
        "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
        vec![
            json!("Alice"),
            json!("alice@example.com"),
            json!(30),
        ],
    ).await?;
    
    println!("Inserted {} row(s)", rows_affected);
    
    // Insert more data
    conn.execute_raw(
        "INSERT INTO users (name, email, age) VALUES (?, ?, ?), (?, ?, ?)",
        vec![
            json!("Bob"),
            json!("bob@example.com"),
            json!(25),
            json!("Charlie"),
            json!("charlie@example.com"),
            json!(35),
        ],
    ).await?;
    
    // Query data
    let users = conn.query_raw(
        "SELECT * FROM users WHERE age > ?",
        vec![json!(20)],
    ).await?;
    
    println!("\nUsers older than 20:");
    for user in &users {
        println!("{}", serde_json::to_string_pretty(user)?);
    }
    
    // Using transactions
    let mut tx = conn.begin_transaction().await?;
    
    tx.execute_raw(
        "UPDATE users SET age = age + 1 WHERE name = ?",
        vec![json!("Alice")],
    ).await?;
    
    tx.execute_raw(
        "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
        vec![
            json!("David"),
            json!("david@example.com"),
            json!(40),
        ],
    ).await?;
    
    // Commit the transaction
    tx.commit().await?;
    
    println!("\nTransaction committed successfully");
    
    // Query all users
    let all_users = conn.query_raw("SELECT * FROM users", vec![]).await?;
    
    println!("\nAll users:");
    for user in &all_users {
        println!("{}", serde_json::to_string_pretty(user)?);
    }
    
    // Using query builder
    let select_query = SelectQuery::new("users")
        .columns(vec!["name", "email", "age"])
        .where_clause("age >= 30")
        .order_by("age", true)
        .limit(5);
    
    println!("\nGenerated SELECT query: {}", select_query.build());
    
    let insert_query = InsertQuery::new("users")
        .columns(vec!["name", "email", "age"])
        .values(vec!["'Eve'", "'eve@example.com'", "28"]);
    
    println!("Generated INSERT query: {}", insert_query.build());
    
    let update_query = UpdateQuery::new("users")
        .set("active", "0")
        .where_clause("age < 25");
    
    println!("Generated UPDATE query: {}", update_query.build());
    
    let delete_query = DeleteQuery::new("users")
        .where_clause("active = 0");
    
    println!("Generated DELETE query: {}", delete_query.build());
    
    // Health check
    conn.health_check().await?;
    println!("\nDatabase health check passed");
    
    // Close the connection
    conn.close().await?;
    
    Ok(())
}

async fn postgres_example() -> Result<(), Box<dyn std::error::Error>> {
    // Create a PostgreSQL configuration
    let config = DatabaseConfig::postgres(
        "localhost",
        5432,
        "postgres",
        "password",
        "testdb",
    );
    
    // Create a connection
    let conn = DatabaseConnection::new(config).await?;
    
    // Create a table
    conn.execute_raw(
        "CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2),
            in_stock BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        vec![],
    ).await?;
    
    println!("Table created successfully");
    
    // Insert data
    let rows_affected = conn.execute_raw(
        "INSERT INTO products (name, description, price) VALUES ($1, $2, $3)",
        vec![
            json!("Laptop"),
            json!("High-performance laptop"),
            json!(999.99),
        ],
    ).await?;
    
    println!("Inserted {} row(s)", rows_affected);
    
    // Query data
    let products = conn.query_raw(
        "SELECT * FROM products WHERE price < $1",
        vec![json!(1500.00)],
    ).await?;
    
    println!("\nProducts under $1500:");
    for product in &products {
        println!("{}", serde_json::to_string_pretty(product)?);
    }
    
    // Using transactions with rollback
    let mut tx = conn.begin_transaction().await?;
    
    tx.execute_raw(
        "INSERT INTO products (name, description, price) VALUES ($1, $2, $3)",
        vec![
            json!("Mouse"),
            json!("Wireless mouse"),
            json!(29.99),
        ],
    ).await?;
    
    // Rollback the transaction
    tx.rollback().await?;
    
    println!("\nTransaction rolled back");
    
    // Check database type
    match conn.database_type() {
        DatabaseType::Postgres => println!("Connected to PostgreSQL"),
        DatabaseType::Sqlite => println!("Connected to SQLite"),
    }
    
    // Close the connection
    conn.close().await?;
    
    Ok(())
}