const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const inspectAdminsAndSettings = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const Admin = mongoose.model('Admin', new mongoose.Schema({}, { strict: false }));
        const Settings = mongoose.model('Settings', new mongoose.Schema({}, { strict: false }));

        const admins = await Admin.find().select('username subdomain email').lean();
        console.log('Admins in database:');
        console.log(JSON.stringify(admins, null, 2));

        const settings = await Settings.find().select('subdomain').lean();
        console.log('Settings in database:');
        console.log(JSON.stringify(settings, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

inspectAdminsAndSettings();
