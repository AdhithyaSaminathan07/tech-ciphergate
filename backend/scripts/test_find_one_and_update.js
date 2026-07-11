const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../models/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const testFindOneAndUpdate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const updateObject = {
            faceRecognition: {
                detectorType: 'tinyFaceDetector',
                matchingThreshold: 0.65
            }
        };

        const updatedSettings = await Settings.findOneAndUpdate(
            { subdomain: 'arun-tv' },
            { $set: updateObject },
            { new: true, runValidators: true }
        );

        console.log('AFTER findOneAndUpdate:', JSON.stringify(updatedSettings.faceRecognition, null, 2));
        console.log('UpdatedAt:', updatedSettings.updatedAt);

    } catch (error) {
        console.error('Error in findOneAndUpdate:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

testFindOneAndUpdate();
