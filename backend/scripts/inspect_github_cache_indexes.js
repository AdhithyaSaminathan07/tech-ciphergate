const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const checkIndexes = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`Connected to DB: ${conn.connection.name}`);
        console.log(`Host: ${conn.connection.host}`);

        const collection = mongoose.connection.collection('githubcaches');
        const indexes = await collection.indexes();

        console.log('Current Indexes on "githubcaches":');
        console.log(JSON.stringify(indexes, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

checkIndexes();
