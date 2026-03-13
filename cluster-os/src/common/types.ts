/**
 * ClusterMessage defines the structure of messages exchanged in the distributed system.
 * It supports heterogeneity by allowing flexible payloads and includes metadata for routing.
 */
export interface ClusterMessage {
  type: 'HEARTBEAT' | 'JOB_SUBMIT' | 'JOB_RESULT' | 'SUB_JOB_SUBMIT' | 'SUB_JOB_RESULT' | 'CLUSTER_STATUS' | 'CLUSTER_STATUS_REPLY';
  senderId: string;
  requestId: string;
  payload: any;
  priority?: 'HIGH' | 'NORMAL' | 'LOW';
  retryCount?: number;
  maxRetries?: number;
  clientAffinityHint?: string;
}

/**
 * Heartbeat payload includes load information for scheduling decisions.
 */
export interface HeartbeatPayload {
  activeJobs: number;
}

/**
 * LoadBalancer registry entry for DNS routing.
 */
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