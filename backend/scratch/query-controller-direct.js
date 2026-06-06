const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { getDashboardData } = require('../controllers/githubController');
const Admin = require('../models/Admin');

async function testDirect() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const admin21 = await Admin.findOne({ username: 'admin21' });
        const adminDefault = await Admin.findOne({ username: 'admin' });

        if (admin21) {
            // Mock req and res
            const req = { user: admin21.toObject() };
            req.user.role = 'admin';
            let responseData = null;
            const res = {
                json: (data) => { responseData = data; return res; },
                status: (code) => { return res; }
            };
            await getDashboardData(req, res);
            console.log('\n--- Direct Controller Response for admin21 (arun-tv) ---');
            console.log('showingCached:', responseData?.showingCached);
            console.log('Stats:', JSON.stringify(responseData?.stats));
            console.log('Repositories Count:', responseData?.repositories?.length);
        }

        if (adminDefault) {
            // Mock req and res
            const req = { user: adminDefault.toObject() };
            req.user.role = 'admin';
            let responseData = null;
            const res = {
                json: (data) => { responseData = data; return res; },
                status: (code) => { return res; }
            };
            await getDashboardData(req, res);
            console.log('\n--- Direct Controller Response for admin (admin) ---');
            console.log('showingCached:', responseData?.showingCached);
            console.log('message:', responseData?.message);
            console.log('Stats:', JSON.stringify(responseData?.stats));
            console.log('Repositories Count:', responseData?.repositories?.length);
        }

    } catch (err) {
        console.error('Error running direct test:', err);
    } finally {
        await mongoose.connection.close();
    }
}

testDirect();
