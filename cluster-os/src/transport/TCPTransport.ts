import * as net from 'net';
import { ClusterMessage } from '../common/types';

// TCP server
export class TCPTransport {
  private server: net.Server;
  private clients: Map<string, net.Socket> = new Map();
  private messageHandler?: (id: string, message: ClusterMessage) => void;
  private closureHandler?: (id: string) => void;

  constructor(port: number) {
    this.server = net.createServer(function(socket) {
      // id for connection
      const id = this.generateId();
      this.clients.set(id, socket);

      let buffer = '';

      socket.on('data', function(data) {
        buffer += data.toString();

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const messageStr = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          try {
            const message = JSON.parse(messageStr);
            if (this.messageHandler) {
              this.messageHandler(id, message);
            }
          } catch (e) {
            console.log('error');
          }
        }
      }.bind(this));

      socket.on('close', function() {
        this.clients.delete(id);
        if (this.closureHandler) {
          this.closureHandler(id);
        }
      }.bind(this));

      socket.on('error', function(err) {
        console.log('socket error');
        this.clients.delete(id);
        if (this.closureHandler) {
          this.closureHandler(id);
        }
      }.bind(this));
    }.bind(this));

    this.server.listen(port, function() {
      console.clear();
      console.log('_______________________________________________');
      console.log('________________  Load Balancer   _____________');
      console.log('||          Load Balancer listening on port ' + port + '   ||');
      console.log('__________________________________________________');
    });
  }

  // set message handler
  setMessageHandler(handler: (id: string, message: ClusterMessage) => void) {
    this.messageHandler = handler;
  }

  // set closure handler
  setConnectionClosureHandler(handler: (id: string) => void) {
    this.closureHandler = handler;
  }

  // send message
  send(id: string, message: ClusterMessage) {
    const socket = this.clients.get(id);
    if (socket) {
      socket.write(JSON.stringify(message) + '\n');
    }
  }

  // get client ids
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Client TCP
export class ClientTCPTransport {
  private socket: net.Socket;
  private messageHandler?: (message: ClusterMessage) => void;
  private buffer = '';

  constructor(host: string, port: number) {
    this.socket = net.createConnection({ host: host, port: port }, function() {
      // connected
    });

    this.socket.on('data', function(data) {
      this.buffer += data.toString();

      let newlineIndex;
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const messageStr = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);

        try {
          const message = JSON.parse(messageStr);
          if (this.messageHandler) {
            this.messageHandler(message);
          }
        } catch (e) {
          console.log('error');
        }
      }
    }.bind(this));

    this.socket.on('close', function() {
      console.log('disconnected');
    });

    this.socket.on('error', function(err) {
      console.log('error');
    });
  }

  // set handler
  setMessageHandler(handler: (message: ClusterMessage) => void) {
    this.messageHandler = handler;
  }

  // send
  send(message: ClusterMessage) {
    this.socket.write(JSON.stringify(message) + '\n');
  }

  // close
  close() {
    this.socket.end();
  }
}