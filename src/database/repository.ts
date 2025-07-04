import { DataSource, Repository, Between, LessThan, MoreThan } from 'typeorm';
import { ChiaBlock } from './schema';

export class BlockRepository {
  private repository: Repository<ChiaBlock>;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(ChiaBlock);
  }

  async saveBlock(block: Partial<ChiaBlock>): Promise<ChiaBlock> {
    const entity = this.repository.create(block);
    return await this.repository.save(entity);
  }

  async saveBlocks(blocks: Partial<ChiaBlock>[]): Promise<ChiaBlock[]> {
    const entities = blocks.map(block => this.repository.create(block));
    return await this.repository.save(entities);
  }

  async getBlockByHash(hash: string): Promise<ChiaBlock | null> {
    return await this.repository.findOne({ where: { header_hash: hash } });
  }

  async getBlockByHeight(height: number): Promise<ChiaBlock | null> {
    return await this.repository.findOne({ where: { height } });
  }

  async getBlocksByHeightRange(startHeight: number, endHeight: number): Promise<ChiaBlock[]> {
    return await this.repository.find({
      where: {
        height: Between(startHeight, endHeight)
      },
      order: {
        height: 'ASC'
      }
    });
  }

  async getLatestBlock(): Promise<ChiaBlock | null> {
    return await this.repository.findOne({
      order: {
        height: 'DESC'
      }
    });
  }

  async getBlockCount(): Promise<number> {
    return await this.repository.count();
  }

  async blockExists(hash: string): Promise<boolean> {
    const count = await this.repository.count({ where: { header_hash: hash } });
    return count > 0;
  }

  async getBlocksAfterHeight(height: number, limit: number = 100): Promise<ChiaBlock[]> {
    return await this.repository.find({
      where: {
        height: MoreThan(height)
      },
      order: {
        height: 'ASC'
      },
      take: limit
    });
  }

  async getBlocksBeforeHeight(height: number, limit: number = 100): Promise<ChiaBlock[]> {
    return await this.repository.find({
      where: {
        height: LessThan(height)
      },
      order: {
        height: 'DESC'
      },
      take: limit
    });
  }

  async getOrphanBlocks(): Promise<ChiaBlock[]> {
    // Find blocks where prev_header_hash doesn't exist in the database
    const query = this.repository
      .createQueryBuilder('block')
      .leftJoin(
        ChiaBlock,
        'prev_block',
        'block.prev_header_hash = prev_block.header_hash'
      )
      .where('prev_block.header_hash IS NULL')
      .andWhere('block.height > 0'); // Exclude genesis block

    return await query.getMany();
  }

  async getBlockGaps(): Promise<Array<{ start: number; end: number }>> {
    const blocks = await this.repository.find({
      select: ['height'],
      order: { height: 'ASC' }
    });

    const gaps: Array<{ start: number; end: number }> = [];
    
    for (let i = 1; i < blocks.length; i++) {
      const prevHeight = blocks[i - 1].height;
      const currentHeight = blocks[i].height;
      
      if (currentHeight - prevHeight > 1) {
        gaps.push({
          start: prevHeight + 1,
          end: currentHeight - 1
        });
      }
    }

    return gaps;
  }

  async deleteBlock(hash: string): Promise<boolean> {
    const result = await this.repository.delete({ header_hash: hash });
    return result.affected !== undefined && result.affected > 0;
  }

  async deleteBlocksAboveHeight(height: number): Promise<number> {
    const result = await this.repository.delete({
      height: MoreThan(height)
    });
    return result.affected || 0;
  }

  // Transaction support
  async runInTransaction<T>(operation: (repository: Repository<ChiaBlock>) => Promise<T>): Promise<T> {
    return await this.dataSource.transaction(async manager => {
      const transactionalRepository = manager.getRepository(ChiaBlock);
      return await operation(transactionalRepository);
    });
  }
}