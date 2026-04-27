import { randomUUID } from 'node:crypto';
import { ClientTCPTransport } from '../transport/TCPTransport';
import { LamportClock } from '../kernel/lamportClock';
import { CpuMonitor } from '../kernel/CpuMonitor';
import { ClusterMessage, HeartbeatPayload } from '../common/types';

// worker node - processes jobs
class WorkerNode {
  private transport: ClientTCPTransport;
  private workerId: string;
  private lamportClock: LamportClock;
  private cpuMonitor: CpuMonitor;
  private jobsInProgress = 0;
  private cancelledJobIds: Set<string> = new Set();

  constructor() {
    var self = this;
    this.workerId = randomUUID();
    this.lamportClock = new LamportClock(this.workerId);
    this.cpuMonitor = new CpuMonitor();
    this.cpuMonitor.startSampling();

    // connect to load balancer
    this.transport = new ClientTCPTransport('localhost', 3010);
    this.transport.setMessageHandler(this.handleMessage.bind(this));

    // startup message
    console.clear();
    console.log('_______________________________________________');
    console.log('________________   Worker Node   ______________');
    console.log('||          Worker Node started                  ||');
    var idStr = 'ID: ' + this.workerId;
    var paddedId = idStr.padEnd(44);
    console.log('||  ' + paddedId + '||');
    console.log('__________________________________________________');

    // send first heartbeat immediately
    this.sendHeartbeat();
    
    // then send heartbeats every 2 seconds
    setInterval(function() {
      self.sendHeartbeat();
    }, 2000);
  }

  private sendHeartbeat() {
    var time = this.lamportClock.increment();
    var hbPayload: HeartbeatPayload = {
      activeJobs: this.jobsInProgress,
      cpuUsage: this.cpuMonitor.getCpuUsage()
    };
    var hbMsg = {
      type: 'HEARTBEAT' as any,
      senderId: this.workerId,
      requestId: '',
      payload: hbPayload,
      lamportTime: time,
      nodeId: this.workerId
    } as ClusterMessage;
    this.transport.send(hbMsg);
  }

  private handleMessage(message: ClusterMessage) {
    var self = this;
    
    // update local lamport clock
    if (message.lamportTime !== undefined) {
      this.lamportClock.update(message.lamportTime);
    }

    // check if this is a job message
    if (message.type === 'JOB_SUBMIT' || message.type === 'SUB_JOB_SUBMIT') {
      this.jobsInProgress++;
      console.log('[WorkerNode] Received job ' + message.requestId);
      
      // process the job
      this.processJob(message).then(function(jobResult) {
        // check if job was cancelled
        if (self.cancelledJobIds.has(message.requestId)) {
          self.cancelledJobIds.delete(message.requestId);
          console.log('[WorkerNode] Job cancelled: ' + message.requestId);
        } else {
          self.jobsInProgress--;
          var resultTime = self.lamportClock.increment();
          var resultMsg = {
            type: message.type === 'JOB_SUBMIT' ? 'JOB_RESULT' : 'SUB_JOB_RESULT',
            senderId: self.workerId,
            requestId: message.requestId,
            payload: jobResult,
            retryCount: message.retryCount || 0,
            lamportTime: resultTime,
            nodeId: self.workerId
          } as any as ClusterMessage;
          self.transport.send(resultMsg);
          console.log('[WorkerNode] Job completed: ' + message.requestId);
        }
      });
    }
  }

  private processJob(message: ClusterMessage): Promise<any> {
    var jobPayload = message.payload;
    var self = this;
    
    return new Promise(function(resolve) {
      // simulate processing delay
      setTimeout(function() {
        if (Array.isArray(jobPayload)) {
          var processed = [];
          for (var i = 0; i < jobPayload.length; i++) {
            // simple processing: multiply by 2
            processed.push(jobPayload[i] * 2);
          }
          resolve(processed);
        } else {
          // scalar job
          resolve({ result: 'done' });
        }
      }, 3000);
    });
  }

  cancelJob(requestId: string) {
    this.cancelledJobIds.add(requestId);
  }
}

new WorkerNode();