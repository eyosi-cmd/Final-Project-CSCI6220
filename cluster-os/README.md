# ClusterOS - Distributed Systems Simulation

![npm](https://img.shields.io/badge/npm-9%2B-CB3837?logo=npm&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=black) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white) ![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white) ![HTML5](https://img.shields.io/badge/HTML5-Markup-E34F26?logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-Styling-1572B6?logo=css3&logoColor=white) ![Express](https://img.shields.io/badge/Express-Backend-000000?logo=express&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?logo=vercel&logoColor=white)

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
- Node.js version 18 or higher
- npm (comes with Node.js)

To check if you have them:
```bash
node --version
npm --version
```

## Installation

If you opened the extracted zip at the project root, first move into the `cluster-os` folder.

1. Open your terminal or PowerShell
2. Navigate to the `cluster-os` directory
3. Install dependencies:
```bash
npm install
```

This installs all required packages for running the system.

If you want to work from the extracted root folder instead, you can run:

```bash
npm run install:all
npm start
```

## Running Options

### Option A - Live Deployment (no setup required)

The app is deployed at:

```
https://cluster-os.vercel.app
```

Uses a serverless backend (Vercel Functions) with a simulated in-memory cluster. No local installation needed.
Host CPU, memory, disk, and network metrics are only available in the local cluster, so the deployed dashboard can show unavailable or fallback values for those panels.

(Just a heads up, the Vercel version isn't running the full backend from the local distributed-system setup. Vercel doesn't really support the long-running multi-process backend this project was originally built around, so the deployed site uses a mocked backend for demo purposes only. That means some behavior in the live app is intentionally simplified and won't exactly match the local cluster version. I also started an initial Render setup to eventually run the real backend outside Vercel, but it wasn't fully integrated before the deadline due to time constraints. The `render.yaml` is there as a starting point, but full production wiring for the real cluster processes wasn't finished.)

### Option B - Local Full Cluster

The easiest way to run the entire system locally is:

```bash
npm start
```

Run that command from inside the `cluster-os` folder. If you stay in the extracted root folder, use the root-level `npm start` instead.

This command starts:
- DNS Router (service discovery)
- Load Balancer (main kernel)
- One Worker Node (processes jobs)
- Dashboard (web interface)

All services start in parallel and output colored messages so you can track what's happening.

## Access the Local Dashboard

After running `npm start`, open your browser and go to:

```
http://localhost:5000
```

You should see the ClusterOS Dashboard with:
- System Controls (Start/Stop Load Balancer, Add/Remove Workers)
- Cluster Metrics (Healthy workers, active jobs, queued jobs)
- System Health (Real-time graphs showing utilization, throughput, queue depth)
- Load Balancer Host Metrics (CPU, memory, disk, and network usage)
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
After adding or removing a worker, the dashboard also triggers a few faster refreshes so the worker counts and health cards catch up quickly.

## What Each Metric Means

- **Healthy Workers**: Number of workers responding correctly / total workers
- **Total Workers**: Total number of worker machines in the cluster
- **Active Jobs**: Number of jobs currently being processed
- **Queued Jobs**: Number of jobs waiting to be assigned
- **Cluster Utilization**: Percentage showing how much the cluster is being used (0-100%)
- **Request Throughput**: Jobs being processed per second
- **Queue Depth**: Count of pending jobs
- **Load Balancer CPU / Memory / Disk**: Host machine usage reported by the local load balancer
- **Network Stats**: Aggregate inbound and outbound traffic reported by the local load balancer host

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


## Testing

To run automated tests:

```bash
npm test
```

This starts the core local services automatically through Playwright's `webServer` configuration and runs the dashboard end-to-end tests.

To run tests in UI mode with visualization:

```bash
npm run test:ui
```

Supported Playwright projects in the current setup:
- Chromium
- WebKit

To view test results:

```bash
npm run test:report
```

If you already started the services manually and want Playwright to reuse them, run:
- Terminal 1: `npm run start:dns`
- Terminal 2: `npm run start:lb`
- Terminal 3: `npm run start:dashboard`
- Terminal 4: `set SKIP_WEB_SERVER=1 && npm test`

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

## Current Limitations

- The deployed Vercel app runs a demo backend, not the true local multi-process cluster.
- Some dashboard behavior is mocked or simplified in the hosted version so the UI can still be demonstrated.
- A few frontend/backend paths are stale from earlier iterations, especially around dashboard API wiring and duplicated dashboard assets.
- Render deployment scaffolding exists, but the real backend flow was not fully connected and tested end-to-end.

## Development

To modify the system:
1. Edit TypeScript files in `src/`
2. The system auto-reloads using ts-node
3. Changes take effect on the next request
4. Check terminal output for errors

## Future Enhancements

- Fully integrate the real backend with a non-serverless deployment target so the hosted app matches the local cluster architecture.
- Remove stale or duplicated dashboard files and make the frontend build use a single source of truth.
- Unify the mocked API and local cluster API behavior so tests and deployment are validating the same system.
- Refresh Playwright coverage so tests match the current dashboard text and verify both local and hosted behavior more clearly.
- Replace fallback/demo metrics with real runtime metrics wherever deployment infrastructure allows it.

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

- `submit_job.js` - Submit a single job from the terminal
- `submit_multiple_jobs.js` - Submit many jobs in a loop

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
