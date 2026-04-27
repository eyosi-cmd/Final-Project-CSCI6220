import * as net from 'net';
import { ClusterMessage } from '../common/types';

// TCP server for load balancer
export class TCPTransport {
  private server: net.Server;
  private clients: Map<string, net.Socket> = new Map();
  private msgHandler?: (id: string, message: ClusterMessage) => void;
  private connClosedHandler?: (id: string) => void;

  constructor(port: number) {
    this.server = net.createServer((socket) => {
      // generate unique id for this connection
      const connId = this.generateId();
      this.clients.set(connId, socket);

      let buf = '';

      socket.on('data', (data) => {
        buf += data.toString();

        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const msgStr = buf.slice(0, idx);
          buf = buf.slice(idx + 1);

          try {
            const msg = JSON.parse(msgStr);
            if (this.msgHandler) {
              this.msgHandler(connId, msg);
            }
          } catch (e) {
            console.log('[TCPTransport] Failed to parse message: ' + e);
          }
        }
      });

      socket.on('close', () => {
        this.clients.delete(connId);
        if (this.connClosedHandler) {
          this.connClosedHandler(connId);
        }
      });

      socket.on('error', (err) => {
        console.log('[TCPTransport] Socket error: ' + err.message);
        this.clients.delete(connId);
        if (this.connClosedHandler) {
          this.connClosedHandler(connId);
        }
      });
    });

    this.server.listen(port, () => {
      console.clear();
      console.log('_______________________________________________');
      console.log('________________  Load Balancer   _____________');
      console.log('||          Load Balancer listening on port ' + port + '   ||');
      console.log('__________________________________________________');
    });
  }

  // set up message handler
  setMessageHandler(handler: (id: string, message: ClusterMessage) => void) {
    this.msgHandler = handler;
  }

  // handle when connection closes
  setConnectionClosureHandler(handler: (id: string) => void) {
    this.connClosedHandler = handler;
  }

  // send message to a client
  send(id: string, message: ClusterMessage) {
    const s = this.clients.get(id);
    if (s && !s.destroyed) {
      s.write(JSON.stringify(message) + '\n');
    }
  }

  // get list of all connected clients
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  private generateId(): string {
    return 'conn-' + Math.random().toString(36).substr(2, 9);
  }
}

// Client TCP
export class ClientTCPTransport {
  private socket!: net.Socket;
  private messageHandler?: (message: ClusterMessage) => void;
  private buffer = '';
  private host: string;
  private port: number;
  private destroyed = false;
  private reconnectDelay = 2000;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.connect();
  }

  private connect() {
    if (this.destroyed) return;
    this.buffer = '';
    this.socket = net.createConnection({ host: this.host, port: this.port });

    this.socket.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      let newlineIndex;
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const messageStr = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        try {
          const message = JSON.parse(messageStr);
          if (this.messageHandler) this.messageHandler(message);
        } catch (e) {
          // malformed message — skip
        }
      }
    });

    this.socket.on('close', () => {
      if (!this.destroyed) {
        console.log('[ClientTCP] Disconnected from ' + this.host + ':' + this.port + ' — reconnecting in ' + this.reconnectDelay + 'ms');
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    });

    this.socket.on('error', (err: Error) => {
      console.log('[ClientTCP] Connection error: ' + err.message);
      // 'close' event fires after 'error', reconnect happens there
    });
  }

  // set handler
  setMessageHandler(handler: (message: ClusterMessage) => void) {
    this.messageHandler = handler;
  }

  // send
  send(message: ClusterMessage) {
    if (this.socket && !this.socket.destroyed && this.socket.writable) {
      this.socket.write(JSON.stringify(message) + '\n');
    }
  }

  // close
  close() {
    this.destroyed = true;
    this.socket.end();
  }
}
