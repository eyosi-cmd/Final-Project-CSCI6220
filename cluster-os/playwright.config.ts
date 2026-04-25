import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Firefox and mobile testing disabled due to service stability issues
    // Uncomment when LoadBalancer/DNS services are more stable
  ],

  webServer: process.env.SKIP_WEB_SERVER ? undefined : {
    command: 'npm run start:core',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
