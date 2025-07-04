import { DataSource, Repository } from 'typeorm';
import { BlockRepository } from '../../../src/database/repository';
import { ChiaBlock } from '../../../src/database/schema';

// Mock TypeORM
jest.mock('typeorm', () => ({
  DataSource: jest.fn(),
  Repository: jest.fn(),
  Between: jest.fn((start: number, end: number) => ({ _type: 'between', start, end })),
  LessThan: jest.fn((value: number) => ({ _type: 'lessThan', value })),
  MoreThan: jest.fn((value: number) => ({ _type: 'moreThan', value }))
}));

describe('BlockRepository', () => {
  let repository: BlockRepository;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockRepository: jest.Mocked<Repository<ChiaBlock>>;
  let mockBlock: Partial<ChiaBlock>;

  beforeEach(() => {
    // Create mock repository methods
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn()
    } as any;

    // Create mock data source
    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
      transaction: jest.fn()
    } as any;

    repository = new BlockRepository(mockDataSource);

    // Create mock block
    mockBlock = {
      header_hash: '0x' + 'a'.repeat(64),
      height: 100,
      prev_header_hash: '0x' + 'b'.repeat(64),
      timestamp: '1234567890',
      weight: '1000',
      total_iters: '50000',
      signage_point_index: 0,
      is_transaction_block: false,
      transaction_count: 0
    };
  });

  describe('constructor', () => {
    it('should get repository from data source', () => {
      expect(mockDataSource.getRepository).toHaveBeenCalledWith(ChiaBlock);
    });
  });

  describe('saveBlock', () => {
    it('should create and save a block', async () => {
      const savedBlock = { ...mockBlock, id: 1 } as ChiaBlock;
      mockRepository.create.mockReturnValue(savedBlock);
      mockRepository.save.mockResolvedValue(savedBlock);

      const result = await repository.saveBlock(mockBlock);

      expect(mockRepository.create).toHaveBeenCalledWith(mockBlock);
      expect(mockRepository.save).toHaveBeenCalledWith(savedBlock);
      expect(result).toBe(savedBlock);
    });
  });

  describe('saveBlocks', () => {
    it('should create and save multiple blocks', async () => {
      const blocks = [mockBlock, { ...mockBlock, height: 101 }];
      const savedBlocks = blocks.map((b, i) => ({ ...b, id: i + 1 })) as ChiaBlock[];
      
      mockRepository.create.mockImplementation((block) => ({ ...block, id: 1 } as ChiaBlock));
      mockRepository.save.mockResolvedValue(savedBlocks);

      const result = await repository.saveBlocks(blocks);

      expect(mockRepository.create).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(savedBlocks);
    });
  });

  describe('getBlockByHash', () => {
    it('should find block by hash', async () => {
      const block = mockBlock as ChiaBlock;
      mockRepository.findOne.mockResolvedValue(block);

      const result = await repository.getBlockByHash('0x' + 'a'.repeat(64));

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { header_hash: '0x' + 'a'.repeat(64) }
      });
      expect(result).toBe(block);
    });

    it('should return null if block not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await repository.getBlockByHash('0x' + 'z'.repeat(64));

      expect(result).toBeNull();
    });
  });

  describe('getBlockByHeight', () => {
    it('should find block by height', async () => {
      const block = mockBlock as ChiaBlock;
      mockRepository.findOne.mockResolvedValue(block);

      const result = await repository.getBlockByHeight(100);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { height: 100 }
      });
      expect(result).toBe(block);
    });
  });

  describe('getBlocksByHeightRange', () => {
    it('should find blocks in height range', async () => {
      const blocks = [
        { ...mockBlock, height: 100 },
        { ...mockBlock, height: 101 },
        { ...mockBlock, height: 102 }
      ] as ChiaBlock[];
      mockRepository.find.mockResolvedValue(blocks);

      const result = await repository.getBlocksByHeightRange(100, 102);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          height: { _type: 'between', start: 100, end: 102 }
        },
        order: {
          height: 'ASC'
        }
      });
      expect(result).toBe(blocks);
    });
  });

  describe('getLatestBlock', () => {
    it('should find latest block', async () => {
      const block = mockBlock as ChiaBlock;
      mockRepository.findOne.mockResolvedValue(block);

      const result = await repository.getLatestBlock();

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        order: {
          height: 'DESC'
        }
      });
      expect(result).toBe(block);
    });
  });

  describe('getBlockCount', () => {
    it('should return block count', async () => {
      mockRepository.count.mockResolvedValue(1000);

      const result = await repository.getBlockCount();

      expect(mockRepository.count).toHaveBeenCalled();
      expect(result).toBe(1000);
    });
  });

  describe('blockExists', () => {
    it('should return true if block exists', async () => {
      mockRepository.count.mockResolvedValue(1);

      const result = await repository.blockExists('0x' + 'a'.repeat(64));

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { header_hash: '0x' + 'a'.repeat(64) }
      });
      expect(result).toBe(true);
    });

    it('should return false if block does not exist', async () => {
      mockRepository.count.mockResolvedValue(0);

      const result = await repository.blockExists('0x' + 'z'.repeat(64));

      expect(result).toBe(false);
    });
  });

  describe('getBlocksAfterHeight', () => {
    it('should find blocks after height with limit', async () => {
      const blocks = [] as ChiaBlock[];
      mockRepository.find.mockResolvedValue(blocks);

      const result = await repository.getBlocksAfterHeight(100, 50);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          height: { _type: 'moreThan', value: 100 }
        },
        order: {
          height: 'ASC'
        },
        take: 50
      });
      expect(result).toBe(blocks);
    });

    it('should use default limit', async () => {
      const blocks = [] as ChiaBlock[];
      mockRepository.find.mockResolvedValue(blocks);

      await repository.getBlocksAfterHeight(100);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          height: { _type: 'moreThan', value: 100 }
        },
        order: {
          height: 'ASC'
        },
        take: 100
      });
    });
  });

  describe('getBlocksBeforeHeight', () => {
    it('should find blocks before height with limit', async () => {
      const blocks = [] as ChiaBlock[];
      mockRepository.find.mockResolvedValue(blocks);

      const result = await repository.getBlocksBeforeHeight(100, 50);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          height: { _type: 'lessThan', value: 100 }
        },
        order: {
          height: 'DESC'
        },
        take: 50
      });
      expect(result).toBe(blocks);
    });
  });

  describe('getOrphanBlocks', () => {
    it('should find orphan blocks', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
      };
      
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await repository.getOrphanBlocks();

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('block');
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('prev_block.header_hash IS NULL');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('block.height > 0');
      expect(result).toEqual([]);
    });
  });

  describe('getBlockGaps', () => {
    it('should find gaps in block heights', async () => {
      const blocks = [
        { height: 100 },
        { height: 101 },
        { height: 105 }, // Gap from 102-104
        { height: 106 }
      ] as ChiaBlock[];
      
      mockRepository.find.mockResolvedValue(blocks);

      const result = await repository.getBlockGaps();

      expect(result).toEqual([
        { start: 102, end: 104 }
      ]);
    });

    it('should return empty array if no gaps', async () => {
      const blocks = [
        { height: 100 },
        { height: 101 },
        { height: 102 }
      ] as ChiaBlock[];
      
      mockRepository.find.mockResolvedValue(blocks);

      const result = await repository.getBlockGaps();

      expect(result).toEqual([]);
    });
  });

  describe('deleteBlock', () => {
    it('should delete block and return true', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 } as any);

      const result = await repository.deleteBlock('0x' + 'a'.repeat(64));

      expect(mockRepository.delete).toHaveBeenCalledWith({
        header_hash: '0x' + 'a'.repeat(64)
      });
      expect(result).toBe(true);
    });

    it('should return false if no block deleted', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 } as any);

      const result = await repository.deleteBlock('0x' + 'z'.repeat(64));

      expect(result).toBe(false);
    });
  });

  describe('deleteBlocksAboveHeight', () => {
    it('should delete blocks above height', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 10 } as any);

      const result = await repository.deleteBlocksAboveHeight(100);

      expect(mockRepository.delete).toHaveBeenCalledWith({
        height: { _type: 'moreThan', value: 100 }
      });
      expect(result).toBe(10);
    });
  });

  describe('runInTransaction', () => {
    it('should run operation in transaction', async () => {
      const mockTransactionalRepository = {} as Repository<ChiaBlock>;
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockTransactionalRepository)
      };
      
      const testResult = 'test-result';
      const operation = jest.fn().mockResolvedValue(testResult);
      
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await repository.runInTransaction(operation);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.getRepository).toHaveBeenCalledWith(ChiaBlock);
      expect(operation).toHaveBeenCalledWith(mockTransactionalRepository);
      expect(result).toBe(testResult);
    });
  });
});