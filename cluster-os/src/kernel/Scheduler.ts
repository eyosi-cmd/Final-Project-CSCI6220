import * as net from 'net';
import { FailureDetector } from '../middleware/FailureDetector';
import { CircuitBreakerStatus, SocketHealthMetrics } from '../common/types';

export class Scheduler {
  private failureDetector: FailureDetector;
  private clientAffinityMap: Map<string, string> = new Map();
  private circuitBreakerState: Map<string, CircuitBreakerStatus> = new Map();

  constructor(failureDetector: FailureDetector) {
    this.failureDetector = failureDetector;
  }

  getNextNode(): string | null {
    var nodesByLoad = this.getHealthyNodesByLoad();
    if (nodesByLoad.length === 0) return null;
    return nodesByLoad[0].id;
  }

  getNextNodeForClient(clientId: string): string | null {
    var preferredWorker = this.clientAffinityMap.get(clientId);
    if (preferredWorker) {
      var healthyNodes = this.failureDetector.getHealthyNodes();
      var circuitState = this.circuitBreakerState.get(preferredWorker);
      var isHealthy = false;
      for (let i = 0; i < healthyNodes.length; i++) {
        if (healthyNodes[i] === preferredWorker) {
          isHealthy = true;
          break;
        }
      }
      if (isHealthy && (!circuitState || circuitState.state !== 'OPEN')) {
        return preferredWorker;
      } else {
        this.clientAffinityMap.delete(clientId);
      }
    }
    
    var nextNode = this.getNextNode();
    if (nextNode) {
      this.clientAffinityMap.set(clientId, nextNode);
    }
    return nextNode;
  }

  setClientAffinity(clientId: string, workerId: string) {
    this.clientAffinityMap.set(clientId, workerId);
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