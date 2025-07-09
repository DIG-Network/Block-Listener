//! Event system for the block indexer

use crate::error::Result;
use crate::models::{CoinsUpdatedEvent, BalanceUpdatedEvent};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use serde::Serialize;

/// Event types that can be emitted by the indexer
#[derive(Debug, Clone, Serialize)]
pub enum IndexerEvent {
    CoinsUpdated(CoinsUpdatedEvent),
    BalanceUpdated(BalanceUpdatedEvent),
}

/// Event emitter for broadcasting indexer events
#[derive(Clone)]
pub struct EventEmitter {
    sender: broadcast::Sender<IndexerEvent>,
    subscribers: Arc<RwLock<Vec<String>>>,
}

impl EventEmitter {
    /// Create a new event emitter with the specified channel capacity
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            sender,
            subscribers: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    /// Emit a coins updated event
    pub async fn emit_coins_updated(&self, event: CoinsUpdatedEvent) -> Result<()> {
        let event = IndexerEvent::CoinsUpdated(event);
        self.emit(event).await
    }
    
    /// Emit a balance updated event
    pub async fn emit_balance_updated(&self, event: BalanceUpdatedEvent) -> Result<()> {
        let event = IndexerEvent::BalanceUpdated(event);
        self.emit(event).await
    }
    
    /// Emit an event to all subscribers
    async fn emit(&self, event: IndexerEvent) -> Result<()> {
        match self.sender.send(event) {
            Ok(count) => {
                log::debug!("Event sent to {} subscribers", count);
                Ok(())
            }
            Err(_) => {
                log::debug!("No active subscribers for event");
                Ok(())
            }
        }
    }
    
    /// Subscribe to events
    pub fn subscribe(&self) -> broadcast::Receiver<IndexerEvent> {
        self.sender.subscribe()
    }
    
    /// Get the number of active subscribers
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for EventEmitter {
    fn default() -> Self {
        Self::new(1000)
    }
}

/// Event subscriber for receiving indexer events
pub struct EventSubscriber {
    receiver: broadcast::Receiver<IndexerEvent>,
}

impl EventSubscriber {
    /// Create a new event subscriber from an emitter
    pub fn new(emitter: &EventEmitter) -> Self {
        Self {
            receiver: emitter.subscribe(),
        }
    }
    
    /// Receive the next event
    pub async fn recv(&mut self) -> Result<IndexerEvent> {
        self.receiver.recv().await
            .map_err(|e| crate::error::BlockIndexerError::EventSystem(e.to_string()))
    }
    
    /// Try to receive the next event without blocking
    pub fn try_recv(&mut self) -> Result<Option<IndexerEvent>> {
        match self.receiver.try_recv() {
            Ok(event) => Ok(Some(event)),
            Err(broadcast::error::TryRecvError::Empty) => Ok(None),
            Err(e) => Err(crate::error::BlockIndexerError::EventSystem(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Coin, BalanceUpdate};
    
    #[tokio::test]
    async fn test_event_emitter() {
        let emitter = EventEmitter::new(10);
        let mut subscriber = EventSubscriber::new(&emitter);
        
        // Emit a coins updated event
        let event = CoinsUpdatedEvent {
            height: 100,
            puzzle_hashes: vec!["ph1".to_string()],
            additions: vec![],
            removals: vec![],
        };
        
        emitter.emit_coins_updated(event.clone()).await.unwrap();
        
        // Receive the event
        let received = subscriber.recv().await.unwrap();
        match received {
            IndexerEvent::CoinsUpdated(e) => {
                assert_eq!(e.height, event.height);
                assert_eq!(e.puzzle_hashes, event.puzzle_hashes);
            }
            _ => panic!("Unexpected event type"),
        }
    }
}