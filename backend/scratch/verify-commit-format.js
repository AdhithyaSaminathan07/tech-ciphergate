const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const GitHubCache = mongoose.model('GitHubCache', new mongoose.Schema({}, { strict: false, collection: 'githubcaches' }));

    const cached = await GitHubCache.findOne({
        subdomain: 'arun-tv',
        cache_key: 'techvaseegrah:dashboard_data',
        data_type: 'dashboard_data'
    });

    if (cached && cached.data) {
        const commits = cached.data.recentCommits || [];
        console.log(`Retrieved ${commits.length} recent commits.`);
        if (commits.length > 0) {
            const sample = commits[0];
            console.log('Sample commit structure:');
            console.log(JSON.stringify(sample, null, 2));
            
            // Check properties
            console.log('\n--- Format Checks ---');
            console.log('c.sha exists:', !!sample.sha);
            console.log('c.commit exists:', !!sample.commit);
            console.log('c.commit.author exists:', !!sample.commit?.author);
            console.log('c.commit.author.date exists:', !!sample.commit?.author?.date);
            console.log('c.author exists:', !!sample.author);
            console.log('c.author.login exists:', !!sample.author?.login);
            console.log('c.author.avatar_url exists:', !!sample.author?.avatar_url);
        } else {
            console.log('No recent commits in cache.');
        }
    } else {
        console.log('No dashboard cache found.');
    }

    await mongoose.connection.close();
}

run().catch(console.error);
