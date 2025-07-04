import { ChiaEventEmitter } from '../../../src/events/emitter';
import { ChiaBlock } from '../../../src/database/schema';

describe('ChiaEventEmitter', () => {
  let emitter: ChiaEventEmitter;
  let mockBlock: ChiaBlock;

  beforeEach(() => {
    emitter = ChiaEventEmitter.getInstance();
    
    // Clear all listeners before each test
    emitter.removeAllListeners();
    
    // Create mock block
    const baseBlock = {
      header_hash: '0x' + 'a'.repeat(64),
      height: 100,
      prev_header_hash: '0x' + 'b'.repeat(64),
      timestamp: '1234567890',
      weight: '1000',
      total_iters: '50000',
      signage_point_index: 0,
      is_transaction_block: false,
      transaction_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // Add getters and setters
    Object.defineProperty(baseBlock, 'weightBigInt', {
      get() { return BigInt(this.weight); },
      set(value: bigint) { this.weight = value.toString(); },
      enumerable: false,
      configurable: true
    });
    
    Object.defineProperty(baseBlock, 'totalItersBigInt', {
      get() { return BigInt(this.total_iters); },
      set(value: bigint) { this.total_iters = value.toString(); },
      enumerable: false,
      configurable: true
    });
    
    Object.defineProperty(baseBlock, 'timestampBigInt', {
      get() { return BigInt(this.timestamp); },
      set(value: bigint) { this.timestamp = value.toString(); },
      enumerable: false,
      configurable: true
    });
    
    mockBlock = baseBlock as ChiaBlock;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ChiaEventEmitter.getInstance();
      const instance2 = ChiaEventEmitter.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('event registration and emission', () => {
    it('should emit and receive block:new event', (done) => {
      emitter.on('block:new', (block) => {
        expect(block).toBe(mockBlock);
        done();
      });

      emitter.emit('block:new', mockBlock);
    });

    it('should emit and receive block:confirmed event', (done) => {
      emitter.on('block:confirmed', (block) => {
        expect(block).toBe(mockBlock);
        done();
      });

      emitter.emit('block:confirmed', mockBlock);
    });

    it('should emit and receive block:reorganized event', (done) => {
      const newBlock = { ...mockBlock, header_hash: '0x' + 'c'.repeat(64) };
      
      emitter.on('block:reorganized', (oldBlock, newBlockReceived) => {
        expect(oldBlock).toBe(mockBlock);
        expect(newBlockReceived).toBe(newBlock);
        done();
      });

      emitter.emit('block:reorganized', mockBlock, newBlock);
    });

    it('should emit and receive peer:connected event', (done) => {
      emitter.on('peer:connected', (peerId) => {
        expect(peerId).toBe('127.0.0.1:8444');
        done();
      });

      emitter.emit('peer:connected', '127.0.0.1:8444');
    });

    it('should emit and receive peer:disconnected event', (done) => {
      emitter.on('peer:disconnected', (peerId) => {
        expect(peerId).toBe('127.0.0.1:8444');
        done();
      });

      emitter.emit('peer:disconnected', '127.0.0.1:8444');
    });

    it('should emit and receive sync events', (done) => {
      let syncStarted = false;
      let progressReceived = false;

      emitter.on('sync:started', () => {
        syncStarted = true;
      });

      emitter.on('sync:progress', (current, total) => {
        expect(current).toBe(50);
        expect(total).toBe(100);
        progressReceived = true;
      });

      emitter.on('sync:completed', (height) => {
        expect(height).toBe(100);
        expect(syncStarted).toBe(true);
        expect(progressReceived).toBe(true);
        done();
      });

      emitter.emit('sync:started');
      emitter.emit('sync:progress', 50, 100);
      emitter.emit('sync:completed', 100);
    });

    it('should emit and receive error event', (done) => {
      const testError = new Error('Test error');
      
      emitter.on('error', (error) => {
        expect(error).toBe(testError);
        done();
      });

      emitter.emit('error', testError);
    });

    it('should emit and receive missing_blocks event', (done) => {
      const gaps = [
        { start: 100, end: 110 },
        { start: 200, end: 205 }
      ];
      
      emitter.on('missing_blocks', (receivedGaps) => {
        expect(receivedGaps).toEqual(gaps);
        done();
      });

      emitter.emit('missing_blocks', gaps);
    });
  });

  describe('once listener', () => {
    it('should only trigger once', () => {
      const listener = jest.fn();
      
      emitter.once('block:new', listener);
      
      emitter.emit('block:new', mockBlock);
      emitter.emit('block:new', mockBlock);
      
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove listeners', () => {
    it('should remove specific listener', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('block:new', listener1);
      emitter.on('block:new', listener2);
      
      emitter.off('block:new', listener1);
      
      emitter.emit('block:new', mockBlock);
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners for an event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('block:new', listener1);
      emitter.on('block:new', listener2);
      
      emitter.removeAllListeners('block:new');
      
      emitter.emit('block:new', mockBlock);
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('hook registration', () => {
    it('should register and unregister hook', () => {
      const listener = jest.fn();
      
      const unsubscribe = emitter.registerHook('block:new', listener);
      
      emitter.emit('block:new', mockBlock);
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      emitter.emit('block:new', mockBlock);
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('convenience methods', () => {
    it('should use onNewBlock convenience method', (done) => {
      const unsubscribe = emitter.onNewBlock((block) => {
        expect(block).toBe(mockBlock);
        unsubscribe();
        done();
      });

      emitter.emit('block:new', mockBlock);
    });

    it('should use onBlockConfirmed convenience method', (done) => {
      const unsubscribe = emitter.onBlockConfirmed((block) => {
        expect(block).toBe(mockBlock);
        unsubscribe();
        done();
      });

      emitter.emit('block:confirmed', mockBlock);
    });

    it('should use onPeerConnected convenience method', (done) => {
      const unsubscribe = emitter.onPeerConnected((peerId) => {
        expect(peerId).toBe('127.0.0.1:8444');
        unsubscribe();
        done();
      });

      emitter.emit('peer:connected', '127.0.0.1:8444');
    });

    it('should use onError convenience method', (done) => {
      const testError = new Error('Test error');
      const unsubscribe = emitter.onError((error) => {
        expect(error).toBe(testError);
        unsubscribe();
        done();
      });

      emitter.emit('error', testError);
    });
  });

  describe('listener count', () => {
    it('should return correct listener count', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      expect(emitter.listenerCount('block:new')).toBe(0);
      
      emitter.on('block:new', listener1);
      expect(emitter.listenerCount('block:new')).toBe(1);
      
      emitter.on('block:new', listener2);
      expect(emitter.listenerCount('block:new')).toBe(2);
      
      emitter.off('block:new', listener1);
      expect(emitter.listenerCount('block:new')).toBe(1);
    });
  });
});