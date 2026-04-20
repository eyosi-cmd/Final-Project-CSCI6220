import * as net from 'net';
import { FailureDetector } from '../middleware/FailureDetector';
import { CircuitBreakerStatus, SocketHealthMetrics, ClientAffinityRecord } from '../common/types';

export class Scheduler {
  private failureDetector: FailureDetector;
  private clientAffinityMap: Map<string, ClientAffinityRecord> = new Map();
  private circuitBreakerState: Map<string, CircuitBreakerStatus> = new Map();
  private affinityTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

  constructor(failureDetector: FailureDetector) {
    this.failureDetector = failureDetector;
    // Start garbage collection for stale affinities
    this.startAffinityGarbageCollection();
  }

  private startAffinityGarbageCollection() {
    setInterval(() => {
      // clean up old client affinity records
      var now = Date.now();
      var toRemove = [];
      
      // check all affinity records
      var iter = this.clientAffinityMap.entries();
      var res = iter.next();
      while (!res.done) {
        var cid = res.value[0];
        var rec = res.value[1];
        
        var timeSinceAccess = now - rec.lastAccessed;
        if (timeSinceAccess > this.affinityTimeoutMs) {
          toRemove.push(cid);
        }
        res = iter.next();
      }
      
      // remove stale entries
      for (var i = 0; i < toRemove.length; i++) {
        this.clientAffinityMap.delete(toRemove[i]);
      }
      
      if (toRemove.length > 0) {
        console.log('[Scheduler] Removed ' + toRemove.length + ' old affinity records');
      }
    }, 60000);
  }

  getNextNode(): string | null {
    var nodesByLoad = this.getHealthyNodesByLoad();
    if (nodesByLoad.length === 0) return null;
    return nodesByLoad[0].id;
  }

  getNextNodeForClient(clientId: string): string | null {
    var record = this.clientAffinityMap.get(clientId);
    if (record) {
      var healthyNodes = this.failureDetector.getHealthyNodes();
      var circuitState = this.circuitBreakerState.get(record.preferredWorker);
      var isHealthy = false;
      for (let i = 0; i < healthyNodes.length; i++) {
        if (healthyNodes[i] === record.preferredWorker) {
          isHealthy = true;
          break;
        }
      }
      if (isHealthy && (!circuitState || circuitState.state !== 'OPEN')) {
        // Update lastAccessed timestamp
        record.lastAccessed = Date.now();
        return record.preferredWorker;
      } else {
        this.clientAffinityMap.delete(clientId);
      }
    }
    
    var nextNode = this.getNextNode();
    if (nextNode) {
      var newRecord: ClientAffinityRecord = {
        clientId: clientId,
        preferredWorker: nextNode,
        lastAccessed: Date.now()
      };
      this.clientAffinityMap.set(clientId, newRecord);
    }
    return nextNode;
  }

  setClientAffinity(clientId: string, workerId: string) {
    var record: ClientAffinityRecord = {
      clientId: clientId,
      preferredWorker: workerId,
      lastAccessed: Date.now()
    };
    this.clientAffinityMap.set(clientId, record);
  }

  clearClientAffinity(clientId: string) {
    this.clientAffinityMap.delete(clientId);
  }

  getHealthyNodesByLoad(): Array<{ id: string; load: number }> {
    var allHealthyNodes = this.failureDetector.getHealthyNodesByLoad();
    var ret = [];
    for (var i = 0; i < allHealthyNodes.length; i++) {
      var node = allHealthyNodes[i];
      var circuitState = this.circuitBreakerState.get(node.id);
      if (!circuitState || circuitState.state !== 'OPEN') {
        ret.push(node);
      }
    }
    return ret;
  }

  setCircuitBreakerState(state: Map<string, CircuitBreakerStatus>) {
    this.circuitBreakerState = state;
  }

  getCircuitBreakerState(workerId: string): CircuitBreakerStatus | undefined {
    return this.circuitBreakerState.get(workerId);
  }

  trackWorkerHealthMetrics(s: Map<string, net.Socket>): SocketHealthMetrics {
    const n = this.failureDetector.getAllNodes();
    let a = 0;
    let w = n.length;
    
    for (let i = 0; i < n.length; i++) {
      const load = this.failureDetector.getNodeLoad(n[i]);
      if (load > 0) {
        a++;
      }
    }
    
    const u = w > 0 ? a / w : 0;
    
    let h = 0;
    const t = s.size;
    
    for (const [, socket] of s) {
      if (!socket.destroyed && socket.writable) {
        h++;
      }
    }
    
    return {
      utilization: u,
      healthy: h / (t > 0 ? t : 1) > 0.5,
      healthyConnections: h,
      totalConnections: t
    };
  }
}