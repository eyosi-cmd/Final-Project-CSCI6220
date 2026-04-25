# Startup Guide - ClusterOS

## Quick Start (Recommended)

Start everything at once with:

```bash
npm start
```

This will launch:
- 🔵 **DNS Router** (port 3000) - Service discovery
- 🟢 **Load Balancer** (port 3010, metrics 9001) - Distributed request routing  
- 🟡 **Worker Node** (port 2000+) - Task execution
- 🟣 **Dashboard** (port 5000) - Web UI for monitoring

All services run in parallel with color-coded output for easy monitoring.

---

## Startup Options

### Option 1: Everything (Default)
```bash
npm start
```
Starts 1 DNS, 1 Load Balancer, 1 Worker, and the Dashboard.

**Use for:** Quick testing, demos, development

---

### Option 2: Core Services Only (No Workers)
```bash
npm run start:core
```
Starts DNS Router, Load Balancer, and Dashboard (without workers).

**Use for:** Testing the dashboard without job processing
- Dashboard available at `http://localhost:5000`
- Add workers later with "Add Worker" button in dashboard

---

### Option 3: Full Cluster (3 Workers)
```bash
npm run start:cluster
```
Starts DNS Router, Load Balancer, 3 Worker Nodes, and Dashboard.

**Use for:** Full cluster testing with distributed processing
- 3 workers for parallel job processing
- Observe load balancing across workers
- Test circuit breaker patterns with multiple workers

---

### Option 4: Individual Services
Start services individually:

```bash
# Terminal 1: DNS Router
npm run start:dns

# Terminal 2: Load Balancer
npm run start:lb

# Terminal 3: Worker Nodes (run multiple times in different terminals)
npm run start:worker

# Terminal 4: Dashboard
npm run start:dashboard
```

**Use for:** Debugging specific services or custom configurations

---

## Service Details

### DNS Router (port 3000)
- Service registry for Load Balancer
- Maintains list of active services
- Auto-restarts service discovery on connection failure

### Load Balancer (port 3010)
- Receives jobs from clients
- Routes requests to healthy workers
- Provides metrics endpoint (port 9001): `http://localhost:9001/metrics`
- Implements circuit breaker pattern for fault tolerance

### Worker Nodes
- Process job requests
- Send heartbeats to Load Balancer
- Report job results back
- Each worker gets a unique ID (auto-generated)

### Dashboard (port 5000)
- Web UI: `http://localhost:5000`
- Monitor real-time cluster metrics
- View circuit breaker states
- Submit test jobs
- Control load balancer and workers
- View job results

---

## Monitoring Output

When running with `npm start`, you'll see output like:

```
[DNS] DNS Router listening on port 3000
[LB]  Load Balancer listening on port 3010
[LB]  Metrics server listening on port 9001
[WORKER] Worker Node started - ID: abc123def456
[DASHBOARD] Dashboard listening on http://localhost:5000
```

Color-coded prefixes make it easy to identify service messages:
- 🔵 Blue = DNS Router messages
- 🟢 Green = Load Balancer messages
- 🟡 Yellow = Worker Node messages
- 🟣 Magenta = Dashboard messages

---

## Stopping Services

### Stop All Services
Press **Ctrl+C** to stop all services (concurrently handles graceful shutdown)

### Stop Individual Services (if running separately)
- Find the process: `tasklist | findstr node`
- Kill by PID: `taskkill /PID <pid> /F`
- Or on Windows: `Get-Process node | Stop-Process`

---

## Troubleshooting

### Port Already in Use
If you see "EADDRINUSE" errors:

```bash
# Windows: Kill all Node processes
Stop-Process -Name node -Force

# Or specific ports:
netstat -ano | findstr :3000  # Find what's using port 3000
taskkill /PID <pid> /F
```

### Services Not Connecting
- DNS Router must start first (it's port 3000 that others depend on)
- Wait 2-3 seconds for DNS to fully initialize
- Check firewall isn't blocking localhost connections
- Use individual startup option to debug specific service issues

### Dashboard Shows "Waiting for Load Balancer"
- Ensure Load Balancer started successfully (look for green messages)
- Check metrics endpoint: `curl http://localhost:9001/metrics`
- Click "Start LB" in dashboard to restart the Load Balancer

### Workers Not Showing as Healthy
- DNS Router must be running (blue messages should appear)
- Load Balancer must be running (green messages)
- Wait 5-10 seconds for heartbeat detection
- Worker nodes send heartbeats every 1-2 seconds

---

## Testing the Cluster

Once everything is running:

1. **Open Dashboard**: http://localhost:5000
2. **Submit a Job**: 
   - Enter `[10, 20, 30, 40, 50]` in the Job Payload field
   - Click "Dispatch Job"
   - Watch job progress in Results panel
3. **Monitor Metrics**:
   - Watch Active/Queued jobs increase/decrease
   - View circuit breaker states for workers
   - Check load distribution across workers
4. **Test Failure Handling**:
   - Stop a worker while jobs are running
   - Watch circuit breaker transition to OPEN
   - See load balancer route jobs to healthy workers

---

## Configuration

All services connect to localhost by default. For production/remote deployments:

- Modify `src/kernel/LoadBalancer.ts` for DNS host/port
- Modify `src/worker/WorkerNode.ts` for LB connection details
- Modify `src/dashboard/Dashboard.ts` for API endpoints

---

## Next Steps

- Run `npm test` to execute UI tests
- Check `TESTING.md` for testing documentation
- View dashboard at `http://localhost:5000` for real-time monitoring
- Submit jobs and observe distributed processing
