import * as net from 'net';
import { ClusterMessage } from '../common/types';

interface LoadBalancerRegistryEntry {
  host: string;
  port: number;
  id: string;
  registered: number;
}

class DNSRouter {
  private server: net.Server | null = null;
  private registrationServer: net.Server | null = null;
  private loadBalancerRegistry: LoadBalancerRegistryEntry[] = [];
  private lbIdToAddress: Map<string, { host: string; port: number }> = new Map();
  private currentIndex = 0;
  private clientConnections: Map<string, net.Socket> = new Map();
  private clientServerIdMap: Map<string, string> = new Map();
  private registrationPort: number;
  private lbRegistrationTimeout = 60000; // 60 seconds heartbeat timeout for LBs

  constructor(port: number, registrationPort: number, loadBalancers: Array<{ host: string; port: number }>) {
    this.registrationPort = registrationPort;
    
    const registry: LoadBalancerRegistryEntry[] = [];
    for (let i = 0; i < loadBalancers.length; i++) {
      const lb = loadBalancers[i];
      registry.push({
        host: lb.host,
        port: lb.port,
        id: 'LB-seed-' + i,
        registered: Date.now()
      });
    }
    this.loadBalancerRegistry = registry;

    for (let i = 0; i < this.loadBalancerRegistry.length; i++) {
      const lb = this.loadBalancerRegistry[i];
      this.lbIdToAddress.set(lb.id, { host: lb.host, port: lb.port });
    }

    this.setupClientRoutingServer(port);
    this.setupLoadBalancerRegistrationServer(registrationPort);
  }

  private setupClientRoutingServer(port: number) {
    const self = this;
    this.server = net.createServer(function(socket) {
      const cid = self.generateId();
      const serverId = self.generateServerIdForClient(cid);
      self.clientConnections.set(cid, socket);
      self.clientServerIdMap.set(cid, serverId);

      const lb = self.selectLoadBalancer();
      if (!lb) {
        console.log('[DNSRouter] No load balancer available');
        socket.end();
        self.clientConnections.delete(cid);
        self.clientServerIdMap.delete(cid);
        return;
      }

      console.log('[DNSRouter] Routing client ' + cid + ' to LB');

      const lbSocket = net.createConnection(
        { host: lb.host, port: lb.port },
        function() {
          console.log('[DNSRouter] Connected to load balancer');
        }
      );

      socket.on('data', function(data) {
        // forward client data to LB
        lbSocket.write(data);
      });

      lbSocket.on('data', function(data) {
        // send LB response back to client
        socket.write(data);
      });

      socket.on('close', function() {
        console.log('[DNSRouter] Client ' + cid + ' disconnected');
        lbSocket.end();
        self.clientConnections.delete(cid);
        self.clientServerIdMap.delete(cid);
      });

      socket.on('error', function(err) {
        console.log('[DNSRouter] Client socket error: ' + err.message);
        lbSocket.end();
        self.clientConnections.delete(cid);
        self.clientServerIdMap.delete(cid);
      });

      lbSocket.on('error', function(err) {
        console.log('[DNSRouter] LB connection error: ' + err.message);
        socket.end();
        self.clientConnections.delete(cid);
        self.clientServerIdMap.delete(cid);
      });

      lbSocket.on('close', function() {
        console.log('LB tunnel closed');
        socket.end();
      });
    });

    this.server.listen(port, function() {
      console.clear();
      console.log('_______________________________________________');
      console.log('________________   DNS Router   ________________');
      console.log('||          DNS Router listening on port ' + port + '        ||');
      console.log('||  Client Routing: Port ' + port + '                           ||');
      console.log('||  LB Registration: Port ' + self.registrationPort + '                        ||');
      console.log('__________________________________________________');
    });
  }

  private setupLoadBalancerRegistrationServer(port: number) {
    this.registrationServer = net.createServer((socket) => {
      console.log(`[DNSRouter-Registration] New LoadBalancer registration connection from ${socket.remoteAddress}:${socket.remotePort}`);
      
      let buffer = '';
      
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().length === 0) continue;
          
          try {
            const message: ClusterMessage = JSON.parse(line);
            
            if (message.type === 'REGISTER_LB') {
              this.handleLoadBalancerRegistration(socket, message);
            } else if (message.type === 'DEREGISTER_LB') {
              this.handleLoadBalancerDeregistration(socket, message);
            }
          } catch (err) {
            console.error(`[DNSRouter-Registration] Error parsing message:`, err);
          }
        }
      });

      socket.on('close', () => {
        console.log(`[DNSRouter-Registration] LoadBalancer disconnected from ${socket.remoteAddress}:${socket.remotePort}`);
      });

      socket.on('error', (err) => {
        console.error(`[DNSRouter-Registration] Socket error:`, err);
      });
    });

    this.registrationServer.listen(port, () => {
      console.log(`[DNSRouter] LoadBalancer registration server listening on port ${port}`);
    });
  }

  private handleLoadBalancerRegistration(socket: net.Socket, message: ClusterMessage) {
    const { host, port, lbId } = message.payload;
    
    if (!host || !port || !lbId) {
      console.error(`[DNSRouter-Registration] Invalid registration payload:`, message.payload);
      const ack: ClusterMessage = {
        type: 'REGISTER_LB_ACK',
        senderId: 'dns-router',
        requestId: message.requestId,
        payload: { success: false, error: 'Invalid payload' }
      };
      socket.write(JSON.stringify(ack) + '\n');
      return;
    }

    // Check if already registered with same ID
    const existingIndex = this.loadBalancerRegistry.findIndex(lb => lb.id === lbId);
    
    if (existingIndex >= 0) {
      // Update existing entry
      this.loadBalancerRegistry[existingIndex] = {
        host,
        port,
        id: lbId,
        registered: Date.now()
      };
      this.lbIdToAddress.set(lbId, { host, port });
      console.log(`[DNSRouter-Registration] Updated LoadBalancer ${lbId} at ${host}:${port}`);
    } else {
      // Add new entry
      this.loadBalancerRegistry.push({
        host,
        port,
        id: lbId,
        registered: Date.now()
      });
      this.lbIdToAddress.set(lbId, { host, port });
      console.log(`[DNSRouter-Registration] Registered new LoadBalancer ${lbId} at ${host}:${port}`);
    }

    this.printRegistryStatus();

    const ack: ClusterMessage = {
      type: 'REGISTER_LB_ACK',
      senderId: 'dns-router',
      requestId: message.requestId,
      payload: { success: true, lbId, registrySize: this.loadBalancerRegistry.length }
    };
    socket.write(JSON.stringify(ack) + '\n');
  }

  private handleLoadBalancerDeregistration(socket: net.Socket, message: ClusterMessage) {
    const { lbId } = message.payload;
    
    if (!lbId) {
      console.error(`[DNSRouter-Registration] Invalid deregistration payload:`, message.payload);
      const ack: ClusterMessage = {
        type: 'REGISTER_LB_ACK',
        senderId: 'dns-router',
        requestId: message.requestId,
        payload: { success: false, error: 'Invalid payload' }
      };
      socket.write(JSON.stringify(ack) + '\n');
      return;
    }

    const index = this.loadBalancerRegistry.findIndex(lb => lb.id === lbId);
    if (index >= 0) {
      const removed = this.loadBalancerRegistry.splice(index, 1)[0];
      this.lbIdToAddress.delete(lbId);
      console.log(`[DNSRouter-Registration] Deregistered LoadBalancer ${lbId} at ${removed.host}:${removed.port}`);
      this.printRegistryStatus();
    } else {
      console.warn(`[DNSRouter-Registration] Attempted to deregister unknown LoadBalancer ${lbId}`);
    }

    const ack: ClusterMessage = {
      type: 'REGISTER_LB_ACK',
      senderId: 'dns-router',
      requestId: message.requestId,
      payload: { success: true, lbId, registrySize: this.loadBalancerRegistry.length }
    };
    socket.write(JSON.stringify(ack) + '\n');
  }

  private printRegistryStatus() {
    console.log('Registry size: ' + this.loadBalancerRegistry.length);
    for (var i = 0; i < this.loadBalancerRegistry.length; i++) {
      var lb = this.loadBalancerRegistry[i];
      console.log('  ' + (i + 1) + '. [' + lb.id + '] ' + lb.host + ':' + lb.port);
    }
  }

  private selectLoadBalancer(): { host: string; port: number } | null {
    if (this.loadBalancerRegistry.length === 0) {
      console.error(`[DNSRouter] No LoadBalancers available in registry`);
      return null;
    }

    const selectedLB = this.loadBalancerRegistry[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.loadBalancerRegistry.length;
    return { host: selectedLB.host, port: selectedLB.port };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private generateServerIdForClient(clientId: string): string {
    return `SERVERID_${Math.random().toString(36).substr(2, 12)}`;
  }

  getRegisteredLoadBalancers(): Array<{ host: string; port: number; id: string }> {
    var ret = [];
    for (var i = 0; i < this.loadBalancerRegistry.length; i++) {
      var lb = this.loadBalancerRegistry[i];
      ret.push({
        host: lb.host,
        port: lb.port,
        id: lb.id
      });
    }
    return ret;
  }

  getActiveConnections(): number {
    return this.clientConnections.size;
  }

  getClientServerId(clientId: string): string | undefined {
    return this.clientServerIdMap.get(clientId);
  }
}

const dnsRouter = new DNSRouter(2000, 3000, [
  { host: 'localhost', port: 3010 },
  { host: 'localhost', port: 3011 },
  { host: 'localhost', port: 3012 }
]);

process.on('SIGTERM', () => {
  console.log('[DNSRouter] Shutdown initiated');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[DNSRouter] Shutdown initiated');
  process.exit(0);
})
