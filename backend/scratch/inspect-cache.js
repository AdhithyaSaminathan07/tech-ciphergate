const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const GitHubCache = require('../models/GitHubCache');

async function inspectCache() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const records = await GitHubCache.find({ subdomain: 'arun-tv' });
        console.log(`\nFound ${records.length} cache records for subdomain "arun-tv":`);
        
        records.forEach(r => {
            console.log(`\n- _id: ${r._id}`);
            console.log(`  cache_key: "${r.cache_key}"`);
            console.log(`  data_type: "${r.data_type}"`);
            console.log(`  username:  "${r.username}"`);
            console.log(`  expires_at: ${r.expires_at}`);
            console.log(`  isExpired:  ${r.expires_at < new Date()}`);
            if (r.data) {
                console.log(`  data keys:  ${Object.keys(r.data).join(', ')}`);
                if (r.data.stats) {
                    console.log(`  stats:      ${JSON.stringify(r.data.stats)}`);
                }
                if (Array.isArray(r.data)) {
                    console.log(`  array length: ${r.data.length}`);
                }
            } else {
                console.log('  data: null/undefined');
            }
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

inspectCache();
