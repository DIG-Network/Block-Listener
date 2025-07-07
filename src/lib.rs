#![deny(clippy::all)]

use napi_derive::napi;

mod peer;
mod protocol;
mod event_emitter;
mod error;
mod tls;

pub use error::ChiaError;
pub use event_emitter::ChiaBlockListener;

#[napi]
pub fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}