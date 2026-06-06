const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const GitHubCache = mongoose.model('GitHubCache', new mongoose.Schema({}, { strict: false, collection: 'githubcaches' }));

    const count = await GitHubCache.countDocuments({ subdomain: 'arun-tv' });
    console.log(`Total cache records for arun-tv: ${count}`);

    const types = await GitHubCache.aggregate([
        { $match: { subdomain: 'arun-tv' } },
        { $group: { _id: '$data_type', count: { $sum: 1 } } }
    ]);
    console.log('\nCache counts by data_type:');
    console.log(types);

    const keys = await GitHubCache.find({ subdomain: 'arun-tv', data_type: { $ne: 'repo_details' } })
        .select('cache_key data_type username expires_at last_fetched');
    console.log('\nNon-repo cache records:');
    console.log(keys);

    await mongoose.connection.close();
}

run().catch(console.error);
