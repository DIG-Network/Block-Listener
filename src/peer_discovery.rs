use std::net::{SocketAddr, ToSocketAddrs};
use tracing::{info, warn, error};
use anyhow::Result;

const DNS_INTRODUCERS: &[&str] = &[
    "dns-introducer.chia.net",
    "chia.ctrlaltdel.ch", 
    "seeder.dexie.space",
    "chia.hoffmang.com",
];

const DEFAULT_PORT: u16 = 8444;

pub async fn discover_peers(network: &str) -> Result<Vec<SocketAddr>> {
    let mut all_peers = Vec::new();
    
    for introducer in DNS_INTRODUCERS {
        match resolve_introducer(introducer).await {
            Ok(peers) => {
                info!("Found {} peers from {}", peers.len(), introducer);
                all_peers.extend(peers);
            }
            Err(e) => {
                warn!("Failed to resolve {}: {}", introducer, e);
            }
        }
    }
    
    // Deduplicate peers
    all_peers.sort();
    all_peers.dedup();
    
    info!("Discovered {} unique peers total", all_peers.len());
    Ok(all_peers)
}

async fn resolve_introducer(host: &str) -> Result<Vec<SocketAddr>> {
    let addr_string = format!("{}:{}", host, DEFAULT_PORT);
    let addrs: Vec<SocketAddr> = addr_string
        .to_socket_addrs()?
        .collect();
    
    Ok(addrs)
}