// message type
export interface ClusterMessage {
  type: 'HEARTBEAT' | 'JOB_SUBMIT' | 'JOB_RESULT' | 'SUB_JOB_SUBMIT' | 'SUB_JOB_RESULT' | 'CLUSTER_STATUS' | 'CLUSTER_STATUS_REPLY' | 'REGISTER_LB' | 'DEREGISTER_LB' | 'REGISTER_LB_ACK' | 'REMOVE_NODE' | 'REMOVE_UNHEALTHY_NODE';
  senderId: string;
  requestId: string;
  payload: any;
  priority?: 'HIGH' | 'NORMAL' | 'LOW';
  retryCount?: number;
  maxRetries?: number;
  clientAffinityHint?: string;
  lamportTime?: number;
  nodeId?: string;
}

// heartbeat
export interface HeartbeatPayload {
  activeJobs: number;
}

// registry
export interface LoadBalancerRegistry {
  host: string;
  port: number;
}

export interface JobContext {
  requestId: string;
  clientId: string;
  message: ClusterMessage;
  submittedAt: number;
  timeoutMs: number;
  retryCount: number;
  maxRetries: number;
  assignedWorker?: string;
}

export interface ClientAffinityRecord {
  clientId: string;
  preferredWorker: string;
  lastAccessed: number;
}

export interface CircuitBreakerStatus {
  workerId: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  probeAttempts: number;
}

export interface SocketHealthMetrics {
  utilization: number;
  healthy: boolean;
  healthyConnections: number;
  totalConnections: number;
}