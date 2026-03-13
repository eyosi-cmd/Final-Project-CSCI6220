import { HeartbeatPayload } from '../common/types';

export class FailureDetector {
  private heartbeats: Map<string, number> = new Map();
  private nodeLoads: Map<string, number> = new Map();
  private heartbeatIntervals: Map<string, number[]> = new Map();
  private phiThreshold = 3.0;
  private maxIntervalHistory = 20;

  updateHeartbeat(nodeId: string, payload?: HeartbeatPayload) {
    const now = Date.now();
    const previousTime = this.heartbeats.get(nodeId);
    
    this.heartbeats.set(nodeId, now);
    if (payload) {
      this.nodeLoads.set(nodeId, payload.activeJobs);
    }

    if (previousTime !== undefined) {
      const interval = now - previousTime;
      if (!this.heartbeatIntervals.has(nodeId)) {
        this.heartbeatIntervals.set(nodeId, []);
      }
      const intervals = this.heartbeatIntervals.get(nodeId)!;
      intervals.push(interval);
      if (intervals.length > this.maxIntervalHistory) {
        intervals.shift();
      }
    }
  }

  private computePhiSuspicion(nodeId: string): number {
    const now = Date.now();
    const lastHeartbeat = this.heartbeats.get(nodeId);

    if (lastHeartbeat === undefined) {
      return 10.0;
    }

    const timeSinceLastHeartbeat = now - lastHeartbeat;
    const intervals = this.heartbeatIntervals.get(nodeId);

    if (!intervals || intervals.length === 0) {
      return 0.0;
    }

    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - meanInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return timeSinceLastHeartbeat > meanInterval * 2 ? 8.0 : 0.0;
    }

    const zScore = (timeSinceLastHeartbeat - meanInterval) / stdDev;
    const phi = -Math.log10(Math.exp(-zScore) / (1 + Math.exp(-zScore))) + Math.log10(0.1);

    return Math.max(0, Math.min(10, phi));
  }

  getHealthyNodes(): string[] {
    const healthy: string[] = [];
    for (const [id] of this.heartbeats) {
      const phi = this.computePhiSuspicion(id);
      if (phi < this.phiThreshold) {
        healthy.push(id);
      }
    }
    return healthy;
  }

  getNodeLoad(nodeId: string): number {
    return this.nodeLoads.get(nodeId) || 0;
  }

  getHealthyNodesByLoad(): Array<{ id: string; load: number }> {
    const healthy: Array<{ id: string; load: number }> = [];
    for (const [id] of this.heartbeats) {
      const phi = this.computePhiSuspicion(id);
      if (phi < this.phiThreshold) {
        const load = this.getNodeLoad(id);
        healthy.push({ id, load });
      }
    }
    return healthy.sort((a, b) => a.load - b.load);
  }

  getNodePhiSuspicion(nodeId: string): number {
    return this.computePhiSuspicion(nodeId);
  }

  setPhiThreshold(threshold: number) {
    this.phiThreshold = threshold;
  }
}