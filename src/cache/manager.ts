import NodeCache from 'node-cache';
import { ChiaBlock } from '../database/schema';
import { createLogger } from '../utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  checkPeriod?: number; // Check period for expired keys
  maxKeys?: number; // Maximum number of keys
}

export class BlockCacheManager {
  private cache: NodeCache;
  private logger = createLogger('BlockCache');
  private readonly maxKeys: number;

  constructor(options: CacheOptions = {}) {
    const { ttl = 3600, checkPeriod = 600, maxKeys = 10000 } = options;
    
    this.maxKeys = maxKeys;
    this.cache = new NodeCache({
      stdTTL: ttl,
      checkperiod: checkPeriod,
      useClones: false, // For better performance
      deleteOnExpire: true
    });

    // Set up event listeners
    this.cache.on('expired', (key, value) => {
      this.logger.debug(`Cache key expired: ${key}`);
    });

    this.cache.on('set', (key, value) => {
      this.ensureCapacity();
    });
  }

  // Ensure cache doesn't exceed max keys
  private ensureCapacity(): void {
    const keys = this.cache.keys();
    if (keys.length > this.maxKeys) {
      // Remove oldest entries (simple FIFO)
      const toRemove = keys.length - this.maxKeys;
      const keysToDelete = keys.slice(0, toRemove);
      this.cache.del(keysToDelete);
      this.logger.debug(`Removed ${toRemove} old cache entries`);
    }
  }

  // Cache a block by both height and hash
  cacheBlock(block: ChiaBlock): void {
    try {
      // Cache by height
      this.cache.set(`height:${block.height}`, block);
      
      // Cache by hash
      this.cache.set(`hash:${block.header_hash}`, block);
      
      // Update latest block if applicable
      const latestBlock = this.cache.get<ChiaBlock>('latest');
      if (!latestBlock || block.height > latestBlock.height) {
        this.cache.set('latest', block);
      }
    } catch (error) {
      this.logger.error('Failed to cache block', { error, blockHeight: block.height });
    }
  }

  // Cache multiple blocks
  cacheBlocks(blocks: ChiaBlock[]): void {
    const timer = this.logger.startTimer();
    
    for (const block of blocks) {
      this.cacheBlock(block);
    }
    
    timer();
    this.logger.info(`Cached ${blocks.length} blocks`);
  }

  // Get block by height
  getBlockByHeight(height: number): ChiaBlock | undefined {
    return this.cache.get<ChiaBlock>(`height:${height}`);
  }

  // Get block by hash
  getBlockByHash(hash: string): ChiaBlock | undefined {
    return this.cache.get<ChiaBlock>(`hash:${hash}`);
  }

  // Get latest cached block
  getLatestBlock(): ChiaBlock | undefined {
    return this.cache.get<ChiaBlock>('latest');
  }

  // Get multiple blocks by height range
  getBlockRange(startHeight: number, endHeight: number): ChiaBlock[] {
    const blocks: ChiaBlock[] = [];
    
    for (let height = startHeight; height <= endHeight; height++) {
      const block = this.getBlockByHeight(height);
      if (block) {
        blocks.push(block);
      }
    }
    
    return blocks;
  }

  // Check if block exists in cache
  hasBlock(hashOrHeight: string | number): boolean {
    if (typeof hashOrHeight === 'number') {
      return this.cache.has(`height:${hashOrHeight}`);
    }
    return this.cache.has(`hash:${hashOrHeight}`);
  }

  // Remove block from cache
  removeBlock(hashOrHeight: string | number): void {
    if (typeof hashOrHeight === 'number') {
      const block = this.getBlockByHeight(hashOrHeight);
      if (block) {
        this.cache.del([`height:${hashOrHeight}`, `hash:${block.header_hash}`]);
      }
    } else {
      const block = this.getBlockByHash(hashOrHeight);
      if (block) {
        this.cache.del([`height:${block.height}`, `hash:${hashOrHeight}`]);
      }
    }
  }

  // Clear all cached data
  clear(): void {
    this.cache.flushAll();
    this.logger.info('Cache cleared');
  }

  // Get cache statistics
  getStats(): {
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const keys = this.cache.keys().length;
    const stats = this.cache.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses) || 0;
    
    return {
      keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }

  // Get cache size in bytes (approximate)
  getCacheSizeBytes(): number {
    let size = 0;
    const keys = this.cache.keys();
    
    for (const key of keys) {
      const value = this.cache.get(key);
      if (value) {
        size += JSON.stringify(value).length;
      }
    }
    
    return size;
  }

  // Preload cache from an array of blocks
  preloadCache(blocks: ChiaBlock[]): void {
    this.logger.info(`Preloading cache with ${blocks.length} blocks`);
    const timer = this.logger.startTimer();
    
    // Sort by height to ensure latest block is set correctly
    const sortedBlocks = blocks.sort((a, b) => a.height - b.height);
    
    for (const block of sortedBlocks) {
      this.cacheBlock(block);
    }
    
    timer();
  }
}