import { TCPTransport } from '../transport/TCPTransport';
import { FailureDetector } from '../middleware/FailureDetector';
import { Scheduler } from './Scheduler';
import { ClusterMessage, JobContext, ClientAffinityRecord, CircuitBreakerStatus } from '../common/types';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as net from 'net';

class Dispatcher extends EventEmitter {
  private transport: TCPTransport;
  private messageQueueByPriority: Map<string, Array<{ id: string; message: ClusterMessage }>> = new Map();

  constructor(port: number) {
    super();
    this.transport = new TCPTransport(port);
    
    this.messageQueueByPriority.set('HIGH', []);
    this.messageQueueByPriority.set('NORMAL', []);
    this.messageQueueByPriority.set('LOW', []);

    this.transport.setMessageHandler((id: string, message: ClusterMessage) => {
      const priority = message.priority || 'NORMAL';
      this.messageQueueByPriority.get(priority)!.push({ id, message });
      this.emit('messageQueued');
    });

    this.transport.setConnectionClosureHandler((id: string) => {
      this.emit('connectionClosed', id);
    });
  }

  dequeueMessage(): { id: string; message: ClusterMessage } | null {
    const priorityOrder = ['HIGH', 'NORMAL', 'LOW'];
    for (const priority of priorityOrder) {
      const queue = this.messageQueueByPriority.get(priority)!;
      if (queue.length > 0) {
        return queue.shift() || null;
      }
    }
    return null;
  }

  getQueueSize(): number {
    let total = 0;
    for (const queue of this.messageQueueByPriority.values()) {
      total += queue.length;
    }
    return total;
  }

  send(id: string, message: ClusterMessage) {
    this.transport.send(id, message);
  }

  getClientIds(): string[] {
    return this.transport.getClientIds();
  }
}

class Worker {
  private id: number;
  private dispatcher: Dispatcher;
  private failureDetector: FailureDetector;
  private scheduler: Scheduler;
  private requestToClient: Map<string, string> = new Map();
  private nodeConnections: Map<string, boolean> = new Map();
  private aggregationMap: Map<string, { totalChunks: number; receivedChunks: number; aggregatedData: any[] }> = new Map();
  private jobContextMap: Map<string, JobContext> = new Map();
  private jobTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private circuitBreakerState: Map<string, CircuitBreakerStatus> = new Map();
  private circuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    openTimeout: 30000,
    halfOpenProbeInterval: 5000
  };
  private running = true;

  constructor(
    id: number,
    dispatcher: Dispatcher,
    failureDetector: FailureDetector,
    scheduler: Scheduler
  ) {
    this.id = id;
    this.dispatcher = dispatcher;
    this.failureDetector = failureDetector;
    this.scheduler = scheduler;
  }

  start() {
    const processNextMessage = async () => {
      if (!this.running) return;

      const queued = this.dispatcher.dequeueMessage();
      if (queued) {
        await this.processMessage(queued.id, queued.message);
      }

      setImmediate(processNextMessage);
    };

    processNextMessage();

    setInterval(() => {
      this.scheduler.setCircuitBreakerState(this.circuitBreakerState);
    }, 1000);
  }

  private async processMessage(id: string, message: ClusterMessage) {
    this.nodeConnections.set(id, true);

    if (message.type === 'HEARTBEAT') {
      this.failureDetector.updateHeartbeat(id, message.payload);
    } else if (message.type === 'JOB_SUBMIT') {
      this.handleJobSubmit(id, message);
    } else if (message.type === 'SUB_JOB_RESULT') {
      this.handleSubJobResult(id, message);
    } else if (message.type === 'CLUSTER_STATUS') {
      const healthyNodes = this.failureDetector.getHealthyNodes();
      const reply: ClusterMessage = {
        type: 'CLUSTER_STATUS_REPLY',
        senderId: 'load-balancer',
        requestId: message.requestId,
        payload: healthyNodes,
        priority: 'HIGH'
      };
      this.dispatcher.send(id, reply);
      console.log(`[Worker-${this.id}] Sent cluster status to client ${id}: ${healthyNodes.length} healthy nodes`);
    } else if (message.type === 'JOB_RESULT') {
      const clientId = this.requestToClient.get(message.requestId);
      const jobContext = this.jobContextMap.get(message.requestId);
      
      if (jobContext && jobContext.assignedWorker) {
        this.recordWorkerSuccess(jobContext.assignedWorker);
      }
      
      if (clientId && this.nodeConnections.get(clientId)) {
        this.dispatcher.send(clientId, message);
        console.log(`[Worker-${this.id}] Delivered result for job ${message.requestId} to client ${clientId}`);
        this.requestToClient.delete(message.requestId);
        this.clearJobTimeout(message.requestId);
        this.jobContextMap.delete(message.requestId);
      } else {
        console.log(`[Worker-${this.id}] Client ${clientId} no longer connected for job ${message.requestId}`);
      }
    }
  }

  private handleJobSubmit(clientId: string, message: ClusterMessage) {
    const { payload } = message;
    const maxRetries = message.maxRetries || 3;
    const retryCount = (message.retryCount || 0);
    const timeoutMs = 10000;

    const jobContext: JobContext = {
      requestId: message.requestId,
      clientId,
      message,
      submittedAt: Date.now(),
      timeoutMs,
      retryCount,
      maxRetries
    };
    this.jobContextMap.set(message.requestId, jobContext);

    const timeoutHandle = setTimeout(() => {
      console.log(`[Worker-${this.id}] Job ${message.requestId} timed out after ${timeoutMs}ms`);
      this.handleJobTimeout(jobContext);
    }, timeoutMs);
    this.jobTimeouts.set(message.requestId, timeoutHandle);

    if (Array.isArray(payload)) {
      this.splitAndDispatchJob(clientId, message);
    } else {
      const workerId = this.scheduler.getNextNodeForClient(clientId) || this.scheduler.getNextNode();
      if (workerId) {
        jobContext.assignedWorker = workerId;
        this.requestToClient.set(message.requestId, clientId);
        this.dispatcher.send(workerId, message);
        console.log(`[Worker-${this.id}] Routed job ${message.requestId} to worker ${workerId}`);
      } else {
        console.log(`[Worker-${this.id}] No healthy workers available for job ${message.requestId}`);
      }
    }
  }

  private handleJobTimeout(jobContext: JobContext) {
    if (jobContext.assignedWorker) {
      this.recordWorkerFailure(jobContext.assignedWorker);
    }

    if (jobContext.retryCount < jobContext.maxRetries) {
      jobContext.retryCount++;
      const retryMessage: ClusterMessage = {
        ...jobContext.message,
        retryCount: jobContext.retryCount,
        maxRetries: jobContext.maxRetries
      };

      const workerId = this.scheduler.getNextNode();
      if (workerId) {
        console.log(`[Worker-${this.id}] Retrying job ${jobContext.requestId} (attempt ${jobContext.retryCount}/${jobContext.maxRetries}) on worker ${workerId}`);
        jobContext.assignedWorker = workerId;
        this.dispatcher.send(workerId, retryMessage);

        const timeoutHandle = setTimeout(() => {
          console.log(`[Worker-${this.id}] Retry job ${jobContext.requestId} timed out`);
          this.handleJobTimeout(jobContext);
        }, jobContext.timeoutMs);
        this.jobTimeouts.set(jobContext.requestId, timeoutHandle);
      } else {
        console.log(`[Worker-${this.id}] No workers available for retry of job ${jobContext.requestId}`);
        this.sendFailureResultToClient(jobContext);
      }
    } else {
      console.log(`[Worker-${this.id}] Job ${jobContext.requestId} exceeded max retries`);
      this.sendFailureResultToClient(jobContext);
    }
  }

  private sendFailureResultToClient(jobContext: JobContext) {
    const clientId = this.requestToClient.get(jobContext.requestId);
    if (clientId && this.nodeConnections.get(clientId)) {
      const failureResult: ClusterMessage = {
        type: 'JOB_RESULT',
        senderId: 'load-balancer',
        requestId: jobContext.requestId,
        payload: { error: 'Job failed after maximum retries', retryCount: jobContext.retryCount }
      };
      this.dispatcher.send(clientId, failureResult);
      console.log(`[Worker-${this.id}] Sent failure result for job ${jobContext.requestId} to client ${clientId}`);
    }

    this.requestToClient.delete(jobContext.requestId);
    this.clearJobTimeout(jobContext.requestId);
    this.jobContextMap.delete(jobContext.requestId);
  }

  private clearJobTimeout(requestId: string) {
    const timeoutHandle = this.jobTimeouts.get(requestId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.jobTimeouts.delete(requestId);
    }
  }

  private splitAndDispatchJob(clientId: string, message: ClusterMessage) {
    const data: any[] = message.payload;
    const healthyNodes = this.scheduler.getHealthyNodesByLoad();

    if (healthyNodes.length === 0) {
      console.log(`[Worker-${this.id}] No healthy workers available for job ${message.requestId}`);
      return;
    }

    const chunkSize = Math.ceil(data.length / healthyNodes.length);
    const chunks: any[][] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }

    this.aggregationMap.set(message.requestId, {
      totalChunks: chunks.length,
      receivedChunks: 0,
      aggregatedData: []
    });
    this.requestToClient.set(message.requestId, clientId);

    chunks.forEach((chunk, index) => {
      const worker = healthyNodes[index % healthyNodes.length];
      const subMessage: ClusterMessage = {
        type: 'SUB_JOB_SUBMIT',
        senderId: message.senderId,
        requestId: `${message.requestId}-chunk-${index}`,
        payload: chunk,
        retryCount: message.retryCount || 0,
        maxRetries: message.maxRetries || 3
      };
      this.dispatcher.send(worker.id, subMessage);
      console.log(`[Worker-${this.id}] Dispatched chunk ${index} of job ${message.requestId} to worker ${worker.id}`);
    });
  }

  // Expose active job counts for metrics
  public getActiveJobsCount(): number {
    return this.jobContextMap.size + this.aggregationMap.size;
  }

  // Expose circuit breaker states summary
  public getCircuitBreakerStates(): { [workerId: string]: string } {
    const out: { [workerId: string]: string } = {};
    for (const [wid, state] of this.circuitBreakerState.entries()) {
      out[wid] = state.state;
    }
    return out;
  }

  private handleSubJobResult(workerId: string, message: ClusterMessage) {
    this.recordWorkerSuccess(workerId);
    
    const baseRequestId = message.requestId.split('-chunk-')[0];
    const aggregation = this.aggregationMap.get(baseRequestId);

    if (!aggregation) {
      console.log(`[Worker-${this.id}] No aggregation record for ${baseRequestId}`);
      return;
    }

    aggregation.aggregatedData.push(...message.payload);
    aggregation.receivedChunks++;

    console.log(`[Worker-${this.id}] Received chunk ${aggregation.receivedChunks}/${aggregation.totalChunks} for job ${baseRequestId}`);

    if (aggregation.receivedChunks === aggregation.totalChunks) {
      const clientId = this.requestToClient.get(baseRequestId);
      if (clientId && this.nodeConnections.get(clientId)) {
        const finalResult: ClusterMessage = {
          type: 'JOB_RESULT',
          senderId: 'load-balancer',
          requestId: baseRequestId,
          payload: aggregation.aggregatedData
        };
        this.dispatcher.send(clientId, finalResult);
        console.log(`[Worker-${this.id}] Delivered aggregated result for job ${baseRequestId} to client ${clientId}`);
      }

      this.aggregationMap.delete(baseRequestId);
      this.requestToClient.delete(baseRequestId);
      this.clearJobTimeout(baseRequestId);
      this.jobContextMap.delete(baseRequestId);
    }
  }

  private recordWorkerSuccess(workerId: string) {
    if (!this.circuitBreakerState.has(workerId)) {
      this.circuitBreakerState.set(workerId, {
        workerId,
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        lastSuccessTime: Date.now(),
        probeAttempts: 0
      });
    }

    const state = this.circuitBreakerState.get(workerId)!;
    if (state.state === 'HALF_OPEN') {
      state.probeAttempts++;
      if (state.probeAttempts >= this.circuitBreakerConfig.successThreshold) {
        state.state = 'CLOSED';
        state.consecutiveFailures = 0;
        state.probeAttempts = 0;
        console.log(`[Worker-${this.id}] Circuit breaker for ${workerId} transitioned to CLOSED`);
      }
    } else if (state.state === 'CLOSED') {
      state.consecutiveFailures = 0;
    }
    state.lastSuccessTime = Date.now();
  }

  private recordWorkerFailure(workerId: string) {
    if (!this.circuitBreakerState.has(workerId)) {
      this.circuitBreakerState.set(workerId, {
        workerId,
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: Date.now(),
        lastSuccessTime: 0,
        probeAttempts: 0
      });
    }

    const state = this.circuitBreakerState.get(workerId)!;
    state.lastFailureTime = Date.now();

    if (state.state === 'HALF_OPEN') {
      state.state = 'OPEN';
      state.consecutiveFailures = 0;
      state.probeAttempts = 0;
      console.log(`[Worker-${this.id}] Circuit breaker for ${workerId} transitioned to OPEN (probe failed)`);
    } else if (state.state === 'CLOSED') {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= this.circuitBreakerConfig.failureThreshold) {
        state.state = 'OPEN';
        console.log(`[Worker-${this.id}] Circuit breaker for ${workerId} transitioned to OPEN (${state.consecutiveFailures} failures)`);
      }
    }
  }

  private getCircuitBreakerState(workerId: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    const state = this.circuitBreakerState.get(workerId);
    if (!state) return 'CLOSED';

    if (state.state === 'OPEN') {
      const timeSinceOpen = Date.now() - state.lastFailureTime;
      if (timeSinceOpen >= this.circuitBreakerConfig.openTimeout) {
        state.state = 'HALF_OPEN';
        state.probeAttempts = 0;
        console.log(`[Worker-${this.id}] Circuit breaker for ${workerId} transitioned to HALF_OPEN`);
      }
    }

    return state.state;
  }

  stop() {
    this.running = false;
    for (const timeoutHandle of this.jobTimeouts.values()) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * LoadBalancer now acts as an orchestrator using the Dispatcher/Worker pattern.
 * It maintains a Dispatcher listening on a port and a pool of Workers processing messages.
 */
class LoadBalancer {
  private dispatcher: Dispatcher;
  private failureDetector: FailureDetector;
  private scheduler: Scheduler;
  private workers: Worker[] = [];
  private workerPoolSize: number;
  private dnsSocket: net.Socket | null = null;
  private lbId: string;
  private lbPort: number;
  private dnsRegistered = false;

  constructor(port: number, workerPoolSize: number = 4, dnsHost: string = 'localhost', dnsRegistrationPort: number = 3000) {
    this.workerPoolSize = workerPoolSize;
    this.lbPort = port;
    this.lbId = `LB-${Math.random().toString(36).substr(2, 9)}`;
    
    this.dispatcher = new Dispatcher(port);
    this.failureDetector = new FailureDetector();
    this.scheduler = new Scheduler(this.failureDetector);

    this.initializeWorkerPool();
    this.monitorClusterHealth();
    this.startMetricsServer();
    this.registerWithDNS(dnsHost, dnsRegistrationPort);
  }

  /**
   * Registers this LoadBalancer instance with the DNS Router.
   */
  private registerWithDNS(dnsHost: string, dnsPort: number) {
    try {
      this.dnsSocket = net.createConnection({ host: dnsHost, port: dnsPort }, () => {
        console.log(`[LoadBalancer] Connected to DNSRouter for registration`);
        
        const registerMessage: ClusterMessage = {
          type: 'REGISTER_LB',
          senderId: this.lbId,
          requestId: `register-${Date.now()}`,
          payload: {
            lbId: this.lbId,
            host: 'localhost',
            port: this.lbPort
          }
        };
        
        this.dnsSocket!.write(JSON.stringify(registerMessage) + '\n');
      });

      let buffer = '';
      this.dnsSocket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().length === 0) continue;
          
          try {
            const response: ClusterMessage = JSON.parse(line);
            if (response.type === 'REGISTER_LB_ACK') {
              const { success, lbId } = response.payload;
              if (success) {
                console.log(`[LoadBalancer] Successfully registered with DNSRouter as ${lbId}`);
                this.dnsRegistered = true;
              } else {
                console.error(`[LoadBalancer] Failed to register with DNSRouter:`, response.payload.error);
              }
            }
          } catch (err) {
            console.error(`[LoadBalancer] Error parsing DNS response:`, err);
          }
        }
      });

      this.dnsSocket.on('error', (err) => {
        console.error(`[LoadBalancer] DNS registration connection error:`, err);
        this.dnsSocket = null;
        
        // Retry registration after a delay
        console.log(`[LoadBalancer] Retrying DNS registration in 5 seconds...`);
        setTimeout(() => {
          this.registerWithDNS(dnsHost, dnsPort);
        }, 5000);
      });

      this.dnsSocket.on('close', () => {
        console.log(`[LoadBalancer] DNS registration connection closed`);
        this.dnsSocket = null;
        this.dnsRegistered = false;
      });
    } catch (err) {
      console.error(`[LoadBalancer] Failed to connect to DNSRouter:`, err);
      console.log(`[LoadBalancer] Retrying DNS registration in 5 seconds...`);
      setTimeout(() => {
        this.registerWithDNS(dnsHost, dnsPort);
      }, 5000);
    }
  }

  /**
   * Deregisters this LoadBalancer instance with the DNS Router.
   */
  private deregisterFromDNS() {
    if (this.dnsSocket && this.dnsRegistered) {
      const deregisterMessage: ClusterMessage = {
        type: 'DEREGISTER_LB',
        senderId: this.lbId,
        requestId: `deregister-${Date.now()}`,
        payload: {
          lbId: this.lbId
        }
      };
      
      this.dnsSocket.write(JSON.stringify(deregisterMessage) + '\n');
      console.log(`[LoadBalancer] Deregistration request sent to DNSRouter`);
      
      // Close the connection after a delay to allow the message to be processed
      setTimeout(() => {
        if (this.dnsSocket) {
          this.dnsSocket.end();
          this.dnsSocket = null;
        }
      }, 500);
    }
  }

  /**
   * Initializes the worker pool.
   */
  private initializeWorkerPool() {
    for (let i = 0; i < this.workerPoolSize; i++) {
      const worker = new Worker(i, this.dispatcher, this.failureDetector, this.scheduler);
      worker.start();
      this.workers.push(worker);
    }
    console.log(`[LoadBalancer] Initialized worker pool with ${this.workerPoolSize} workers`);
  }

  /**
   * Monitors cluster health and displays status.
   */
  private monitorClusterHealth() {
    setInterval(() => {
      const healthy = this.failureDetector.getHealthyNodes();
      const queueSize = this.dispatcher.getQueueSize();
      const healthStr = `[LoadBalancer] Healthy workers: ${healthy.length} | Queue: ${queueSize}`;
      const paddedHealth = healthStr.padEnd(66);
      console.log(`||  ${paddedHealth}||`);
    }, 1000);
  }

  private startMetricsServer() {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/metrics') {
        // Aggregate active jobs and circuit breaker states from workers
        const activeJobs = this.workers.reduce((acc, w) => acc + (w as any).getActiveJobsCount(), 0);
        const circuitBreakerStates: { [k: string]: string } = {};
        for (const w of this.workers) {
          if (typeof (w as any).getCircuitBreakerStates === 'function') {
            Object.assign(circuitBreakerStates, (w as any).getCircuitBreakerStates());
          }
        }

        const metrics = {
          healthyWorkers: this.failureDetector.getHealthyNodes().length,
          totalWorkers: this.workerPoolSize,
          activeJobs,
          queuedJobs: this.dispatcher.getQueueSize(),
          circuitBreakerStates,
          timestamp: Date.now()
        };
        res.writeHead(200);
        res.end(JSON.stringify(metrics));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(9001, () => {
      console.log('[LoadBalancer] Metrics server listening on port 9001');
    });
  }

  /**
   * Gracefully shuts down the LoadBalancer.
   */
  shutdown() {
    console.log('[LoadBalancer] Initiating graceful shutdown...');
    this.deregisterFromDNS();
    this.workers.forEach(w => w.stop());
    console.log('[LoadBalancer] Shutdown completed');
  }
}

// Initialize the Load Balancer with 4 workers processing messages asynchronously
// Default: LB listens on port 3010, DNS Router registration on port 3000
const lb = new LoadBalancer(3010, 4, 'localhost', 3000);

console.clear();
console.log('_______________________________________________');
console.log('________________  Load Balancer   _____________');
console.log('||          Load Balancer listening on port 3010  ||');
console.log('||  DNS Router: localhost:3000 (Registration)     ||');
console.log('||  [LoadBalancer] Healthy workers: 0             ||');
console.log('__________________________________________________');

// Graceful shutdown on signals
process.on('SIGTERM', () => lb.shutdown());
process.on('SIGINT', () => lb.shutdown());