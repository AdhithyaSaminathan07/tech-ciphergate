/**
 * Purge oversized dashboard_data, leaderboard_data, and :repositories cache documents
 * so the next request uses the new slim format (no 16MB+ document issue).
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const GitHubCache = mongoose.model('GitHubCache', new mongoose.Schema({}, { strict: false, collection: 'githubcaches' }));

    // Delete all dashboard_data, leaderboard_data, and :repositories caches (they'll be rebuilt on next sync or request)
    const res1 = await GitHubCache.deleteMany({ data_type: { $in: ['dashboard_data', 'leaderboard_data', 'repositories'] } });
    console.log(`Deleted ${res1.deletedCount} oversized cache documents (dashboard_data, leaderboard_data, repositories).`);

    // Confirm remaining cache counts
    const summary = await GitHubCache.aggregate([
        { $group: { _id: '$data_type', count: { $sum: 1 } } }
    ]);
    console.log('\nRemaining cache types:');
    summary.forEach(s => console.log(`  ${s._id}: ${s.count}`));

    await mongoose.connection.close();
    console.log('\nDone. The next GitHub sync will write slim, correctly-sized cache documents.');
}

run().catch(err => { console.error(err); process.exit(1); });
