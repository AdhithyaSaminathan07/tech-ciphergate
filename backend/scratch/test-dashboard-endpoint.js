const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const GitHubCache = require('../models/GitHubCache');

async function testDashboardEndpoint() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const subdomain = 'arun-tv';
        const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';
        const cacheKey = `${username}:dashboard_data`;

        console.log(`Querying cache for subdomain="${subdomain}", cacheKey="${cacheKey}"`);
        const cached = await GitHubCache.findOne({
            subdomain,
            cache_key: cacheKey,
            data_type: 'dashboard_data'
        });

        if (cached) {
            console.log('Cache found! properties:');
            console.log(`- data_type: ${cached.data_type}`);
            console.log(`- expires_at: ${cached.expires_at}`);
            console.log(`- showingCached: true`);
            console.log(`- stats: ${JSON.stringify(cached.data?.stats)}`);
            console.log(`- repositories count: ${cached.data?.repositories?.length}`);
            console.log(`- commits count: ${cached.data?.commits?.length}`);
            console.log(`- pullRequests count: ${cached.data?.pullRequests?.length}`);
        } else {
            console.log('Cache NOT found!');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

testDashboardEndpoint();
