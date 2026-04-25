import { HeartbeatPayload } from '../common/types';

export class FailureDetector {
  private heartbeats: Map<string, number> = new Map();
  private heartbeatLamportTimes: Map<string, number> = new Map();
  private nodeLoads: Map<string, number> = new Map();
  private heartbeatIntervals: Map<string, number[]> = new Map();
  private phiThreshold = 3.0;
  private maxIntervalHistory = 20;

  updateHeartbeat(nodeId: string, payload?: HeartbeatPayload, lamportTime?: number) {
    var now = Date.now();
    var previousTime = this.heartbeats.get(nodeId);
    
    this.heartbeats.set(nodeId, now);    console.log(`[FailureDetector] Heartbeat from ${nodeId.substring(0,8)} | LamportTime: ${lamportTime}`);
    if (lamportTime !== undefined) {
      this.heartbeatLamportTimes.set(nodeId, lamportTime);
    }
    if (payload) {
      this.nodeLoads.set(nodeId, payload.activeJobs);
    }

    if (previousTime !== undefined) {
      var interval = now - previousTime;
      if (!this.heartbeatIntervals.has(nodeId)) {
        this.heartbeatIntervals.set(nodeId, []);
      }
      var intervals = this.heartbeatIntervals.get(nodeId)!;
      intervals.push(interval);
      if (intervals.length > this.maxIntervalHistory) {
        intervals.shift();
      }
    }
  }

  private computePhiSuspicion(nodeId: string): number {
    var now = Date.now();
    var lastHeartbeat = this.heartbeats.get(nodeId);

    if (lastHeartbeat === undefined) {
      return 10.0;
    }

    var timeSinceLastHeartbeat = now - lastHeartbeat;
    var intervals = this.heartbeatIntervals.get(nodeId);

    if (!intervals || intervals.length === 0) {
      return 0.0;
    }

    var meanInterval = 0;
    for (var i = 0; i < intervals.length; i++) {
      meanInterval += intervals[i];
    }
    meanInterval = meanInterval / intervals.length;

    var variance = 0;
    for (var i = 0; i < intervals.length; i++) {
      var diff = intervals[i] - meanInterval;
      variance += diff * diff;
    }
    variance = variance / intervals.length;

    var stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return timeSinceLastHeartbeat > meanInterval * 2 ? 8.0 : 0.0;
    }

    var zScore = (timeSinceLastHeartbeat - meanInterval) / stdDev;
    var phi = -Math.log10(Math.exp(-zScore) / (1 + Math.exp(-zScore))) + Math.log10(0.1);

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

  getAllNodes(): string[] {
    return Array.from(this.heartbeats.keys());
  }

  getNodeLoad(nodeId: string): number {
    return this.nodeLoads.get(nodeId) || 0;
  }

  getHealthyNodesByLoad(): Array<{ id: string; load: number }> {
    var healthy = [];
    for (var id of this.heartbeats.keys()) {
      var phi = this.computePhiSuspicion(id);
      if (phi < this.phiThreshold) {
        var load = this.getNodeLoad(id);
        healthy.push({ id: id, load: load });
      }
    }
    
    for (var i = 0; i < healthy.length - 1; i++) {
      for (var j = 0; j < healthy.length - i - 1; j++) {
        if (healthy[j].load > healthy[j + 1].load) {
          var temp = healthy[j];
          healthy[j] = healthy[j + 1];
          healthy[j + 1] = temp;
        }
      }
    }
    return healthy;
  }

  getNodePhiSuspicion(nodeId: string): number {
    return this.computePhiSuspicion(nodeId);
  }

  removeNode(nodeId: string): void {
    this.heartbeats.delete(nodeId);
    this.nodeLoads.delete(nodeId);
    this.heartbeatIntervals.delete(nodeId);
  }

  removeMostUnhealthyNode(): string | null {
    let mostUnhealthyId: string | null = null;
    let maxPhi = -1;
    for (const id of this.heartbeats.keys()) {
      const phi = this.computePhiSuspicion(id);
      if (phi > maxPhi) {
        maxPhi = phi;
        mostUnhealthyId = id;
      }
    }
    if (mostUnhealthyId) {
      this.removeNode(mostUnhealthyId);
    }
    return mostUnhealthyId;
  }

  setPhiThreshold(threshold: number) {
    this.phiThreshold = threshold;
  }
}
