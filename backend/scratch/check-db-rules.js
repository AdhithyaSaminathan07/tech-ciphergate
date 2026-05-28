const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Rule = require('../models/Rule');
const Settings = require('../models/Settings');
const Worker = require('../models/Worker');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to Database');

        const rules = await Rule.find({});
        console.log(`\n--- ALL RULES IN DB (${rules.length}) ---`);
        rules.forEach(r => {
            console.log(`ID: ${r._id} | Title: "${r.title}" | Version: ${r.version} | Status: ${r.status} | Subdomain: ${r.subdomain}`);
        });

        const settings = await Settings.find({});
        console.log(`\n--- ALL SETTINGS IN DB (${settings.length}) ---`);
        settings.forEach(s => {
            console.log(`ID: ${s._id} | Subdomain: ${s.subdomain} | Version: ${s.rulesConfiguration?.currentVersion} | Force Acceptance: ${s.rulesConfiguration?.forceAcceptance}`);
        });

        const workers = await Worker.find({ status: 'Active' }).limit(5);
        console.log(`\n--- ACTIVE WORKERS (showing up to 5) ---`);
        workers.forEach(w => {
            console.log(`ID: ${w._id} | Name: ${w.name} | Username: ${w.username} | Subdomain: ${w.subdomain} | AcceptedVersion: ${w.acceptedRulesVersion}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
