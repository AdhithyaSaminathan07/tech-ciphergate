const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../models/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const checkAllSettings = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const docs = await Settings.find({}, 'subdomain faceRecognition updatedAt').lean();
        console.log('--- Settings Subdomains and Face Recognition Configs ---');
        docs.forEach(doc => {
            console.log(`Subdomain: ${doc.subdomain}`);
            console.log(`  FaceRecognition: ${JSON.stringify(doc.faceRecognition, null, 2)}`);
            console.log(`  UpdatedAt: ${doc.updatedAt}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

checkAllSettings();
