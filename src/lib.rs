#![deny(clippy::all)]

use napi_derive::napi;

mod error;
mod event_emitter;
mod peer;
mod peer_pool;
mod peer_pool_napi;
mod protocol;
mod tls;

pub use event_emitter::ChiaBlockListener;
pub use peer_pool_napi::ChiaPeerPool;

#[napi]
pub fn init_tracing() {
    // Initialize logging with a filter for our crate
    use tracing_subscriber::{filter::LevelFilter, fmt, EnvFilter};

    let filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy()
        .add_directive("chia_block_listener=debug".parse().unwrap());

    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(true)
        .with_line_number(true)
        .init();
}
