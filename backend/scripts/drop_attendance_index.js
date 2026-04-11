const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const dropIndex = async () => {
    await connectDB();

    try {
        const collection = mongoose.connection.collection('attendances');

        // List indexes first to confirm
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes);

        const indexName = 'worker_1_date_1';
        const indexExists = indexes.some(idx => idx.name === indexName);

        if (indexExists) {
            await collection.dropIndex(indexName);
            console.log(`Index ${indexName} dropped successfully.`);
        } else {
            console.log(`Index ${indexName} does not exist.`);
        }

    } catch (error) {
        console.error('Error dropping index:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

dropIndex();
