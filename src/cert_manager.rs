use std::path::{Path, PathBuf};
use std::fs;
use anyhow::{Result, Context};
use tracing::{info, debug};

#[derive(Clone)]
pub struct ChiaCerts {
    pub cert: Vec<u8>,
    pub key: Vec<u8>,
    pub ca: Vec<u8>,
}

pub fn load_chia_certs(network: &str) -> Result<ChiaCerts> {
    let chia_root = find_chia_root(network)?;
    info!("Loading certificates from: {}", chia_root.display());
    
    let cert_path = chia_root.join("config/ssl/full_node/private_full_node.crt");
    let key_path = chia_root.join("config/ssl/full_node/private_full_node.key");
    let ca_path = chia_root.join("config/ssl/ca/chia_ca.crt");
    
    let cert = fs::read(&cert_path)
        .with_context(|| format!("Failed to read cert from {}", cert_path.display()))?;
    let key = fs::read(&key_path)
        .with_context(|| format!("Failed to read key from {}", key_path.display()))?;
    let ca = fs::read(&ca_path)
        .with_context(|| format!("Failed to read CA from {}", ca_path.display()))?;
    
    Ok(ChiaCerts { cert, key, ca })
}

fn find_chia_root(network: &str) -> Result<PathBuf> {
    // Check environment variable first
    if let Ok(chia_root) = std::env::var("CHIA_ROOT") {
        let path = PathBuf::from(chia_root);
        if path.exists() {
            return Ok(path);
        }
    }
    
    // Otherwise use default location
    let home = dirs::home_dir()
        .context("Could not find home directory")?;
    
    let chia_dir = home.join(".chia").join(network);
    
    if !chia_dir.exists() {
        anyhow::bail!(
            "Chia directory not found at {}. Please ensure Chia is installed or set CHIA_ROOT", 
            chia_dir.display()
        );
    }
    
    Ok(chia_dir)
}

// Helper to get the home directory
mod dirs {
    use std::path::PathBuf;
    
    pub fn home_dir() -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            std::env::var("USERPROFILE").ok().map(PathBuf::from)
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("HOME").ok().map(PathBuf::from)
        }
    }
}