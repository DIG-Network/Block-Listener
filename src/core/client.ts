import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ChiaConnection } from './connection';
import { BlockRepository } from '../database/repository';
import { ChiaBlock } from '../database/schema';
import { ChiaEventEmitter } from '../events/emitter';
import { BlockCacheManager } from '../cache/manager';
import { createLogger, Logger } from '../utils/logger';
import { 
  ProtocolMessageTypes, 
  FullBlock 
} from '../protocol/types';
import { 
  createMessage,
  RequestBlock,
  RequestBlocks,
  RespondBlock,
  RespondBlocks,
  NewPeak
} from '../protocol/messages';

export interface ChiaClientConfig {
  host?: string;
  port?: number;
  networkId?: string;
  database: {
    type: 'postgres' | 'sqlite';
    database: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
  };
  maxPeers?: number;
  cacheOptions?: {
    ttl?: number;
    maxKeys?: number;
  };
  hooks?: {
    onNewBlock?: (block: ChiaBlock) => void | Promise<void>;
    onPeerConnected?: (peerId: string) => void;
    onPeerDisconnected?: (peerId: string) => void;
    onError?: (error: Error) => void;
  };
}

export class ChiaBlockchainClient {
  private connections: Map<string, ChiaConnection> = new Map();
  private repository!: BlockRepository;
  private eventEmitter: ChiaEventEmitter;
  private dataSource!: DataSource;
  private cacheManager: BlockCacheManager;
  private syncInProgress: boolean = false;
  private logger: Logger;
  private config: ChiaClientConfig;
  private initialized: boolean = false;

  constructor(config: ChiaClientConfig) {
    this.config = config;
    this.eventEmitter = ChiaEventEmitter.getInstance();
    this.cacheManager = new BlockCacheManager(config.cacheOptions);
    this.logger = createLogger('ChiaClient');
    this.setupHooks();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Client already initialized');
      return;
    }

    try {
      this.logger.info('Initializing Chia blockchain client');
      
      // Initialize database
      await this.initializeDatabase();
      
      // Load recent blocks into cache
      await this.preloadCache();
      
      // Connect to initial peer
      await this.connectToPeer(
        this.config.host || 'localhost',
        this.config.port || 8444
      );
      
      this.initialized = true;
      this.logger.info('Client initialization complete');
    } catch (error) {
      this.logger.error('Failed to initialize client', { error });
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    this.dataSource = new DataSource({
      type: this.config.database.type,
      database: this.config.database.database,
      host: this.config.database.host,
      port: this.config.database.port,
      username: this.config.database.username,
      password: this.config.database.password,
      entities: [ChiaBlock],
      synchronize: true,
      logging: false
    });

    await this.dataSource.initialize();
    this.repository = new BlockRepository(this.dataSource);
    this.logger.info('Database initialized');
  }

  private async preloadCache(): Promise<void> {
    try {
      const recentBlocks = await this.repository.getBlocksAfterHeight(
        Math.max(0, (await this.repository.getLatestBlock())?.height || 0 - 100),
        100
      );
      
      this.cacheManager.preloadCache(recentBlocks);
      this.logger.info(`Preloaded ${recentBlocks.length} blocks into cache`);
    } catch (error) {
      this.logger.error('Failed to preload cache', { error });
    }
  }

  private setupHooks(): void {
    // Register user-defined hooks
    if (this.config.hooks?.onNewBlock) {
      this.eventEmitter.onNewBlock(this.config.hooks.onNewBlock);
    }
    
    if (this.config.hooks?.onPeerConnected) {
      this.eventEmitter.onPeerConnected(this.config.hooks.onPeerConnected);
    }
    
    if (this.config.hooks?.onPeerDisconnected) {
      this.eventEmitter.onPeerDisconnected(this.config.hooks.onPeerDisconnected);
    }
    
    if (this.config.hooks?.onError) {
      this.eventEmitter.onError(this.config.hooks.onError);
    }
    
    // Internal event handlers
    this.eventEmitter.on('missing_blocks', async (gaps) => {
      for (const gap of gaps) {
        await this.syncBlockRange(gap.start, gap.end);
      }
    });
  }

  async connectToPeer(host: string, port: number): Promise<void> {
    const peerId = `${host}:${port}`;
    
    if (this.connections.has(peerId)) {
      this.logger.warn(`Already connected to peer ${peerId}`);
      return;
    }
    
    try {
      this.logger.info(`Connecting to peer ${peerId}`);
      
      const connection = new ChiaConnection(peerId, this.eventEmitter);
      
      // Set up connection event handlers
      connection.on('connected', () => {
        this.logger.info(`Connected to peer ${peerId}`);
        this.eventEmitter.emit('peer:connected', peerId);
        
        // Start initial sync after handshake is complete
        this.startSync().catch(error => {
          this.logger.error('Failed to start sync', { error });
        });
      });
      
      connection.on('disconnected', (reason) => {
        this.logger.info(`Disconnected from peer ${peerId}`, reason);
        this.connections.delete(peerId);
        this.eventEmitter.emit('peer:disconnected', peerId);
      });
      
      connection.on('new_peak', async (peak: NewPeak) => {
        await this.handleNewPeak(peak);
      });
      
      connection.on('block', async (response: RespondBlock) => {
        await this.handleBlock(response.block);
      });
      
      connection.on('blocks', async (response: RespondBlocks) => {
        await this.handleBlocks(response.blocks);
      });
      
      connection.on('error', (error: Error) => {
        this.logger.error(`Connection error from ${peerId}`, { error });
        this.eventEmitter.emit('error', error as Error);
      });
      
      await connection.connect();
      this.connections.set(peerId, connection);
      
      // Don't start sync here - wait for handshake acknowledgment
      // await this.startSync();
      
    } catch (error) {
      this.logger.error(`Failed to connect to peer ${peerId}`, { error });
      throw error;
    }
  }

  private async handleNewPeak(peak: NewPeak): Promise<void> {
    this.logger.info(`New peak received: height ${peak.height}, hash ${peak.header_hash}`);
    
    // Check if we need to sync
    const latestLocal = await this.repository.getLatestBlock();
    if (!latestLocal || peak.height > latestLocal.height) {
      await this.syncToHeight(peak.height);
    }
  }

  private async handleBlock(fullBlock: FullBlock): Promise<void> {
    try {
      const block = await this.convertAndSaveBlock(fullBlock);
      
      if (block) {
        this.cacheManager.cacheBlock(block);
        this.eventEmitter.emit('block:new', block);
        
        // Check for gaps
        await this.checkAndFillGaps(block.height);
      }
    } catch (error) {
      this.logger.error('Failed to handle block', { error });
      this.eventEmitter.emit('error', error as Error);
    }
  }

  private async handleBlocks(fullBlocks: FullBlock[]): Promise<void> {
    try {
      const blocks: ChiaBlock[] = [];
      
      for (const fullBlock of fullBlocks) {
        const block = await this.convertAndSaveBlock(fullBlock);
        if (block) {
          blocks.push(block);
        }
      }
      
      this.cacheManager.cacheBlocks(blocks);
      this.logger.info(`Processed ${blocks.length} blocks`);
      
      // Emit sync progress
      if (blocks.length > 0) {
        const heights = blocks.map(b => b.height);
        this.eventEmitter.emit('sync:progress', Math.min(...heights), Math.max(...heights));
      }
    } catch (error) {
      this.logger.error('Failed to handle blocks', { error });
      this.eventEmitter.emit('error', error as Error);
    }
  }

  private async convertAndSaveBlock(fullBlock: FullBlock): Promise<ChiaBlock | null> {
    try {
      // Convert FullBlock to ChiaBlock entity
      const block: Partial<ChiaBlock> = {
        header_hash: this.calculateHeaderHash(fullBlock),
        height: fullBlock.reward_chain_block.height,
        prev_header_hash: fullBlock.foliage.prev_block_hash,
        timestamp: Date.now().toString(), // Simplified - should extract from block
        weight: fullBlock.reward_chain_block.weight.toString(),
        total_iters: fullBlock.reward_chain_block.total_iters.toString(),
        signage_point_index: fullBlock.reward_chain_block.signage_point_index,
        is_transaction_block: fullBlock.reward_chain_block.is_transaction_block,
        transaction_count: fullBlock.transactions_generator ? 1 : 0, // Simplified
        proof_of_space: fullBlock.reward_chain_block.proof_of_space,
        reward_chain_block: fullBlock.reward_chain_block,
        foliage: fullBlock.foliage,
        transactions_info: fullBlock.transactions_info,
        raw_data: JSON.stringify(fullBlock)
      };
      
      // Check if block already exists
      if (await this.repository.blockExists(block.header_hash!)) {
        this.logger.debug(`Block ${block.header_hash} already exists`);
        return null;
      }
      
      // Save to database
      const savedBlock = await this.repository.saveBlock(block);
      this.logger.debug(`Saved block ${savedBlock.height} to database`);
      
      return savedBlock;
    } catch (error) {
      this.logger.error('Failed to convert and save block', { error });
      return null;
    }
  }

  private calculateHeaderHash(block: FullBlock): string {
    // Simplified hash calculation - in production, use proper Chia hashing
    const data = JSON.stringify({
      height: block.reward_chain_block.height,
      prev: block.foliage.prev_block_hash,
      timestamp: Date.now()
    });
    
    // Use a simple hash for demo purposes
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
  }

  private async startSync(): Promise<void> {
    if (this.syncInProgress) {
      this.logger.warn('Sync already in progress');
      return;
    }
    
    try {
      this.syncInProgress = true;
      this.eventEmitter.emit('sync:started');
      
      // Get latest local block
      const latestLocal = await this.repository.getLatestBlock();
      const startHeight = latestLocal ? latestLocal.height + 1 : 0;
      
      // Request current peak from peer
      const connection = this.connections.values().next().value;
      if (!connection) {
        throw new Error('No active connections');
      }
      
      // For demo purposes, sync last 100 blocks
      const targetHeight = startHeight + 100;
      await this.syncBlockRange(startHeight, targetHeight);
      
      this.eventEmitter.emit('sync:completed', targetHeight);
    } catch (error) {
      this.logger.error('Sync failed', { error });
      this.eventEmitter.emit('error', error as Error);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncToHeight(targetHeight: number): Promise<void> {
    const latestLocal = await this.repository.getLatestBlock();
    const startHeight = latestLocal ? latestLocal.height + 1 : 0;
    
    if (startHeight <= targetHeight) {
      await this.syncBlockRange(startHeight, targetHeight);
    }
  }

  private async syncBlockRange(startHeight: number, endHeight: number): Promise<void> {
    const connection = this.connections.values().next().value;
    if (!connection) {
      throw new Error('No active connections');
    }
    
    this.logger.info(`Syncing blocks from ${startHeight} to ${endHeight}`);
    
    // Request blocks one by one for now (can be optimized later)
    for (let height = startHeight; height <= endHeight; height++) {
      try {
        const block = await connection.requestBlock(height);
        if (block) {
          await this.handleBlock(block);
        }
      } catch (error) {
        this.logger.error(`Failed to fetch block at height ${height}:`, error);
      }
    }
  }

  private async checkAndFillGaps(currentHeight: number): Promise<void> {
    const gaps = await this.repository.getBlockGaps();
    
    if (gaps.length > 0) {
      this.logger.warn(`Found ${gaps.length} gaps in blockchain`);
      this.eventEmitter.emit('missing_blocks', gaps);
    }
  }

  // Public API methods
  async getBlock(height: number): Promise<ChiaBlock | null> {
    // Check cache first
    const cached = this.cacheManager.getBlockByHeight(height);
    if (cached) {
      return cached;
    }
    
    // Fetch from database
    const block = await this.repository.getBlockByHeight(height);
    if (block) {
      this.cacheManager.cacheBlock(block);
    }
    
    return block;
  }

  async getBlockByHash(hash: string): Promise<ChiaBlock | null> {
    // Check cache first
    const cached = this.cacheManager.getBlockByHash(hash);
    if (cached) {
      return cached;
    }
    
    // Fetch from database
    const block = await this.repository.getBlockByHash(hash);
    if (block) {
      this.cacheManager.cacheBlock(block);
    }
    
    return block;
  }

  async getBlockRange(start: number, end: number): Promise<ChiaBlock[]> {
    return this.repository.getBlocksByHeightRange(start, end);
  }

  async getLatestBlock(): Promise<ChiaBlock | null> {
    const cached = this.cacheManager.getLatestBlock();
    if (cached) {
      return cached;
    }
    
    return this.repository.getLatestBlock();
  }

  onBlock(callback: (block: ChiaBlock) => void | Promise<void>): () => void {
    return this.eventEmitter.registerHook('block:new', callback);
  }

  onSyncProgress(callback: (current: number, total: number) => void): () => void {
    return this.eventEmitter.registerHook('sync:progress', callback);
  }

  getCacheStats(): any {
    return this.cacheManager.getStats();
  }

  getConnectionStats(): Map<string, any> {
    const stats = new Map();
    
    for (const [peerId, connection] of this.connections) {
      stats.set(peerId, connection.getStats());
    }
    
    return stats;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting client');
    
    // Disconnect all peers
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
    
    // Clear cache
    this.cacheManager.clear();
    
    // Close database connection
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    
    // Remove all event listeners
    this.eventEmitter.removeAllListeners();
    
    this.initialized = false;
    this.logger.info('Client disconnected');
  }
}