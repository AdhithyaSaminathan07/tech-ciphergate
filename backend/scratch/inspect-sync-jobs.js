const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const GitHubSyncJob = require('../models/GitHubSyncJob');

async function inspectSyncJobs() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const jobs = await GitHubSyncJob.find({}).sort({ createdAt: -1 });
        console.log(`\nFound ${jobs.length} sync jobs:`);
        jobs.forEach(j => {
            console.log(`- ID: ${j._id}`);
            console.log(`  subdomain: "${j.subdomain}"`);
            console.log(`  status:    "${j.status}"`);
            console.log(`  progress:  "${j.progress}"`);
            console.log(`  startedAt: ${j.startedAt}`);
            console.log(`  completedAt: ${j.completedAt}`);
            console.log(`  processed: ${j.repositoriesProcessed}, failed: ${j.repositoriesFailed}`);
            console.log(`  syncErrors: ${JSON.stringify(j.syncErrors)}`);
            console.log('---');
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

inspectSyncJobs();
