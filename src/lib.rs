#![deny(clippy::all)]

use napi_derive::napi;
use napi::{threadsafe_function::{ThreadsafeFunction, ErrorStrategy}, JsFunction};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

mod client;
mod database;
mod error;
mod event_emitter;
mod handshake;
mod types;

use client::ChiaClient;
pub use error::{Error, Result};
use event_emitter::BlockEventEmitter;
use types::BlockEvent;

#[napi]
pub struct ChiaBlockListener {
    client: Option<ChiaClient>,
    emitter: BlockEventEmitter,
    listeners: Arc<Mutex<HashMap<String, ThreadsafeFunction<BlockEvent, ErrorStrategy::Fatal>>>>,
    event_task: Option<tokio::task::JoinHandle<()>>,
}

#[napi]
impl ChiaBlockListener {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            client: None,
            emitter: BlockEventEmitter::new(),
            listeners: Arc::new(Mutex::new(HashMap::new())),
            event_task: None,
        }
    }

    #[napi]
    pub async unsafe fn connect(
        &mut self,
        host: String,
        port: u16,
        network_id: String,
        cert_path: Option<String>,
        key_path: Option<String>,
    ) -> napi::Result<()> {
        let client = ChiaClient::connect(host, port, network_id, cert_path, key_path)
            .await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        self.client = Some(client);
        Ok(())
    }

    #[napi]
    pub async unsafe fn start_listening(&mut self) -> napi::Result<()> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Not connected"))?;

        // Create a new receiver for events
        let (sender, mut receiver) = mpsc::unbounded_channel::<(String, BlockEvent)>();
        let emitter = BlockEventEmitter::new_with_sender(sender);

        // Start listening
        client
            .start_listening(emitter)
            .await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        // Start the event forwarding task
        let listeners = self.listeners.clone();
        let task = tokio::spawn(async move {
            while let Some((event_name, data)) = receiver.recv().await {
                let listeners = listeners.lock().unwrap();
                if let Some(callback) = listeners.get(&event_name) {
                    callback.call(data, napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking);
                }
            }
        });

        self.event_task = Some(task);
        Ok(())
    }

    #[napi(ts_args_type = "event: string, callback: (data: BlockEvent) => void")]
    pub fn on(&mut self, event: String, callback: JsFunction) -> napi::Result<()> {
        let tsfn: ThreadsafeFunction<BlockEvent, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| {
                Ok(vec![ctx.value])
            })?;
        
        let mut listeners = self.listeners.lock().unwrap();
        listeners.insert(event, tsfn);
        Ok(())
    }

    #[napi]
    pub fn off(&self, event: String) -> napi::Result<()> {
        let mut listeners = self.listeners.lock().unwrap();
        listeners.remove(&event);
        Ok(())
    }

    #[napi]
    pub async fn get_block_count(&self) -> napi::Result<u32> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Not connected"))?;

        client
            .get_block_count()
            .await
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async unsafe fn disconnect(&mut self) -> napi::Result<()> {
        // Cancel the event task
        if let Some(task) = self.event_task.take() {
            task.abort();
        }

        if let Some(client) = self.client.take() {
            client
                .disconnect()
                .await
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        }
        Ok(())
    }
}