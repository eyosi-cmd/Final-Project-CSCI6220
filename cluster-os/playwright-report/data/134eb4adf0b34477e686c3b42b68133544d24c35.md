# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> ClusterOS Dashboard >> Circuit Breaker Panel >> should show circuit breaker state indicators
- Location: tests\dashboard.spec.ts:88:9

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('text=ClusterOS Dashboard') to be visible

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - img "ClusterOS Banner" [ref=e4]
  - banner [ref=e5]:
    - generic [ref=e7]:
      - heading "Dashboard" [level=2] [ref=e8]
      - paragraph [ref=e9]: Real-time cluster monitoring and control
  - main [ref=e10]:
    - generic [ref=e11]:
      - heading "System Controls" [level=2] [ref=e13]
      - generic [ref=e14]:
        - generic [ref=e15]:
          - heading "Load Balancer" [level=3] [ref=e16]
          - generic [ref=e17]:
            - button "Start Load Balancer" [ref=e18] [cursor=pointer]
            - button "⏹" [ref=e19] [cursor=pointer]
        - generic [ref=e20]:
          - heading "Workers" [level=3] [ref=e21]
          - generic [ref=e22]:
            - button "Add Worker" [ref=e23] [cursor=pointer]
            - button "✕" [ref=e24] [cursor=pointer]
    - generic [ref=e25]:
      - heading "Cluster Metrics" [level=2] [ref=e27]
      - generic [ref=e28]:
        - generic [ref=e29]:
          - generic [ref=e30]:
            - generic [ref=e31]: Healthy
            - generic [ref=e32]: "0"
            - generic [ref=e33]: workers
          - generic [ref=e34]:
            - generic [ref=e35]: Total
            - generic [ref=e36]: "4"
            - generic [ref=e37]: workers
          - generic [ref=e38]:
            - generic [ref=e39]: Active
            - generic [ref=e40]: "0"
            - generic [ref=e41]: jobs
          - generic [ref=e42]:
            - generic [ref=e43]: Queued
            - generic [ref=e44]: "0"
            - generic [ref=e45]: jobs
        - generic [ref=e46]:
          - heading "System Health" [level=3] [ref=e47]
          - generic [ref=e48]:
            - generic [ref=e50]: Cluster Utilization %
            - generic [ref=e54]: Request Throughput (jobs/sec)
            - generic [ref=e58]: Queue Depth (pending jobs)
          - generic [ref=e61]:
            - generic [ref=e62]:
              - strong [ref=e63]: "Status:"
              - generic [ref=e64]: Waiting for Load Balancer...
            - generic [ref=e65]:
              - strong [ref=e66]: "Health:"
              - text: 🔴 0% health
            - generic [ref=e67]:
              - strong [ref=e68]: "Utilization:"
              - text: ~0 jobs/worker (0 total)
    - generic [ref=e69]:
      - generic [ref=e70]:
        - heading "Worker Health (Circuit Breaker States)" [level=2] [ref=e71]
        - generic [ref=e72]: 03:18:36
      - generic [ref=e73]:
        - generic [ref=e74]:
          - strong [ref=e75]: "States:"
          - generic [ref=e76]: ● CLOSED (healthy)
          - generic [ref=e77]: ● HALF_OPEN
          - generic [ref=e78]: ● OPEN (failed)
        - generic [ref=e80]: No circuits active
    - generic [ref=e81]:
      - heading "Submit Job" [level=2] [ref=e83]
      - generic [ref=e84]:
        - generic [ref=e85]:
          - generic [ref=e86]: Job Payload (JSON Array)
          - textbox "Job Payload (JSON Array)" [ref=e88]:
            - /placeholder: "[1, 2, 3, 4, 5]"
          - generic [ref=e89]:
            - text: "Example:"
            - code [ref=e90]: "[10, 20, 30]"
            - text: → Elements doubled and distributed across workers
          - button "Dispatch Job" [ref=e91] [cursor=pointer]
        - generic [ref=e92]:
          - generic [ref=e93]:
            - generic [ref=e94]: Results
            - button "Clear" [ref=e95] [cursor=pointer]
          - generic [ref=e96]: Ready to submit jobs...
    - generic [ref=e97]:
      - heading "Architecture & Key Concepts" [level=2] [ref=e99]
      - generic [ref=e101]:
        - generic [ref=e102]:
          - strong [ref=e103]: Load Balancer (Single System Image Kernel)
          - text: Distributes incoming requests to provide location transparency, ensuring the cluster appears to the user as a single, integrated computing resource.
        - generic [ref=e104]:
          - strong [ref=e105]: Failure Detection (Phi-Suspicion)
          - text: Acts as an unreliable failure detector by analyzing heartbeat intervals to estimate suspicion levels, allowing the system to adapt to network delays without relying on rigid timeouts.
        - generic [ref=e106]:
          - strong [ref=e107]: Circuit Breaker Pattern
          - text: Enhances fault tolerance by isolating failing components across three states—Closed, Open, and Half-Open—to prevent local errors from causing cascading system-wide failures.
        - generic [ref=e108]:
          - strong [ref=e109]: Job Aggregation (MapReduce)
          - text: Employs a divide-and-conquer strategy where tasks are partitioned for parallel processing and then reassembled to provide a consistent, ordered result to the client.
```

# Test source

```ts
  1   | import { Page, expect } from '@playwright/test';
  2   | 
  3   | export class DashboardPage {
  4   |   constructor(private page: Page) {}
  5   | 
  6   |   async goto() {
  7   |     await this.page.goto('http://localhost:5000');
  8   |     // Wait for dashboard to be fully loaded
> 9   |     await this.page.waitForSelector('text=ClusterOS Dashboard', { timeout: 10000 });
      |                     ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  10  |   }
  11  | 
  12  |   async getHealthyWorkersCount(): Promise<number> {
  13  |     const text = await this.page.locator('#metric-healthy').textContent();
  14  |     return parseInt(text || '0', 10);
  15  |   }
  16  | 
  17  |   async getTotalWorkersCount(): Promise<number> {
  18  |     const text = await this.page.locator('#metric-total').textContent();
  19  |     return parseInt(text || '0', 10);
  20  |   }
  21  | 
  22  |   async getActiveJobsCount(): Promise<number> {
  23  |     const text = await this.page.locator('#metric-active').textContent();
  24  |     return parseInt(text || '0', 10);
  25  |   }
  26  | 
  27  |   async getQueuedJobsCount(): Promise<number> {
  28  |     const text = await this.page.locator('#metric-queued').textContent();
  29  |     return parseInt(text || '0', 10);
  30  |   }
  31  | 
  32  |   async waitForMetricsUpdate(timeout: number = 5000) {
  33  |     // Wait for metrics to be displayed
  34  |     await this.page.waitForSelector('#metric-healthy', { timeout });
  35  |     await this.page.waitForSelector('#metric-active', { timeout });
  36  |     await this.page.waitForSelector('#metric-queued', { timeout });
  37  |   }
  38  | 
  39  |   async submitJob(jobData: number[]): Promise<void> {
  40  |     const jobInput = this.page.locator('#job-data');
  41  |     await jobInput.fill(JSON.stringify(jobData));
  42  |     
  43  |     const submitBtn = this.page.locator('#submit-job');
  44  |     await submitBtn.click();
  45  |     
  46  |     // Wait for job submission feedback
  47  |     await this.page.waitForSelector('text=Processing', { timeout: 5000 });
  48  |   }
  49  | 
  50  |   async getCircuitBreakerStates(): Promise<Map<string, string>> {
  51  |     const circuitItems = this.page.locator('.circuit-item');
  52  |     const count = await circuitItems.count();
  53  |     
  54  |     const states = new Map<string, string>();
  55  |     
  56  |     for (let i = 0; i < count; i++) {
  57  |       const item = circuitItems.nth(i);
  58  |       const text = await item.textContent();
  59  |       
  60  |       if (text) {
  61  |         // Parse "worker-id CLOSED" format
  62  |         const parts = text.trim().split(/\s+/);
  63  |         if (parts.length >= 2) {
  64  |           const workerId = parts[0];
  65  |           const state = parts[parts.length - 1];
  66  |           states.set(workerId, state);
  67  |         }
  68  |       }
  69  |     }
  70  |     
  71  |     return states;
  72  |   }
  73  | 
  74  |   async waitForCircuitBreakerState(
  75  |     workerId: string,
  76  |     expectedState: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
  77  |     timeout: number = 10000
  78  |   ): Promise<void> {
  79  |     const startTime = Date.now();
  80  |     
  81  |     while (Date.now() - startTime < timeout) {
  82  |       const states = await this.getCircuitBreakerStates();
  83  |       
  84  |       if (states.has(workerId) && states.get(workerId) === expectedState) {
  85  |         return;
  86  |       }
  87  |       
  88  |       await this.page.waitForTimeout(500);
  89  |     }
  90  |     
  91  |     throw new Error(
  92  |       `Circuit breaker for ${workerId} did not reach ${expectedState} within ${timeout}ms`
  93  |     );
  94  |   }
  95  | 
  96  |   async isCircuitBreakerPanelVisible(): Promise<boolean> {
  97  |     const panel = this.page.locator('text=Worker Health');
  98  |     return panel.isVisible();
  99  |   }
  100 | 
  101 |   async getLoadDistribution(): Promise<string> {
  102 |     const text = await this.page.locator('#load-distribution').textContent();
  103 |     return text || '';
  104 |   }
  105 | 
  106 |   async getHealthIndicator(): Promise<string> {
  107 |     const text = await this.page.locator('#health-indicator').textContent();
  108 |     return text || '';
  109 |   }
```