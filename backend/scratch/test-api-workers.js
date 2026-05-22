const http = require('http');

function post(url, body, headers = {}) {
  const parsedUrl = new URL(url);
  const data = JSON.stringify(body);
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...headers
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let resData = '';
      res.on('data', (chunk) => { resData += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(resData)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: resData
          });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testApi() {
  try {
    console.log("1. Simulating Admin Login for admin21...");
    const loginRes = await post('http://localhost:5002/api/auth/admin', {
      username: 'admin21',
      password: '100000'
    });

    console.log("Login Response Status:", loginRes.status);
    console.log("Login Response Body:", loginRes.body);

    if (loginRes.status !== 200) {
      console.error("Login failed!");
      return;
    }

    const { token, subdomain } = loginRes.body;
    console.log(`\nSuccess! Token received. Subdomain is '${subdomain}'`);

    console.log("\n2. Fetching workers for subdomain:", subdomain);
    const workersRes = await post('http://localhost:5002/api/workers/all', {
      subdomain: subdomain,
      status: 'all'
    }, {
      'Authorization': `Bearer ${token}`
    });

    console.log("Workers API Response Status:", workersRes.status);
    if (Array.isArray(workersRes.body)) {
      console.log(`Successfully fetched ${workersRes.body.length} workers!`);
      if (workersRes.body.length > 0) {
        console.log("Sample worker 1 details:");
        console.log(workersRes.body[0]);
      }
    } else {
      console.log("Response Body (Not Array):", workersRes.body);
    }

  } catch (err) {
    console.error("Error in API test:", err.message);
  }
}

testApi();
