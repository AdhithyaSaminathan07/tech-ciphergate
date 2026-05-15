const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ApiKey = require('../models/ApiKey');

dotenv.config();

async function updateKey() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const result = await ApiKey.findOneAndUpdate(
            { key: 'cg_37eb843abb444576b04b62ed32b3dc4d' },
            { subdomain: 'arun-tv' },
            { new: true }
        );
        
        if (result) {
            console.log('✅ API Key subdomain updated to: arun-tv');
        } else {
            console.log('❌ API Key not found.');
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

updateKey();
