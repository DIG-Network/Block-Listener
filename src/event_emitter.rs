use crate::{error::Result, types::BlockEvent};
use std::sync::Arc;
use tokio::sync::mpsc;

#[derive(Clone)]
pub struct BlockEventEmitter {
    sender: Arc<mpsc::UnboundedSender<(String, BlockEvent)>>,
}

impl BlockEventEmitter {
    pub fn new() -> Self {
        let (sender, _receiver) = mpsc::unbounded_channel();
        Self {
            sender: Arc::new(sender),
        }
    }
    
    pub fn new_with_sender(sender: mpsc::UnboundedSender<(String, BlockEvent)>) -> Self {
        Self {
            sender: Arc::new(sender),
        }
    }

    pub fn emit(&self, event: String, data: BlockEvent) -> Result<()> {
        self.sender
            .send((event, data))
            .map_err(|_| crate::error::Error::EventEmitter("Failed to send event".to_string()))?;
        Ok(())
    }
}