import { TCPTransport } from '../transport/TCPTransport';
import { FailureDetector } from '../middleware/FailureDetector';
import { Scheduler } from './Scheduler';
import { LamportClock } from './lamportClock';
import SystemMonitor from './SystemMonitor';
import { ClusterMessage, JobContext, ClientAffinityRecord, CircuitBreakerStatus } from '../common/types';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as net from 'net';

class Dispatcher extends EventEmitter {
  private transport: TCPTransport;
  private msgQueues: Map<string, Array<{ id: string; message: ClusterMessage }>> = new Map();

  constructor(port: number) {
    super();
    this.transport = new TCPTransport(port);
    
    // set up message queues for different priority levels
    this.msgQueues.set('HIGH', []);
    this.msgQueues.set('NORMAL', []);
    this.msgQueues.set('LOW', []);

    this.transport.setMessageHandler(function(id, message) {
      var priorityLevel = message.priority || 'NORMAL';
      var queue = this.msgQueues.get(priorityLevel);
      if (queue) {
        queue.push({ id: id, message: message });
      }
      this.emit('messageQueued');
    }.bind(this));

    this.transport.setConnectionClosureHandler(function(id) {
      this.emit('connectionClosed', id);
    }.bind(this));
  }

  dequeueMessage()  {
    // check high priority first
    var highQueue = this.msgQueues.get('HIGH');
    if (highQueue && highQueue.length > 0) {
      return highQueue.shift() || null;
    }
    
    // then normal
    var normalQueue = this.msgQueues.get('NORMAL');
    if (normalQueue && normalQueue.length > 0) {
      return normalQueue.shift() || null;
    }
    
    // finally low priority
    var lowQueue = this.msgQueues.get('LOW');
    if (lowQueue && lowQueue.length > 0) {
      return lowQueue.shift() || null;
    }
    
    return null;
  }

  getQueueSize(): number {
    var count = 0;
    var highQ = this.msgQueues.get('HIGH');
    var normQ = this.msgQueues.get('NORMAL');
    var lowQ = this.msgQueues.get('LOW');
    
    if (highQ) count += highQ.length;
    if (normQ) count += normQ.length;
    if (lowQ) count += lowQ.length;
    
    return count;
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
  private clock: LamportClock;
  private requestToClient: Map<string, string> = new Map();
  private nodeConnections: Map<string, boolean> = new Map();
  private aggregationMap: Map<string, { totalChunks: number; receivedChunks: number; chunkResults: any[][] }> = new Map();
  private jobContextMap: Map<string, JobContext> = new Map();
  private jobTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private circuitBreakerState: Map<string, CircuitBreakerStatus> = new Map();
  private circuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    openTimeout: 5000,
    halfOpenProbeInterval: 5000
  };
  private running = true;
  private connToWorkerMap: Map<string, string> = new Map(); // connId → workerId

  constructor(
    id: number,
    dispatcher: Dispatcher,
    failureDetector: FailureDetector,
    scheduler: Scheduler,
    onJobCompleted?: () => void
  ) {
    this.id = id;
    this.dispatcher = dispatcher;
    this.failureDetector = failureDetector;
    this.scheduler = scheduler;
    this.clock = new LamportClock('loadBalancer-' + id);
    this.onJobCompleted = onJobCompleted;
  }

  private onJobCompleted?: () => void;

  start() {
      var self: any = this;
    var processNextMessage = function() {
      if (!self.running) return;

      var queued = self.dispatcher.dequeueMessage();
      if (queued) {
        self.processMessage(queued.id, queued.message);
        setImmediate(processNextMessage);
      }
    };

    self.dispatcher.on('messageQueued', processNextMessage);
    self.dispatcher.on('connectionClosed', function(id) {
      self.nodeConnections.delete(id);
      var workerId = self.connToWorkerMap.get(id);
      if (workerId) {
        self.failureDetector.removeNode(workerId);
        self.connToWorkerMap.delete(id);
        console.log('[LoadBalancer] Worker ' + workerId.substring(0, 8) + ' disconnected — removed from cluster');
      }
    });
    processNextMessage();

    setInterval(function() {
      self.scheduler.setCircuitBreakerState(self.circuitBreakerState);
    }, 1000);
  }

  private processMessage(id: string, message: ClusterMessage) {
    this.nodeConnections.set(id, true);

    if (message.lamportTime !== undefined) {
      this.clock.update(message.lamportTime);
    }

    if (message.type === 'HEARTBEAT') {
      var workerId = message.senderId || message.nodeId || id;
      if (!this.connToWorkerMap.has(id)) {
        this.connToWorkerMap.set(id, workerId);
      }
      this.failureDetector.updateHeartbeat(workerId, message.payload, message.lamportTime);
    } else if (message.type === 'JOB_SUBMIT') {
      this.handleJobSubmit(id, message);
    } else if (message.type === 'SUB_JOB_RESULT') {
      this.handleSubJobResult(id, message);
    } else if (message.type === 'CLUSTER_STATUS') {
      var healthyNodes = this.failureDetector.getHealthyNodes();
      var lamportTime = this.clock.increment();
      var reply = {
        type: 'CLUSTER_STATUS_REPLY' as any,
        senderId: 'load-balancer',
        requestId: message.requestId,
        payload: healthyNodes,
        priority: 'HIGH',
        lamportTime: lamportTime,
        nodeId: this.clock.getNodeId()
      } as ClusterMessage;
      this.dispatcher.send(id, reply);
      console.log('[Worker-' + this.id + '] Sent cluster status to client: ' + healthyNodes.length + ' healthy nodes');
    } else if (message.type === 'REMOVE_NODE') {
      var nodeId = (message as any).nodeId;
      this.failureDetector.removeNode(nodeId);
      console.log('[LoadBalancer] Removed node ' + nodeId + ' from failure detector');
    } else if (message.type === 'REMOVE_UNHEALTHY_NODE') {
      var removedId = this.failureDetector.removeMostUnhealthyNode();
      if (removedId) {
        console.log('[LoadBalancer] Removed most unhealthy node: ' + removedId);
      } else {
        console.log('[LoadBalancer] No unhealthy nodes to remove');
      }
    } else if (message.type === 'JOB_RESULT') {
      var clientId = this.requestToClient.get(message.requestId);
      var jobContext = this.jobContextMap.get(message.requestId);
      
      if (jobContext && jobContext.assignedWorker) {
        this.recordWorkerSuccess(jobContext.assignedWorker);
      }
      
      if (clientId && this.nodeConnections.get(clientId)) {
        this.dispatcher.send(clientId, message);
        if (this.onJobCompleted) {
          this.onJobCompleted();
        }
        console.log('[Worker-' + this.id + '] Delivered result for job ' + message.requestId + ' to client ' + clientId);
        this.requestToClient.delete(message.requestId);
        this.clearJobTimeout(message.requestId);
        this.jobContextMap.delete(message.requestId);
      } else {
        console.log('[Worker-' + this.id + '] Client ' + clientId + ' no longer connected for job ' + message.requestId);
      }
    }
  }

  private handleJobSubmit(clientId: string, message: ClusterMessage) {
    var payload = message.payload;
    var maxRetries = message.maxRetries || 3;
    var retryCount = (message.retryCount || 0);
    var timeoutMs = 10000;

    var jobContext = {
      requestId: message.requestId,
      clientId: clientId,
      message: message,
      submittedAt: Date.now(),
      timeoutMs: timeoutMs,
      retryCount: retryCount,
      maxRetries: maxRetries,
      assignedWorker: ''
    } as JobContext;
    this.jobContextMap.set(message.requestId, jobContext);

      var self: any = this;
    var timeoutHandle = setTimeout(function() {
      console.log('[Worker-' + self.id + '] Job ' + message.requestId + ' timed out after ' + timeoutMs + 'ms');
      self.handleJobTimeout(jobContext);
    }, timeoutMs);
    this.jobTimeouts.set(message.requestId, timeoutHandle);

    if (Array.isArray(payload)) {
      this.splitAndDispatchJob(clientId, message);
    } else {
      var workerId = this.scheduler.getNextNodeForClient(clientId) || this.scheduler.getNextNode();
      if (workerId) {
        jobContext.assignedWorker = workerId;
        this.requestToClient.set(message.requestId, clientId);
        var lamportTime = this.clock.increment();
        message.lamportTime = lamportTime;
        message.nodeId = this.clock.getNodeId();
        this.dispatcher.send(workerId, message);
        console.log('[Worker-' + this.id + '] Routed job ' + message.requestId + ' to worker ' + workerId);
      } else {
        console.log('[Worker-' + this.id + '] No healthy workers available for job ' + message.requestId);
      }
    }
  }

  private handleJobTimeout(jobContext: JobContext) {
    if (jobContext.assignedWorker) {
      console.log('[Worker-' + this.id + '] Job ' + jobContext.message.requestId + ' timed out on worker ' + jobContext.assignedWorker + ' | Recording failure...');
      this.recordWorkerFailure(jobContext.assignedWorker);
      var cbState = this.circuitBreakerState.get(jobContext.assignedWorker);
      if (cbState) {
        console.log('[Worker-' + this.id + '] Worker ' + jobContext.assignedWorker + ' failure count: ' + cbState.consecutiveFailures + ' / ' + this.circuitBreakerConfig.failureThreshold);
      }
    }

    if (jobContext.retryCount < jobContext.maxRetries) {
      jobContext.retryCount++;
      var retryMessage = {
        type: jobContext.message.type,
        senderId: jobContext.message.senderId,
        requestId: jobContext.message.requestId,
        payload: jobContext.message.payload,
        retryCount: jobContext.retryCount,
        maxRetries: jobContext.maxRetries
      };

      var workerId = this.scheduler.getNextNode();
      if (workerId) {
        console.log('[Worker-' + this.id + '] Retrying job ' + jobContext.requestId + ' (attempt ' + jobContext.retryCount + '/' + jobContext.maxRetries + ') on worker ' + workerId);
        jobContext.assignedWorker = workerId;
        var lamportTime = this.clock.increment();
        (retryMessage as any).lamportTime = lamportTime;
        (retryMessage as any).nodeId = this.clock.getNodeId();
        this.dispatcher.send(workerId, retryMessage);

      var self: any = this;
        var timeoutHandle = setTimeout(function() {
          console.log('[Worker-' + self.id + '] Retry job ' + jobContext.requestId + ' timed out');
          self.handleJobTimeout(jobContext);
        }, jobContext.timeoutMs);
        this.jobTimeouts.set(jobContext.requestId, timeoutHandle);
      } else {
        console.log('[Worker-' + this.id + '] No workers available for retry of job ' + jobContext.requestId);
        this.sendFailureResultToClient(jobContext);
      }
    } else {
      console.log('[Worker-' + this.id + '] Job ' + jobContext.requestId + ' exceeded max retries');
      this.sendFailureResultToClient(jobContext);
    }
  }

  private sendFailureResultToClient(jobContext: JobContext) {
    var clientId = this.requestToClient.get(jobContext.requestId);
    if (clientId && this.nodeConnections.get(clientId)) {
      var lamportTime = this.clock.increment();
      var failureResult = {
        type: 'JOB_RESULT' as any,
        senderId: 'load-balancer',
        requestId: jobContext.requestId,
        payload: { error: 'Job failed after maximum retries', retryCount: jobContext.retryCount },
        lamportTime: lamportTime,
        nodeId: this.clock.getNodeId()
      } as ClusterMessage;
      this.dispatcher.send(clientId, failureResult);
      console.log('[Worker-' + this.id + '] Sent failure result for job ' + jobContext.requestId + ' to client ' + clientId);
    }

    this.requestToClient.delete(jobContext.requestId);
    this.clearJobTimeout(jobContext.requestId);
    this.jobContextMap.delete(jobContext.requestId);
  }

  private clearJobTimeout(requestId: string) {
    var timeoutHandle = this.jobTimeouts.get(requestId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.jobTimeouts.delete(requestId);
    }
  }

  private splitAndDispatchJob(clientId: string, message: ClusterMessage) {
    var data = message.payload;
    var healthyNodes = this.scheduler.getHealthyNodesByLoad();

    if (healthyNodes.length === 0) {
      console.log('No healthy workers');
      return;
    }

    var chunkSize = Math.ceil(data.length / healthyNodes.length);
    var chunks = [];
    for (var i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }

    this.aggregationMap.set(message.requestId, {
      totalChunks: chunks.length,
      receivedChunks: 0,
      chunkResults: new Array(chunks.length)
    });
    this.requestToClient.set(message.requestId, clientId);

    for (var index = 0; index < chunks.length; index++) {
      var chunk = chunks[index];
      var worker = healthyNodes[index % healthyNodes.length];
      var lamportTime = this.clock.increment();
      var subMessage = {
        type: 'SUB_JOB_SUBMIT' as any,
        senderId: message.senderId,
        requestId: message.requestId + '-chunk-' + index,
        payload: chunk,
        retryCount: message.retryCount || 0,
        maxRetries: message.maxRetries || 3,
        lamportTime: lamportTime,
        nodeId: this.clock.getNodeId()
      } as ClusterMessage;
      this.dispatcher.send(worker.id, subMessage);
      console.log('Dispatched chunk');
    }
  }

  // Expose active job counts for metrics
  public getActiveJobsCount(): number {
    return this.jobContextMap.size + this.aggregationMap.size;
  }

  // Expose circuit breaker states summary
  public getCircuitBreakerStates() {
    var out = {} as any;
    var entries = this.circuitBreakerState.entries();
    var entry = entries.next();
    while (!entry.done) {
      var wid = entry.value[0];
      var state = entry.value[1];
      out[wid] = state.state;
      entry = entries.next();
    }
    return out;
  }

  private handleSubJobResult(connId: string, message: ClusterMessage) {
    var workerId = message.senderId || message.nodeId || connId;
    this.recordWorkerSuccess(workerId);
    
    var baseRequestId = message.requestId.split('-chunk-')[0];
    var chunkIndexText = message.requestId.split('-chunk-')[1];
    var chunkIndex = parseInt(chunkIndexText, 10);
    var aggregation = this.aggregationMap.get(baseRequestId);

    if (!aggregation) {
      console.log('[Worker-' + this.id + '] No aggregation record for ' + baseRequestId);
      return;
    }

    if (!isNaN(chunkIndex)) {
      aggregation.chunkResults[chunkIndex] = message.payload;
    } else {
      aggregation.chunkResults.push(message.payload);
    }
    aggregation.receivedChunks++;

    console.log('[Worker-' + this.id + '] Received chunk ' + aggregation.receivedChunks + '/' + aggregation.totalChunks + ' for job ' + baseRequestId);

    if (aggregation.receivedChunks === aggregation.totalChunks) {
      var clientId = this.requestToClient.get(baseRequestId);
      if (clientId && this.nodeConnections.get(clientId)) {
        var orderedResult = [];
        for (var i = 0; i < aggregation.chunkResults.length; i++) {
          var chunkResult = aggregation.chunkResults[i] || [];
          for (var j = 0; j < chunkResult.length; j++) {
            orderedResult.push(chunkResult[j]);
          }
        }
        var lamportTime = this.clock.increment();
        var resultMessage = {
          type: 'JOB_RESULT' as any,
          senderId: 'load-balancer',
          requestId: baseRequestId,
          payload: orderedResult,
          lamportTime: lamportTime,
          nodeId: this.clock.getNodeId()
        } as ClusterMessage;
        this.dispatcher.send(clientId, resultMessage);
        if (this.onJobCompleted) {
          this.onJobCompleted();
        }
        console.log('[Worker-' + this.id + '] Delivered aggregated result for job ' + baseRequestId + ' to client ' + clientId);
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
        workerId: workerId,
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        lastSuccessTime: Date.now(),
        probeAttempts: 0
      });
    }

    var state = this.circuitBreakerState.get(workerId) as any;
    if (state.state === 'HALF_OPEN') {
      state.probeAttempts++;
      if (state.probeAttempts >= this.circuitBreakerConfig.successThreshold) {
        state.state = 'CLOSED';
        state.consecutiveFailures = 0;
        state.probeAttempts = 0;
        console.log('[Worker-' + this.id + '] Circuit breaker for ' + workerId + ' transitioned to CLOSED');
      }
    } else if (state.state === 'CLOSED') {
      state.consecutiveFailures = 0;
    }
    state.lastSuccessTime = Date.now();
  }

  private recordWorkerFailure(workerId: string) {
    if (!this.circuitBreakerState.has(workerId)) {
      this.circuitBreakerState.set(workerId, {
        workerId: workerId,
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: Date.now(),
        lastSuccessTime: 0,
        probeAttempts: 0
      });
    }

    var state = this.circuitBreakerState.get(workerId) as any;
    state.lastFailureTime = Date.now();

    if (state.state === 'HALF_OPEN') {
      state.state = 'OPEN';
      state.consecutiveFailures = 0;
      state.probeAttempts = 0;
      console.log('[Worker-' + this.id + '] Circuit breaker for ' + workerId + ' transitioned to OPEN (probe failed)');
    } else if (state.state === 'CLOSED') {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= this.circuitBreakerConfig.failureThreshold) {
        state.state = 'OPEN';
        console.log('[Worker-' + this.id + '] Circuit breaker for ' + workerId + ' transitioned to OPEN (' + state.consecutiveFailures + ' failures)');
      }
    }
  }

  stop() {
    this.running = false;
    var handles = this.jobTimeouts.values();
    for (var handle of handles) {
      clearTimeout(handle);
    }
  }
}

// main LB class
class LoadBalancer {
  private dispatcher: Dispatcher;
  private failureDetector: FailureDetector;
  private scheduler: Scheduler;
  private systemMonitor: SystemMonitor;
  private workers: Worker[] = [];
  private workerPoolSize: number;
  private dnsSocket: net.Socket | null = null;
  private lbId: string;
  private lbPort: number;
  private dnsRegistered = false;
  private completedJobsTotal: number = 0;

  constructor(port: number, workerPoolSize: number = 4, dnsHost: string = 'localhost', dnsRegistrationPort: number = 3000) {
    this.workerPoolSize = workerPoolSize;
    this.lbPort = port;
    this.lbId = `LB-${Math.random().toString(36).substr(2, 9)}`;
    
    this.dispatcher = new Dispatcher(port);
    this.failureDetector = new FailureDetector();
    this.scheduler = new Scheduler(this.failureDetector);
    this.systemMonitor = new SystemMonitor();
    this.systemMonitor.startSampling();

    this.initializeWorkerPool();
    this.monitorClusterHealth();
    this.startMetricsServer();
    this.registerWithDNS(dnsHost, dnsRegistrationPort);
  }

  private registerWithDNS(dnsHost: string, dnsPort: number) {
      var self: any = this;
    try {
      this.dnsSocket = net.createConnection({ host: dnsHost, port: dnsPort }, function() {
        console.log('[LoadBalancer] Connected to DNSRouter for registration');
        
        var registerMessage = {
          type: 'REGISTER_LB',
          senderId: self.lbId,
          requestId: 'register-' + Date.now(),
          payload: {
            lbId: self.lbId,
            host: 'localhost',
            port: self.lbPort
          }
        };
        
        self.dnsSocket.write(JSON.stringify(registerMessage) + '\n');
      });

      var buffer = '';
      this.dnsSocket.on('data', function(data) {
        buffer += data.toString();
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (line.trim().length === 0) continue;
          
          try {
            var response = JSON.parse(line);
            if (response.type === 'REGISTER_LB_ACK') {
              var success = response.payload.success;
              var lbId = response.payload.lbId;
              if (success) {
                console.log('[LoadBalancer] Successfully registered with DNSRouter as ' + lbId);
                self.dnsRegistered = true;
              } else {
                console.error('[LoadBalancer] Failed to register with DNSRouter:', response.payload.error);
              }
            }
          } catch (err) {
            console.error('[LoadBalancer] Error parsing DNS response:', err);
          }
        }
      });

      this.dnsSocket.on('error', function(err) {
        console.error('[LoadBalancer] DNS registration connection error:', err);
        self.dnsSocket = null;
        
        console.log('[LoadBalancer] Retrying DNS registration in 5 seconds...');
        setTimeout(function() {
          self.registerWithDNS(dnsHost, dnsPort);
        }, 5000);
      });

      this.dnsSocket.on('close', function() {
        console.log('[LoadBalancer] DNS registration connection closed');
        self.dnsSocket = null;
        self.dnsRegistered = false;
      });
    } catch (err) {
      console.error('[LoadBalancer] Failed to connect to DNSRouter:', err);
      console.log('[LoadBalancer] Retrying DNS registration in 5 seconds...');
      setTimeout(function() {
        self.registerWithDNS(dnsHost, dnsPort);
      }, 5000);
    }
  }

  private deregisterFromDNS() {
    if (this.dnsSocket && this.dnsRegistered) {
      var deregisterMessage = {
        type: 'DEREGISTER_LB',
        senderId: this.lbId,
        requestId: 'deregister-' + Date.now(),
        payload: {
          lbId: this.lbId
        }
      };
      
      this.dnsSocket.write(JSON.stringify(deregisterMessage) + '\n');
      console.log('[LoadBalancer] Deregistration request sent to DNSRouter');
      
      var self: any = this;
      setTimeout(function() {
        if (self.dnsSocket) {
          self.dnsSocket.end();
          self.dnsSocket = null;
        }
      }, 500);
    }
  }

  private initializeWorkerPool() {
      var self: any = this;
    for (var i = 0; i < this.workerPoolSize; i++) {
      var worker = new Worker(i, this.dispatcher, this.failureDetector, this.scheduler, function() {
        self.completedJobsTotal++;
      });
      worker.start();
      this.workers.push(worker);
    }
    console.log('[LoadBalancer] Initialized worker pool with ' + this.workerPoolSize + ' workers');
  }

  // check cluster
  private monitorClusterHealth() {
      var self: any = this;
    setInterval(function() {
      var healthy = self.failureDetector.getHealthyNodes();
      var queueSize = self.dispatcher.getQueueSize();
      var healthStr = '[LoadBalancer] Healthy workers: ' + healthy.length + ' | Queue: ' + queueSize;
      var paddedHealth = healthStr.padEnd(66);
      console.log('||  ' + paddedHealth + '||');
    }, 1000);
  }

  private startMetricsServer() {
      var self: any = this;
    var server = http.createServer(function(req, res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/metrics') {
        var activeJobs = 0;
        for (var i = 0; i < self.workers.length; i++) {
          activeJobs += (self.workers[i] as any).getActiveJobsCount();
        }
        var circuitBreakerStates = {};
        
        // First, collect circuit breaker states from all workers
        for (var i = 0; i < self.workers.length; i++) {
          var w = self.workers[i];
          if (typeof (w as any).getCircuitBreakerStates === 'function') {
            var states = (w as any).getCircuitBreakerStates();
            for (var key in states) {
              circuitBreakerStates[key] = states[key];
            }
          }
        }
        
        // Initialize circuit breaker states for any healthy nodes that don't have states yet
        var allHealthyNodes = self.failureDetector.getHealthyNodes();
        for (var h = 0; h < allHealthyNodes.length; h++) {
          var nodeId = allHealthyNodes[h];
          if (!circuitBreakerStates.hasOwnProperty(nodeId)) {
            circuitBreakerStates[nodeId] = 'CLOSED';
          }
        }

        var queuedJobs = self.dispatcher.getQueueSize();
        var healthyNodes = allHealthyNodes.length;
        var totalWorkerCount = self.failureDetector.getAllNodes().length;
        
        if (healthyNodes > totalWorkerCount) {
          healthyNodes = totalWorkerCount;
        }

        var systemMetrics = self.getSystemMetrics();
        var metrics = {
          healthyWorkers: healthyNodes,
          totalWorkers: totalWorkerCount,
          activeJobs: activeJobs,
          queuedJobs: queuedJobs,
          completedJobsTotal: self.completedJobsTotal,
          circuitBreakerStates: circuitBreakerStates,
          loadBalancerCpuUsage: self.getLBCpuUsage(),
          loadBalancerMemoryUsage: self.getLBMemoryUsage(),
          loadBalancerDiskUsage: self.getLBDiskUsage(),
          systemMetrics: systemMetrics,
          timestamp: Date.now()
        };

        console.log('[LoadBalancer] Metrics request: active=' + activeJobs + ', queued=' + queuedJobs + ', healthy=' + healthyNodes + '/' + totalWorkerCount + ', circuit breakers=' + Object.keys(circuitBreakerStates).length);
        res.writeHead(200);
        res.end(JSON.stringify(metrics));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(9001, function() {
      console.log('[LoadBalancer] Metrics server listening on port 9001');
    });
  }

  public getLBCpuUsage(): number | null {
    return this.systemMonitor.getCpuUsage();
  }

  public getLBMemoryUsage(): number | null {
    return this.systemMonitor.getMemoryUsage();
  }

  public getLBDiskUsage(): number | null {
    return this.systemMonitor.getDiskUsage();
  }

  public getSystemMetrics() {
    return this.systemMonitor.getMetrics();
  }

  shutdown() {
    console.log('[LoadBalancer] Initiating graceful shutdown...');
    this.deregisterFromDNS();
    for (var i = 0; i < this.workers.length; i++) {
      this.workers[i].stop();
    }
    console.log('[LoadBalancer] Shutdown completed');
  }
}

// start lb
var lb = new LoadBalancer(3010, 4, 'localhost', 3000);

console.clear();
console.log('_______________________________________________');
console.log('________________  Load Balancer   _____________');
console.log('||          Load Balancer listening on port 3010  ||');
console.log('||  DNS Router: localhost:3000 (Registration)     ||');
console.log('||  [LoadBalancer] Healthy workers: 0             ||');
console.log('__________________________________________________');

// graceful shutdown on signals
process.on('SIGTERM', function() { lb.shutdown(); });
process.on('SIGINT', function() { lb.shutdown(); });

