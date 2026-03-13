import * as net from 'net';
import { ClusterMessage } from '../common/types';

/**
 * TCPTransport handles server-side TCP connections for the Load Balancer.
 * It manages multiple client connections, buffers incoming data, and parses JSON messages.
 */
export class TCPTransport {
  private server: net.Server;
  private clients: Map<string, net.Socket> = new Map();
  private messageHandler?: (id: string, message: ClusterMessage) => void;
  private closureHandler?: (id: string) => void;

  constructor(port: number) {
    this.server = net.createServer((socket) => {
      // Assign a unique ID to each connection
      const id = this.generateId();
      this.clients.set(id, socket);

      let buffer = '';

      socket.on('data', (data) => {
        // Accumulate data in buffer
        buffer += data.toString();

        let newlineIndex;
        // Process complete messages (delimited by newline)
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const messageStr = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          try {
            const message: ClusterMessage = JSON.parse(messageStr);
            if (this.messageHandler) {
              this.messageHandler(id, message);
            }
          } catch (e) {
            console.error('Failed to parse message:', e);
          }
        }
      });

      socket.on('close', () => {
        // Remove disconnected client
        this.clients.delete(id);
        // Notify the handler of the closure
        if (this.closureHandler) {
          this.closureHandler(id);
        }
      });

      socket.on('error', (err) => {
        console.error('Socket error:', err);
        this.clients.delete(id);
        if (this.closureHandler) {
          this.closureHandler(id);
        }
      });
    });

    this.server.listen(port, () => {
      console.clear();
      console.log('_______________________________________________');
      console.log('________________  Load Balancer   _____________');
      console.log(`||          Load Balancer listening on port ${port}   ||`);
      console.log('__________________________________________________');
    });
  }

  /**
   * Sets the handler for incoming messages.
   */
  setMessageHandler(handler: (id: string, message: ClusterMessage) => void) {
    this.messageHandler = handler;
  }

  /**
   * Sets the handler for connection closures.
   */
  setConnectionClosureHandler(handler: (id: string) => void) {
    this.closureHandler = handler;
  }

  /**
   * Sends a message to a specific client.
   */
  send(id: string, message: ClusterMessage) {
    const socket = this.clients.get(id);
    if (socket) {
      socket.write(JSON.stringify(message) + '\n');
    }
  }

  /**
   * Gets the list of connected client IDs.
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

/**
 * ClientTCPTransport handles client-side TCP connections for workers and users.
 * It connects to the Load Balancer and manages message sending/receiving.
 */
export class ClientTCPTransport {
  private socket: net.Socket;
  private messageHandler?: (message: ClusterMessage) => void;
  private buffer = '';

  constructor(host: string, port: number) {
    this.socket = net.createConnection({ host, port }, () => {
      // Connection established - components will display their own messages
    });

    this.socket.on('data', (data) => {
      this.buffer += data.toString();

      let newlineIndex;
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const messageStr = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);

        try {
          const message: ClusterMessage = JSON.parse(messageStr);
          if (this.messageHandler) {
            this.messageHandler(message);
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      }
    });

    this.socket.on('close', () => {
      console.log('Disconnected from Load Balancer');
    });

    this.socket.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  /**
   * Sets the handler for incoming messages.
   */
  setMessageHandler(handler: (message: ClusterMessage) => void) {
    this.messageHandler = handler;
  }

  /**
   * Sends a message to the server.
   */
  send(message: ClusterMessage) {
    this.socket.write(JSON.stringify(message) + '\n');
  }

  /**
   * Closes the connection.
   */
  close() {
    this.socket.end();
  }
}