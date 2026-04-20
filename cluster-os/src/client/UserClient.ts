import { randomUUID } from 'node:crypto';
import * as readline from 'readline';
import { ClientTCPTransport } from '../transport/TCPTransport';
import { ClusterMessage } from '../common/types';

// userclient
class UserClient {
  private transport: ClientTCPTransport;
  private readline: readline.Interface;
  private myClientId: string;

  constructor(dnsHost: string = 'localhost', dnsPort: number = 2000) {
    var self = this;
    this.myClientId = 'client-' + randomUUID();

    // set up connection to DNS router
    this.transport = new ClientTCPTransport(dnsHost, dnsPort);
    this.transport.setMessageHandler(function(msg) { 
      self.handleMessage(msg); 
    });

    // set up readline interface
    this.readline = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'ClusterOS > '
    });

    // handle user input
    this.readline.on('line', function(line) {
      var trimmedLine = line.trim();
      self.handleCommand(trimmedLine);
    });

    // handle exit
    this.readline.on('close', function() {
      console.log('Goodbye');
      self.transport.close();
      process.exit(0);
    });

    // display startup message
    console.clear();
    console.log('_______________________________________________');
    console.log('_________________   User Client   _____________');
    console.log('||          User Client started                 ||');
    var clientIdStr = 'ID: ' + this.myClientId;
    var paddedClientId = clientIdStr.padEnd(44);
    console.log('||  ' + paddedClientId + '||');
    console.log('||  Connected to DNS Router (localhost:2000)    ||');
    console.log('||          Type "help" for available commands  ||');
    console.log('__________________________________________________');
    this.readline.prompt();
  }

  // parse and handle user commands
  private handleCommand(command: string) {
    var cmdParts = command.split(' ');
    var cmdName = cmdParts[0].toLowerCase();

    if (cmdName === 'submit') {
      if (cmdParts.length < 2) {
        console.log('Usage: submit <data>');
        this.readline.prompt();
        return;
      }
      var jobData = '';
      for (var i = 1; i < cmdParts.length; i++) {
        jobData += cmdParts[i] + ' ';
      }
      this.sendJob(jobData.trim());
    } else if (cmdName === 'status') {
      this.requestStatus();
    } else if (cmdName === 'help') {
      this.showHelp();
    } else if (cmdName === 'exit') {
      this.readline.close();
    } else {
      console.log('Unknown command');
      this.readline.prompt();
    }
  }

  // send job to cluster
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
      senderId: this.myClientId,
      requestId: randomUUID(),
      payload: payload
    };
    console.log('Job: ' + message.requestId);
    this.transport.send(message as unknown as ClusterMessage);
  }

  // request cluster status
  private requestStatus() {
    var message = {
      type: 'CLUSTER_STATUS',
      senderId: this.myClientId,
      requestId: randomUUID(),
      payload: {}
    };
    this.transport.send(message as unknown as ClusterMessage);
  }

  // show help
  private showHelp() {
    console.log('Commands:');
    console.log('  submit <data>');
    console.log('  status');
    console.log('  help');
    console.log('  exit');
    console.log('');
    this.readline.prompt();
  }

  // handle message from cluster
  private handleMessage(message: ClusterMessage) {
    if (message.type === 'JOB_RESULT') {
      console.log('Job ' + message.requestId + ' done: ' + JSON.stringify(message.payload));
      this.readline.prompt();
    } else if (message.type === 'CLUSTER_STATUS_REPLY') {
      var healthyNodes = message.payload;
      console.log('Status: ' + healthyNodes.length + ' nodes');
      if (healthyNodes.length > 0) {
        console.log('Nodes: ' + healthyNodes.join(', '));
      }
      this.readline.prompt();
    }
  }
}

// Start the client
new UserClient();