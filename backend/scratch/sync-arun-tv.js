const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { runBackgroundGitHubSync } = require('../services/githubSyncService');

async function runTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        console.log('\nStarting GitHub sync for subdomain "arun-tv"...');
        await runBackgroundGitHubSync('arun-tv');
        console.log('\nGitHub sync finished.');

    } catch (err) {
        console.error('Test error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

runTest();
