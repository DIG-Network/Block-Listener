import * as WebSocket from 'ws';
import * as tls from 'tls';
import { EventEmitter } from 'events';
import { 
  ProtocolMessageTypes, 
  NodeType, 
  PROTOCOL_VERSION, 
  NETWORK_ID 
} from '../protocol/types';
import { 
  createMessage, 
  Handshake, 
  HandshakeAck,
  NewPeak,
  RespondBlock,
  RespondBlocks,
  MessageDataMap
} from '../protocol/messages';
import { encodeMessage, decodeMessage } from '../protocol/serialization';
import { createLogger, Logger } from '../utils/logger';

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
  private options: Required<ConnectionOptions>;
  private logger: Logger;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private messageBuffer: Buffer = Buffer.alloc(0);
  private pendingRequests: Map<number, {
    resolve: (data: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private nextMessageId: number = 1;
  private stats: ConnectionStats = {
    connected: false,
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
    reconnectAttempts: 0
  };

  constructor(options: ConnectionOptions) {
    super();
    
    this.options = {
      host: options.host,
      port: options.port,
      networkId: options.networkId || NETWORK_ID,
      nodeType: options.nodeType || NodeType.FULL_NODE,
      certificatePath: options.certificatePath || '',
      keyPath: options.keyPath || '',
      caCertPath: options.caCertPath || '',
      reconnectInterval: options.reconnectInterval || 5000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      heartbeatInterval: options.heartbeatInterval || 30000,
      requestTimeout: options.requestTimeout || 30000
    };
    
    this.logger = createLogger(`Connection:${options.host}:${options.port}`);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `wss://${this.options.host}:${this.options.port}/ws`;
        
        // Create TLS options (simplified for development)
        const tlsOptions: tls.ConnectionOptions = {
          rejectUnauthorized: false, // For development only
          // In production, use proper certificates:
          // cert: fs.readFileSync(this.options.certificatePath),
          // key: fs.readFileSync(this.options.keyPath),
          // ca: this.options.caCertPath ? fs.readFileSync(this.options.caCertPath) : undefined
        };

        this.logger.info(`Connecting to ${url}`);
        
        this.ws = new WebSocket(url, {
          ...tlsOptions,
          handshakeTimeout: 10000
        });

        this.ws.on('open', () => {
          this.logger.info('WebSocket connection established');
          this.stats.connected = true;
          this.stats.connectedAt = new Date();
          this.stats.reconnectAttempts = 0;
          
          // Send handshake
          this.sendHandshake();
          
          // Start heartbeat
          this.startHeartbeat();
          
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.stats.messagesReceived++;
          this.stats.bytesReceived += data.length;
          this.stats.lastMessageAt = new Date();
          
          this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
          this.logger.error('WebSocket error', { error: error.message });
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code: number, reason: string) => {
          this.logger.info('WebSocket connection closed', { code, reason });
          this.stats.connected = false;
          this.stats.disconnectedAt = new Date();
          
          this.cleanup();
          this.emit('disconnected', { code, reason });
          
          // Attempt reconnection
          if (this.stats.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        });

      } catch (error) {
        this.logger.error('Failed to connect', { error });
        reject(error);
      }
    });
  }

  private sendHandshake(): void {
    const handshake = createMessage(ProtocolMessageTypes.HANDSHAKE, {
      network_id: this.options.networkId,
      protocol_version: PROTOCOL_VERSION,
      software_version: '1.0.0',
      server_port: 8444,
      node_type: this.options.nodeType,
      capabilities: []
    });
    
    this.sendMessage(handshake);
  }

  private handleMessage(data: Buffer): void {
    try {
      // Append to message buffer
      this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
      
      // Try to decode messages from buffer
      while (this.messageBuffer.length >= 4) {
        // Read message length (first 4 bytes)
        const messageLength = this.messageBuffer.readUInt32BE(0);
        
        if (this.messageBuffer.length < 4 + messageLength) {
          // Not enough data for complete message
          break;
        }
        
        // Extract complete message
        const messageData = this.messageBuffer.slice(4, 4 + messageLength);
        this.messageBuffer = this.messageBuffer.slice(4 + messageLength);
        
        // Decode and process message
        const message = decodeMessage(messageData);
        this.processMessage(message);
      }
    } catch (error) {
      this.logger.error('Failed to handle message', { error });
      this.emit('error', error);
    }
  }

  private processMessage(message: any): void {
    this.logger.debug('Received message', { type: message.type });
    
    // Handle response to pending request
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      pending.resolve(message.data);
      return;
    }
    
    // Handle specific message types
    switch (message.type) {
      case ProtocolMessageTypes.HANDSHAKE_ACK:
        const ack = message.data as HandshakeAck;
        if (ack.success) {
          this.logger.info('Handshake successful');
          this.emit('connected');
        } else {
          this.logger.error('Handshake failed');
          this.disconnect();
        }
        break;
        
      case ProtocolMessageTypes.NEW_PEAK:
        this.emit('new_peak', message.data as NewPeak);
        break;
        
      case ProtocolMessageTypes.RESPOND_BLOCK:
        this.emit('block', message.data as RespondBlock);
        break;
        
      case ProtocolMessageTypes.RESPOND_BLOCKS:
        this.emit('blocks', message.data as RespondBlocks);
        break;
        
      case ProtocolMessageTypes.PING:
        // Respond with pong
        this.sendMessage(createMessage(ProtocolMessageTypes.PONG, {}));
        break;
        
      default:
        this.emit('message', message);
    }
  }

  sendMessage<T extends keyof MessageDataMap>(
    message: { type: T; data: MessageDataMap[T]; id?: number }
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Cannot send message: connection not open');
      return;
    }
    
    try {
      const encoded = encodeMessage(message);
      const lengthBuffer = Buffer.allocUnsafe(4);
      lengthBuffer.writeUInt32BE(encoded.length, 0);
      
      const fullMessage = Buffer.concat([lengthBuffer, encoded]);
      
      this.ws.send(fullMessage);
      this.stats.messagesSent++;
      this.stats.bytesSent += fullMessage.length;
      
      this.logger.debug('Sent message', { type: message.type });
    } catch (error) {
      this.logger.error('Failed to send message', { error });
      this.emit('error', error);
    }
  }

  async sendRequest<T extends keyof MessageDataMap, R>(
    type: T,
    data: MessageDataMap[T],
    expectedResponseType?: ProtocolMessageTypes
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const id = this.nextMessageId++;
      
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for message type ${type}`));
      }, this.options.requestTimeout);
      
      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });
      
      // Send message with ID
      this.sendMessage({ type, data, id });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(createMessage(ProtocolMessageTypes.PING, {}));
      }
    }, this.options.heartbeatInterval);
  }

  private scheduleReconnect(): void {
    this.stats.reconnectAttempts++;
    const delay = this.options.reconnectInterval * Math.min(this.stats.reconnectAttempts, 5);
    
    this.logger.info(`Scheduling reconnection attempt ${this.stats.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        this.logger.error('Reconnection failed', { error });
      });
    }, delay);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
    
    // Clear message buffer
    this.messageBuffer = Buffer.alloc(0);
  }

  disconnect(): void {
    this.logger.info('Disconnecting');
    
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = undefined;
    }
    
    this.cleanup();
    this.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
  }

  isConnected(): boolean {
    return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
  }

  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  getPeerId(): string {
    return `${this.options.host}:${this.options.port}`;
  }
}