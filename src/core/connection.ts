import { EventEmitter } from 'events';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dns from 'dns/promises';
import { Tls } from '@dignetwork/datalayer-driver';
import { createLogger, Logger } from '../utils/logger';
import { 
  Handshake,
  HandshakeAck,
  NewPeak,
  RespondBlock,
  RespondBlocks,
  createMessage as createProtocolMessage
} from '../protocol/messages';
import { 
  NodeType,
  ProtocolMessageTypes,
  NETWORK_ID, 
  PROTOCOL_VERSION,
  Capability
} from '../protocol/types';
import { ChiaEventEmitter } from '../events/emitter';
import { encodeMessage, decodeMessage, serializeHandshake, serializeRequestBlock } from '../protocol/serialization';
import { StreamableDecoder } from '../protocol/serialization';

// DNS introducers for peer discovery
const DNS_INTRODUCERS = [
  'dns-introducer.chia.net',
  'chia.ctrlaltdel.ch',
  'seeder.dexie.space',
  'chia.hoffmang.com'
];

const CONNECTION_TIMEOUT = 2000; // milliseconds
const MAX_PEERS_TO_FETCH = 10;
const FULLNODE_PORT = 8444;

// Discover peers function
async function discoverPeers(): Promise<string[]> {
  const allPeers: string[] = [];
  
  for (const introducer of DNS_INTRODUCERS) {
    try {
      const addresses = await dns.resolve4(introducer);
      allPeers.push(...addresses);
      console.log(`Found ${addresses.length} peers from ${introducer}`);
    } catch (error) {
      console.log(`Failed to resolve ${introducer}:`, error);
    }
  }
  
  // Remove duplicates
  return [...new Set(allPeers)];
}

// Helper function to create a complete message with length prefix
function createMessage(type: ProtocolMessageTypes, data: any, id?: number): Buffer {
  // First serialize the data
  let serializedData: Buffer;
  
  if (type === ProtocolMessageTypes.HANDSHAKE) {
    serializedData = serializeHandshake(data);
  } else if (type === ProtocolMessageTypes.REQUEST_BLOCK) {
    serializedData = serializeRequestBlock(data);
  } else {
    // For other types, use a generic approach
    throw new Error(`Unsupported message type: ${type}`);
  }
  
  // Create the message structure
  const message = {
    type,
    id,
    data: serializedData
  };
  
  // Encode the message
  const encodedMessage = encodeMessage(message);
  
  // Add length prefix
  const lengthBuffer = Buffer.allocUnsafe(4);
  lengthBuffer.writeUInt32BE(encodedMessage.length, 0);
  
  return Buffer.concat([lengthBuffer, encodedMessage]);
}

// Helper function to parse incoming messages
function parseMessage(data: Buffer): { type: ProtocolMessageTypes, id?: number, payload: any } {
  // Assume data includes the length prefix
  if (data.length < 4) {
    throw new Error('Message too short');
  }
  
  const messageLength = data.readUInt32BE(0);
  const messageData = data.slice(4, 4 + messageLength);
  
  const decoded = decodeMessage(messageData);
  
  // Decode the payload based on message type
  let payload: any = decoded.data;
  
  // For known message types, decode the streamable data
  switch (decoded.type) {
    case ProtocolMessageTypes.HANDSHAKE:
      // Decode handshake
      const decoder = new StreamableDecoder(decoded.data);
      payload = {
        network_id: decoder.readString(),
        protocol_version: decoder.readString(), 
        software_version: decoder.readString(),
        server_port: decoder.readUint16(),
        node_type: decoder.readUint8(),
        capabilities: decoder.readList(() => [decoder.readUint16(), decoder.readString()])
      };
      break;
      
    case ProtocolMessageTypes.NEW_PEAK:
      // Decode new peak
      const peakDecoder = new StreamableDecoder(decoded.data);
      payload = {
        header_hash: peakDecoder.readBytes32(),
        height: peakDecoder.readUint32(),
        weight: peakDecoder.readUint128(),
        fork_point_with_previous_peak: peakDecoder.readUint32(),
        unfinished_reward_block_hash: peakDecoder.readBytes32()
      };
      break;
      
    // Add more decoders as needed
  }
  
  return {
    type: decoded.type,
    id: decoded.id,
    payload
  };
}

export interface ConnectionOptions {
  host: string;
  port: number;
  networkId?: string;
  nodeType?: NodeType;
  certificatePath?: string;
  keyPath?: string;
  caCertPath?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  requestTimeout?: number;
}

export interface ConnectionStats {
  connected: boolean;
  connectedAt?: Date;
  disconnectedAt?: Date;
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  lastMessageAt?: Date;
  reconnectAttempts: number;
}

export class ChiaConnection extends EventEmitter {
  private ws?: WebSocket;
  private messageId = 0;
  private responseHandlers = new Map<number, (response: any) => void>();
  private eventEmitter: ChiaEventEmitter;
  private connectionClosed = false;
  private currentPeerIndex = 0;
  private bannedPeers = new Set<string>();
  private logger: Logger;
  private messageBuffer = Buffer.alloc(0);
  private stats = {
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
  };

  constructor(private peer: string, eventEmitter: ChiaEventEmitter) {
    super();
    this.eventEmitter = eventEmitter;
    this.logger = createLogger(`Connection:${peer}`);
  }

  async connect(): Promise<void> {
    const allPeers = await discoverPeers();
    
    // Randomize peer selection
    const shuffledPeers = [...allPeers].sort(() => Math.random() - 0.5);
    
    for (const peer of shuffledPeers) {
      if (this.bannedPeers.has(peer)) {
        console.log(`Skipping banned peer: ${peer}`);
        continue;
      }

      try {
        await this.connectToPeer(peer);
        this.peer = peer; // Update current peer on successful connection
        return;
      } catch (error: any) {
        if (error.message?.includes('403')) {
          console.log(`Peer ${peer} banned our IP, marking as banned`);
          this.bannedPeers.add(peer);
        }
        console.log(`Failed to connect to ${peer}, trying next...`);
      }
    }
    
    throw new Error('Failed to connect to any peer');
  }

  private async connectToPeer(peer: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Attempting to connect to peer: ${peer}`);
      
      // Generate TLS certificates
      const sslFolder = path.resolve(os.homedir(), '.chia', 'blockchain-client', 'ssl');
      const certFile = path.join(sslFolder, 'public_client.crt');
      const keyFile = path.join(sslFolder, 'public_client.key');

      // Create SSL folder if it doesn't exist
      if (!fs.existsSync(sslFolder)) {
        fs.mkdirSync(sslFolder, { recursive: true });
      }

      // Create TLS instance which will generate certificates if they don't exist
      const tlsInstance = new Tls(certFile, keyFile);

      // Read the generated certificates
      const cert = fs.readFileSync(certFile);
      const key = fs.readFileSync(keyFile);
      
      // Connect with certificates, matching your working setup
      this.ws = new WebSocket(`wss://${peer}:${FULLNODE_PORT}/ws`, {
        cert: cert,
        key: key,
        rejectUnauthorized: false,
        handshakeTimeout: 10000,
      });

      this.ws.on('open', async () => {
        console.log(`Connected to ${peer}`);
        try {
          // Send handshake immediately
          await this.sendHandshake();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.ws.on('message', (data: Buffer) => {
        console.log(`Received ${data.length} bytes from ${peer}`);
        console.log('Raw data hex:', data.toString('hex').slice(0, 100) + '...');
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Connection closed: ${code} - ${reason.toString()}`);
        this.connectionClosed = true;
        
        if (code === 1002 && reason.toString() === '-6') {
          reject(new Error('INCOMPATIBLE_NETWORK_ID'));
        } else {
          reject(new Error(`Connection closed: ${code} - ${reason.toString()}`));
        }
      });

      this.ws.on('unexpected-response', (request: any, response: any) => {
        console.log(`Unexpected response from ${peer}: ${response.statusCode} ${response.statusMessage}`);
        if (response.statusCode === 403) {
          reject(new Error(`403 Forbidden from ${peer}`));
        } else {
          reject(new Error(`Unexpected response: ${response.statusCode}`));
        }
      });
    });
  }

  private async sendHandshake(): Promise<void> {
    // Match the Rust SDK exactly - connect as WALLET to FULL_NODE
    const handshake: Handshake = {
      network_id: 'mainnet',
      protocol_version: '0.0.37',
      software_version: '0.0.0',  // Match Rust SDK
      server_port: 0,  // 0 for wallet clients per Rust SDK
      node_type: NodeType.WALLET,  // Connect as wallet (6)
      capabilities: [
        [1, '1'], // BASE
        [2, '1'], // BLOCK_HEADERS  
        [3, '1'], // RATE_LIMITS_V2
      ]
    };

    console.log('Sending handshake:', handshake);
    
    const message = createMessage(
      ProtocolMessageTypes.HANDSHAKE,
      handshake,
      undefined // No message ID for handshake
    );
    
    // Log the hex for debugging
    console.log('Handshake hex:', message.toString('hex'));
    console.log('Handshake length:', message.length, 'bytes');
    
    // Log breakdown
    console.log('Message breakdown:');
    console.log('- Length prefix:', message.slice(0, 4).toString('hex'));
    console.log('- Message type:', message.slice(4, 5).toString('hex'));
    console.log('- Optional ID:', message.slice(5, 6).toString('hex'));
    console.log('- Payload length:', message.slice(6, 10).toString('hex'));
    console.log('- Payload:', message.slice(10).toString('hex'));
    
    this.ws!.send(message);
    this.stats.messagesSent++;
    this.stats.bytesSent += message.length;
  }

  private handleMessage(data: Buffer): void {
    try {
      // Add to message buffer
      this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
      this.stats.bytesReceived += data.length;
      
      // Process complete messages from buffer
      while (this.messageBuffer.length >= 4) {
        // Read message length
        const messageLength = this.messageBuffer.readUInt32BE(0);
        
        // Check if we have the complete message
        if (this.messageBuffer.length < 4 + messageLength) {
          break; // Wait for more data
        }
        
        // Extract complete message
        const fullMessage = this.messageBuffer.slice(0, 4 + messageLength);
        this.messageBuffer = this.messageBuffer.slice(4 + messageLength);
        
        // Parse the message
        const { type, id, payload } = parseMessage(fullMessage);
        this.stats.messagesReceived++;
        
        console.log(`Received message type: ${type}, id: ${id}`);
        
        // Handle based on message type
        switch (type) {
          case ProtocolMessageTypes.HANDSHAKE:
            // Peer's handshake response
            const peerHandshake = payload as Handshake;
            console.log('Received handshake from peer:', peerHandshake);
            if (peerHandshake.node_type === NodeType.FULL_NODE) {
              console.log('Connected to full node successfully!');
              this.eventEmitter.emit('peer:connected', this.peer);
            }
            break;
            
          case ProtocolMessageTypes.HANDSHAKE_ACK:
            console.log('Handshake acknowledged!');
            break;
            
          case ProtocolMessageTypes.NEW_PEAK:
            const newPeak = payload as NewPeak;
            console.log(`New peak at height ${newPeak.height}`);
            // Emit event so client can request the block
            this.emit('new_peak', newPeak);
            break;
            
          case ProtocolMessageTypes.RESPOND_BLOCK:
            // Handle block response
            if (id !== undefined && this.responseHandlers.has(id)) {
              const handler = this.responseHandlers.get(id);
              this.responseHandlers.delete(id);
              handler!(payload);
            }
            break;
            
          default:
            console.log(`Unhandled message type: ${type}`);
            // Handle response callbacks for other message types
            if (id !== undefined && this.responseHandlers.has(id)) {
              const handler = this.responseHandlers.get(id);
              this.responseHandlers.delete(id);
              handler!(payload);
            }
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  async requestBlock(height: number): Promise<any> {
    const id = this.messageId++;
    
    const request = {
      height,
      include_transaction_block: true
    };
    
    const message = createMessage(
      ProtocolMessageTypes.REQUEST_BLOCK,
      request,
      id
    );
    
    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, resolve);
      
      this.ws!.send(message);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getStats(): ConnectionStats {
    return {
      connected: this.isConnected(),
      messagesReceived: this.stats.messagesReceived,
      messagesSent: this.stats.messagesSent,
      bytesReceived: this.stats.bytesReceived,
      bytesSent: this.stats.bytesSent,
      reconnectAttempts: 0
    };
  }
}