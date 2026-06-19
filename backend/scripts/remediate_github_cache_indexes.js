const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const remediateIndexes = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            console.error('❌ MONGO_URI is missing in environment variables.');
            process.exit(1);
        }

        console.log('Connecting to database...');
        const conn = await mongoose.connect(uri);
        console.log(`✅ Connected to DB: ${conn.connection.name}`);
        console.log(`Host: ${conn.connection.host}`);

        const collection = mongoose.connection.collection('githubcaches');
        const indexes = await collection.indexes();

        console.log('\n--- Before Remediation: Current Indexes ---');
        console.log(JSON.stringify(indexes, null, 2));

        const targetIndex = indexes.find(idx => idx.name === 'cache_key_1');

        if (targetIndex) {
            if (targetIndex.unique) {
                console.log('\n🚨 Legacy unique index "cache_key_1" found. Dropping...');
                await collection.dropIndex('cache_key_1');
                console.log('✅ Index "cache_key_1" successfully dropped.');
                console.log('ℹ️ Mongoose will recreate it as a non-unique index at next startup.');
            } else {
                console.log('\n✅ Index "cache_key_1" exists but is not unique. No remediation needed.');
            }
        } else {
            console.log('\nℹ️ Index "cache_key_1" does not exist in the collection.');
        }

        const updatedIndexes = await collection.indexes();
        console.log('\n--- After Remediation: Updated Indexes ---');
        console.log(JSON.stringify(updatedIndexes, null, 2));

    } catch (error) {
        console.error('❌ Error during index remediation:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from DB.');
        process.exit();
    }
};

remediateIndexes();
