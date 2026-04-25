import { LamportClock } from './lamportClock';

function runTests() {
  console.log('Starting Lamport Clock Tests...');
  
  const clock = new LamportClock('test-node');
  
  // Test Initial Time
  if (clock.getTime() === 0) {
    console.log('PASS: Initial time is 0');
  } else {
    console.error('FAIL: Initial time is ' + clock.getTime());
  }

  // Test Increment
  clock.increment();
  if (clock.getTime() === 1) {
    console.log('PASS: Increment works');
  } else {
    console.error('FAIL: Increment failed');
  }

  // Test Update (smaller time)
  clock.update(0);
  if (clock.getTime() === 2) {
    console.log('PASS: Update with smaller time works');
  } else {
    console.error('FAIL: Update with smaller time failed');
  }

  // Test Update (larger time)
  clock.update(10);
  if (clock.getTime() === 11) {
    console.log('PASS: Update with larger time works');
  } else {
    console.error('FAIL: Update with larger time failed');
  }

  console.log('Tests completed.');
}

runTests();
