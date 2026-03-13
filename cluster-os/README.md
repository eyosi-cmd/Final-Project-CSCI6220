# ClusterOS

So basically a distributed system where a load balancer acts like the kernel and manage a cluster of worker nodes.

## What it do

- **Load Balancer**: added consepts of job routings, it tracks workers,also handle failures
- **Worker Nodes**: They do the actual work
- **Clients**: Send jobs to the system

Everything communicate using TCP sockets and JSON messages. it is pretty straightforward.

## How to Actually Run It

### Prerequisites & Setup

Before you run anything, make sure you got everything you need:

**Required:**
- Node.js installed (you can get it from nodejs.org)
- npm come with Node.js so you should have it automatically
- Git (optional but recommended for cloning the repo)

**Installation Steps:**
1. Make sure you in the `cluster-os` directory: `cd cluster-os`
2. Install all the dependencies: `npm install`
3. Wait for npm to finish installing packages (might take a minute)
4. Now you ready to run the application

### Using the Dashboard UI - Easier Way

```powershell
cd cluster-os
npm run start:dashboard
```

Then open `http://localhost:5000` in your browser. You gonna see a nice UI with buttons and stuff. Just click to start the load balancer and add workers.

#### Detailed Testing Based on Distributed Systems Concepts

After you get the UI open, here some testing steps based on concepts from "Distributed Systems: Concepts and Design":

**Single System Image (SSI) Testing:**
- Click "Start Load Balancer" - this create the kernel of your distributed system
- Even though the Load Balancer is one component, it gonna present as one unified interface to clients
- Submit multiple jobs and notice how you still interacting with one system even though there multiple workers behind scenes
- This demonstrate the SSI principle where clients don't need to worry about which worker processing their job

**Load Balancing & Job Distribution:**
- Add 3 workers to the cluster
- Submit several jobs in quick succession like `[1,2,3]`, `[4,5,6]`, `[7,8,9]`
- Watch the dashboard - each worker should get roughly equal number of jobs (this the least-loaded scheduling algorithm)
- This show how the system distribute work evenly across nodes

**Failure Detection & Fault Tolerance:**

-Start the system with 2 workers
- Submit a normal job first to confirm everything working
- Then manually stop one of the worker processes (you can kill it from task manager or terminal)
- Notice how the Load Balancer detect this within few seconds (heartbeat timeout is 5 seconds)
- The dashboard should show that worker is no longer healthy
- Submit another job and it should route to the remaining healthy worker
- This demonstrate fault tolerance and automatic failure detection using heartbeat monitoring

**Example Scenario for Fault Tolerance:**
1. Start dashboard and click "Start Load Balancer"
2. Add 2 workers - you should see both marked as "healthy" with green status
3. Submit job `[10,20,30]` - you should get result `[20,40,60]` back (this confirm everything working)
4. Now go to task manager (or use PowerShell) and kill one of the worker node processes
5. Go back to dashboard - you might still see 2 workers but after 5-6 seconds one should change to "unhealthy" or disappear
6. Submit another job `[5,15]` while one worker is down
7. The Load Balancer automatically route it to the remaining healthy worker
8. You still get result `[10,30]` back even though one worker crashed
9. This show that the system can handle worker failures and keep operating
10. The Load Balancer detect missing heartbeat from dead worker and exclude it from job scheduling

**Concurrency Transparency:**
- Submit multiple jobs from the browser dashboard at the same time
- Type quick job like `[1]`, `[2]`, `[3]` and click submit multiple times rapidly
- All jobs run in parallel on different workers without you needing to manage synchronization
- The results come back as each worker finish, demonstrating that client don't see the concurrent nature

**Queue Management & Job Scheduling:**
- Start the system with 1 worker only
- Submit 5 jobs rapidly in succession with different arrays like `[1,2,3]`, `[4,5,6]`, `[7,8,9]`, `[10,11,12]`, `[13,14,15]`
- Since you only got 1 worker, the first job start processing immediately but the other 4 jobs go into the queue
- Watch the dashboard Queued Jobs counter go up to 4 while 1 active job running
- As the worker finish each job, you see the queued jobs count decrease
- Eventually all jobs process completely and queued jobs go back to 0
- This demonstrate how the system handle job scheduling when workers are saturated
- Submit 10 jobs with just 1 worker and notice how the queue build up and then drain as jobs complete

**Transparency in Action:**
- Submit a job through the dashboard (location transparency)
- The client don't need to know which worker will process it or where it located
- Load Balancer handle all that transparently
- Client just send job and get result back without caring about underlying distribution

### Or Use Command Line If You Want

Open different terminals in your IDE (like VS Code or others) and run these commands one by one. Make sure you already ran `npm install` and your in the `cluster-os` directory:

```
Dashboard listening on http://localhost:5000
✓ Metrics API: http://localhost:5000/api/metrics
✓ Job Submission: http://localhost:5000/api/submit-job

User opens browser to http://localhost:5000:
  - Clicks "Start Load Balancer"
  - Healthy workers: 0 → (wait)
  - Load Balancer starts listening on port 3000
  
  - Clicks "Add Worker"
  - Healthy workers: 1 (connected via heartbeat)
  
  - Clicks "Add Worker" again
  - Healthy workers: 2 (both workers connected)
  
  - Enters [1,2,3] and clicks "Submit"
  - Job ID: job-1-1773201639712
  - Result appears: [2, 4, 6] ✓

Metrics show:
  Healthy Workers: 2
  Total Workers: 4 (internal pool)
  Active Jobs: 0
  Circuit Breaker: CLOSED for all workers
```

#### Testing Checklist:

All of these have been tested and work:
- **Start Load Balancer** - it spawn on port 3000
- **Add Workers** - they auto-connect using heartbeat detection
- **Metrics Update** - show real-time worker count
- **Submit Jobs** - the whole process work end-to-end
- **Correct Results** - array get doubled correctly like [1,2,3] become [2,4,6]
- **Remove Workers** - they shutdown gracefully and metrics update
- **Stop Load Balancer** - it clean shutdown and reset everything to 0
- **Restart Cycle** - system fully recover and workers reconnect without issue

---

### Alternative: Command-Line Interface (CLI)

If you prefer using the CLI instead of the dashboard:

**Terminal 1: Start DNS Router**
```powershell
cd cluster-os
npm run start:dns
```

Terminal 2 (wait 1s):
```
npm run start:lb
```

Terminal 3 (wait 2s):
```
npm run start:worker
```

Terminal 4 (wait 2s):
```
npm run start:worker
```

Terminal 5 (wait 3s):
```
npm run start:client
```

Then type commands:
```
submit [1,2,3,4,5]
status
exit
```

---

### Direct TypeScript Execution (If npm scripts don't work)

```powershell
# Terminal 1
cd cluster-os && npx ts-node src/network/DNSRouter.ts

# Terminal 2 (wait 1s)
cd cluster-os && npx ts-node src/kernel/LoadBalancer.ts

# Terminal 3 (wait 2s)
cd cluster-os && npx ts-node src/worker/WorkerNode.ts

# Terminal 4 (wait 2s)
cd cluster-os && npx ts-node src/worker/WorkerNode.ts

# Terminal 5 (wait 3s)
cd cluster-os && npx ts-node src/client/UserClient.ts
```

Then just type commands:
```

Then open your browser to `http://localhost:5000`

**Dashboard Features:**
- **Start/Stop Controls**: Launch Load Balancer and Worker nodes with single clicks
- **Real-time Metrics**: View healthy workers, active jobs, and queue status
- **Job Submission**: Submit jobs directly from the UI and see results
- **Circuit Breaker Status**: Monitor the state of each worker (CLOSED, OPEN, HALF_OPEN)
- **Auto-refresh**: All metrics update automatically every 2 seconds

**Recommended Workflow:**

1. **Start Dashboard** (one terminal):
   ```powershell
   npm run start:dashboard
   ```

2. **Open Browser** (any browser):
   ```
   http://localhost:5000
   ```

3. **Use Dashboard**:
   - Click "Start Load Balancer" (wait 2-3 seconds)
   - Click "Add Worker" 2-3 times (wait 2 seconds between clicks)
   - Enter array in job submission: `[1,2,3,4,5]`
   - Click "Submit" and watch result appear
   - Monitor healthy workers and circuit breaker status in real-time
   - Add/remove workers while system runs

**Dashboard Architecture:**
- **Dashboard.ts**: Node.js HTTP server managing processes and connecting to LoadBalancer
- **dashboard.html**: Student-written HTML/CSS/JavaScript frontend
- **Port 5000**: Dashboard web interface
- **Port 9001**: LoadBalancer metrics endpoint
- **Port 3000**: LoadBalancer TCP (spawned in background)

**Testing Checklist (Integration Testing):**
- ✅ Click "Start Load Balancer" → Listens on port 3000
- ✅ Click "Add Worker" → Workers connect and send heartbeats
- ✅ View metrics → Healthy workers count increases
- ✅ Submit job `[2,4,6]` → Result shows `[4,8,12]` (doubled)
- ✅ Check circuit breaker → Shows CLOSED for healthy workers
- ✅ Click "Remove Worker" → Healthy workers decrease
- ✅ Stop and restart LB → Metrics reset to 0
- ✅ Submit multiple jobs → Queue updates in real-time

## Cross-Platform Support

ClusterOS runs identically on **Windows, macOS, and Linux**. Simply use your platform's default terminal (PowerShell, bash, zsh, etc.) and run the npm scripts as shown above.

## Component Output Examples

### DNS Router Startup

```
_______________________________________________
_______________  DNS Router   _________________
||      DNS Router listening on port 2000      ||
||      Registered 3 LoadBalancer instances    ||
__________________________________________________
```

## How This Work

1. Workers connect and send heartbeats to the Load Balancer every 2 seconds
2. Load Balancer keep track of which workers is still alive
3. When user submit a job (like an array of numbers)
4. Load Balancer route to the worker that got the least jobs
5. Worker double each number in the array
6. Result get sent back

## Project Structure

```
_______________________________________________
_________________   User Client   _____________
||          User Client started                ||
||  ID: client-b0e21dee-dc46-41ae-8835-8abff28e028f||
||  Connected to DNS Router (localhost:2000)    ||
||          Type "help" for available commands ||
__________________________________________________

ClusterOS > 
```

## Testing It Out

### Using the Dashboard (Recommended)

1. Run the dashboard: `npm run start:dashboard`
2. Open `http://localhost:5000` in your browser
3. Click the "Start Load Balancer" button - should say it connected
4. Click "Add Worker" button twice (so you got 2 workers)
5. Now you should see both workers in the list showing as "healthy"
6. Type some numbers in the job input field like `[1,2,3]` or `[10,20]`
7. Click "Submit Job" button
8. Wait a moment and you should see the result appear - each number get doubled
9. For example `[1,2,3]` become `[2,4,6]`

### Command Line Testing

If you prefer command line you can submit jobs using the client terminal after everything running. You can type `submit [1,2,3,4,5]` and it gonna do the same thing as the dashboard.

The dashboard show real-time metrics too - you can see how many jobs is running, how many completed, and worker status and stuff.
