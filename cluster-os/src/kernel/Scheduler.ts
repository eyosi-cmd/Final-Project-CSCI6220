import { FailureDetector } from '../middleware/FailureDetector';
import { CircuitBreakerStatus } from '../common/types';

export class Scheduler {
  private failureDetector: FailureDetector;
  private clientAffinityMap: Map<string, string> = new Map();
  private circuitBreakerState: Map<string, CircuitBreakerStatus> = new Map();

  constructor(failureDetector: FailureDetector) {
    this.failureDetector = failureDetector;
  }

  getNextNode(): string | null {
    const nodesByLoad = this.getHealthyNodesByLoad();
    if (nodesByLoad.length === 0) return null;
    return nodesByLoad[0].id;
  }

  getNextNodeForClient(clientId: string): string | null {
    const preferredWorker = this.clientAffinityMap.get(clientId);
    if (preferredWorker) {
      const healthyNodes = this.failureDetector.getHealthyNodes();
      const circuitState = this.circuitBreakerState.get(preferredWorker);
      if (healthyNodes.includes(preferredWorker) && (!circuitState || circuitState.state !== 'OPEN')) {
        return preferredWorker;
      } else {
        this.clientAffinityMap.delete(clientId);
      }
    }
    
    const nextNode = this.getNextNode();
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
    const allHealthyNodes = this.failureDetector.getHealthyNodesByLoad();
    return allHealthyNodes.filter(node => {
      const circuitState = this.circuitBreakerState.get(node.id);
      return !circuitState || circuitState.state !== 'OPEN';
    });
  }

  setCircuitBreakerState(state: Map<string, CircuitBreakerStatus>) {
    this.circuitBreakerState = state;
  }

  getCircuitBreakerState(workerId: string): CircuitBreakerStatus | undefined {
    return this.circuitBreakerState.get(workerId);
  }
}