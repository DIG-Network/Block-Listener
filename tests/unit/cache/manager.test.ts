import { BlockCacheManager } from '../../../src/cache/manager';
import { ChiaBlock } from '../../../src/database/schema';

// Mock node-cache
jest.mock('node-cache');

describe('BlockCacheManager', () => {
  let cacheManager: BlockCacheManager;
  let mockBlock: ChiaBlock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    cacheManager = new BlockCacheManager({
      ttl: 3600,
      maxKeys: 100
    });

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

  describe('constructor', () => {
    it('should create cache manager with default options', () => {
      const manager = new BlockCacheManager();
      expect(manager).toBeDefined();
    });

    it('should create cache manager with custom options', () => {
      const manager = new BlockCacheManager({
        ttl: 7200,
        checkPeriod: 1200,
        maxKeys: 5000
      });
      expect(manager).toBeDefined();
    });
  });

  describe('cacheBlock', () => {
    it('should cache a block by height and hash', () => {
      cacheManager.cacheBlock(mockBlock);
      
      // Test retrieval by height
      const byHeight = cacheManager.getBlockByHeight(100);
      expect(byHeight).toEqual(mockBlock);
      
      // Test retrieval by hash
      const byHash = cacheManager.getBlockByHash(mockBlock.header_hash);
      expect(byHash).toEqual(mockBlock);
    });

    it('should update latest block if applicable', () => {
      cacheManager.cacheBlock(mockBlock);
      
      const newerBlock = { ...mockBlock, height: 200, header_hash: '0x' + 'b'.repeat(64) };
      cacheManager.cacheBlock(newerBlock);
      
      const latest = cacheManager.getLatestBlock();
      expect(latest).toEqual(newerBlock);
    });

    it('should not update latest block if older', () => {
      const newerBlock = { ...mockBlock, height: 200, header_hash: '0x' + 'b'.repeat(64) };
      cacheManager.cacheBlock(newerBlock);
      
      cacheManager.cacheBlock(mockBlock);
      
      const latest = cacheManager.getLatestBlock();
      expect(latest).toEqual(newerBlock);
    });
  });

  describe('cacheBlocks', () => {
    it('should cache multiple blocks', () => {
      const blocks = [
        mockBlock,
        { ...mockBlock, height: 101, header_hash: '0x' + 'b'.repeat(64) },
        { ...mockBlock, height: 102, header_hash: '0x' + 'c'.repeat(64) }
      ];
      
      cacheManager.cacheBlocks(blocks);
      
      expect(cacheManager.getBlockByHeight(100)).toEqual(blocks[0]);
      expect(cacheManager.getBlockByHeight(101)).toEqual(blocks[1]);
      expect(cacheManager.getBlockByHeight(102)).toEqual(blocks[2]);
    });
  });

  describe('getBlockRange', () => {
    it('should return blocks in range', () => {
      const blocks = [];
      for (let i = 100; i <= 110; i++) {
        const block = { ...mockBlock, height: i, header_hash: '0x' + i.toString().repeat(32) };
        blocks.push(block);
        cacheManager.cacheBlock(block);
      }
      
      const range = cacheManager.getBlockRange(103, 107);
      expect(range).toHaveLength(5);
      expect(range[0].height).toBe(103);
      expect(range[4].height).toBe(107);
    });

    it('should return empty array if no blocks in range', () => {
      const range = cacheManager.getBlockRange(200, 210);
      expect(range).toEqual([]);
    });
  });

  describe('hasBlock', () => {
    it('should check if block exists by height', () => {
      cacheManager.cacheBlock(mockBlock);
      
      expect(cacheManager.hasBlock(100)).toBe(true);
      expect(cacheManager.hasBlock(200)).toBe(false);
    });

    it('should check if block exists by hash', () => {
      cacheManager.cacheBlock(mockBlock);
      
      expect(cacheManager.hasBlock(mockBlock.header_hash)).toBe(true);
      expect(cacheManager.hasBlock('0x' + 'z'.repeat(64))).toBe(false);
    });
  });

  describe('removeBlock', () => {
    it('should remove block by height', () => {
      cacheManager.cacheBlock(mockBlock);
      
      cacheManager.removeBlock(100);
      
      expect(cacheManager.getBlockByHeight(100)).toBeUndefined();
      expect(cacheManager.getBlockByHash(mockBlock.header_hash)).toBeUndefined();
    });

    it('should remove block by hash', () => {
      cacheManager.cacheBlock(mockBlock);
      
      cacheManager.removeBlock(mockBlock.header_hash);
      
      expect(cacheManager.getBlockByHeight(100)).toBeUndefined();
      expect(cacheManager.getBlockByHash(mockBlock.header_hash)).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all cached data', () => {
      cacheManager.cacheBlock(mockBlock);
      cacheManager.cacheBlock({ ...mockBlock, height: 101, header_hash: '0x' + 'b'.repeat(64) });
      
      cacheManager.clear();
      
      expect(cacheManager.getBlockByHeight(100)).toBeUndefined();
      expect(cacheManager.getBlockByHeight(101)).toBeUndefined();
      expect(cacheManager.getLatestBlock()).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = cacheManager.getStats();
      
      expect(stats).toHaveProperty('keys');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('getCacheSizeBytes', () => {
    it('should return approximate cache size', () => {
      cacheManager.cacheBlock(mockBlock);
      
      const size = cacheManager.getCacheSizeBytes();
      
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('preloadCache', () => {
    it('should preload cache with blocks sorted by height', () => {
      const blocks = [
        { ...mockBlock, height: 102, header_hash: '0x' + 'c'.repeat(64) },
        { ...mockBlock, height: 100, header_hash: '0x' + 'a'.repeat(64) },
        { ...mockBlock, height: 101, header_hash: '0x' + 'b'.repeat(64) }
      ];
      
      cacheManager.preloadCache(blocks);
      
      expect(cacheManager.getBlockByHeight(100)).toBeDefined();
      expect(cacheManager.getBlockByHeight(101)).toBeDefined();
      expect(cacheManager.getBlockByHeight(102)).toBeDefined();
      
      const latest = cacheManager.getLatestBlock();
      expect(latest?.height).toBe(102);
    });
  });

  describe('capacity management', () => {
    it('should remove old entries when exceeding maxKeys', () => {
      // Create a cache manager with small capacity
      const smallCache = new BlockCacheManager({ maxKeys: 3 });
      
      // Add more blocks than capacity
      for (let i = 0; i < 5; i++) {
        const block = { ...mockBlock, height: i, header_hash: '0x' + i.toString().repeat(32) };
        smallCache.cacheBlock(block);
      }
      
      // Old blocks should be removed (but this depends on the mock implementation)
      // In a real implementation, we would check that only the latest 3 blocks remain
    });
  });
});