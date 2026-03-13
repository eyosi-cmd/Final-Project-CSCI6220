import { randomUUID } from 'node:crypto';
import * as readline from 'readline';
import { ClientTCPTransport } from '../transport/TCPTransport';
import { ClusterMessage } from '../common/types';

// user client
class UserClient {
  private transport: ClientTCPTransport;
  private rl: readline.Interface;
  private clientId: string;

  constructor(dnsRouterHost: string = 'localhost', dnsRouterPort: number = 2000) {
    var self = this;
    this.clientId = 'client-' + randomUUID();

    // connect
    this.transport = new ClientTCPTransport(dnsRouterHost, dnsRouterPort);
    this.transport.setMessageHandler(function(msg) { self.handleMessage(msg); });

    // readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'ClusterOS > '
    });

    // line handler
    this.rl.on('line', function(line) {
      self.handleCommand(line.trim());
    });

    // close handler
    this.rl.on('close', function() {
      console.log('Goodbye');
      self.transport.close();
      process.exit(0);
    });

    // startup
    console.clear();
    console.log('_______________________________________________');
    console.log('_________________   User Client   _____________');
    console.log('||          User Client started                 ||');
    var clientIdStr = 'ID: ' + this.clientId;
    var paddedClientId = clientIdStr.padEnd(44);
    console.log('||  ' + paddedClientId + '||');
    console.log('||  Connected to DNS Router (localhost:2000)    ||');
    console.log('||          Type "help" for available commands  ||');
    console.log('__________________________________________________');
    this.rl.prompt();
  }

  // handle commands
  private handleCommand(command: string) {
    var parts = command.split(' ');
    var cmd = parts[0].toLowerCase();

    if (cmd === 'submit') {
      if (parts.length < 2) {
        console.log('Usage: submit <data>');
        this.rl.prompt();
        return;
      }
      var data = '';
      for (var i = 1; i < parts.length; i++) {
        data += parts[i] + ' ';
      }
      this.sendJob(data.trim());
    } else if (cmd === 'status') {
      this.requestStatus();
    } else if (cmd === 'help') {
      this.showHelp();
    } else if (cmd === 'exit') {
      this.rl.close();
    } else {
      console.log('Unknown command');
      this.rl.prompt();
    }
  }

  // send job
  private sendJob(data: string) {
    var payload;
    try {
      payload = JSON.parse(data);
      if (!Array.isArray(payload)) {
        throw new Error('Not an array');
      }
    } catch (e) {
      payload = data;
    }

    var message = {
      type: 'JOB_SUBMIT',
      senderId: this.clientId,
      requestId: randomUUID(),
      payload: payload
    };
    console.log('Job: ' + message.requestId);
    this.transport.send(message as unknown as ClusterMessage);
  }

  // status
  private requestStatus() {
    var message = {
      type: 'CLUSTER_STATUS',
      senderId: this.clientId,
      requestId: randomUUID(),
      payload: {}
    };
    this.transport.send(message as unknown as ClusterMessage);
  }

  // help
  private showHelp() {
    console.log('Commands:');
    console.log('  submit <data>');
    console.log('  status');
    console.log('  help');
    console.log('  exit');
    console.log('');
    this.rl.prompt();
  }

  // handle response
  private handleMessage(message: ClusterMessage) {
    if (message.type === 'JOB_RESULT') {
      console.log('Job ' + message.requestId + ' done: ' + JSON.stringify(message.payload));
      this.rl.prompt();
    } else if (message.type === 'CLUSTER_STATUS_REPLY') {
      var healthyNodes = message.payload;
      console.log('Status: ' + healthyNodes.length + ' nodes');
      if (healthyNodes.length > 0) {
        console.log('Nodes: ' + healthyNodes.join(', '));
      }
      this.rl.prompt();
    }
  }
}

// Start the client
new UserClient();