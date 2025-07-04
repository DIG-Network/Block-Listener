import { ProtocolMessage, ProtocolMessageTypes, uint16, uint32, uint64, uint128 } from './types';

// Chia uses a custom serialization format called "streamable"
// This is a simplified implementation for the key types

export class StreamableEncoder {
  private buffer: Buffer;
  private position: number = 0;

  constructor(initialSize: number = 1024) {
    this.buffer = Buffer.alloc(initialSize);
  }

  private ensureCapacity(additionalBytes: number): void {
    const requiredSize = this.position + additionalBytes;
    if (requiredSize > this.buffer.length) {
      const newSize = Math.max(requiredSize, this.buffer.length * 2);
      const newBuffer = Buffer.alloc(newSize);
      this.buffer.copy(newBuffer);
      this.buffer = newBuffer;
    }
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.buffer.writeUInt8(value, this.position);
    this.position += 1;
  }

  writeUint16(value: uint16): void {
    this.ensureCapacity(2);
    this.buffer.writeUInt16BE(value, this.position);
    this.position += 2;
  }

  writeUint32(value: uint32): void {
    this.ensureCapacity(4);
    this.buffer.writeUInt32BE(value, this.position);
    this.position += 4;
  }

  writeUint64(value: uint64): void {
    this.ensureCapacity(8);
    this.buffer.writeBigUInt64BE(value, this.position);
    this.position += 8;
  }

  writeUint128(value: uint128): void {
    // Split 128-bit value into two 64-bit parts
    const high = value >> 64n;
    const low = value & 0xFFFFFFFFFFFFFFFFn;
    this.writeUint64(high);
    this.writeUint64(low);
  }

  writeBoolean(value: boolean): void {
    this.writeUint8(value ? 1 : 0);
  }

  writeBytes(value: Buffer | Uint8Array): void {
    const bytes = Buffer.from(value);
    this.writeUint32(bytes.length);
    this.ensureCapacity(bytes.length);
    bytes.copy(this.buffer, this.position);
    this.position += bytes.length;
  }

  writeString(value: string): void {
    this.writeBytes(Buffer.from(value, 'utf8'));
  }

  writeBytes32(value: string): void {
    // Assume hex string input, convert to 32 bytes
    const bytes = Buffer.from(value.replace('0x', ''), 'hex');
    if (bytes.length !== 32) {
      throw new Error(`Invalid bytes32: expected 32 bytes, got ${bytes.length}`);
    }
    this.ensureCapacity(32);
    bytes.copy(this.buffer, this.position);
    this.position += 32;
  }

  writeList<T>(items: T[], writer: (item: T) => void): void {
    this.writeUint32(items.length);
    for (const item of items) {
      writer(item);
    }
  }

  writeOptional<T>(value: T | undefined | null, writer: (value: T) => void): void {
    if (value === undefined || value === null) {
      this.writeBoolean(false);
    } else {
      this.writeBoolean(true);
      writer(value);
    }
  }

  toBuffer(): Buffer {
    return this.buffer.slice(0, this.position);
  }
}

export class StreamableDecoder {
  private buffer: Buffer;
  private position: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  private ensureBytes(count: number): void {
    if (this.position + count > this.buffer.length) {
      throw new Error(`Buffer underflow: need ${count} bytes, have ${this.buffer.length - this.position}`);
    }
  }

  readUint8(): number {
    this.ensureBytes(1);
    const value = this.buffer.readUInt8(this.position);
    this.position += 1;
    return value;
  }

  readUint16(): uint16 {
    this.ensureBytes(2);
    const value = this.buffer.readUInt16BE(this.position);
    this.position += 2;
    return value;
  }

  readUint32(): uint32 {
    this.ensureBytes(4);
    const value = this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  readUint64(): uint64 {
    this.ensureBytes(8);
    const value = this.buffer.readBigUInt64BE(this.position);
    this.position += 8;
    return value;
  }

  readUint128(): uint128 {
    const high = this.readUint64();
    const low = this.readUint64();
    return (high << 64n) | low;
  }

  readBoolean(): boolean {
    return this.readUint8() !== 0;
  }

  readBytes(): Buffer {
    const length = this.readUint32();
    this.ensureBytes(length);
    const bytes = this.buffer.slice(this.position, this.position + length);
    this.position += length;
    return bytes;
  }

  readString(): string {
    const bytes = this.readBytes();
    return bytes.toString('utf8');
  }

  readBytes32(): string {
    this.ensureBytes(32);
    const bytes = this.buffer.slice(this.position, this.position + 32);
    this.position += 32;
    return '0x' + bytes.toString('hex');
  }

  readList<T>(reader: () => T): T[] {
    const length = this.readUint32();
    const items: T[] = [];
    for (let i = 0; i < length; i++) {
      items.push(reader());
    }
    return items;
  }

  readOptional<T>(reader: () => T): T | null {
    const hasValue = this.readBoolean();
    return hasValue ? reader() : null;
  }

  hasMoreData(): boolean {
    return this.position < this.buffer.length;
  }

  getRemainingBytes(): number {
    return this.buffer.length - this.position;
  }
}

// Message encoding/decoding
export function encodeMessage(message: ProtocolMessage): Buffer {
  const encoder = new StreamableEncoder();
  
  // Write message header
  encoder.writeUint8(message.type);
  encoder.writeOptional(message.id, (id) => encoder.writeUint16(id));
  
  // Encode message data based on type
  const dataBuffer = encodeMessageData(message.type, message.data);
  encoder.writeBytes(dataBuffer);
  
  return encoder.toBuffer();
}

export function decodeMessage(buffer: Buffer): ProtocolMessage {
  const decoder = new StreamableDecoder(buffer);
  
  // Read message header
  const type = decoder.readUint8() as ProtocolMessageTypes;
  const id = decoder.readOptional(() => decoder.readUint16()) || undefined;
  
  // Decode message data
  const dataBuffer = decoder.readBytes();
  const data = decodeMessageData(type, dataBuffer);
  
  return { type, id, data };
}

// Helper functions for encoding/decoding specific message types
function encodeMessageData(type: ProtocolMessageTypes, data: any): Buffer {
  const encoder = new StreamableEncoder();
  
  switch (type) {
    case ProtocolMessageTypes.HANDSHAKE:
      encoder.writeString(data.network_id);
      encoder.writeString(data.protocol_version);
      encoder.writeString(data.software_version);
      encoder.writeUint16(data.server_port);
      encoder.writeUint8(data.node_type);
      encoder.writeList(data.capabilities, (cap) => {
        encoder.writeString(cap.capability);
        encoder.writeString(cap.value);
      });
      break;
      
    case ProtocolMessageTypes.HANDSHAKE_ACK:
      encoder.writeBoolean(data.success);
      break;
      
    case ProtocolMessageTypes.NEW_PEAK:
      encoder.writeBytes32(data.header_hash);
      encoder.writeUint32(data.height);
      encoder.writeUint128(data.weight);
      encoder.writeUint32(data.fork_point_with_previous_peak);
      encoder.writeBytes32(data.unfinished_reward_block_hash);
      break;
      
    case ProtocolMessageTypes.REQUEST_BLOCK:
      encoder.writeUint32(data.height);
      encoder.writeBoolean(data.include_transaction_block);
      break;
      
    case ProtocolMessageTypes.REQUEST_BLOCKS:
      encoder.writeUint32(data.start_height);
      encoder.writeUint32(data.end_height);
      encoder.writeBoolean(data.include_transaction_blocks);
      break;
      
    case ProtocolMessageTypes.PING:
    case ProtocolMessageTypes.PONG:
    case ProtocolMessageTypes.DISCONNECT:
    case ProtocolMessageTypes.REQUEST_PEERS:
      // Empty messages
      break;
      
    default:
      // For complex types like RESPOND_BLOCK, we'd need more detailed encoding
      // This is a simplified version
      encoder.writeBytes(Buffer.from(JSON.stringify(data), 'utf8'));
  }
  
  return encoder.toBuffer();
}

function decodeMessageData(type: ProtocolMessageTypes, buffer: Buffer): any {
  const decoder = new StreamableDecoder(buffer);
  
  switch (type) {
    case ProtocolMessageTypes.HANDSHAKE:
      return {
        network_id: decoder.readString(),
        protocol_version: decoder.readString(),
        software_version: decoder.readString(),
        server_port: decoder.readUint16(),
        node_type: decoder.readUint8(),
        capabilities: decoder.readList(() => ({
          capability: decoder.readString(),
          value: decoder.readString()
        }))
      };
      
    case ProtocolMessageTypes.HANDSHAKE_ACK:
      return {
        success: decoder.readBoolean()
      };
      
    case ProtocolMessageTypes.NEW_PEAK:
      return {
        header_hash: decoder.readBytes32(),
        height: decoder.readUint32(),
        weight: decoder.readUint128(),
        fork_point_with_previous_peak: decoder.readUint32(),
        unfinished_reward_block_hash: decoder.readBytes32()
      };
      
    case ProtocolMessageTypes.REQUEST_BLOCK:
      return {
        height: decoder.readUint32(),
        include_transaction_block: decoder.readBoolean()
      };
      
    case ProtocolMessageTypes.REQUEST_BLOCKS:
      return {
        start_height: decoder.readUint32(),
        end_height: decoder.readUint32(),
        include_transaction_blocks: decoder.readBoolean()
      };
      
    case ProtocolMessageTypes.PING:
    case ProtocolMessageTypes.PONG:
    case ProtocolMessageTypes.DISCONNECT:
    case ProtocolMessageTypes.REQUEST_PEERS:
      return {};
      
    default:
      // For complex types, we'd need more detailed decoding
      // This is a simplified version
      const jsonStr = decoder.readBytes().toString('utf8');
      return jsonStr ? JSON.parse(jsonStr) : {};
  }
}