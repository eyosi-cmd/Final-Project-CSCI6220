'use strict';

const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');

const app = express();

const allowedOrigins = [
  'https://cluster-os.vercel.app',
  'http://localhost:5000',
  'http://localhost:3000'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS blocked'));
  },
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));

const workers = new Map();
const jobs    = new Map();
const jobQueue = [];
let   lbRunning = true;
let   requestCount = 0;
let   completedJobsTotal = 0;

const MAX_CONCURRENT_JOBS_PER_WORKER = 3;

function getHealthyWorkers() {
  return Array.from(workers.values()).filter(w => w.status === 'healthy');
}

function chooseWorker() {
  const healthy = getHealthyWorkers().filter(w => w.activeJobs < MAX_CONCURRENT_JOBS_PER_WORKER);
  if (!healthy.length) return null;
  return healthy.reduce((best, cur) =>
    (!best || cur.activeJobs < best.activeJobs) ? cur : best, null);
}

function assignQueuedJobs() {
  while (jobQueue.length > 0) {
    const job = jobs.get(jobQueue[0]);
    if (!job || job.status !== 'queued') { jobQueue.shift(); continue; }
    const worker = chooseWorker();
    if (!worker) return;
    jobQueue.shift();
    worker.activeJobs++;
    job.workerId = worker.id;
    job.status   = 'running';
    job.updatedAt = Date.now();

    setTimeout(() => {
      if (job.status === 'running') {
        job.status      = 'completed';
        job.result      = Array.isArray(job.data) ? job.data.map(x => x * 2) : { result: 'done' };
        job.completedAt = Date.now();
        job.updatedAt   = Date.now();
        if (worker) worker.activeJobs = Math.max(0, worker.activeJobs - 1);
        completedJobsTotal++;
        assignQueuedJobs();
      }
    }, 3000);
  }
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

app.get('/health', (_req, res) => {
  sendJson(res, 200, { status: 'ok', workers: workers.size, jobs: jobs.size, lbRunning });
});

app.get('/api/metrics', (_req, res) => {
  const running = Array.from(jobs.values()).filter(j => j.status === 'running').length;
  const circuitBreakerStates = {};
  for (const [id, w] of workers) {
    circuitBreakerStates[id.slice(0, 8)] = w.circuitState || (w.status === 'healthy' ? 'CLOSED' : 'OPEN');
  }
  sendJson(res, 200, {
    lbRunning,
    healthyWorkers: lbRunning ? getHealthyWorkers().length : 0,
    totalWorkers:   workers.size,
    activeJobs:     running,
    queuedJobs:     jobQueue.length,
    completedJobsTotal,
    circuitBreakerStates,
    timestamp:      Date.now()
  });
});

app.post('/api/start-lb', (_req, res) => {
  lbRunning = true;
  sendJson(res, 200, { status: 'Load Balancer started' });
});

app.post('/api/kill-lb', (_req, res) => {
  lbRunning = false;
  sendJson(res, 200, { status: 'Load Balancer stopped' });
});

app.post('/api/start-worker', (_req, res) => {
  const id     = randomUUID();
  const idx    = workers.size;
  const worker = { id, name: `worker-${idx}`, status: 'healthy', circuitState: 'CLOSED', activeJobs: 0, lastHeartbeat: Date.now(), createdAt: Date.now() };
  workers.set(id, worker);
  assignQueuedJobs();
  sendJson(res, 200, { status: `Worker ${worker.name} started`, worker });
});

app.post('/api/kill-worker', (_req, res) => {
  const ids = Array.from(workers.keys());
  if (!ids.length) { sendJson(res, 400, { error: 'No workers running' }); return; }
  const lastId = ids[ids.length - 1];
  const worker = workers.get(lastId);
  if (!worker) { sendJson(res, 400, { error: 'No workers running' }); return; }

  worker.status       = 'failed';
  worker.circuitState = 'OPEN';
  worker.activeJobs   = 0;

  setTimeout(() => {
    if (workers.has(lastId)) {
      worker.circuitState = 'HALF_OPEN';
      worker.status       = 'recovering';
    }
  }, 8000);

  setTimeout(() => {
    workers.delete(lastId);
  }, 16000);

  sendJson(res, 200, { status: `Worker ${worker.name} removed` });
});

app.post('/api/submit-job', (req, res) => {
  if (!lbRunning) { sendJson(res, 503, { error: 'Load Balancer is stopped — start it first' }); return; }
  const data = req.body?.data;
  if (!data) { sendJson(res, 400, { error: 'data is required' }); return; }

  const id     = 'job-' + (++requestCount) + '-' + Date.now();
  const worker = chooseWorker();
  const job    = {
    id, data, status: worker ? 'running' : 'queued',
    workerId: worker ? worker.id : null,
    result: null, error: null,
    requestedAt: Date.now(), updatedAt: Date.now()
  };
  jobs.set(id, job);

  if (worker) {
    worker.activeJobs++;
    setTimeout(() => {
      if (job.status === 'running') {
        job.status      = 'completed';
        job.result      = Array.isArray(data) ? data.map(x => x * 2) : { result: 'done' };
        job.completedAt = Date.now();
        job.updatedAt   = Date.now();
        worker.activeJobs = Math.max(0, worker.activeJobs - 1);
        completedJobsTotal++;
        assignQueuedJobs();
      }
    }, 3000);
  } else {
    jobQueue.push(id);
  }

  sendJson(res, 200, { jobId: id, status: 'submitted' });
});

app.get('/api/job-result/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) { sendJson(res, 404, { error: 'Job not found' }); return; }
  sendJson(res, 200, job);
});

app.post('/api/cancel-job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) { sendJson(res, 404, { error: 'Job not found' }); return; }
  job.status    = 'cancelled';
  job.updatedAt = Date.now();
  const idx = jobQueue.indexOf(req.params.id);
  if (idx !== -1) jobQueue.splice(idx, 1);
  sendJson(res, 200, { status: 'cancelled' });
});

app.get('/api/workers', (_req, res) => {
  sendJson(res, 200, { workers: Array.from(workers.values()) });
});

app.get('/api/jobs', (_req, res) => {
  sendJson(res, 200, { jobs: Array.from(jobs.values()) });
});

app.use((_req, res) => {
  sendJson(res, 404, { error: 'not found' });
});

module.exports = app;

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
}
