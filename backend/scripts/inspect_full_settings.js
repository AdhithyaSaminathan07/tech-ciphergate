const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const inspectSettings = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const Settings = mongoose.model('Settings', new mongoose.Schema({}, { strict: false }));

        const settings = await Settings.find().lean();
        console.log('ALL SETTINGS DOCUMENTS:');
        console.log(JSON.stringify(settings, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

inspectSettings();
