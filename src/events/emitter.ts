import { EventEmitter } from 'events';
import { ChiaBlock } from '../database/schema';

interface BlockEvents {
  'block:new': (block: ChiaBlock) => void;
  'block:confirmed': (block: ChiaBlock) => void;
  'block:reorganized': (oldBlock: ChiaBlock, newBlock: ChiaBlock) => void;
  'peer:connected': (peerId: string) => void;
  'peer:disconnected': (peerId: string) => void;
  'sync:started': () => void;
  'sync:completed': (height: number) => void;
  'sync:progress': (current: number, total: number) => void;
  'error': (error: Error) => void;
  'missing_blocks': (gaps: Array<{ start: number; end: number }>) => void;
}

export class TypedEventEmitter<T extends Record<string, any>> {
  private emitter = new EventEmitter();

  constructor() {
    // Set max listeners to avoid warnings
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof T>(event: K, listener: T[K]): void {
    this.emitter.on(event as string, listener as any);
  }

  once<K extends keyof T>(event: K, listener: T[K]): void {
    this.emitter.once(event as string, listener as any);
  }

  off<K extends keyof T>(event: K, listener: T[K]): void {
    this.emitter.off(event as string, listener as any);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    return this.emitter.emit(event as string, ...args);
  }

  removeAllListeners<K extends keyof T>(event?: K): void {
    this.emitter.removeAllListeners(event as string);
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.emitter.listenerCount(event as string);
  }

  listeners<K extends keyof T>(event: K): Function[] {
    return this.emitter.listeners(event as string);
  }
}

export class ChiaEventEmitter extends TypedEventEmitter<BlockEvents> {
  private static instance: ChiaEventEmitter;

  static getInstance(): ChiaEventEmitter {
    if (!ChiaEventEmitter.instance) {
      ChiaEventEmitter.instance = new ChiaEventEmitter();
    }
    return ChiaEventEmitter.instance;
  }

  // Hook registration helper with type safety
  registerHook<K extends keyof BlockEvents>(
    event: K,
    callback: BlockEvents[K]
  ): () => void {
    this.on(event, callback);
    
    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  // Convenience methods for common events
  onNewBlock(callback: (block: ChiaBlock) => void): () => void {
    return this.registerHook('block:new', callback);
  }

  onBlockConfirmed(callback: (block: ChiaBlock) => void): () => void {
    return this.registerHook('block:confirmed', callback);
  }

  onBlockReorganized(
    callback: (oldBlock: ChiaBlock, newBlock: ChiaBlock) => void
  ): () => void {
    return this.registerHook('block:reorganized', callback);
  }

  onPeerConnected(callback: (peerId: string) => void): () => void {
    return this.registerHook('peer:connected', callback);
  }

  onPeerDisconnected(callback: (peerId: string) => void): () => void {
    return this.registerHook('peer:disconnected', callback);
  }

  onSyncStarted(callback: () => void): () => void {
    return this.registerHook('sync:started', callback);
  }

  onSyncCompleted(callback: (height: number) => void): () => void {
    return this.registerHook('sync:completed', callback);
  }

  onSyncProgress(callback: (current: number, total: number) => void): () => void {
    return this.registerHook('sync:progress', callback);
  }

  onError(callback: (error: Error) => void): () => void {
    return this.registerHook('error', callback);
  }

  onMissingBlocks(
    callback: (gaps: Array<{ start: number; end: number }>) => void
  ): () => void {
    return this.registerHook('missing_blocks', callback);
  }
}