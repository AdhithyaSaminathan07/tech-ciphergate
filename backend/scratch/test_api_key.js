const axios = require('axios');

const API_KEY = 'cg_4ba43158179d427292043590bffb3710';
const BASE_URL = 'http://localhost:5001/api/external';

async function testApi() {
    console.log('--- TESTING API KEY SYSTEM ---');
    console.log(`Key: ${API_KEY}`);
    
    try {
        console.log('\n1. Testing GET /workers...');
        const workersRes = await axios.get(`${BASE_URL}/workers`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ Success! Found workers:', workersRes.data.length);
        if (workersRes.data.length > 0) {
            console.log('Sample Worker:', workersRes.data[0].name);
        }

        console.log('\n2. Testing GET /attendance...');
        const attRes = await axios.get(`${BASE_URL}/attendance`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ Success! Found attendance records:', attRes.data.length);

        console.log('\n3. Testing GET /settings...');
        const setRes = await axios.get(`${BASE_URL}/settings`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ Success! Company Subdomain:', setRes.data.subdomain);

    } catch (error) {
        console.error('❌ API Test Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testApi();
