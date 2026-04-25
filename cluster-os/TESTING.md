# ClusterOS Dashboard - UI Testing Guide

## ⚠️ Important: Service Startup Instructions

Due to service stability issues, **you must manually start the cluster services BEFORE running tests**. Do NOT rely on Playwright's automatic service startup.

### Step-by-Step Startup

#### Terminal 1 - DNS Router
```bash
npm run start:dns
```
Wait for: `[DNS Router] Server listening on port 2000`

#### Terminal 2 - Load Balancer
```bash
npm run start:lb
```
Wait for: `[LB] Server listening on port 3010` and `[LB] Metrics server listening on port 9001`

#### Terminal 3 - Dashboard
```bash
npm run start:dashboard
```
Wait for: `[DASHBOARD] Successfully connected to Load Balancer on port 3010`

#### Terminal 4 - Run Tests (after all 3 services are ready)
```bash
SKIP_WEB_SERVER=1 npm test
```

Or use the interactive UI mode:
```bash
SKIP_WEB_SERVER=1 npm run test:ui
```

---

## Overview
This project includes automated UI tests using Playwright, a modern testing framework that supports multiple browsers and devices.

## Setup

### Prerequisites
- Node.js 16+
- ClusterOS project dependencies installed
- LoadBalancer and Dashboard services available

### Installation
The following have been automatically installed:
- `@playwright/test` - Testing framework
- Configuration files created:
  - `playwright.config.ts` - Playwright configuration
  - `tests/pages/dashboard.page.ts` - Page Object Model
  - `tests/dashboard.spec.ts` - Test specifications

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in UI Mode (Recommended for Development)
```bash
npm run test:ui
```
This opens an interactive mode where you can:
- See tests running in real-time
- Pause/resume execution
- Inspect elements
- View detailed logs

### Run Tests in Headed Mode (Browser Visible)
```bash
npm run test:headed
```
Tests run with browser windows visible for observation.

### Run Tests in Debug Mode
```bash
npm run test:debug
```
Launches with Playwright Inspector for step-by-step debugging.

### View Test Report
After tests run, view detailed HTML report:
```bash
npm run test:report
```

## Test Structure

### Page Object Model (POM)
- **Location**: `tests/pages/dashboard.page.ts`
- **Purpose**: Encapsulates all dashboard interactions
- **Benefits**: 
  - Centralized element selectors
  - Reusable methods
  - Easy maintenance when UI changes

### Test Specifications
- **Location**: `tests/dashboard.spec.ts`
- **Coverage**:
  - Page Load tests
  - Metrics Display tests
  - Circuit Breaker Panel tests
  - Job Submission tests
  - Control Buttons tests
  - Responsive Design tests
  - Info Panel tests

## Key Test Categories

### 1. Page Load Tests
- Verifies dashboard loads successfully
- Checks all major sections are visible
- Validates page title

### 2. Metrics Display Tests
- Verifies metric values display correctly
- Ensures metrics update periodically
- Validates numeric constraints (healthy ≤ total)
- Checks load distribution display
- Validates health indicator

### 3. Circuit Breaker Panel Tests
- Verifies circuit breaker section displays
- Validates state indicators (CLOSED, OPEN, HALF_OPEN)
- Tests state retrieval and validation
- Checks timestamp display

### 4. Job Submission Tests
- Validates form presence
- Checks job results section
- Verifies example payload display
- Tests clear button functionality

### 5. Control Buttons Tests
- Verifies all control buttons are visible
- Checks buttons are clickable
- Validates Load Balancer controls
- Validates Worker controls

### 6. Responsive Design Tests
- Tests mobile (375x667) viewport
- Tests tablet (768x1024) viewport
- Tests desktop (1920x1080) viewport
- Ensures critical elements remain visible

## Browser Coverage

Currently enabled for stability:
- ✅ Chromium (Desktop)
- ✅ WebKit/Safari (Desktop)

Disabled (unstable service issues):
- ❌ Firefox (Desktop) - [Can be re-enabled after service stability fixes]
- ❌ Mobile Chrome (Pixel 5 emulation) - [Can be re-enabled after service stability fixes]
- ❌ Mobile Safari (iPhone 12 emulation) - [Can be re-enabled after service stability fixes]

To run on specific browser:
```bash
SKIP_WEB_SERVER=1 npm test -- --project=chromium
SKIP_WEB_SERVER=1 npm test -- --project=webkit
```

## Page Object Methods

### Metrics Methods
```typescript
getHealthyWorkersCount(): Promise<number>
getTotalWorkersCount(): Promise<number>
getActiveJobsCount(): Promise<number>
getQueuedJobsCount(): Promise<number>
getLoadDistribution(): Promise<string>
getHealthIndicator(): Promise<string>
```

### Circuit Breaker Methods
```typescript
getCircuitBreakerStates(): Promise<Map<string, string>>
waitForCircuitBreakerState(workerId, state, timeout)
isCircuitBreakerPanelVisible(): Promise<boolean>
```

### Job Submission Methods
```typescript
submitJob(jobData: number[]): Promise<void>
getJobResultsOutput(): Promise<string>
clearJobResults(): Promise<void>
```

### Waiting Methods
```typescript
waitForMetricsUpdate(timeout?)
waitForHealthyWorkers(count, timeout?)
waitForActiveJobs(count, timeout?)
```

### Control Methods
```typescript
goto()
startLoadBalancer()
addWorker()
```

## Writing New Tests

### Example: Testing Circuit Breaker State Changes
```typescript
test('should transition circuit breaker to OPEN on failures', async () => {
  await dashboard.goto();
  await dashboard.waitForHealthyWorkers(1);
  
  // Submit jobs to trigger failures
  await dashboard.submitJob([5000, 5000, 5000]);
  
  // Wait for circuit breaker to open
  await dashboard.waitForCircuitBreakerState('worker-1', 'OPEN', 30000);
  
  const states = await dashboard.getCircuitBreakerStates();
  expect(states.get('worker-1')).toBe('OPEN');
});
```

### Example: Testing Load Balancer Functionality
```typescript
test('should start load balancer and show workers', async () => {
  await dashboard.goto();
  
  await dashboard.startLoadBalancer();
  await dashboard.waitForHealthyWorkers(1);
  
  const healthy = await dashboard.getHealthyWorkersCount();
  expect(healthy).toBeGreaterThan(0);
});
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: UI Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Debugging Tests

### Using Playwright Inspector
```bash
npm run test:debug
```
- Step through code line by line
- Inspect DOM elements
- View console logs
- Check network requests

### Screenshots and Videos
Tests automatically capture:
- Screenshots on failure
- Videos on failure
- Full test traces

Located in `test-results/` directory.

### Verbose Logging
```bash
DEBUG=pw:api npm test
```

## Best Practices

1. **Use Page Objects** - Keep selectors and logic separated
2. **Wait Explicitly** - Don't use hardcoded waits
3. **Test User Behavior** - Click buttons, submit forms
4. **Keep Tests Isolated** - No dependencies between tests
5. **Use Descriptive Names** - Clear test purpose
6. **Handle Flakiness** - Use appropriate timeouts
7. **Mock External Services** - When needed for speed/reliability

## Troubleshooting

### Tests fail immediately after startup
- Ensure you're using `SKIP_WEB_SERVER=1` environment variable
- Verify all 3 services (DNS, LoadBalancer, Dashboard) are running in separate terminals
- Check service startup order: DNS first, then LoadBalancer, then Dashboard
- Look for error messages in each service's terminal

### Tests timeout waiting for dashboard
- Ensure DNS Router is running (port 2000)
- Ensure LoadBalancer is running (port 3010, 9001)
- Ensure Dashboard is running and shows "Successfully connected to Load Balancer"
- Check if `http://localhost:5000` is accessible in browser
- Increase timeout in specific test: `{ timeout: 30000 }`

### LoadBalancer crashes on startup
- This is a known issue - try restarting it
- Ensure no other process is using ports 3010 or 9001
- Check terminal output for socket errors
- See service_issues.md for known workarounds

### Dashboard crashes on startup
- Verify LoadBalancer is fully started before starting Dashboard
- Check Dashboard terminal for connection errors
- If "Failed to connect to Load Balancer" appears, restart Dashboard after LB is ready
- See service_issues.md for known workarounds

### Element not found errors
- Check if selector/ID has changed in dashboard HTML
- Use Playwright Inspector to find correct selector
- Verify element is visible before interaction

### Flaky tests
- Increase wait timeouts
- Add explicit waits for network requests
- Use `waitForLoadState('networkidle')`

### Cross-browser failures
- Test individually: `npm test -- --project=firefox`
- Check browser-specific CSS
- Verify viewport size handling

## Performance

- **Single run**: ~30-60 seconds (all browsers)
- **UI mode**: Instant (interactive)
- **Parallelization**: 4 workers by default
- **CI Mode**: 1 worker (more reliable)

## Reports

Generated after test run:
- HTML report in `playwright-report/`
- JSON results in `test-results/results.json`
- Screenshots/videos in `test-results/`

View HTML report:
```bash
npm run test:report
```

## Next Steps

1. Run `npm test` to execute the test suite
2. Use `npm run test:ui` for interactive testing
3. Add custom tests in `tests/dashboard.spec.ts`
4. Integrate tests into CI/CD pipeline
5. Monitor test metrics and adjust timeouts as needed
