const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const checkIndex = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`Connected to DB: ${conn.connection.name}`);
        console.log(`Host: ${conn.connection.host}`);

        const collection = mongoose.connection.collection('attendances');
        const indexes = await collection.indexes();

        console.log('Current Indexes on "attendances":');
        console.log(JSON.stringify(indexes, null, 2));

        const indexName = 'worker_1_date_1';
        const exists = indexes.some(idx => idx.name === indexName);

        console.log(`\nIndex "${indexName}" exists? ${exists}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

checkIndex();
