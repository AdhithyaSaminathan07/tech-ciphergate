const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../models/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const testUpdate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Let's get the first settings document
        const firstSettings = await Settings.findOne();
        if (!firstSettings) {
            console.log('No settings documents found!');
            return;
        }

        console.log('Original settings document faceRecognition before update:', firstSettings.faceRecognition);

        // Update it
        firstSettings.faceRecognition = {
            detectorType: 'tinyFaceDetector',
            matchingThreshold: 0.55
        };

        const saved = await firstSettings.save();
        console.log('Saved settings document faceRecognition:', saved.faceRecognition);
        console.log('Saved document updatedAt:', saved.updatedAt);

    } catch (error) {
        console.error('Error during update test:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

testUpdate();
