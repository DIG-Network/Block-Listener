import { Entity, PrimaryColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('chia_blocks')
@Index(['height'])
@Index(['timestamp'])
@Index(['prev_header_hash'])
export class ChiaBlock {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  header_hash!: string;

  @Column({ type: 'integer', unique: true })
  height!: number;

  @Column({ type: 'varchar', length: 66 })
  prev_header_hash!: string;

  @Column({ type: 'bigint' })
  timestamp!: string; // Stored as string to handle BigInt

  @Column({ type: 'varchar', length: 66 })
  weight!: string; // uint128 stored as string

  @Column({ type: 'varchar', length: 66 })
  total_iters!: string; // uint128 stored as string

  @Column({ type: 'integer' })
  signage_point_index!: number;

  @Column({ type: 'boolean' })
  is_transaction_block!: boolean;

  @Column({ type: 'integer', default: 0 })
  transaction_count!: number;

  @Column({ type: 'varchar', nullable: true })
  farmer_puzzle_hash?: string;

  @Column({ type: 'varchar', nullable: true })
  pool_puzzle_hash?: string;

  @Column({ type: 'json', nullable: true })
  proof_of_space?: any;

  @Column({ type: 'json', nullable: true })
  reward_chain_block?: any;

  @Column({ type: 'json', nullable: true })
  foliage?: any;

  @Column({ type: 'json', nullable: true })
  transactions_info?: any;

  @Column({ type: 'text', nullable: true })
  raw_data?: string; // Store serialized block data

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  // Virtual properties for conversion
  get weightBigInt(): bigint {
    return BigInt(this.weight);
  }

  set weightBigInt(value: bigint) {
    this.weight = value.toString();
  }

  get totalItersBigInt(): bigint {
    return BigInt(this.total_iters);
  }

  set totalItersBigInt(value: bigint) {
    this.total_iters = value.toString();
  }

  get timestampBigInt(): bigint {
    return BigInt(this.timestamp);
  }

  set timestampBigInt(value: bigint) {
    this.timestamp = value.toString();
  }
}