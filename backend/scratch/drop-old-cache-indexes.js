const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('githubcaches');

    console.log('--- Indexes on githubcaches ---');
    const indexes = await collection.indexes();
    console.log(indexes);

    for (const index of indexes) {
        if (index.name === 'cache_key_1' && index.unique) {
            console.log('Dropping unique index cache_key_1...');
            await collection.dropIndex('cache_key_1');
            console.log('Dropped successfully.');
        }
    }

    await mongoose.connection.close();
}

run().catch(console.error);
