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

=======

  constructor() {
    // Generate a unique ID for this worker node
    this.nodeId = randomUUID();

    // Establish connection to the Load Balancer
>>>>>>> a7dd42c (Initial commit from local)
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

<<<<<<< HEAD
=======
    // Send initial heartbeat immediately, then every 2 seconds
>>>>>>> a7dd42c (Initial commit from local)
    this.sendHeartbeat();
    setInterval(() => {
      this.sendHeartbeat();
    }, 2000);
  }

<<<<<<< HEAD
=======
  /**
   * Sends a heartbeat message to the Load Balancer to indicate this node is healthy.
   */
>>>>>>> a7dd42c (Initial commit from local)
  private sendHeartbeat() {
    const payload: HeartbeatPayload = {
      activeJobs: this.activeJobCount
    };
    const message: ClusterMessage = {
      type: 'HEARTBEAT',
      senderId: this.nodeId,
<<<<<<< HEAD
      requestId: '',
=======
      requestId: '', // Heartbeats don't need a request ID
>>>>>>> a7dd42c (Initial commit from local)
      payload
    };
    this.transport.send(message);
  }

<<<<<<< HEAD
=======
  /**
   * Handles incoming messages from the Load Balancer.
   * Currently only handles job submissions.
   */
>>>>>>> a7dd42c (Initial commit from local)
  private handleMessage(message: ClusterMessage) {
    if (message.type === 'JOB_SUBMIT' || message.type === 'SUB_JOB_SUBMIT') {
      this.activeJobCount++;
      console.log(`Worker ${this.nodeId} received job ${message.requestId}, active jobs: ${this.activeJobCount}`);
      
<<<<<<< HEAD
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
=======
      // Process the job
      this.processJob(message).then(result => {
        this.activeJobCount--;
        const resultMessage: ClusterMessage = {
          type: message.type === 'JOB_SUBMIT' ? 'JOB_RESULT' : 'SUB_JOB_RESULT',
          senderId: this.nodeId,
          requestId: message.requestId,
          payload: result
        };
        this.transport.send(resultMessage);
        console.log(`Worker ${this.nodeId} completed job ${message.requestId}, active jobs: ${this.activeJobCount}`);
>>>>>>> a7dd42c (Initial commit from local)
      });
    }
  }

<<<<<<< HEAD
=======
  /**
   * Processes a job payload. For arrays, doubles each number.
   */
>>>>>>> a7dd42c (Initial commit from local)
  private async processJob(message: ClusterMessage): Promise<any> {
    const { payload } = message;
    
    if (Array.isArray(payload)) {
<<<<<<< HEAD
      // Longer delay for observable metrics in UI
      await new Promise(resolve => setTimeout(resolve, 3000));
      return payload.map((num: number) => num * 2);
    } else {
=======
      // MapReduce task: double each number
      return payload.map((num: number) => num * 2);
    } else {
      // Simulate job processing time
>>>>>>> a7dd42c (Initial commit from local)
      await new Promise(resolve => setTimeout(resolve, 3000));
      return { result: 'Job completed successfully' };
    }
  }
<<<<<<< HEAD

  cancelJob(requestId: string) {
    this.cancelledJobs.add(requestId);
  }
}

=======
}

// Start the worker node
>>>>>>> a7dd42c (Initial commit from local)
new WorkerNode();