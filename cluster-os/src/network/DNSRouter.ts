import * as net from 'net';
import { ClusterMessage } from '../common/types';

class DNSRouter {
  private server: net.Server;
  private loadBalancerRegistry: Array<{ host: string; port: number }> = [];
  private currentIndex = 0;
  private clientConnections: Map<string, net.Socket> = new Map();
  private clientServerIdMap: Map<string, string> = new Map();

  constructor(port: number, loadBalancers: Array<{ host: string; port: number }>) {
    this.loadBalancerRegistry = loadBalancers;

    this.server = net.createServer((socket) => {
      const clientId = this.generateId();
      const serverId = this.generateServerIdForClient(clientId);
      this.clientConnections.set(clientId, socket);
      this.clientServerIdMap.set(clientId, serverId);

      const selectedLB = this.selectLoadBalancer();
      console.log(`[DNSRouter] Routing client ${clientId} to LoadBalancer at ${selectedLB.host}:${selectedLB.port}`);

      const lbSocket = net.createConnection(
        { host: selectedLB.host, port: selectedLB.port },
        () => {
          console.log(`[DNSRouter] Tunnel established for client ${clientId} to LoadBalancer`);
        }
      );

      socket.on('data', (data) => {
        lbSocket.write(data);
      });

      lbSocket.on('data', (data) => {
        socket.write(data);
      });

      socket.on('close', () => {
        console.log(`[DNSRouter] Client ${clientId} disconnected`);
        lbSocket.end();
        this.clientConnections.delete(clientId);
        this.clientServerIdMap.delete(clientId);
      });

      socket.on('error', (err) => {
        console.error(`[DNSRouter] Socket error for client ${clientId}:`, err);
        lbSocket.end();
        this.clientConnections.delete(clientId);
        this.clientServerIdMap.delete(clientId);
      });

      lbSocket.on('error', (err) => {
        console.error(`[DNSRouter] LoadBalancer connection error for client ${clientId}:`, err);
        socket.end();
        this.clientConnections.delete(clientId);
        this.clientServerIdMap.delete(clientId);
      });

      lbSocket.on('close', () => {
        console.log(`[DNSRouter] LoadBalancer tunnel closed for client ${clientId}`);
        socket.end();
      });
    });

    this.server.listen(port, () => {
      console.clear();
      console.log('_______________________________________________');
      console.log('________________   DNS Router   ________________');
      console.log(`||          DNS Router listening on port ${port}        ||`);
      console.log(`||          Registered ${this.loadBalancerRegistry.length} LoadBalancer instances          ||`);
      this.loadBalancerRegistry.forEach((lb, idx) => {
        const lbStr = `${idx + 1}. ${lb.host}:${lb.port}`;
        const paddedLB = lbStr.padEnd(44);
        console.log(`||  ${paddedLB}||`);
      });
      console.log('__________________________________________________');
    });
  }

  private selectLoadBalancer(): { host: string; port: number } {
    const selectedLB = this.loadBalancerRegistry[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.loadBalancerRegistry.length;
    return selectedLB;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private generateServerIdForClient(clientId: string): string {
    return `SERVERID_${Math.random().toString(36).substr(2, 12)}`;
  }

  getRegisteredLoadBalancers(): Array<{ host: string; port: number }> {
    return [...this.loadBalancerRegistry];
  }

  getActiveConnections(): number {
    return this.clientConnections.size;
  }

  getClientServerId(clientId: string): string | undefined {
    return this.clientServerIdMap.get(clientId);
  }
}

const dnsRouter = new DNSRouter(2000, [
  { host: 'localhost', port: 3000 },
  { host: 'localhost', port: 3001 },
  { host: 'localhost', port: 3002 }
]);

process.on('SIGTERM', () => {
  console.log('[DNSRouter] Shutdown initiated');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[DNSRouter] Shutdown initiated');
  process.exit(0);
})
