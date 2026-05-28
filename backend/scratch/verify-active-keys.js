const mongoose = require('mongoose');
const http = require('http');
const dotenv = require('dotenv');
const ApiKey = require('../models/ApiKey');

dotenv.config();

function makeRequest(method, path, headers = {}) {
    const options = {
        hostname: 'localhost',
        port: 5002,
        path: path,
        method: method,
        headers: {
            ...headers
        }
    };

    return new Promise((resolve) => {
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
        
        req.on('error', (err) => {
            resolve({
                status: 0,
                body: err.message
            });
        });
        req.end();
    });
}

async function verifyKeys() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI is not defined in the environment variables');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to Database.');

        // Find keys under the active subdomain
        const keys = await ApiKey.find({ subdomain: 'arun-tv' });
        console.log(`\nFound ${keys.length} API key(s) under subdomain 'arun-tv':\n`);

        for (const k of keys) {
            console.log(`--------------------------------------------------`);
            console.log(`Client: ${k.clientName || 'N/A'}`);
            console.log(`Key Prefix: ${k.key ? k.key.substring(0, 8) + '...' : 'N/A'}`);
            console.log(`Status: ${k.isActive ? 'Active' : 'Disabled'}`);
            console.log(`Permissions: [${k.permissions.join(', ')}]`);
            console.log(`Usage Count: ${k.usageCount || 0}`);

            if (!k.key) {
                console.log(`⚠️ Key secret is undefined. Skipping verification.`);
                continue;
            }

            if (!k.isActive) {
                console.log(`⚠️ Key is disabled. Skipping request verification.`);
                continue;
            }

            // Test accessing invoices module
            console.log(`Testing GET /api/external/invoices...`);
            const resInvoices = await makeRequest('GET', '/api/external/invoices', { 'x-api-key': k.key });
            console.log(`Invoices Response Status: ${resInvoices.status}`);
            if (resInvoices.status === 200) {
                console.log(`✅ Success! Response returned ${resInvoices.body.data?.length || 0} invoices.`);
            } else {
                console.log(`❌ Response: ${JSON.stringify(resInvoices.body)}`);
            }

            // Test accessing attendance module
            console.log(`Testing GET /api/external/attendance...`);
            const resAttendance = await makeRequest('GET', '/api/external/attendance', { 'x-api-key': k.key });
            console.log(`Attendance Response Status: ${resAttendance.status}`);
            if (resAttendance.status === 200) {
                console.log(`✅ Success! Response returned data.`);
            } else {
                console.log(`❌ Response: ${JSON.stringify(resAttendance.body)}`);
            }
        }
        console.log(`--------------------------------------------------`);

    } catch (error) {
        console.error('Error during verification:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

verifyKeys();
