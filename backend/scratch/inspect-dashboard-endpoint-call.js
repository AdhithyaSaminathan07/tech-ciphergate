const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { getDashboardData } = require('../controllers/githubController');
const Admin = require('../models/Admin');

async function testDashboardController() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        // Find the admin user we expect is logged in (e.g. admin21 or admin)
        const adminUser = await Admin.findOne({ username: 'admin21' });
        if (!adminUser) {
            console.error('Test admin user (admin21) not found in database!');
            return;
        }

        console.log(`\nMocking request with Admin User: "${adminUser.username}", Subdomain: "${adminUser.subdomain}"`);

        const req = {
            user: {
                id: adminUser._id,
                username: adminUser.username,
                subdomain: adminUser.subdomain,
                role: 'admin'
            },
            query: {}
        };

        const res = {
            statusCode: 200,
            jsonPayload: null,
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(payload) {
                this.jsonPayload = payload;
                return this;
            }
        };

        // Call the controller method
        await getDashboardData(req, res);

        console.log('\n--- Controller Response ---');
        console.log(`HTTP Status: ${res.statusCode}`);
        if (res.jsonPayload) {
            console.log(`success: ${res.jsonPayload.success}`);
            console.log(`showingCached: ${res.jsonPayload.showingCached}`);
            console.log(`lastSuccessfulSync: ${res.jsonPayload.lastSuccessfulSync}`);
            console.log(`stats: ${JSON.stringify(res.jsonPayload.stats)}`);
            if (res.jsonPayload.repositories) {
                console.log(`repositories count: ${res.jsonPayload.repositories.length}`);
            }
            if (res.jsonPayload.commits) {
                console.log(`commits count: ${res.jsonPayload.commits.length}`);
            }
            console.log(`message: ${res.jsonPayload.message}`);
        } else {
            console.log('No payload returned.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

testDashboardController();
