use crate::event_emitter::{BlockReceivedEvent, PeerConnectedEvent, PeerDisconnectedEvent};
use crate::peer_pool::{ChiaPeerPool as InternalPeerPool, NewPeakHeightEvent};
use napi::bindgen_prelude::*;
use napi::{
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction,
};
use napi_derive::napi;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

#[napi]
pub struct ChiaPeerPool {
    pool: Arc<InternalPeerPool>,
    listeners: Arc<RwLock<EventListeners>>,
}

struct EventListeners {
    peer_connected_listeners: Vec<ThreadsafeFunction<PeerConnectedEvent, ErrorStrategy::Fatal>>,
    peer_disconnected_listeners:
        Vec<ThreadsafeFunction<PeerDisconnectedEvent, ErrorStrategy::Fatal>>,
    new_peak_height_listeners: Vec<ThreadsafeFunction<NewPeakHeightEvent, ErrorStrategy::Fatal>>,
}

#[napi]
impl ChiaPeerPool {
    #[napi(constructor)]
    pub fn new() -> Self {
        info!("Creating new ChiaPeerPool");
        let listeners = Arc::new(RwLock::new(EventListeners {
            peer_connected_listeners: Vec::new(),
            peer_disconnected_listeners: Vec::new(),
            new_peak_height_listeners: Vec::new(),
        }));

        let pool = Arc::new(InternalPeerPool::new());

        // Set event callbacks on the pool
        let listeners_connected = listeners.clone();
        let listeners_disconnected = listeners.clone();
        let listeners_new_peak = listeners.clone();

        pool.set_event_callbacks(
            Box::new(move |event| {
                let listeners = listeners_connected.clone();
                tokio::spawn(async move {
                    let guard = listeners.read().await;
                    for listener in &guard.peer_connected_listeners {
                        listener.call(event.clone(), ThreadsafeFunctionCallMode::NonBlocking);
                    }
                });
            }),
            Box::new(move |event| {
                let listeners = listeners_disconnected.clone();
                tokio::spawn(async move {
                    let guard = listeners.read().await;
                    for listener in &guard.peer_disconnected_listeners {
                        listener.call(event.clone(), ThreadsafeFunctionCallMode::NonBlocking);
                    }
                });
            }),
            Box::new(move |event| {
                let listeners = listeners_new_peak.clone();
                tokio::spawn(async move {
                    let guard = listeners.read().await;
                    for listener in &guard.new_peak_height_listeners {
                        listener.call(event.clone(), ThreadsafeFunctionCallMode::NonBlocking);
                    }
                });
            }),
        );

        Self { pool, listeners }
    }

    #[napi]
    pub async fn add_peer(&self, host: String, port: u16, network_id: String) -> Result<String> {
        self.pool
            .add_peer(host, port, network_id)
            .await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to add peer: {e}")))
    }

    #[napi]
    pub async fn get_block_by_height(&self, height: u32) -> Result<BlockReceivedEvent> {
        self.pool
            .get_block_by_height(height as u64)
            .await
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get block: {e}")))
    }

    #[napi]
    pub async fn remove_peer(&self, peer_id: String) -> Result<bool> {
        self.pool.remove_peer(peer_id).await.map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to remove peer: {e}"),
            )
        })
    }

    #[napi]
    pub async fn shutdown(&self) -> Result<()> {
        self.pool.shutdown().await.map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to shutdown pool: {e}"),
            )
        })
    }

    #[napi]
    pub async fn get_connected_peers(&self) -> Result<Vec<String>> {
        self.pool.get_connected_peers().await.map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to get connected peers: {e}"),
            )
        })
    }

    #[napi]
    pub async fn get_peak_height(&self) -> Result<Option<u32>> {
        Ok(self.pool.get_highest_peak().await)
    }

    #[napi]
    pub fn on(&self, event: String, callback: JsFunction) -> Result<()> {
        let rt = tokio::runtime::Handle::current();

        match event.as_str() {
            "peerConnected" => {
                let tsfn = callback.create_threadsafe_function(0, |ctx| {
                    let event: &PeerConnectedEvent = &ctx.value;
                    let mut obj = ctx.env.create_object()?;
                    obj.set_named_property("peerId", ctx.env.create_string(&event.peer_id)?)?;
                    obj.set_named_property("host", ctx.env.create_string(&event.host)?)?;
                    obj.set_named_property("port", ctx.env.create_uint32(event.port)?)?;
                    Ok(vec![obj])
                })?;

                let mut guard = rt.block_on(self.listeners.write());
                guard.peer_connected_listeners.push(tsfn);
            }
            "peerDisconnected" => {
                let tsfn = callback.create_threadsafe_function(0, |ctx| {
                    let event: &PeerDisconnectedEvent = &ctx.value;
                    let mut obj = ctx.env.create_object()?;
                    obj.set_named_property("peerId", ctx.env.create_string(&event.peer_id)?)?;
                    obj.set_named_property("host", ctx.env.create_string(&event.host)?)?;
                    obj.set_named_property("port", ctx.env.create_uint32(event.port)?)?;
                    if let Some(msg) = &event.message {
                        obj.set_named_property("message", ctx.env.create_string(msg)?)?;
                    }
                    Ok(vec![obj])
                })?;

                let mut guard = rt.block_on(self.listeners.write());
                guard.peer_disconnected_listeners.push(tsfn);
            }
            "newPeakHeight" => {
                let tsfn = callback.create_threadsafe_function(0, |ctx| {
                    let event: &NewPeakHeightEvent = &ctx.value;
                    let mut obj = ctx.env.create_object()?;
                    match event.old_peak {
                        Some(old) => {
                            obj.set_named_property("oldPeak", ctx.env.create_uint32(old)?)?
                        }
                        None => obj.set_named_property("oldPeak", ctx.env.get_null()?)?,
                    }
                    obj.set_named_property("newPeak", ctx.env.create_uint32(event.new_peak)?)?;
                    obj.set_named_property("peerId", ctx.env.create_string(&event.peer_id)?)?;
                    Ok(vec![obj])
                })?;

                let mut guard = rt.block_on(self.listeners.write());
                guard.new_peak_height_listeners.push(tsfn);
            }
            _ => {
                return Err(Error::new(
                    Status::InvalidArg,
                    format!("Unknown event type: {event}"),
                ))
            }
        }

        Ok(())
    }

    #[napi]
    pub fn off(&self, event: String, _callback: JsFunction) -> Result<()> {
        let rt = tokio::runtime::Handle::current();
        let listeners = self.listeners.clone();

        rt.block_on(async {
            let mut guard = listeners.write().await;

            match event.as_str() {
                "peerConnected" => {
                    guard.peer_connected_listeners.clear();
                }
                "peerDisconnected" => {
                    guard.peer_disconnected_listeners.clear();
                }
                "newPeakHeight" => {
                    guard.new_peak_height_listeners.clear();
                }
                _ => {}
            }
        });

        Ok(())
    }
}

impl Default for ChiaPeerPool {
    fn default() -> Self {
        Self::new()
    }
}
