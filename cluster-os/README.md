# ClusterOS - Distributed Systems Simulation

ClusterOS is a distributed systems project that simulates a cluster of computers working together. It demonstrates how load balancers distribute work across multiple machines, how systems detect failures, and how they recover from problems automatically.

## What's Inside

ClusterOS includes:
- Load Balancer: Routes jobs to available worker machines
- Worker Nodes: Process jobs and return results
- DNS Router: Manages service discovery
- Dashboard: A web interface to monitor and control everything
- Real-time Metrics: Monitor cluster health and performance

## Prerequisites

You need:
- Node.js version 16 or higher
- npm (comes with Node.js)

To check if you have them:
```bash
node --version
npm --version
```

## Installation

1. Open your terminal or PowerShell
2. Navigate to the cluster-os directory
3. Install dependencies:
```bash
npm install
```

This installs all required packages for running the system.

## Quick Start - Run Everything

The easiest way to run the entire system is:

```bash
npm start
```

This command starts:
- DNS Router (service discovery)
- Load Balancer (main kernel)
- One Worker Node (processes jobs)
- Dashboard (web interface)

All services start in parallel and output colored messages so you can track what's happening.

## Access the Dashboard

After running `npm start`, open your browser and go to:

```
http://localhost:5000
```

You should see the ClusterOS Dashboard with:
- System Controls (Start/Stop Load Balancer, Add/Remove Workers)
- Cluster Metrics (Healthy workers, active jobs, queued jobs)
- System Health (Real-time graphs showing utilization, throughput, queue depth)
- Circuit Breaker States (Health status of each worker)
- Job Submission (Submit jobs and view results)
- Dynamic Tuning (Adjust system parameters)

## How to Use the Dashboard

1. Start the system with `npm start`
2. Open http://localhost:5000
3. Click "Start Load Balancer" to begin
4. Click "Add Worker" 2-3 times to add multiple workers
5. Submit a job by entering a JSON array like `[1,2,3,4,5]` in the Job Payload field
6. Click "Dispatch Job" to send it
7. View the result in the Results section below
8. Watch the real-time graphs update as jobs are processed
9. Use the hamburger menu (three lines) to open Dynamic Tuning and adjust coefficients

The dashboard updates automatically every 500 milliseconds, so you can see system behavior in real-time.

## What Each Metric Means

- **Healthy Workers**: Number of workers responding correctly / total workers
- **Total Workers**: Total number of worker machines in the cluster
- **Active Jobs**: Number of jobs currently being processed
- **Queued Jobs**: Number of jobs waiting to be assigned
- **Cluster Utilization**: Percentage showing how much the cluster is being used (0-100%)
- **Request Throughput**: Jobs being processed per second
- **Queue Depth**: Count of pending jobs

## Stop the System

Press Ctrl+C in the terminal to stop all services.

## Alternative Startup Options

If you want more control, you can start services individually:

**Start DNS Router Only:**
```bash
npm run start:dns
```

**Start Load Balancer Only:**
```bash
npm run start:lb
```

**Start Worker Nodes:**
```bash
npm run start:worker
```

**Start Dashboard Only:**
```bash
npm run start:dashboard
```

**Start with 3 Workers:**
```bash
npm run start:cluster
```

Note: Services must be started in order (DNS Router, then Load Balancer, then Workers/Dashboard).

## Project Structure

```
cluster-os/
├── src/
│   ├── kernel/           LoadBalancer, Scheduler, Lamport Clock
│   ├── worker/           Worker Node implementation
│   ├── network/          DNS Router implementation
│   ├── dashboard/        Web UI and backend server
│   └── middleware/       Failure detection
├── tests/                Automated tests
├── package.json          Project dependencies
└── README.md            This file
```

## Key Concepts Demonstrated

### Load Balancer as Kernel
The load balancer acts as the central "kernel" of the cluster. All jobs go through it, and it decides which worker gets each job. This abstraction makes the cluster look like a single machine to clients.

### Failure Detection
The system continuously monitors worker health through heartbeat messages. If a worker stops responding, the system automatically stops sending it jobs. When the worker recovers, the system puts it back to work.

### Circuit Breaker Pattern
Each worker has a state:
- CLOSED: Healthy, accepting jobs
- OPEN: Failed, rejecting jobs
- HALF_OPEN: Testing recovery with limited jobs

### Job Aggregation
Large jobs are divided into smaller tasks that workers process in parallel. Results are collected and returned in the correct order.

### Lamport Clock
Every message in the system gets a logical timestamp. This ensures all events can be ordered correctly, even without synchronized clocks. This is essential for debugging and ensuring correct ordering in distributed processing.

## Testing

To run automated tests:

```bash
npm test
```

To run tests in UI mode with visualization:

```bash
npm run test:ui
```

To view test results:

```bash
npm run test:report
```

Note: Before running tests, start the services in separate terminals:
- Terminal 1: `npm run start:dns`
- Terminal 2: `npm run start:lb`
- Terminal 3: `npm run start:dashboard`
- Terminal 4: `SKIP_WEB_SERVER=1 npm test`

## Understanding the Architecture

```
Browser Client
    |
    v
DNS Router (Port 2000/3000)
    |
    v
Load Balancer (Port 3010)
    |
    +----> Worker Node 1
    |
    +----> Worker Node 2
    |
    +----> Worker Node 3
    |
    v
Metrics Server (Port 9001)
```

When you submit a job through the dashboard:
1. The job goes to the Load Balancer
2. The Load Balancer picks the best available Worker
3. The Worker processes the job
4. Results return to the Load Balancer
5. Results are delivered back to the Dashboard
6. The Dashboard displays the results

## Common Issues

**Dashboard won't connect:**
- Make sure Load Balancer is running
- Check that it's on port 3010
- Wait a few seconds and refresh the browser

**Workers won't add:**
- Load Balancer must be running first
- Check that DNS Router started successfully

**Jobs don't process:**
- At least one worker must be added
- Load Balancer must be running
- Check for error messages in the terminal

## Development

To modify the system:
1. Edit TypeScript files in `src/`
2. The system auto-reloads using ts-node
3. Changes take effect on the next request
4. Check terminal output for errors

## Further Learning

This project demonstrates concepts from:
- Distributed Systems textbooks
- Microservices architecture
- Fault tolerance patterns
- Real-time monitoring systems

Study the source code to see how each concept is implemented. Start with `src/kernel/LoadBalancer.ts` to understand the core logic.
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
