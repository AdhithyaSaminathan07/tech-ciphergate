const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const http = require('http');
const ApiKey = require('../models/ApiKey');
const Admin = require('../models/Admin');
const Invoice = require('../models/Invoice');
const DeleteHistory = require('../models/DeleteHistory');
const apiRoutes = require('../routes/apiRoutes');

dotenv.config();

// Helper to make native HTTP requests to localhost:5999
function makeRequest(method, path, body, headers = {}) {
    const data = body ? JSON.stringify(body) : null;
    const options = {
        hostname: 'localhost',
        port: 5999,
        path: path,
        method: method,
        headers: {
            ...headers
        }
    };
    
    if (data) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(data);
    }

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
        if (data) {
            req.write(data);
        }
        req.end();
    });
}

async function runTests() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI is not defined in the environment variables');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected successfully!');

        // 1. Setup Test Identities (Admin & different permission API Keys)
        console.log('\n--- SETUP TEST IDENTITIES ---');
        
        let testAdmin = await Admin.findOne({ subdomain: 'test-company-1' });
        if (!testAdmin) {
            testAdmin = await Admin.create({
                username: 'test_admin_1',
                email: 'test_admin_1@test.com',
                password: 'password123',
                subdomain: 'test-company-1'
            });
            console.log('Created test_admin_1 for test-company-1');
        } else {
            console.log('Found existing test_admin_1');
        }

        // Key 1: Invoices module access only (Read & Write)
        let keyInvoices = await ApiKey.findOne({ clientName: 'Invoice Only Integration' });
        if (!keyInvoices) {
            keyInvoices = await ApiKey.create({
                key: 'cg_test_key_invoices_123',
                clientName: 'Invoice Only Integration',
                subdomain: 'test-company-1',
                permissions: ['invoices:read', 'invoices:write']
            });
            console.log('Created Invoices-only API key');
        }

        // Key 2: Attendance module access only (Read only)
        let keyAttendance = await ApiKey.findOne({ clientName: 'Attendance Read Integration' });
        if (!keyAttendance) {
            keyAttendance = await ApiKey.create({
                key: 'cg_test_key_attendance_123',
                clientName: 'Attendance Read Integration',
                subdomain: 'test-company-1',
                permissions: ['attendance:read']
            });
            console.log('Created Attendance-read-only API key');
        }

        // Key 3: Admin preset access
        let keyAdmin = await ApiKey.findOne({ clientName: 'Admin Preset Integration' });
        if (!keyAdmin) {
            keyAdmin = await ApiKey.create({
                key: 'cg_test_key_admin_123',
                clientName: 'Admin Preset Integration',
                subdomain: 'test-company-1',
                permissions: ['admin']
            });
            console.log('Created Admin preset API key');
        }

        // 2. Setup Mock Express App and Server
        const app = express();
        app.use(express.json());
        app.use('/api/external', apiRoutes);

        const server = http.createServer(app);
        
        await new Promise((resolve) => server.listen(5999, resolve));
        console.log('✅ Temporary test server started on port 5999');

        // 3. Perform Permission Matrix Tests
        console.log('\n--- TESTING GRANULAR PERMISSION CHECKS ---');

        // Test 3.1: Invoices-only key reading invoices (Should Succeed)
        console.log('\nTest 3.1: Invoices-only key reading invoices...');
        const res1 = await makeRequest('GET', '/api/external/invoices', null, { 'x-api-key': keyInvoices.key });
        console.log('Status Code:', res1.status, '(Expected: 200)');
        if (res1.status === 200) {
            console.log('✅ Pass!');
        } else {
            console.error('❌ Fail!');
        }

        // Test 3.2: Invoices-only key reading attendance (Should Fail with 403)
        console.log('\nTest 3.2: Invoices-only key reading attendance...');
        const res2 = await makeRequest('GET', '/api/external/attendance', null, { 'x-api-key': keyInvoices.key });
        console.log('Status Code:', res2.status, '(Expected: 403)');
        if (res2.status === 403) {
            console.log('✅ Pass! Blocked correctly. Message:', res2.body.message);
        } else {
            console.error('❌ Fail! Access was allowed or wrong code returned.');
        }

        // Test 3.3: Attendance-only key reading attendance (Should Succeed)
        console.log('\nTest 3.3: Attendance-read-only key reading attendance...');
        const res3 = await makeRequest('GET', '/api/external/attendance', null, { 'x-api-key': keyAttendance.key });
        console.log('Status Code:', res3.status, '(Expected: 200)');
        if (res3.status === 200) {
            console.log('✅ Pass!');
        } else {
            console.error('❌ Fail!');
        }

        // Test 3.4: Attendance-only key writing attendance (Should Fail with 403 since it has read but not write)
        console.log('\nTest 3.4: Attendance-read-only key writing attendance...');
        const res4 = await makeRequest('POST', '/api/external/attendance', { rfid: 'TEST-RFID-123' }, { 'x-api-key': keyAttendance.key });
        console.log('Status Code:', res4.status, '(Expected: 403)');
        if (res4.status === 403) {
            console.log('✅ Pass! Blocked correctly. Message:', res4.body.message);
        } else {
            console.error('❌ Fail! Access was allowed or wrong code returned.');
        }

        // Test 3.5: Attendance-only key reading invoices (Should Fail with 403)
        console.log('\nTest 3.5: Attendance-read-only key reading invoices...');
        const res5 = await makeRequest('GET', '/api/external/invoices', null, { 'x-api-key': keyAttendance.key });
        console.log('Status Code:', res5.status, '(Expected: 403)');
        if (res5.status === 403) {
            console.log('✅ Pass! Blocked correctly. Message:', res5.body.message);
        } else {
            console.error('❌ Fail! Access was allowed or wrong code returned.');
        }

        // Test 3.6: Admin-preset key reading invoices and attendance (Should both succeed)
        console.log('\nTest 3.6: Admin key reading invoices and attendance...');
        const res6a = await makeRequest('GET', '/api/external/invoices', null, { 'x-api-key': keyAdmin.key });
        const res6b = await makeRequest('GET', '/api/external/attendance', null, { 'x-api-key': keyAdmin.key });
        console.log('Invoices Status:', res6a.status, '(Expected: 200) | Attendance Status:', res6b.status, '(Expected: 200)');
        if (res6a.status === 200 && res6b.status === 200) {
            console.log('✅ Pass!');
        } else {
            console.error('❌ Fail!');
        }

        // 4. Clean up Database Entities
        console.log('\n--- CLEANUP ---');
        await ApiKey.deleteOne({ _id: keyInvoices._id });
        await ApiKey.deleteOne({ _id: keyAttendance._id });
        await ApiKey.deleteOne({ _id: keyAdmin._id });
        await Admin.deleteOne({ _id: testAdmin._id });
        console.log('✅ Test entities cleaned up successfully!');

        // Close Server
        server.close();
        console.log('✅ Temporary test server closed.');

    } catch (err) {
        console.error('Error during testing:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

runTests();
