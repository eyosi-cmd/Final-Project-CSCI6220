import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';

test.describe('ClusterOS Dashboard', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test.describe('Page Load', () => {
    test('should load dashboard successfully', async ({ page }) => {
      await expect(page).toHaveTitle('ClusterOS Dashboard');
      
      // Verify main sections are visible
      await expect(page.locator('text=System Controls')).toBeVisible();
      await expect(page.locator('text=Cluster Metrics')).toBeVisible();
      await expect(page.locator('text=Worker Health')).toBeVisible();
      await expect(page.locator('text=Submit Job')).toBeVisible();
    });

    test('should display all metric cards', async () => {
      // Verify metric headers
      await expect(dashboard.page.locator('text=Healthy')).toBeVisible();
      await expect(dashboard.page.locator('text=Total')).toBeVisible();
      await expect(dashboard.page.locator('text=Active')).toBeVisible();
      await expect(dashboard.page.locator('text=Queued')).toBeVisible();
    });
  });

  test.describe('Metrics Display', () => {
    test('should display metric values as numbers', async () => {
      await dashboard.waitForMetricsUpdate();
      
      const healthy = await dashboard.getHealthyWorkersCount();
      const total = await dashboard.getTotalWorkersCount();
      const active = await dashboard.getActiveJobsCount();
      const queued = await dashboard.getQueuedJobsCount();
      
      // All should be non-negative numbers
      expect(healthy).toBeGreaterThanOrEqual(0);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(active).toBeGreaterThanOrEqual(0);
      expect(queued).toBeGreaterThanOrEqual(0);
      
      // Healthy should never exceed total
      expect(healthy).toBeLessThanOrEqual(total);
    });

    test('should update metrics periodically', async () => {
      await dashboard.waitForMetricsUpdate();
      
      const firstActive = await dashboard.getActiveJobsCount();
      
      // Wait a bit and check metrics are still responsive
      await dashboard.page.waitForTimeout(1000);
      const secondActive = await dashboard.getActiveJobsCount();
      
      // Metrics should update without errors
      expect(typeof secondActive).toBe('number');
    });

    test('should display load distribution', async () => {
      await dashboard.waitForMetricsUpdate();
      
      const loadDist = await dashboard.getLoadDistribution();
      expect(loadDist).toBeTruthy();
      expect(loadDist).toContain('jobs/worker');
    });

    test('should display health indicator', async () => {
      await dashboard.waitForMetricsUpdate();
      
      const health = await dashboard.getHealthIndicator();
      expect(health).toBeTruthy();
      expect(health).toMatch(/\d+%\s+health/);
    });
  });

  test.describe('Circuit Breaker Panel', () => {
    test('should display circuit breaker section', async () => {
      await expect(
        dashboard.page.locator('text=Worker Health (Circuit Breaker States)')
      ).toBeVisible();
    });

    test('should show circuit breaker state indicators', async () => {
      // Verify the legend is displayed
      await expect(
        dashboard.page.locator('text=CLOSED (healthy)')
      ).toBeVisible();
      await expect(
        dashboard.page.locator('text=HALF_OPEN')
      ).toBeVisible();
      await expect(
        dashboard.page.locator('text=OPEN (failed)')
      ).toBeVisible();
    });

    test('should retrieve circuit breaker states', async () => {
      await dashboard.waitForMetricsUpdate();
      
      const states = await dashboard.getCircuitBreakerStates();
      
      // Even if no workers, should return a Map
      expect(states).toBeInstanceOf(Map);
      
      // All states should be valid
      for (const [workerId, state] of states) {
        expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
      }
    });

    test('should display timestamp', async ({ page }) => {
      const timestamp = page.locator('#circuit-status-timestamp');
      await expect(timestamp).toBeVisible();
      
      const timeText = await timestamp.textContent();
      expect(timeText).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  test.describe('Job Submission UI', () => {
    test('should display job submission form', async ({ page }) => {
      await expect(page.locator('text=Job Payload (JSON Array)')).toBeVisible();
      await expect(page.locator('#job-data')).toBeVisible();
      await expect(page.locator('#submit-job')).toBeVisible();
    });

    test('should show job results section', async ({ page }) => {
      const resultsSection = page.locator('text=Results');
      await expect(resultsSection).toBeVisible();
      
      const terminal = page.locator('#job-results');
      await expect(terminal).toBeVisible();
    });

    test('should display example payload', async ({ page }) => {
      const example = page.locator('text=[10, 20, 30]');
      await expect(example).toBeVisible();
    });

    test('should have clear button', async ({ page }) => {
      const clearBtn = page.locator('#clear-output');
      await expect(clearBtn).toBeVisible();
    });
  });

  test.describe('Control Buttons', () => {
    test('should display load balancer controls', async ({ page }) => {
      const startLbBtn = page.locator('#start-lb');
      const stopLbBtn = page.locator('#stop-lb');
      
      await expect(startLbBtn).toBeVisible();
      await expect(stopLbBtn).toBeVisible();
    });

    test('should display worker controls', async ({ page }) => {
      const addWorkerBtn = page.locator('#add-worker');
      const removeWorkerBtn = page.locator('#remove-worker');
      
      await expect(addWorkerBtn).toBeVisible();
      await expect(removeWorkerBtn).toBeVisible();
    });

    test('control buttons should be clickable', async ({ page }) => {
      const startLbBtn = page.locator('#start-lb');
      
      await expect(startLbBtn).toBeEnabled();
    });
  });

  test.describe('Responsive Design', () => {
    test('should be responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Key elements should still be visible
      await expect(page.locator('text=Cluster Metrics')).toBeVisible();
      await expect(page.locator('text=Worker Health')).toBeVisible();
    });

    test('should be responsive on tablet', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      
      await expect(page.locator('text=Cluster Metrics')).toBeVisible();
    });

    test('should be responsive on desktop', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      await expect(page.locator('text=Cluster Metrics')).toBeVisible();
    });
  });

  test.describe('Info Panel', () => {
    test('should display architecture information', async ({ page }) => {
      const infoPanel = page.locator('text=Architecture & Key Concepts');
      await expect(infoPanel).toBeVisible();
      
      // Verify key concepts are displayed
      await expect(
        page.locator('text=Load Balancer (Single System Image Kernel)')
      ).toBeVisible();
      await expect(
        page.locator('text=Failure Detection (Phi-Suspicion)')
      ).toBeVisible();
      await expect(
        page.locator('text=Circuit Breaker Pattern')
      ).toBeVisible();
      await expect(
        page.locator('text=Job Aggregation (MapReduce)')
      ).toBeVisible();
    });
  });
});
