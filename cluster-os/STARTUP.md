# Quick Start Guide

For complete instructions, see README.md. This file shows the fastest ways to get started.

## Start Everything (Recommended)

```bash
npm start
```

This starts DNS Router, Load Balancer, Worker Node, and Dashboard all at once.

Open http://localhost:5000

## Start with More Workers

```bash
npm run start:cluster
```

This starts with 3 workers instead of 1. Useful for testing load balancing and failure scenarios.

Open http://localhost:5000

## Start Services Individually

If you need to debug specific services:

```bash
Terminal 1: npm run start:dns
Terminal 2: npm run start:lb
Terminal 3: npm run start:worker
Terminal 4: npm run start:dashboard
```

Start them in this order. DNS Router must be first.

## Service Ports

- DNS Router: 2000 (internal service discovery)
- Load Balancer: 3010 (main service)
- Metrics: 9001 (internal metrics endpoint)
- Dashboard: 5000 (web interface)

## Stop Services

Press Ctrl+C in the terminal.

## Next Steps

1. Open http://localhost:5000
2. Click "Start Load Balancer"
3. Click "Add Worker" to add workers
4. Submit a job: `[1,2,3,4,5]`
5. View results and real-time metrics

See README.md for detailed information about what each metric means and how to use the dashboard.
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
