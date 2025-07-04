import { StreamableEncoder, StreamableDecoder, encodeMessage, decodeMessage } from '../../../src/protocol/serialization';
import { ProtocolMessageTypes } from '../../../src/protocol/types';
import { createMessage } from '../../../src/protocol/messages';

describe('StreamableEncoder', () => {
  let encoder: StreamableEncoder;

  beforeEach(() => {
    encoder = new StreamableEncoder();
  });

  describe('basic type encoding', () => {
    it('should encode uint8', () => {
      encoder.writeUint8(255);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(1);
      expect(buffer[0]).toBe(255);
    });

    it('should encode uint16', () => {
      encoder.writeUint16(65535);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(2);
      expect(buffer.readUInt16BE(0)).toBe(65535);
    });

    it('should encode uint32', () => {
      encoder.writeUint32(4294967295);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(4);
      expect(buffer.readUInt32BE(0)).toBe(4294967295);
    });

    it('should encode uint64', () => {
      encoder.writeUint64(9223372036854775807n);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(8);
      expect(buffer.readBigUInt64BE(0)).toBe(9223372036854775807n);
    });

    it('should encode uint128', () => {
      const value = (1n << 100n) + 123456789n;
      encoder.writeUint128(value);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(16);
    });

    it('should encode boolean', () => {
      encoder.writeBoolean(true);
      encoder.writeBoolean(false);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(2);
      expect(buffer[0]).toBe(1);
      expect(buffer[1]).toBe(0);
    });

    it('should encode string', () => {
      encoder.writeString('Hello, World!');
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBeGreaterThan(13); // Length prefix + string
    });

    it('should encode bytes32', () => {
      const hash = '0x' + '0'.repeat(64);
      encoder.writeBytes32(hash);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(32);
    });

    it('should encode list', () => {
      encoder.writeList([1, 2, 3], (item) => encoder.writeUint8(item));
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(7); // 4 bytes length + 3 bytes data
    });

    it('should encode optional value', () => {
      encoder.writeOptional(42, (value) => encoder.writeUint8(value));
      encoder.writeOptional(null, (_value) => encoder.writeUint8(0));
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBe(3); // 1 byte flag + 1 byte value + 1 byte flag
    });
  });

  describe('buffer expansion', () => {
    it('should automatically expand buffer when needed', () => {
      const largeData = Buffer.alloc(2000).fill(0xFF);
      encoder.writeBytes(largeData);
      const buffer = encoder.toBuffer();
      expect(buffer.length).toBeGreaterThan(2000);
    });
  });
});

describe('StreamableDecoder', () => {
  let encoder: StreamableEncoder;
  let decoder: StreamableDecoder;

  beforeEach(() => {
    encoder = new StreamableEncoder();
  });

  describe('basic type decoding', () => {
    it('should decode uint8', () => {
      encoder.writeUint8(255);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readUint8()).toBe(255);
    });

    it('should decode uint16', () => {
      encoder.writeUint16(65535);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readUint16()).toBe(65535);
    });

    it('should decode uint32', () => {
      encoder.writeUint32(4294967295);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readUint32()).toBe(4294967295);
    });

    it('should decode uint64', () => {
      encoder.writeUint64(9223372036854775807n);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readUint64()).toBe(9223372036854775807n);
    });

    it('should decode uint128', () => {
      const value = (1n << 100n) + 123456789n;
      encoder.writeUint128(value);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readUint128()).toBe(value);
    });

    it('should decode boolean', () => {
      encoder.writeBoolean(true);
      encoder.writeBoolean(false);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readBoolean()).toBe(true);
      expect(decoder.readBoolean()).toBe(false);
    });

    it('should decode string', () => {
      encoder.writeString('Hello, World!');
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readString()).toBe('Hello, World!');
    });

    it('should decode bytes32', () => {
      const hash = '0x' + 'a'.repeat(64);
      encoder.writeBytes32(hash);
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readBytes32()).toBe(hash);
    });

    it('should decode list', () => {
      encoder.writeList([1, 2, 3], (item) => encoder.writeUint8(item));
      decoder = new StreamableDecoder(encoder.toBuffer());
      const list = decoder.readList(() => decoder.readUint8());
      expect(list).toEqual([1, 2, 3]);
    });

    it('should decode optional value', () => {
      encoder.writeOptional(42, (value) => encoder.writeUint8(value));
      encoder.writeOptional(null, (_value) => encoder.writeUint8(0));
      decoder = new StreamableDecoder(encoder.toBuffer());
      expect(decoder.readOptional(() => decoder.readUint8())).toBe(42);
      expect(decoder.readOptional(() => decoder.readUint8())).toBe(null);
    });
  });

  describe('error handling', () => {
    it('should throw on buffer underflow', () => {
      decoder = new StreamableDecoder(Buffer.alloc(1));
      expect(() => decoder.readUint32()).toThrow('Buffer underflow');
    });
  });
});

describe('Message encoding/decoding', () => {
  it('should encode and decode handshake message', () => {
    const handshake = createMessage(ProtocolMessageTypes.HANDSHAKE, {
      network_id: 'mainnet',
      protocol_version: '0.0.35',
      software_version: '1.0.0',
      server_port: 8444,
      node_type: 1,
      capabilities: [
        { capability: 'BASE', value: '1' }
      ]
    });

    const encoded = encodeMessage(handshake);
    const decoded = decodeMessage(encoded);

    expect(decoded.type).toBe(ProtocolMessageTypes.HANDSHAKE);
    expect(decoded.data.network_id).toBe('mainnet');
    expect(decoded.data.protocol_version).toBe('0.0.35');
    expect(decoded.data.capabilities).toHaveLength(1);
  });

  it('should encode and decode message with id', () => {
    const message = createMessage(ProtocolMessageTypes.REQUEST_BLOCK, {
      height: 12345,
      include_transaction_block: true
    }, 42);

    const encoded = encodeMessage(message);
    const decoded = decodeMessage(encoded);

    expect(decoded.type).toBe(ProtocolMessageTypes.REQUEST_BLOCK);
    expect(decoded.id).toBe(42);
    expect(decoded.data.height).toBe(12345);
    expect(decoded.data.include_transaction_block).toBe(true);
  });

  it('should encode and decode empty messages', () => {
    const ping = createMessage(ProtocolMessageTypes.PING, {});
    const encoded = encodeMessage(ping);
    const decoded = decodeMessage(encoded);

    expect(decoded.type).toBe(ProtocolMessageTypes.PING);
    expect(decoded.data).toEqual({});
  });

  it('should encode and decode new peak message', () => {
    const newPeak = createMessage(ProtocolMessageTypes.NEW_PEAK, {
      header_hash: '0x' + 'a'.repeat(64),
      height: 1000000,
      weight: 123456789012345678901234567890n,
      fork_point_with_previous_peak: 999999,
      unfinished_reward_block_hash: '0x' + 'b'.repeat(64)
    });

    const encoded = encodeMessage(newPeak);
    const decoded = decodeMessage(encoded);

    expect(decoded.type).toBe(ProtocolMessageTypes.NEW_PEAK);
    expect(decoded.data.header_hash).toBe('0x' + 'a'.repeat(64));
    expect(decoded.data.height).toBe(1000000);
    expect(decoded.data.weight).toBe(123456789012345678901234567890n);
  });
});