const http = require('http');

function submitJob(jobData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(jobData);
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/submit-job',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Submitting 3 jobs in sequence...\n');

  // Submit job 1
  console.log('Job 1: Submitting [1,2,3,4,5]...');
  let result = await submitJob({ data: [1, 2, 3, 4, 5] });
  console.log(`Response: ${result.status}`);
  console.log(result.body);

  // Wait 1 sec before next
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Submit job 2
  console.log('\nJob 2: Submitting [10,20,30]...');
  result = await submitJob({ data: [10, 20, 30] });
  console.log(`Response: ${result.status}`);
  console.log(result.body);

  // Wait 1 sec before next
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Submit job 3
  console.log('\nJob 3: Submitting [100,200]...');
  result = await submitJob({ data: [100, 200] });
  console.log(`Response: ${result.status}`);
  console.log(result.body);

  console.log('\n\nAll jobs submitted. Check dashboard UI for metrics updates!');
}

main().catch(console.error);
