const axios = require('axios');

async function testApi() {
    const API_KEY = 'cg_37eb843abb444576b04b62ed32b3dc4d';
    const BASE_URL = 'http://localhost:5001/api/external';

    console.log('--- Testing CipherGate API ---');
    
    try {
        console.log('1. Testing GET /attendance...');
        const res = await axios.get(`${BASE_URL}/attendance`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ Success! Found', res.data.attendance.length, 'records.');

        console.log('\n2. Testing GET /report...');
        const reportRes = await axios.get(`${BASE_URL}/report`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ Success! Today\'s Attendance:', reportRes.data.percentage, '%');

    } catch (error) {
        console.error('❌ API Test Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received from server. Is it running on port 5000?');
        } else {
            console.error('Error:', error.message);
        }
    }
}

testApi();
