# ClusterOS — Project Structure & System Design

## Overview

ClusterOS is a distributed computing cluster built entirely in TypeScript/Node.js. It implements a multi-tier architecture with a DNS routing layer, load balancer with an internal worker pool, dynamic worker nodes, a browser-based dashboard, and a CLI client. The system uses Lamport logical clocks for causal ordering, Phi-accrual failure detection, client-affinity scheduling, and a circuit breaker pattern for fault tolerance.

---
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

## System Architecture Diagram

```mermaid
flowchart TD

    subgraph CLIENT_LAYER["Client Layer"]
        UC["UserClient\n──────────────\nCLI: submit / status / help\nConnects → DNS :2000"]
        BR["Browser\ndashboard.html / CSS / JS"]
    end

    subgraph DASHBOARD_SVC["Dashboard Service  (:5000 HTTP)"]
        DH["HTTP Server\n/api/metrics\n/api/submit-job\n/api/start-lb  /api/kill-lb\n/api/start-worker /api/kill-worker\n/api/job-result/:id\n/api/cancel-job/:id"]
        DJ["jobMap\n(request tracking)"]
        DS["Process Spawner\nspawn / kill via child_process"]
    end

    subgraph DNS_LAYER["DNSRouter"]
        DNS_C["Client Routing Server\n:2000 TCP\n(transparent proxy tunnel)"]
        DNS_R["LB Registration Server\n:3000 TCP"]
        DNS_T["LB Registry Table\nRound-Robin selector\n(60s heartbeat timeout)"]
    end

    subgraph LB_SVC["LoadBalancer"]
        subgraph DISPATCHER["Dispatcher  —  TCPTransport :3010"]
            TCP_SRV["TCP Server :3010\n(workers + clients connect here)"]
            PQ["Priority Queue\nHIGH → NORMAL → LOW"]
        end

        subgraph WORKER_POOL["Internal Worker Pool  (×4 threads)"]
            WP["Worker Message Processors\n────────────────────────\n• JOB_SUBMIT → route/split\n• JOB_RESULT → deliver to client\n• SUB_JOB_RESULT → aggregate\n• HEARTBEAT → failure detector\n• CLUSTER_STATUS → reply\n• REMOVE_NODE / REMOVE_UNHEALTHY"]
            LC["LamportClock\n(per worker)\nlogical time ordering"]
            AGG["Job Aggregator\naggregationMap\nchunk bookkeeping"]
            CTX["JobContext + Timeout\n10 s timeout / 3 retries\njobContextMap"]
        end

        subgraph SCHED_LAYER["Scheduling Layer"]
            SCH["Scheduler\nclientAffinityMap\n(sticky sessions)"]
            CB["Circuit Breaker\nCLOSED ↔ OPEN ↔ HALF_OPEN\n5 failures → OPEN\n30 s → HALF_OPEN\n2 probes → CLOSED"]
        end

        FD["FailureDetector\nPhi-Accrual algorithm\nheartbeat interval history\nφ threshold = 3.0"]
        MHTTP["Metrics HTTP  :9001\nGET /metrics\nhealthyWorkers, totalWorkers\nactiveJobs, queuedJobs\ncircuitBreakerStates"]
    end

    subgraph WORKER_NODES["Worker Nodes  (1 … N)"]
        WN1["WorkerNode 1\n──────────────\nUUID nodeId\nLamportClock\nHeartbeat every 2 s\n(activeJobs count)\nProcesses: ×2 per item\nor { result: done }"]
        WN2["WorkerNode 2"]
        WNn["WorkerNode N"]
    end

    %% ── Browser → Dashboard ──────────────────────────────────
    BR -->|"HTTP :5000\nGET / (dashboard.html/css/js)"| DH
    DH --- DJ
    DH --- DS

    %% ── UserClient → DNSRouter → LB ─────────────────────────
    UC -->|"TCP :2000\nJOB_SUBMIT\nCLUSTER_STATUS"| DNS_C
    DNS_C <-->|"transparent\nTCP tunnel"| TCP_SRV
    DNS_C --- DNS_T

    %% ── LB registers with DNSRouter ──────────────────────────
    TCP_SRV -->|"REGISTER_LB\nlbId, host, port\nTCP :3000"| DNS_R
    DNS_R -->|"REGISTER_LB_ACK"| TCP_SRV
    DNS_R --- DNS_T

    %% ── Dispatcher internals ─────────────────────────────────
    TCP_SRV --> PQ
    PQ -->|"dequeue by priority"| WP

    %% ── Worker pool internals ────────────────────────────────
    WP --- LC
    WP --- AGG
    WP --- CTX
    WP -->|"getNextNode()\ngetNextNodeForClient()"| SCH
    SCH -->|"getHealthyNodes()\ngetHealthyNodesByLoad()"| FD
    SCH --- CB

    %% ── LB → Worker Nodes ────────────────────────────────────
    WP -->|"JOB_SUBMIT\nSUB_JOB_SUBMIT\n(array split per node)"| WN1
    WP -->|"JOB_SUBMIT\nSUB_JOB_SUBMIT"| WN2
    WP -->|"JOB_SUBMIT\nSUB_JOB_SUBMIT"| WNn

    %% ── Worker Nodes → LB ────────────────────────────────────
    WN1 -->|"HEARTBEAT every 2 s\nJOB_RESULT\nSUB_JOB_RESULT\nTCP :3010"| TCP_SRV
    WN2 -->|"HEARTBEAT / JOB_RESULT\nTCP :3010"| TCP_SRV
    WNn -->|"HEARTBEAT / JOB_RESULT\nTCP :3010"| TCP_SRV

    %% ── LB replies to client via DNS tunnel ─────────────────
    TCP_SRV -->|"JOB_RESULT\nCLUSTER_STATUS_REPLY\n(back through tunnel)"| DNS_C
    DNS_C -->|"response"| UC

    %% ── Metrics HTTP ─────────────────────────────────────────
    WP -->|"metrics export"| MHTTP

    %% ── Dashboard → LB ───────────────────────────────────────
    DH -->|"TCP :3010\nJOB_SUBMIT\nREMOVE_UNHEALTHY_NODE"| TCP_SRV
    DH -->|"HTTP GET :9001/metrics"| MHTTP
    MHTTP -->|"JSON metrics"| DH

    %% ── Dashboard process control ────────────────────────────
    DS -.->|"spawn / SIGTERM"| WN1
    DS -.->|"spawn / SIGTERM"| WN2
```

---

## Component Reference

| Layer | Component | Port(s) | Role |
|---|---|---|---|
| Client | `UserClient` | connects to :2000 | CLI — `submit`, `status`, `help`, `exit` |
| Client | `Browser` | connects to :5000 | Web UI consuming Dashboard REST API |
| Network | `DNSRouter` | :2000 (client), :3000 (LB reg) | Transparent TCP proxy tunnel to LBs; round-robin across registered LBs |
| Compute | `LoadBalancer` | :3010 (TCP), :9001 (HTTP metrics) | Priority-queue `Dispatcher` + 4 internal `Worker` message processors |
| Scheduling | `Scheduler` | — | Client-affinity sticky sessions + circuit-breaker-aware least-loaded node selection |
| Health | `FailureDetector` | — | Phi-accrual algorithm; tracks heartbeat interval history; φ ≥ 3.0 = unhealthy |
| Resilience | `CircuitBreaker` | — | CLOSED → OPEN (5 failures) → HALF_OPEN (30 s timeout) → CLOSED (2 successful probes) |
| Fault-tolerance | Job retry | — | 10 s job timeout, up to 3 retries on different workers |
| Fan-out | Aggregation | — | Array payloads split into `SUB_JOB_SUBMIT` chunks across all healthy workers, reassembled in order |
| Observability | Metrics HTTP | :9001 | `GET /metrics` → JSON: `healthyWorkers`, `totalWorkers`, `activeJobs`, `queuedJobs`, `circuitBreakerStates` |
| Observability | `Dashboard` | :5000 | Polls `:9001`, submits jobs via TCP `:3010`, can spawn/kill worker processes |
| Clocks | `LamportClock` | — | Each LB worker processor + each WorkerNode maintains a logical clock for causal ordering of messages |

---

## Key Port Map

| Service | Port | Protocol | Purpose |
|---|---|---|---|
| DNSRouter | 2000 | TCP | Client connections — transparent proxy |
| DNSRouter | 3000 | TCP | LoadBalancer `REGISTER_LB` / `DEREGISTER_LB` |
| LoadBalancer | 3010 | TCP | Workers + Dashboard connect; job/heartbeat traffic |
| LoadBalancer | 9001 | HTTP | `GET /metrics` endpoint |
| Dashboard | 5000 | HTTP | Web UI + REST API |

---

## Message Type Reference

| Message Type | Direction | Description |
|---|---|---|
| `JOB_SUBMIT` | Client → LB | Submit a single job (scalar or array payload) |
| `JOB_RESULT` | LB → Client | Final job result or failure after max retries |
| `SUB_JOB_SUBMIT` | LB → WorkerNode | One chunk of a split array job |
| `SUB_JOB_RESULT` | WorkerNode → LB | Result for one chunk |
| `HEARTBEAT` | WorkerNode → LB | Sent every 2 s with `activeJobs` count |
| `CLUSTER_STATUS` | Client → LB | Request list of healthy worker node IDs |
| `CLUSTER_STATUS_REPLY` | LB → Client | List of healthy node IDs |
| `REGISTER_LB` | LB → DNSRouter | Register LB's host:port in DNS routing table |
| `REGISTER_LB_ACK` | DNSRouter → LB | Acknowledgement of registration |
| `DEREGISTER_LB` | LB → DNSRouter | Remove LB from routing table on shutdown |
| `REMOVE_NODE` | Dashboard → LB | Remove a specific node from FailureDetector |
| `REMOVE_UNHEALTHY_NODE` | Dashboard → LB | Remove the most unhealthy node from FailureDetector |

---

## File Structure

```
cluster-os/
├── package.json                   # Scripts: start, start:cluster, start:dns, start:lb, start:worker, start:dashboard
├── tsconfig.json
├── playwright.config.ts           # E2E test configuration
│
├── src/
│   ├── common/
│   │   └── types.ts               # Shared interfaces: ClusterMessage, JobContext, CircuitBreakerStatus, etc.
│   │
│   ├── network/
│   │   └── DNSRouter.ts           # Client routing server (:2000) + LB registration server (:3000)
│   │
│   ├── transport/
│   │   └── TCPTransport.ts        # TCPTransport (server-side) + ClientTCPTransport (client-side)
│   │
│   ├── kernel/
│   │   ├── LoadBalancer.ts        # Dispatcher, Worker pool (×4), LoadBalancer class, Metrics HTTP server
│   │   ├── Scheduler.ts           # Client-affinity map, circuit-breaker-aware least-load selection
│   │   ├── lamportClock.ts        # Lamport logical clock implementation
│   │   └── lamportClock.test.ts   # Unit tests for LamportClock
│   │
│   ├── middleware/
│   │   └── FailureDetector.ts     # Phi-accrual failure detector, heartbeat tracking, node health
│   │
│   ├── worker/
│   │   └── WorkerNode.ts          # Worker node: connects to LB :3010, heartbeat, job processing
│   │
│   ├── client/
│   │   └── UserClient.ts          # CLI client: connects via DNS :2000
│   │
│   └── dashboard/
│       ├── Dashboard.ts           # HTTP server (:5000), metrics polling, process spawning
│       ├── dashboard.html         # Web UI markup
│       ├── dashboard.css          # Web UI styles
│       └── dashboard-client.js    # Browser-side JavaScript
│
├── scripts/
│   ├── submit_job.js              # Standalone job submission script
│   └── submit_multiple_jobs.js    # Batch job submission script
│
└── tests/
    ├── dashboard.spec.ts          # Playwright E2E tests
    └── pages/
        └── dashboard.page.ts      # Page Object Model for dashboard tests
```

---

## Startup Order

Services must be started in dependency order:

```
1. DNSRouter        (npm run start:dns)       — must be first
2. LoadBalancer     (npm run start:lb)        — registers with DNSRouter on startup
3. WorkerNode(s)    (npm run start:worker)    — connect to LoadBalancer :3010
4. Dashboard        (npm run start:dashboard) — polls LB metrics, connects to :3010
5. UserClient       (npm run start:client)    — connects via DNSRouter :2000
```

Or use `npm start` to launch DNS + LB + 1 Worker + Dashboard concurrently via `concurrently`.  
Use `npm run start:cluster` for DNS + LB + 3 Workers + Dashboard.

---

## Job Lifecycle

```
UserClient
  │  JOB_SUBMIT (TCP → DNS :2000)
  ▼
DNSRouter
  │  transparent tunnel → LB :3010
  ▼
LoadBalancer Dispatcher
  │  enqueue by priority (HIGH/NORMAL/LOW)
  ▼
Worker (message processor)
  ├─ scalar payload → route to single WorkerNode via Scheduler
  └─ array payload  → split into N chunks → SUB_JOB_SUBMIT to N workers
          │
          ▼
     WorkerNode(s)
          │  JOB_RESULT / SUB_JOB_RESULT (back to LB :3010)
          ▼
     LoadBalancer Worker
          ├─ scalar: forward JOB_RESULT → client
          └─ array: aggregate all chunks → JOB_RESULT → client
                │
                ▼
          DNSRouter tunnel
                │
                ▼
          UserClient receives result
```

---

## Fault Tolerance Summary

| Mechanism | Implementation |
|---|---|
| **Phi-Accrual Failure Detection** | Tracks heartbeat intervals per node; computes φ suspicion value; nodes with φ ≥ 3.0 excluded from routing |
| **Circuit Breaker** | Per-worker state machine; 5 consecutive failures → OPEN; 30 s cool-down → HALF_OPEN; 2 successful probes → CLOSED |
| **Job Retry** | On 10 s timeout, job is retried up to 3 times on a different healthy worker |
| **Client Affinity** | Sticky session routing; falls back to least-loaded if preferred worker is unhealthy or circuit-open |
| **DNS Round-Robin** | Multiple LoadBalancers can register; DNSRouter distributes clients across them |
| **LB Re-registration** | LoadBalancer retries DNS registration every 5 s on connection failure |
