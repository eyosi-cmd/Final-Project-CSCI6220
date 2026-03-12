import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';

const port = 5000;
const lbMetricsPort = 9001;
const lbPort = 3010; // Updated to new LoadBalancer port

interface ClusterStatus {
  healthyWorkers: number;
  totalWorkers: number;
  activeJobs: number;
  queuedJobs: number;
  circuitBreakerStates: { [workerId: string]: string };
  timestamp: number;
}

interface JobRequest {
  id: string;
  data: number[];
  requestedAt: number;
  result?: number[];
  completedAt?: number;
}

const processMap: Map<string, ChildProcess> = new Map();
const jobMap: Map<string, JobRequest> = new Map();
let lbClientConnection: net.Socket | null = null;
let requestIdCounter = 0;

const connectToLoadBalancer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port: lbPort, host: 'localhost' });
    
    let buffer = '';

    socket.on('error', (err) => {
      lbClientConnection = null;
      reject(new Error(`Failed to connect to LoadBalancer: ${err.message}`));
    });

    socket.on('connect', () => {
      lbClientConnection = socket;
      console.log('[Dashboard] Connected to LoadBalancer');
      resolve();
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'JOB_RESULT' || msg.type === 'SUB_JOB_RESULT') {
            const job = jobMap.get(msg.requestId);
            if (job) {
              job.result = msg.payload;
              job.completedAt = Date.now();
            }
          }
        } catch (e) {}
      }
    });
  });
};

const submitJobToLoadBalancer = async (data: number[]): Promise<string> => {
  if (!lbClientConnection) {
    throw new Error('Not connected to LoadBalancer');
  }

  const requestId = `job-${++requestIdCounter}-${Date.now()}`;
  const job: JobRequest = { id: requestId, data, requestedAt: Date.now() };
  jobMap.set(requestId, job);

  const message = {
    type: 'JOB_SUBMIT',
    senderId: 'dashboard-client',
    requestId,
    payload: data,
    priority: 'NORMAL'
  };

  lbClientConnection.write(JSON.stringify(message) + '\n');
  return requestId;
};

const getMetricsFromLoadBalancer = async (): Promise<ClusterStatus> => {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: 'localhost', port: lbMetricsPort, path: '/metrics', method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const metrics = JSON.parse(data);
            resolve(metrics);
          } catch {
            resolve({
              healthyWorkers: 0,
              totalWorkers: 0,
              activeJobs: 0,
              queuedJobs: 0,
              circuitBreakerStates: {},
              timestamp: Date.now()
            });
          }
        });
      }
    );
    req.on('error', () => {
      resolve({
        healthyWorkers: 0,
        totalWorkers: 0,
        activeJobs: 0,
        queuedJobs: 0,
        circuitBreakerStates: {},
        timestamp: Date.now()
      });
    });
    req.setTimeout(2000);
    req.end();
  });
};

const spawnProcess = (name: string, command: string, args: string[]): { error?: string; status?: string } => {
  if (processMap.has(name)) {
    return { error: `${name} is already running` };
  }

  const proc = spawn(command, args, {
    stdio: 'pipe',
    detached: false,
    cwd: process.cwd()
  });

  processMap.set(name, proc);

  proc.on('error', (err) => {
    console.error(`[${name}] Error:`, err.message);
  });

  proc.stdout?.on('data', (data) => {
    console.log(`[${name}] ${data.toString().trim()}`);
  });

  proc.stderr?.on('data', (data) => {
    console.error(`[${name}] ${data.toString().trim()}`);
  });

  return { status: `${name} started (PID: ${proc.pid})` };
};

const killProcess = (name: string): { error?: string; status?: string } => {
  if (!processMap.has(name)) {
    return { error: `${name} is not running` };
  }

  const proc = processMap.get(name);
  if (proc) {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 2000);
  }
  processMap.delete(name);

  return { status: `${name} stopped` };
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname === '/api/metrics') {
    const metrics = await getMetricsFromLoadBalancer();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
  } else if (pathname === '/api/start-lb') {
    const result = spawnProcess('loadbalancer', 'node', [
      '-r', 'ts-node/register', 'src/kernel/LoadBalancer.ts'
    ]);
    
    if (!result.error) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        await connectToLoadBalancer();
      } catch (err) {
        console.error('Failed to connect to LB:', err);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/start-worker') {
    const id = Array.from(processMap.keys()).filter(k => k.startsWith('worker-')).length;
    const result = spawnProcess(`worker-${id}`, 'node', [
      '-r', 'ts-node/register', 'src/worker/WorkerNode.ts'
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/kill-lb') {
    if (lbClientConnection) {
      lbClientConnection.destroy();
      lbClientConnection = null;
    }
    const result = killProcess('loadbalancer');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/kill-worker') {
    const workers = Array.from(processMap.keys()).filter(k => k.startsWith('worker-'));
    if (workers.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No workers running' }));
      return;
    }
    const result = killProcess(workers[workers.length - 1]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/submit-job') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { data } = JSON.parse(body);
        if (!Array.isArray(data)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'data must be an array' }));
          return;
        }
        // Ensure connection to LoadBalancer TCP endpoint
        if (!lbClientConnection) {
          try {
            await connectToLoadBalancer();
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not connected to LoadBalancer' }));
            return;
          }
        }

        const jobId = await submitJobToLoadBalancer(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jobId, status: 'submitted' }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (pathname.startsWith('/api/job-result/')) {
    const jobId = pathname.split('/').pop();
    const job = jobMap.get(jobId || '');
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
  } else if (pathname.startsWith('/api/cancel-job/')) {
    const jobId = pathname.split('/').pop() || '';
    const job = jobMap.get(jobId);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }
    jobMap.delete(jobId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: `Job ${jobId} cancelled` }));
  } else if (pathname === '/dashboard.css') {
    const cssPath = path.join(__dirname, 'dashboard.css');
    const css = fs.readFileSync(cssPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end(css);
  } else if (pathname === '/') {
    const dashboardPath = path.join(__dirname, 'dashboard.html');
    const html = fs.readFileSync(dashboardPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`Dashboard listening on http://localhost:${port}`);
  console.log(`Click "Start Load Balancer" to begin`);
});
