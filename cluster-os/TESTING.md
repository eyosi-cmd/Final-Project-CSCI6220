# Testing Guide

## Run All Tests

```bash
npm test
```

## Run Tests with Visual Interface

For a better testing experience with visualization:

```bash
npm run test:ui
```

This opens an interactive UI where you can:
- Watch tests run in real-time
- Pause and resume execution
- Inspect elements on the page
- View detailed logs

## Run Tests with Browser Visible

To see the browser while tests run:

```bash
npm run test:headed
```

## Debug Tests

To step through tests with debugging tools:

```bash
npm run test:debug
```

## View Test Results

After tests run, view the HTML report:

```bash
npm run test:report
```

## Important: Start Services First

Before running any tests, start the required services in separate terminals:

Terminal 1:
```bash
npm run start:dns
```

Terminal 2:
```bash
npm run start:lb
```

Terminal 3:
```bash
npm run start:dashboard
```

Terminal 4 (after all above are running):
```bash
npm test
```

Or for UI mode:
```bash
npm run test:ui
```

## What Gets Tested

Tests verify that the dashboard:
- Loads correctly
- Connects to the Load Balancer
- Displays metrics properly
- Accepts job submissions
- Shows results accurately
- Updates in real-time

## Test Files

- `tests/dashboard.spec.ts` - Main test specifications
- `tests/pages/dashboard.page.ts` - Helper functions for dashboard interaction

## Troubleshooting

If tests fail:
1. Check that all services are running
2. Wait a few seconds for services to initialize
3. Check that Load Balancer is on port 3010
4. Check that Dashboard is on port 5000
5. Look at error messages in the test output

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
