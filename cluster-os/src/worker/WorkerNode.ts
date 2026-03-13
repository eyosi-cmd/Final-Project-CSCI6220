import { randomUUID } from 'node:crypto';
import { ClientTCPTransport } from '../transport/TCPTransport';
import { ClusterMessage, HeartbeatPayload } from '../common/types';

class WorkerNode {
  private transport: ClientTCPTransport;
  private nodeId: string;
  private activeJobCount = 0;
  private cancelledJobs: Set<string> = new Set();

  constructor() {
    this.nodeId = randomUUID();

    this.transport = new ClientTCPTransport('localhost', 3000);
    this.transport.setMessageHandler(this.handleMessage.bind(this));

    console.clear();
    console.log('_______________________________________________');
    console.log('________________   Worker Node   ______________');
    console.log(`||          Worker Node started                  ||`);
    const idStr = `ID: ${this.nodeId}`;
    const paddedId = idStr.padEnd(44);
    console.log(`||  ${paddedId}||`);
    console.log('__________________________________________________');

    this.sendHeartbeat();
    setInterval(() => {
      this.sendHeartbeat();
    }, 2000);
  }

  private sendHeartbeat() {
    const payload: HeartbeatPayload = {
      activeJobs: this.activeJobCount
    };
    const message: ClusterMessage = {
      type: 'HEARTBEAT',
      senderId: this.nodeId,
      requestId: '',
      payload
    };
    this.transport.send(message);
  }

  private handleMessage(message: ClusterMessage) {
    if (message.type === 'JOB_SUBMIT' || message.type === 'SUB_JOB_SUBMIT') {
      this.activeJobCount++;
      console.log(`Worker ${this.nodeId} received job ${message.requestId}, active jobs: ${this.activeJobCount}`);
      
      this.processJob(message).then(result => {
        if (this.cancelledJobs.has(message.requestId)) {
          this.cancelledJobs.delete(message.requestId);
          console.log(`Worker ${this.nodeId} discarded cancelled job ${message.requestId}`);
        } else {
          this.activeJobCount--;
          const resultMessage: ClusterMessage = {
            type: message.type === 'JOB_SUBMIT' ? 'JOB_RESULT' : 'SUB_JOB_RESULT',
            senderId: this.nodeId,
            requestId: message.requestId,
            payload: result,
            retryCount: message.retryCount || 0
          };
          this.transport.send(resultMessage);
          console.log(`Worker ${this.nodeId} completed job ${message.requestId}, active jobs: ${this.activeJobCount}`);
        }
      });
    }
  }

  private async processJob(message: ClusterMessage): Promise<any> {
    const { payload } = message;
    
    if (Array.isArray(payload)) {
      // Longer delay for observable metrics in UI
      await new Promise(resolve => setTimeout(resolve, 3000));
      return payload.map((num: number) => num * 2);
    } else {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return { result: 'Job completed successfully' };
    }
  }

  cancelJob(requestId: string) {
    this.cancelledJobs.add(requestId);
  }
}

new WorkerNode();