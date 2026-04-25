import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';

var port = 5000;
var lbMetricsPort = 9001;
var lbPort = 3010;

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

var processMap: Map<string, ChildProcess> = new Map();
var jobMap: Map<string, JobRequest> = new Map();
var lbClientConnection: net.Socket | null = null;
var requestIdCounter = 0;

function connectToLoadBalancer(): Promise<void> {
  return new Promise(function(resolve, reject) {
    var socket = net.createConnection({ port: lbPort, host: 'localhost' });
    
    var buffer = '';

    socket.on('error', function(err) {
      lbClientConnection = null;
      console.error('[DASHBOARD] Connection error to LB:', err.message);
      console.error('[DASHBOARD] Please make sure Load Balancer is running or try again later');
      reject(new Error('Failed to connect: ' + err.message));
    });

    socket.on('connect', function() {
      lbClientConnection = socket;
      console.log('[DASHBOARD] Succesfully connected to Load Balancer on port ' + lbPort);
      console.log('[DASHBOARD] TCP socket established for job streaming');
      resolve();
    });

    socket.on('data', function(chunk) {
      buffer = buffer + chunk.toString();
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.trim()) continue;
        try {
          var msg = JSON.parse(line);
          if (msg.type === 'JOB_RESULT' || msg.type === 'SUB_JOB_RESULT') {
            var job = jobMap.get(msg.requestId);
            if (job) {
              job.result = msg.payload;
              job.completedAt = Date.now();
            }
          }
        } catch (e) {}
      }
    });
  });
}

function submitJobToLoadBalancer(data: number[]): Promise<string> {
  if (!lbClientConnection) {
    console.error('[JOB] Cannot submit - not connected to Load Balancer');
    return Promise.reject(new Error('Not connected'));
  }

  var requestId = 'job-' + (++requestIdCounter) + '-' + Date.now();
  var job: JobRequest = { id: requestId, data: data, requestedAt: Date.now() };
  jobMap.set(requestId, job);
  console.log('[JOB] Created job id=' + requestId + ' with ' + data.length + ' items');

  var message = {
    type: 'JOB_SUBMIT',
    senderId: 'dashboard-client',
    requestId: requestId,
    payload: data,
    priority: 'NORMAL'
  };
  console.log('[JOB] Sending job to Load Balancer (tcp write)');
  lbClientConnection.write(JSON.stringify(message) + '\n');
  console.log('[JOB] Job message written to socket');
  return Promise.resolve(requestId);
}

function getMetricsFromLoadBalancer(): Promise<ClusterStatus> {
  return new Promise(function(resolve) {
    console.log('[METRICS] Requesting metrics from Load Balancer at port ' + lbMetricsPort);
    var req = http.request({ hostname: 'localhost', port: lbMetricsPort, path: '/metrics', method: 'GET' }, function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data = data + chunk;
      });
      res.on('end', function() {
        try {
          var metrics = JSON.parse(data);
          console.log('[METRICS] Recieved metrics: healthy=' + metrics.healthyWorkers + ', active=' + metrics.activeJobs + ', queued=' + metrics.queuedJobs);
          resolve(metrics);
        } catch (e) {
          console.error('[METRICS] Failed to parse metrics response:', e.message);
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
    });
    req.on('error', function(err) {
      console.error('[METRICS] Error fetching metrics: ' + (err && err.message));
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
}

function spawnProcess(name: string, command: string, args: string[]): { error?: string; status?: string } {
  if (processMap.has(name)) {
    console.warn('[SPAWN] ' + name + ' is already running - skipping start');
    return { error: name + ' is already running' };
  }
  console.log('[SPAWN] Starting process: ' + name + ' => ' + command + ' ' + args.join(' '));
  var proc = spawn(command, args, {
    stdio: 'pipe',
    detached: false,
    cwd: process.cwd()
  });

  processMap.set(name, proc);
  console.log('[SPAWN] Process ' + name + ' spawned with PID ' + proc.pid);

  proc.on('error', function(err) {
    console.error('[' + name + '] Error: ' + err.message);
  });

  if (proc.stdout) {
    proc.stdout.on('data', function(data) {
      console.log('[' + name + '] ' + data.toString().trim());
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', function(data) {
      console.error('[' + name + '] ' + data.toString().trim());
    });
  }

  return { status: name + ' started succesfully (PID: ' + proc.pid + ')' };
}

function killProcess(name: string): { error?: string; status?: string } {
  if (!processMap.has(name)) {
    return { error: name + ' is not running' };
  }

  var proc = processMap.get(name) as any;
  if (proc) {
    proc.kill('SIGTERM');
    setTimeout(function() {
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 2000);
  }
  processMap.delete(name);

  return { status: name + ' stopped' };
}

var server = http.createServer(function(req, res) {
  var url = new URL(req.url || '/', 'http://' + req.headers.host);
  var pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname === '/api/metrics') {
    getMetricsFromLoadBalancer().then(function(metrics) {
      console.log('dashboard sending metrics: active=' + metrics.activeJobs + ', queued=' + metrics.queuedJobs + ', healthy=' + metrics.healthyWorkers + '/' + metrics.totalWorkers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics));
    });
  } else if (pathname === '/api/start-lb') {
    var result = spawnProcess('loadbalancer', 'node', [
      '-r', 'ts-node/register', 'src/kernel/LoadBalancer.ts'
    ]);
    
    if (!result.error) {
      setTimeout(function() {
        connectToLoadBalancer().catch(function(err) {
          console.error('Failed to connect: ' + err);
        });
      }, 2000);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/start-worker') {
    var workers = Array.from(processMap.keys()).filter(function(k) {
      return k.startsWith('worker-');
    });
    var id = workers.length;
    var result = spawnProcess('worker-' + id, 'node', [
      '-r', 'ts-node/register', 'src/worker/WorkerNode.ts'
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/kill-lb') {
    if (lbClientConnection) {
      lbClientConnection.destroy();
      lbClientConnection = null;
    }
    var result = killProcess('loadbalancer');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/kill-worker') {
    var workers = Array.from(processMap.keys()).filter(function(k) {
      return k.startsWith('worker-');
    });
    if (workers.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No workers' }));
      return;
    }
    var lastWorker = workers[workers.length - 1];
    var result = killProcess(lastWorker);
    
    if (lbClientConnection && lbClientConnection.writable) {
      var removeMessage = {
        type: 'REMOVE_UNHEALTHY_NODE'
      };
      lbClientConnection.write(JSON.stringify(removeMessage) + '\n');
      console.log('[DASHBOARD] Sent REMOVE_UNHEALTHY_NODE message');
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (pathname === '/api/submit-job') {
    var body = '';
    req.on('data', function(chunk) {
      body = body + chunk;
    });
    req.on('end', function() {
      try {
        var parsed = JSON.parse(body);
        var data = parsed.data;
        if (!Array.isArray(data)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'data must be array' }));
          return;
        }
        if (!lbClientConnection) {
          connectToLoadBalancer().then(function() {
            submitJobToLoadBalancer(data).then(function(jobId) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jobId: jobId, status: 'submitted' }));
            });
          }).catch(function(err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not connected' }));
          });
        } else {
          submitJobToLoadBalancer(data).then(function(jobId) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jobId: jobId, status: 'submitted' }));
          });
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error' }));
      }
    });
  } else if (pathname.startsWith('/api/job-result/')) {
    var jobId = pathname.split('/').pop() as any;
    var job = jobMap.get(jobId || '');
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
  } else if (pathname.startsWith('/api/cancel-job/')) {
    var cancelJobId = pathname.split('/').pop() || '';
    var job = jobMap.get(cancelJobId);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    jobMap.delete(cancelJobId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'cancelled' }));
  } else if (pathname === '/dashboard-client.js') {
    var clientPath = path.join(__dirname, 'dashboard-client.js');
    var client = fs.readFileSync(clientPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(client);
  } else if (pathname === '/dashboard.css') {
    var cssPath = path.join(__dirname, 'dashboard.css');
    var css = fs.readFileSync(cssPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end(css);
  } else if (pathname.startsWith('/assets/')) {
    var fileName = pathname.substring(8);
    var assetPath = path.join(__dirname, 'assets', fileName);
    if (!fs.existsSync(assetPath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    var ext = path.extname(fileName).toLowerCase();
    var contentType = 'application/octet-stream';
    if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    var asset = fs.readFileSync(assetPath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(asset);
  } else if (pathname === '/') {
    var dashboardPath = path.join(__dirname, 'dashboard.html');
    var html = fs.readFileSync(dashboardPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(port, function() {
  console.log('Dashboard listening on http://localhost:' + port);
  console.log('Click Start LB to begin');
});
