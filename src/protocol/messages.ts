import { 
  bytes32, 
  uint8, 
  uint16, 
  uint32, 
  uint64, 
  uint128,
  Capability,
  BlockInfo,
  FullBlock,
  NodeType,
  ProtocolMessageTypes
} from './types';

// Handshake message
export interface Handshake {
  network_id: string;
  protocol_version: string;
  software_version: string;
  server_port: uint16;
  node_type: NodeType;
  capabilities: Capability[];
}

// Handshake acknowledgment
export interface HandshakeAck {
  success: boolean;
}

// New peak notification
export interface NewPeak {
  header_hash: bytes32;
  height: uint32;
  weight: uint128;
  fork_point_with_previous_peak: uint32;
  unfinished_reward_block_hash: bytes32;
}

// Request block
export interface RequestBlock {
  height: uint32;
  include_transaction_block: boolean;
}

// Respond block
export interface RespondBlock {
  block: FullBlock;
}

// Request blocks (multiple)
export interface RequestBlocks {
  start_height: uint32;
  end_height: uint32;
  include_transaction_blocks: boolean;
}

// Respond blocks (multiple)
export interface RespondBlocks {
  start_height: uint32;
  end_height: uint32;
  blocks: FullBlock[];
}

// Request peers
export interface RequestPeers {
  // Empty message
}

// Peer information
export interface PeerInfo {
  host: string;
  port: uint16;
  timestamp: uint64;
}

// Respond peers
export interface RespondPeers {
  peer_list: PeerInfo[];
}

// Message type to data mapping
export type MessageDataMap = {
  [ProtocolMessageTypes.HANDSHAKE]: Handshake;
  [ProtocolMessageTypes.HANDSHAKE_ACK]: HandshakeAck;
  [ProtocolMessageTypes.NEW_PEAK]: NewPeak;
  [ProtocolMessageTypes.REQUEST_BLOCK]: RequestBlock;
  [ProtocolMessageTypes.RESPOND_BLOCK]: RespondBlock;
  [ProtocolMessageTypes.REQUEST_BLOCKS]: RequestBlocks;
  [ProtocolMessageTypes.RESPOND_BLOCKS]: RespondBlocks;
  [ProtocolMessageTypes.REQUEST_PEERS]: RequestPeers;
  [ProtocolMessageTypes.RESPOND_PEERS]: RespondPeers;
  [ProtocolMessageTypes.PING]: {};
  [ProtocolMessageTypes.PONG]: {};
  [ProtocolMessageTypes.DISCONNECT]: {};
};

// Type-safe message creation
export function createMessage<T extends keyof MessageDataMap>(
  type: T,
  data: MessageDataMap[T],
  id?: uint16
): { type: T; data: MessageDataMap[T]; id?: uint16 } {
  return { type, data, id };
}