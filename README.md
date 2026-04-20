## ClusterOS

ClusterOS is a distributed systems simulation based on "Distributed Systems: Concepts and Design (5th Edition)" by George Coulouris. It demonstrates a Load Balancer acting as the kernel, providing a Single System Image over commodity worker nodes using raw TCP sockets.

### Quick Start

**Option 1: Automated (Recommended)**
```bash
cd cluster-os
npm run start
```
This starts all services simultaneously: DNS Router, Load Balancer, Worker Nodes, and Dashboard.

**Option 2: Manual Start (for development)**
```bash
cd cluster-os

# Terminal 1: DNS Router
npm run start:dns

# Terminal 2: Load Balancer
npm run start:lb

# Terminal 3: Worker Nodes (spawn as many as needed)
npm run start:worker

# Terminal 4: Dashboard
npm run start:dashboard

# Terminal 5: CLI Client (optional)
npm run start:client
```

**Access the Dashboard**
- Open your browser and navigate to: `http://localhost:5000`
- Dashboard displays real-time cluster metrics, worker health, and job queue status
- Submit jobs directly from the web UI or use the CLI client

**Installation (first time only)**
```bash
npm install              # Install root dependencies
cd cluster-os
npm install            # Install cluster-os dependencies
npx tsc               # Compile TypeScript
```

---

## Live Demo & Deployment

**Try it Online:**
- **Vercel Deployment**: [https://cluster-os.vercel.app/](https://cluster-os.vercel.app/)
- **GitHub Repository**: [https://github.com/eyosi-cmd/Final-Project-CSCI6220](https://github.com/eyosi-cmd/Final-Project-CSCI6220)

**Local Development:**
- Clone the repository: `git clone https://github.com/eyosi-cmd/Final-Project-CSCI6220`
- Follow the Quick Start instructions above
- Dashboard available at `http://localhost:5000`

---

The interactive web-based dashboard provides real-time monitoring and control of the distributed cluster.

### Dashboard Features

**Cluster Status Panel**
- Healthy Workers: Real-time count of responsive worker nodes
- Total Workers: Total worker pool size
- Active Jobs: Number of jobs currently processing
- Queued Jobs: Jobs waiting for worker availability
- Completed Jobs Total: Cumulative job completion counter

**Worker Health (Circuit Breaker States)**
- Real-time circuit breaker state tracking for each worker
- Visual status indicators: CLOSED (green/healthy), OPEN (red/failed), HALF_OPEN (yellow/recovering)
- Automatic state transitions based on worker performance
- Auto-recovery after 30-second timeout in OPEN state

**System Metrics Visualization**
- Health Graph: Worker utilization percentage over time
- Throughput Graph: Jobs completed per second with dynamic boost calculation
- Queue Graph: Job queue depth with payload-aware scaling
- Real-time updates every 500ms via metrics polling

**Load Distribution Display**
- Shows average jobs per worker
- Total job count across cluster
- Health percentage indicator

**Job Submission Panel**
- JSON Array input for batch jobs (e.g., `[1, 2, 3, 4, 5]`)
- Automatic job distribution across healthy workers
- Real-time job tracking with request IDs
- Result aggregation for split jobs

**Control Buttons**
- Start Load Balancer: Initialize the central coordinator
- Stop Load Balancer: Graceful shutdown
- Add Worker: Spawn new worker process
- Remove Worker: Terminate a worker node
- Submit Job: Send jobs to the cluster
- Clear Output: Reset job history log

**Dynamic Tuning Panel**
- Real-time coefficient adjustment without restart
- Graph Response: w_u (utilization weight), k_t (throughput boost), k_q (queue weight)
- Job Processing: alpha (base completion), beta (payload factor), gamma (queue factor)
- Visualization: metricsUpdateInterval, maxHistoryPoints adjustments
- Behavior: minRandomFactor, maxRandomFactor for graph smoothing
- Reset to defaults option

**Job Results Section**
- Timestamp of job submission and completion
- Payload size tracking
- Result arrays (before/after processing)
- Elapsed time calculation
- Visual scrollable log with timestamps

### API Endpoints

The dashboard communicates with the backend via RESTful APIs:

- `GET /api/metrics` - Cluster metrics (workers, jobs, circuit breaker states)
- `POST /api/start-lb` - Start load balancer
- `POST /api/kill-lb` - Stop load balancer
- `POST /api/start-worker` - Add worker node
- `POST /api/kill-worker` - Remove worker node
- `POST /api/submit-job` - Submit job with payload
- `GET /api/job-result/:id` - Poll job result by request ID

### Data Flow

Dashboard-specific flow:
1. Frontend polls `/api/metrics` every 500ms for cluster state
2. Dashboard.ts (backend) fetches metrics from LoadBalancer (port 9001)
3. LoadBalancer aggregates circuit breaker states from all workers
4. Frontend displays real-time cluster state with color-coded indicators
5. User submits jobs via web form
6. Dashboard routes jobs to LoadBalancer via TCP port 3010
7. Results returned and displayed in scrollable job log

For complete job submission flow, see [Project Structure.md](Project%20Structure.md#data-flow-job-submission-to-result).

### Tuning Coefficients

The dynamic tuning panel allows real-time adjustment of graph behavior:

- **w_u**: Multiplier for worker utilization health metric
- **k_t**: Throughput boost factor for spike detection
- **k_q**: Queue weight boost for congestion visualization
- **alpha**: Base job completion rate
- **beta**: Payload size multiplier for job duration
- **gamma**: Queue congestion factor
- **recentJobWindow**: Timeframe for recent job tracking (ms)
- **maxJobAge**: Maximum age before job dropped from display (ms)
- **metricsUpdateInterval**: Polling frequency (ms)
- **minThroughput**: Minimum jobs/sec for graph floor
- **minQueue**: Minimum queue size for display floor

---

## System Architecture

For detailed system architecture, component descriptions, message types, and port mapping, see [Project Structure.md](Project%20Structure.md).

Key architectural highlights:
- **DNS Router**: Service discovery and transparent load balancer routing
- **LoadBalancer Kernel**: Central coordinator with 4 worker pool processors
- **FailureDetector**: Phi-accrual algorithm for health monitoring
- **Circuit Breaker**: Per-worker state machine (CLOSED → OPEN → HALF_OPEN)
- **Scheduler**: Client affinity with least-load node selection
- **Worker Nodes**: Distributed compute units with heartbeat tracking

---

## Building and Deployment

### Build Dashboard Assets

```bash
npm run build
```

Compiles TypeScript and copies dashboard files to public/ directory.

### Development

```bash
npm run test          # Run Playwright tests
npm run test:ui       # Run tests in UI mode
npm run test:debug    # Debug mode
npm run test:headed   # Headed browser testing
npm run test:report   # Show test report
```

### Production Deployment

Dashboard can be deployed to Vercel via `vercel.json` configuration. Render.yaml supports deployment on Render platform.

---

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js with ts-node
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js HTTP + Raw TCP sockets
- **Testing**: Playwright (partial implementation)
- **Process Management**: concurrently (parallel execution)
- **Deployment**: Vercel (fully implemented), Render (partial implementation)

---

## Project Structure

Detailed file structure, startup order, and job lifecycle are documented in [Project Structure.md](Project%20Structure.md).

**Key directories:**
- `src/kernel/` — LoadBalancer, Scheduler, LamportClock
- `src/network/` — DNSRouter
- `src/worker/` — WorkerNode
- `src/dashboard/` — Web UI and backend server
- `src/middleware/` — FailureDetector
- `tests/` — Playwright integration tests

---

## System Requirements

**For Local Development:**
- Node.js 18+
- npm 9+
- Available ports on localhost:
  - `2000` — DNS Router (client routing)
  - `3000` — DNS Router (LB registration)
  - `3010` — Load Balancer (job/heartbeat traffic)
  - `5000` — Dashboard UI
  - `9001` — Metrics endpoint

**For Deployment:**
- Vercel: Connected via `vercel.json` configuration
- Render: Connected via `render.yaml` configuration

---

## Troubleshooting

**Load Balancer won't start**
- Ensure port 3010 is available
- Check that DNS Router is running on port 3000

**Dashboard shows "0 healthy workers"**
- Verify workers are spawned and connected
- Check worker heartbeat in console output
- Ensure LoadBalancer circuit breaker tracking is correct

**Jobs timing out**
- Jobs timeout after 10 seconds by default
- Increase retry attempts or check worker availability
- Monitor circuit breaker states for failed workers

**Metrics not updating**
- Verify metrics endpoint on port 9001 is responding
- Check browser console for fetch errors
- Ensure LoadBalancer is running

---

## References & Concepts Applied

### Core Textbook
- Coulouris, G., Dollimore, J., Kindberg, T., & Blair, G. (2011). *Distributed Systems: Concepts and Design* (5th ed.). Addison-Wesley.  
  This book served as the primary foundation for the ClusterOS architecture. In particular, Chapter 8 guided the fault tolerance mechanisms, Chapter 11 informed the DNS-related design, and Chapters 13, 14, and 18 were useful for clock synchronization and coordination across distributed nodes.

### Research Papers & Algorithms
- Dean, J., & Ghemawat, S. (2004). *MapReduce: Simplified Data Processing on Large Clusters.* OSDI.  
  This paper influenced the design of job distribution, aggregation, and result reconstruction across worker nodes.

- Hayashibara, N., Défago, X., Yared, R., & Katayama, T. (2004). *The φ Accrual Failure Detector.* SRDS.  
  This work provided the mathematical basis for the adaptive failure detection system implemented in `FailureDetector.ts`, allowing more flexible and accurate health monitoring than fixed timeouts.

- Lamport, L. (1978). *Time, Clocks, and the Ordering of Events in a Distributed System.* Communications of the ACM.  
  This paper formed the basis for implementing logical clocks, ensuring proper event ordering and causal consistency within the system.

### Design Patterns
- Fowler, M. (2014). *Circuit Breaker.*  
  This reference guided the implementation of the Circuit Breaker pattern, including the CLOSED, OPEN, and HALF-OPEN states, to manage node reliability and prevent cascading failures.

### Deployment & Hosting
- Vercel Documentation. *Deployment & Hosting Guide.*  
  Used for configuring deployment via `vercel.json`, managing environment variables, and setting up the GitHub-based continuous deployment workflow.  
  Live demo: https://cluster-os.vercel.app/

### Infrastructure
- Microsoft Azure Architecture Center. *Health Endpoint Monitoring Pattern.*  
  These principles informed the design of the system's health monitoring, including the metrics endpoint (port 9001) and heartbeat-based node status tracking.

---

##  Acknowledgments

This project was developed as a comprehensive exercise in distributed systems design and implementation, combining theoretical concepts from Coulouris et al. with practical hands-on experience in system architecture, networking, and UI development, supported by the textbook and online resources.

**Note on AI Usage:** All code modifications and system design decisions were reviewed and validated by me, applying most of the concepts from the book.

**ChatGPT** was leveraged throughout the project with short, focused prompts for:
- Brainstorming and validating distributed systems architecture
**1. Project Ideation & Architecture:**
- "How to Design a load balancer that distributes jobs across multiple servers"
- "How would you implement failure detection in a distributed system?"
- "What scheduling strategies work best for load balancing?"
- "How can I implement circuit breaker pattern for fault tolerance?"

**2. CSS & Dashboard UI Fixes:**
- "Fix responsive CSS for dashboard metrics display"
- "Style card layout for cluster monitoring dashboard"
- "CSS for real-time metric updates visualization"
- "fix errors identifed by playwrite integration testing"
- "How to integrate vercel for frontend deployment"

**3. README & Documentation:**
- "Rewrite given ReadMe.md file for distributed systems project following given project tree"