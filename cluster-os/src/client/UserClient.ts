import { randomUUID } from 'node:crypto';
import * as readline from 'readline';
import { ClientTCPTransport } from '../transport/TCPTransport';
import { ClusterMessage } from '../common/types';

/**
 * UserClient now connects to the DNSRouter instead of directly to LoadBalancer.
 * The DNSRouter transparently routes the connection to one of the LoadBalancer instances.
 */
class UserClient {
  private transport: ClientTCPTransport;
  private rl: readline.Interface;
  private clientId: string;

  constructor(dnsRouterHost: string = 'localhost', dnsRouterPort: number = 2000) {
    this.clientId = 'client-' + randomUUID();

    // Connect to the DNS Router instead of LoadBalancer
    this.transport = new ClientTCPTransport(dnsRouterHost, dnsRouterPort);
    this.transport.setMessageHandler(this.handleMessage.bind(this));

    // Set up readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[36mClusterOS >\x1b[0m '
    });

    // Handle commands
    this.rl.on('line', (line) => {
      this.handleCommand(line.trim());
    });

    // Handle exit
    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      this.transport.close();
      process.exit(0);
    });

    // Start the prompt
    console.clear();
    console.log('_______________________________________________');
    console.log('_________________   User Client   _____________');
    console.log(`||          User Client started                 ||`);
    const clientIdStr = `ID: ${this.clientId}`;
    const paddedClientId = clientIdStr.padEnd(44);
    console.log(`||  ${paddedClientId}||`);
    console.log(`||  Connected to DNS Router (localhost:2000)    ||`);
    console.log('||          Type "help" for available commands  ||');
    console.log('__________________________________________________');
    this.rl.prompt();
  }

  /**
   * Handles user commands from the REPL.
   */
  private handleCommand(command: string) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'submit':
        if (parts.length < 2) {
          console.log('Usage: submit <data>');
          this.rl.prompt();
          return;
        }
        const data = parts.slice(1).join(' ');
        this.sendJob(data);
        break;

      case 'status':
        this.requestStatus();
        break;

      case 'help':
        this.showHelp();
        break;

      case 'exit':
        this.rl.close();
        break;

      default:
        console.log('Unknown command. Type "help" for available commands.');
        this.rl.prompt();
    }
  }

  /**
   * Sends a job to the LoadBalancer (via DNSRouter).
   */
  private sendJob(data: string) {
    let payload: any;
    try {
      payload = JSON.parse(data);
      if (!Array.isArray(payload)) {
        throw new Error('Not an array');
      }
    } catch {
      payload = data;
    }

    const message: ClusterMessage = {
      type: 'JOB_SUBMIT',
      senderId: this.clientId,
      requestId: randomUUID(),
      payload
    };
    console.log(`Submitting job: ${message.requestId}`);
    this.transport.send(message);
  }

  /**
   * Requests cluster status.
   */
  private requestStatus() {
    const message: ClusterMessage = {
      type: 'CLUSTER_STATUS',
      senderId: this.clientId,
      requestId: randomUUID(),
      payload: {}
    };
    this.transport.send(message);
  }

  /**
   * Shows available commands.
   */
  private showHelp() {
    console.log('\nAvailable commands:');
    console.log('  submit <data>  - Submit a job (data can be JSON array or string)');
    console.log('  status         - Query cluster status (healthy nodes)');
    console.log('  help           - Show this help message');
    console.log('  exit           - Exit the client');
    console.log('');
    this.rl.prompt();
  }

  /**
   * Handles responses from the Load Balancer.
   */
  private handleMessage(message: ClusterMessage) {
    if (message.type === 'JOB_RESULT') {
      console.log(`\nJob ${message.requestId} completed! Result:`, message.payload);
      this.rl.prompt();
    } else if (message.type === 'CLUSTER_STATUS_REPLY') {
      const healthyNodes = message.payload as string[];
      console.log(`\nCluster Status: ${healthyNodes.length} healthy nodes`);
      if (healthyNodes.length > 0) {
        console.log('Healthy nodes:', healthyNodes.join(', '));
      }
      this.rl.prompt();
    }
  }
}

// Start the client
new UserClient();