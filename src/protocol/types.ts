// Protocol version and network constants
export const PROTOCOL_VERSION = '0.0.36';
export const NETWORK_ID = 'mainnet';

// Message type constants
export enum ProtocolMessageTypes {
  // Shared protocol messages (1-255)
  HANDSHAKE = 1,
  HANDSHAKE_ACK = 2,
  DISCONNECT = 3,
  PING = 4,
  PONG = 5,
  
  // Full node protocol messages (1-255)
  NEW_PEAK = 20,
  NEW_TRANSACTION = 21,
  REQUEST_TRANSACTION = 22,
  RESPOND_TRANSACTION = 23,
  REQUEST_PROOF_OF_WEIGHT = 24,
  RESPOND_PROOF_OF_WEIGHT = 25,
  REQUEST_BLOCK = 26,
  RESPOND_BLOCK = 27,
  REJECT_BLOCK = 28,
  REQUEST_BLOCKS = 29,
  RESPOND_BLOCKS = 30,
  REJECT_BLOCKS = 31,
  NEW_UNFINISHED_BLOCK = 32,
  REQUEST_UNFINISHED_BLOCK = 33,
  RESPOND_UNFINISHED_BLOCK = 34,
  NEW_SIGNAGE_POINT_OR_END_OF_SUB_SLOT = 35,
  REQUEST_SIGNAGE_POINT_OR_END_OF_SUB_SLOT = 36,
  RESPOND_SIGNAGE_POINT_OR_END_OF_SUB_SLOT = 37,
  NEW_END_OF_SUB_SLOT = 38,
  REQUEST_END_OF_SUB_SLOT = 39,
  RESPOND_END_OF_SUB_SLOT = 40,
  NEW_SIGNAGE_POINT = 41,
  REQUEST_SIGNAGE_POINT = 42,
  RESPOND_SIGNAGE_POINT = 43,
  REQUEST_COMPACT_VDF = 44,
  RESPOND_COMPACT_VDF = 45,
  NEW_COMPACT_VDF = 46,
  REQUEST_PEERS = 47,
  RESPOND_PEERS = 48,
  NONE = 255
}

// Node types
export enum NodeType {
  FULL_NODE = 1,
  HARVESTER = 2,
  FARMER = 3,
  TIMELORD = 4,
  INTRODUCER = 5,
  WALLET = 6,
  DATA_LAYER = 7
}

// Basic types
export type bytes32 = string; // 32-byte hex string
export type uint8 = number;
export type uint16 = number;
export type uint32 = number;
export type uint64 = bigint;
export type uint128 = bigint;
export type int32 = number;

// Capability structure
export interface Capability {
  capability: string;
  value: string;
}

// Base protocol message interface
export interface ProtocolMessage {
  type: ProtocolMessageTypes;
  id?: uint16;
  data: any;
}

// Common blockchain data structures
export interface BlockInfo {
  header_hash: bytes32;
  height: uint32;
  weight: uint128;
  total_iters: uint128;
  timestamp?: uint64;
}

export interface ProofOfSpace {
  challenge: bytes32;
  pool_contract_puzzle_hash?: bytes32;
  plot_public_key: string;
  size: uint8;
  proof: string;
}

export interface VDFInfo {
  challenge: bytes32;
  number_of_iterations: uint64;
  output: string;
}

export interface RewardChainBlock {
  weight: uint128;
  height: uint32;
  total_iters: uint128;
  signage_point_index: uint8;
  pos_ss_cc_challenge_hash: bytes32;
  proof_of_space: ProofOfSpace;
  challenge_chain_sp_vdf?: VDFInfo;
  challenge_chain_sp_signature: string;
  challenge_chain_ip_vdf: VDFInfo;
  reward_chain_sp_vdf?: VDFInfo;
  reward_chain_sp_signature: string;
  reward_chain_ip_vdf: VDFInfo;
  infused_challenge_chain_ip_vdf?: VDFInfo;
  is_transaction_block: boolean;
}

export interface FoliageBlock {
  prev_block_hash: bytes32;
  reward_block_hash: bytes32;
  foliage_block_data: any;
  foliage_block_data_signature: string;
  foliage_transaction_block_hash?: bytes32;
  foliage_transaction_block_signature?: string;
}

export interface FullBlock {
  finished_sub_slots: any[];
  reward_chain_block: RewardChainBlock;
  challenge_chain_sp_proof?: VDFInfo;
  challenge_chain_ip_proof: VDFInfo;
  reward_chain_sp_proof?: VDFInfo;
  reward_chain_ip_proof: VDFInfo;
  infused_challenge_chain_ip_proof?: VDFInfo;
  foliage: FoliageBlock;
  foliage_transaction_block?: any;
  transactions_info?: any;
  transactions_generator?: any;
  transactions_generator_ref_list: uint32[];
}