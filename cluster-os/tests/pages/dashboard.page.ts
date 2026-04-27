import { Page, expect } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
    await expect(this.page).toHaveTitle('ClusterOS Dashboard');
    await this.page.waitForSelector('#start-lb', { timeout: 10000 });
    await this.page.waitForSelector('#metric-healthy', { timeout: 10000 });
  }

  async getHealthyWorkersCount(): Promise<number> {
    const text = await this.page.locator('#metric-healthy').textContent();
    return parseInt(text || '0', 10);
  }

  async getTotalWorkersCount(): Promise<number> {
    const text = await this.page.locator('#metric-total').textContent();
    return parseInt(text || '0', 10);
  }

  async getActiveJobsCount(): Promise<number> {
    const text = await this.page.locator('#metric-active').textContent();
    return parseInt(text || '0', 10);
  }

  async getQueuedJobsCount(): Promise<number> {
    const text = await this.page.locator('#metric-queued').textContent();
    return parseInt(text || '0', 10);
  }

  async waitForMetricsUpdate(timeout: number = 5000) {
    await this.page.waitForSelector('#metric-healthy', { timeout });
    await this.page.waitForSelector('#metric-active', { timeout });
    await this.page.waitForSelector('#metric-queued', { timeout });
    await this.page.waitForFunction(
      () => {
        const loadDistribution = document.getElementById('load-distribution')?.textContent?.trim();
        const healthIndicator = document.getElementById('health-indicator')?.textContent?.trim();
        const timestamp = document.getElementById('circuit-status-timestamp')?.textContent?.trim();

        return !!loadDistribution && loadDistribution !== '--' &&
          !!healthIndicator && healthIndicator !== '--' &&
          !!timestamp && timestamp !== '--:--:--';
      },
      { timeout }
    );
  }

  async submitJob(jobData: number[]): Promise<void> {
    const jobInput = this.page.locator('#job-data');
    await jobInput.fill(JSON.stringify(jobData));
    
    const submitBtn = this.page.locator('#submit-job');
    await submitBtn.click();
    
    // Wait for job submission feedback
    await this.page.waitForSelector('text=Processing', { timeout: 5000 });
  }

  async getCircuitBreakerStates(): Promise<Map<string, string>> {
    const circuitItems = this.page.locator('.circuit-item');
    const count = await circuitItems.count();
    
    const states = new Map<string, string>();
    
    for (let i = 0; i < count; i++) {
      const item = circuitItems.nth(i);
      const text = await item.textContent();
      
      if (text) {
        // Parse "worker-id CLOSED" format
        const parts = text.trim().split(/\s+/);
        if (parts.length >= 2) {
          const workerId = parts[0];
          const state = parts[parts.length - 1];
          states.set(workerId, state);
        }
      }
    }
    
    return states;
  }

  async waitForCircuitBreakerState(
    workerId: string,
    expectedState: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    timeout: number = 10000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const states = await this.getCircuitBreakerStates();
      
      if (states.has(workerId) && states.get(workerId) === expectedState) {
        return;
      }
      
      await this.page.waitForTimeout(500);
    }
    
    throw new Error(
      `Circuit breaker for ${workerId} did not reach ${expectedState} within ${timeout}ms`
    );
  }

  async isCircuitBreakerPanelVisible(): Promise<boolean> {
    const panel = this.page.locator('text=Worker Health');
    return panel.isVisible();
  }

  async getLoadDistribution(): Promise<string> {
    const text = await this.page.locator('#load-distribution').textContent();
    return text || '';
  }

  async getHealthIndicator(): Promise<string> {
    const text = await this.page.locator('#health-indicator').textContent();
    return text || '';
  }

  async startLoadBalancer(): Promise<void> {
    const startLbBtn = this.page.locator('#start-lb');
    await startLbBtn.click();
    
    // Wait for feedback
    await this.page.waitForSelector('text=LB started', { timeout: 5000 });
  }

  async addWorker(): Promise<void> {
    const addWorkerBtn = this.page.locator('#add-worker');
    await addWorkerBtn.click();
    
    // Wait for feedback
    await this.page.waitForFunction(
      () => {
        const output = document.getElementById('job-results')?.textContent || '';
        return output.includes('Worker added');
      },
      { timeout: 5000 }
    );
  }

  async removeWorker(): Promise<void> {
    const removeWorkerBtn = this.page.locator('#remove-worker');
    await removeWorkerBtn.click();

    await this.page.waitForFunction(
      () => {
        const output = document.getElementById('job-results')?.textContent || '';
        return output.includes('Worker removed');
      },
      { timeout: 5000 }
    );
  }

  async getJobResultsOutput(): Promise<string> {
    const output = this.page.locator('#job-results');
    const text = await output.textContent();
    return text || '';
  }

  async clearJobResults(): Promise<void> {
    const clearBtn = this.page.locator('#clear-output');
    await clearBtn.click();
    
    // Wait for output to be cleared
    await this.page.waitForFunction(
      () => {
        const text = document.getElementById('job-results')?.textContent || '';
        return text.includes('Ready to submit jobs');
      },
      { timeout: 5000 }
    );
  }

  async waitForHealthyWorkers(
    expectedCount: number,
    timeout: number = 15000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const count = await this.getHealthyWorkersCount();
      
      if (count >= expectedCount) {
        return;
      }
      
      await this.page.waitForTimeout(500);
    }
    
    throw new Error(
      `Expected at least ${expectedCount} healthy workers within ${timeout}ms`
    );
  }

  async waitForTotalWorkers(
    expectedCount: number,
    timeout: number = 15000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const count = await this.getTotalWorkersCount();

      if (count === expectedCount) {
        return;
      }

      await this.page.waitForTimeout(500);
    }

    throw new Error(
      `Expected total workers to equal ${expectedCount} within ${timeout}ms`
    );
  }

  async waitForActiveJobs(
    expectedCount: number,
    timeout: number = 10000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const count = await this.getActiveJobsCount();
      
      if (count >= expectedCount) {
        return;
      }
      
      await this.page.waitForTimeout(500);
    }
    
    throw new Error(
      `Expected at least ${expectedCount} active jobs within ${timeout}ms`
    );
  }
}
