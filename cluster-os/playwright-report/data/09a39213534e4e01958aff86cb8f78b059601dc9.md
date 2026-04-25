# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> ClusterOS Dashboard >> Control Buttons >> control buttons should be clickable
- Location: tests\dashboard.spec.ts:167:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5000/
Call log:
  - navigating to "http://localhost:5000/", waiting until "load"

```

# Test source

```ts
  1   | import { Page, expect } from '@playwright/test';
  2   | 
  3   | export class DashboardPage {
  4   |   constructor(private page: Page) {}
  5   | 
  6   |   async goto() {
> 7   |     await this.page.goto('http://localhost:5000');
      |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5000/
  8   |     // Wait for dashboard to be fully loaded
  9   |     await this.page.waitForSelector('text=ClusterOS Dashboard', { timeout: 10000 });
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
```