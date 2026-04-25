# ClusterOS

ClusterOS is a distributed systems simulation based on concepts from "Distributed Systems: Concepts and Design" where a load balancer acts as the kernel and coordinates a set of worker nodes over TCP sockets. The system demonstrates key distributed systems concepts like failure detection, load balancing, circuit breaker patterns, and job aggregation.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Communication**: Raw TCP sockets with newline-delimited JSON
- **No external dependencies** (just TypeScript and ts-node for development)

## Features

- Load balancer with priority queuing and worker routing
- Phi-suspicion failure detection (adaptive heartbeat monitoring)
- Circuit breaker pattern for handling worker failures
- Priority-based job queuing (HIGH, NORMAL, LOW)
- Browser dashboard for managing components and submitting jobs
- Metrics HTTP endpoint for cluster status
- Client affinity for sticky session scheduling
- Job aggregation for parallel processing of array data

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **PowerShell** (on Windows) or terminal on Mac/Linux

## Setup

```powershell
cd cluster-os
npm install
```

This installs TypeScript development tools and type definitions.

## How to Run

### Recommended: Dashboard (Easiest)

The dashboard is the simplest way to run the full system. It handles component startup automatically.

```powershell
npm run start:dashboard
```

Then open your browser:

```text
http://localhost:5000
```

**Steps to test:**

1. Click **Start Load Balancer** button
2. Click **Add Worker** (do this 2-3 times to add multiple workers)
3. Type a JSON array in the job input box, like `[1,2,3,4,5]`
4. Click **Submit Job**
5. View the result in the output panel below
6. Click **Stop Load Balancer** when done

The dashboard also shows:
- **Healthy Workers**: Number of responsive workers / total workers
- **Active Jobs**: Count of jobs currently being processed (increments on submit, decrements as jobs complete)
- **Queued Jobs**: Count of jobs waiting for dispatch when system is at capacity
- **System Health**: Status indicator, health percentage, and load distribution
- **Circuit Breaker States**: Per-worker state visualization (CLOSED=healthy, OPEN=failing, HALF_OPEN=recovering)
- **Real-time Metrics**: All metrics update every 2 seconds

### Alternative: CLI Mode (Manual)

If you want to run components in separate terminals:

**Terminal 1** — Start DNS Router:
```powershell
npm run start:dns
```

**Terminal 2** — Start Load Balancer:
```powershell
npm run start:lb
```

**Terminal 3 & 4** — Start two Worker Nodes (in separate terminals):
```powershell
npm run start:worker
npm run start:worker
```

**Terminal 5** — Start Client CLI:
```powershell
npm run start:client
```

Then in the client, you can run commands:
```
ClusterOS > submit [1,2,3]
ClusterOS > status
ClusterOS > exit
```

**Important:** Start the DNS router first, then the load balancer, then workers. The order matters.

## System Architecture

```
User Input
    ↓
┌─────────────────────┐
│  DNS Router         │ (Port 2000/3000)
│  (Client routing)   │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Load Balancer      │ (Port 3010)
│  (Kernel)           │
│  - Dispatcher       │
│  - Scheduler        │
│  - Circuit Breaker  │
│  - Failure Detector │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Worker Nodes       │
│  (Process jobs)     │
└─────────────────────┘
```

## Key Distributed Systems Concepts

ClusterOS demonstrates several core distributed systems patterns and concepts:

### Load Balancer as Kernel (Single System Image)
The load balancer acts as a centralized kernel that abstracts away worker node complexity from clients. Clients submit jobs to a single entry point without knowing about individual workers.

### Phi-Suspicion Failure Detection
An adaptive failure detection mechanism that analyzes heartbeat intervals rather than just checking presence/absence. Heartbeats arriving at irregular intervals indicate potential failure before a timeout occurs.

### Circuit Breaker Pattern
Prevents cascading failures by managing per-worker state through three states:
- **CLOSED**: Worker is healthy; all requests allowed
- **OPEN**: Worker has failed; requests blocked temporarily
- **HALF_OPEN**: Testing if worker recovered; limited requests allowed

### Job Aggregation (Map-Reduce)
Divides incoming jobs across multiple workers and aggregates results:
- **Divide**: Large job split into smaller tasks
- **Conquer**: Each worker processes its tasks in parallel
- **Aggregate**: Results collected and returned to client

### Priority-Based Queuing
Jobs can be submitted with different priorities (HIGH, NORMAL, LOW). The scheduler respects priority order when dispatching jobs.

### Client Affinity / Sticky Sessions
The scheduler can maintain affinity for repeated requests from the same client to improve cache locality.

### Distributed Logical Ordering (Lamport Clock)
Every message in the system is tagged with a logical timestamp called a Lamport Clock. This provides a total ordering of all events across the distributed system independent of wall-clock synchronization.

**How it works:**
- Each component (LoadBalancer, Workers, DNS Router) maintains its own logical clock
- Before sending a message: increment the clock
- Upon receiving a message: update clock to max(local, received) + 1
- Result: `lamportTime` field in every message establishes causal ordering

**Benefits:**
- Deterministic event ordering across the network
- Proper ordering of sub-job results (MapReduce chunks arrive in correct order)
- Idempotent message handling (detect duplicate retries)
- Consistent distributed tracing and debugging
- Causality tracking independent of network latency

**Implementation:**
- `src/kernel/lamportClock.ts` — Core Lamport Clock class
- LoadBalancer: Increments before sending jobs, updates on receiving heartbeats/results
- Workers: Increment before sending results, update on receiving jobs
- FailureDetector: Tracks logical timestamps from heartbeats

**Example:**
```
Sequence of events (logical time order):
[LoadBalancer:1] Sends JOB_SUBMIT (lamportTime=1)
[Worker:1]       Receives JOB_SUBMIT, updates clock to max(0,1)+1 = 2
[Worker:2]       Sends JOB_RESULT (lamportTime=3)
[LoadBalancer:2] Receives JOB_RESULT, updates clock to max(1,3)+1 = 4

Result: Total causal order: LB:1 → W:2 → W:3 → LB:4
```

## Key Components

| Component | File | Responsibility |
|-----------|------|-----------------|
| **Load Balancer** | `src/kernel/LoadBalancer.ts` | Main kernel; routes jobs to workers, detects failures, manages retries |
| **DNS Router** | `src/network/DNSRouter.ts` | Entry point for clients; routes to available load balancers |
| **Worker Node** | `src/worker/WorkerNode.ts` | Processes jobs; sends heartbeats; handles parallel workloads |
| **Scheduler** | `src/kernel/Scheduler.ts` | Selects which worker gets the job (considers load and affinity) |
| **Failure Detector** | `src/middleware/FailureDetector.ts` | Monitors worker health via heartbeat analysis |
| **Lamport Clock** | `src/kernel/lamportClock.ts` | Provides logical event ordering independent of wall-clock time |
| **Dashboard** | `src/dashboard/Dashboard.ts` | Web UI for managing the cluster |
| **Client** | `src/client/UserClient.ts` | CLI for submitting jobs and checking status |

## Network Ports

| Port | Component | Purpose |
|------|-----------|---------|
| 2000 | DNS Router | Client entry point |
| 3000 | DNS Router | Load balancer registration |
| 3010 | Load Balancer | Worker and client connections |
| 5000 | Dashboard | Web UI |
| 9001 | Metrics Server | HTTP metrics endpoint (JSON format) |

**Metrics Endpoint Example:**

View live metrics in your browser or via curl:

```bash
curl http://localhost:9001/metrics
```

Returns:
```json
{
  "healthyWorkers": 4,
  "totalWorkers": 4,
  "activeJobs": 0,
  "queuedJobs": 0,
  "circuitBreakerStates": {
    "worker-0": "CLOSED",
    "worker-1": "CLOSED",
    "worker-2": "CLOSED",
    "worker-3": "CLOSED"
  }
}
```

## Testing the System

### Verify Active Jobs Metric is Working

The **Active Jobs** metric tracks the number of job elements currently being processed:

1. Open the dashboard: `http://localhost:5000`
2. Note the "Active Jobs" value (should be 0 initially)
3. Enter a job: `[10, 20, 30]` (3 elements)
4. Click "Submit Job"
5. **Watch the Active Jobs metric INCREASE** immediately (will show 2+)
6. **Wait 2-3 seconds** as the load balancer processes the job elements
7. **Watch the Active Jobs metric DECREASE** back to 0 as jobs complete

**Expected Behavior:**
- Before submit: Active Jobs = 0
- After submit: Active Jobs = 2 or higher
- After completion: Active Jobs = 0 (returns in 2-3 seconds)

If you see this pattern, Active Jobs is working correctly!

### Verify Queued Jobs Metric

The **Queued Jobs** metric shows how many jobs are waiting for dispatch:

1. Submit 5 large jobs rapidly by clicking "Submit Job" 5 times
2. Watch "Queued Jobs" counter
3. If system has capacity: Queued Jobs remains at 0 (all jobs dispatched immediately)
4. If system is saturated: Queued Jobs will increase
5. As workers complete jobs, Queued Jobs decreases

### Simple Test: Array Doubling

The worker nodes double all elements in an array:

```
Input:  [1, 2, 3, 4, 5]
Output: [2, 4, 6, 8, 10]
```

### Test Failure Detection

With workers running:
1. Kill a worker process (Ctrl+C in its terminal)
2. Wait a few seconds
3. The failure detector marks it as suspected failed
4. New jobs are routed to healthy workers

### Test Load Balancing

Submit multiple jobs:
1. Submit a job while one is processing
2. The load balancer distributes to the least-busy worker
3. Check metrics: `curl http://localhost:9001/metrics`

## Optional Helper Scripts

In `scripts/` there are two helper scripts for quick testing:

- `submit_job.js` — Submit a single job from the terminal
- `submit_multiple_jobs.js` — Submit many jobs in a loop

These are optional; the dashboard and CLI are the main ways to interact with the system.

## Example Session

```powershell
# Terminal 1
npm run start:dns

# Terminal 2
npm run start:lb

# Terminal 3 & 4
npm run start:worker
npm run start:worker

# Terminal 5
npm run start:client

# In the client terminal:
ClusterOS > submit [10, 20, 30]
Job submitted with ID: abc123-...
ClusterOS > status
Healthy workers: 2, Active jobs: 1, Queued: 0
ClusterOS > # Wait for result...
```

## Notes

- All state is in-memory; restarting components loses job history
- Workers send heartbeats every 2 seconds
- Jobs timeout after 10 seconds with automatic retry (up to 3 attempts)
- The system is designed for local development and testing
- Job results are only kept while components are running
