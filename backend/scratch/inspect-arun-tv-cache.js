const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const GitHubCache = mongoose.model('GitHubCache', new mongoose.Schema({}, { strict: false, collection: 'githubcaches' }));
        const GitHubSyncJob = mongoose.model('GitHubSyncJob', new mongoose.Schema({}, { strict: false, collection: 'githubsyncjobs' }));

        console.log('\n--- Count of Caches by Subdomain ---');
        const cacheStats = await GitHubCache.aggregate([
            { $group: { _id: "$subdomain", count: { $sum: 1 } } }
        ]);
        console.log(cacheStats);

        console.log('\n--- Cached Dashboard Data Keys for arun-tv ---');
        const arunCaches = await GitHubCache.find({ subdomain: 'arun-tv', data_type: { $ne: 'repo_details' } }).select('cache_key username data_type expires_at last_fetched');
        console.log(arunCaches);

        console.log('\n--- Sample Cached Repositories for arun-tv (Top 5) ---');
        const repos = await GitHubCache.find({ subdomain: 'arun-tv', data_type: 'repo_details' }).limit(5).select('cache_key username');
        console.log(repos);

        console.log('\n--- Latest Sync Jobs for arun-tv (Top 5) ---');
        const jobs = await GitHubSyncJob.find({ subdomain: 'arun-tv' }).sort({ createdAt: -1 }).limit(5);
        console.log(jobs);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

inspect();
