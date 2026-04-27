const SystemMonitor = require('./dist/kernel/SystemMonitor.js').default;

async function test() {
    console.log('Starting SystemMonitor test...');
    const monitor = new SystemMonitor();
    
    console.log('Starting sampling...');
    await monitor.startSampling();
    
    console.log('Waiting 3 seconds for metrics to be collected...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Retrieving metrics...');
    const metrics = monitor.getMetrics();
    
    console.log('--- System Metrics ---');
    console.log('CPU:', JSON.stringify(metrics.cpu, null, 2));
    console.log('Memory:', JSON.stringify(metrics.memory, null, 2));
    console.log('Disk:', JSON.stringify(metrics.disk, null, 2));
    console.log('Network:', JSON.stringify(metrics.network, null, 2));
    console.log('Processes:', metrics.processes);
    
    console.log('Stopping sampling...');
    monitor.stopSampling();
    console.log('Test complete.');
    process.exit(0);
}

test().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
