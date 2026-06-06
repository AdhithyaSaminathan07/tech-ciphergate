/**
 * Diagnostic: shows which subdomains exist, their workers, and which GitHub caches exist for each.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const GitHubCache = mongoose.model('GitHubCache', new mongoose.Schema({}, { strict: false, collection: 'githubcaches' }));
    const Worker = mongoose.model('Worker', new mongoose.Schema({}, { strict: false, collection: 'workers' }));

    // 1. List all subdomains with workers
    console.log('\n=== Active Worker Subdomains ===');
    const subdomains = await Worker.distinct('subdomain', { status: 'Active' });
    console.log(subdomains);

    // 2. For each subdomain, what GitHub cache types exist?
    console.log('\n=== GitHub Cache Counts By Subdomain & Type ===');
    const cacheSummary = await GitHubCache.aggregate([
        { $group: { _id: { subdomain: '$subdomain', data_type: '$data_type' }, count: { $sum: 1 } } },
        { $sort: { '_id.subdomain': 1, '_id.data_type': 1 } }
    ]);
    cacheSummary.forEach(c => {
        console.log(`  Subdomain: "${c._id.subdomain}" | Type: "${c._id.data_type}" | Count: ${c.count}`);
    });

    // 3. Check what username env vars say vs actual token owner
    const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME;
    console.log('\n=== Env Checks ===');
    console.log(`  NEXT_PUBLIC_GITHUB_USERNAME = "${username}"`);

    await mongoose.connection.close();
}

run().catch(err => { console.error(err); process.exit(1); });
