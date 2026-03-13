import { randomUUID } from 'node:crypto';
import { ClientTCPTransport } from '../transport/TCPTransport';
import { ClusterMessage, HeartbeatPayload } from '../common/types';

class WorkerNode {
  private transport: ClientTCPTransport;
  private nodeId: string;
  private activeJobCount = 0;
  private cancelledJobs: Set<string> = new Set();

  constructor() {
    var self = this;
    this.nodeId = randomUUID();

    // Establish connection to the Load Balancer
    this.transport = new ClientTCPTransport('localhost', 3010);
    this.transport.setMessageHandler(this.handleMessage.bind(this));

    console.clear();
    console.log('_______________________________________________');
    console.log('________________   Worker Node   ______________');
    console.log('||          Worker Node started                  ||');
    var idStr = 'ID: ' + this.nodeId;
    var paddedId = idStr.padEnd(44);
    console.log('||  ' + paddedId + '||');
    console.log('__________________________________________________');

    this.sendHeartbeat();
    setInterval(function() {
      self.sendHeartbeat();
    }, 2000);
  }

  private sendHeartbeat() {
    var payload = {
      activeJobs: this.activeJobCount
    };
    var message = {
      type: 'HEARTBEAT' as any,
      senderId: this.nodeId,
      requestId: '',
      payload: payload
    } as ClusterMessage;
    this.transport.send(message);
  }

  private handleMessage(message: ClusterMessage) {
    var self = this;
    if (message.type === 'JOB_SUBMIT' || message.type === 'SUB_JOB_SUBMIT') {
      this.activeJobCount++;
      console.log('Job received');
      
      this.processJob(message).then(function(result) {
        if (self.cancelledJobs.has(message.requestId)) {
          self.cancelledJobs.delete(message.requestId);
          console.log('Job cancelled');
        } else {
          self.activeJobCount--;
          var resultMessage = {
            type: message.type === 'JOB_SUBMIT' ? 'JOB_RESULT' : 'SUB_JOB_RESULT',
            senderId: self.nodeId,
            requestId: message.requestId,
            payload: result,
            retryCount: message.retryCount || 0
          } as any as ClusterMessage;
          self.transport.send(resultMessage);
          console.log('Job done');
        }
      });
    }
  }

  private processJob(message: ClusterMessage): Promise<any> {
    var payload = message.payload;
    var self = this;
    
    return new Promise(function(resolve) {
      setTimeout(function() {
        if (Array.isArray(payload)) {
          var result = [];
          for (var i = 0; i < payload.length; i++) {
            result.push(payload[i] * 2);
          }
          resolve(result);
        } else {
          resolve({ result: 'done' });
        }
      }, 3000);
    });
  }

  cancelJob(requestId: string) {
    this.cancelledJobs.add(requestId);
  }
}

new WorkerNode();