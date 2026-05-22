const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    console.log("Querying running API at port 5002...");
    
    const rootRes = await get('http://localhost:5002/');
    console.log("Root Endpoint Response:", rootRes);

    const checkAdminRes = await get('http://localhost:5002/api/auth/check-admin');
    console.log("Check Admin Endpoint Response:", checkAdminRes);

  } catch (err) {
    console.error("Failed to query running API:", err.message);
  }
}

main();
