#![deny(clippy::all)]

use napi_derive::napi;

mod error_conversion;
mod event_emitter;

pub use event_emitter::ChiaBlockListener;

#[napi]
pub fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}