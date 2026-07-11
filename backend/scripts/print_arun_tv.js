const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../models/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const printArunTv = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const doc = await Settings.findOne({ subdomain: 'arun-tv' }).lean();
        console.log('arun-tv Settings:');
        console.log(JSON.stringify(doc, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

printArunTv();
