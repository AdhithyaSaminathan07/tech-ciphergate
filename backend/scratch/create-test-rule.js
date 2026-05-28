const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Rule = require('../models/Rule');
const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to Database');

        const subdomain = 'arun-tv';

        // 1. Find or create an admin for arun-tv to link as creator
        let admin = await Admin.findOne({ subdomain });
        if (!admin) {
            admin = await Admin.create({
                username: 'temp_admin_arun',
                email: 'temp_admin@arun.com',
                password: 'password123',
                rfid: 'RFID_TEMP_ADMIN',
                subdomain
            });
            console.log('Created temp admin for arun-tv');
        }

        // 2. Create an active rule for arun-tv
        await Rule.deleteMany({ subdomain }); // Clear any test rules
        const rule = await Rule.create({
            title: 'General Code of Conduct',
            category: 'Ethics & Code of Conduct',
            content: `
                <h4>1. Professional Integrity</h4>
                <p>All employees are expected to perform their duties with honesty, integrity, and respect for others. Harassment, discrimination, or unprofessional behavior of any kind will not be tolerated.</p>
                
                <h4>2. Office Hours & Work Timings</h4>
                <p>Standard office working hours are from 9:00 AM to 6:00 PM, Monday through Friday. Ensure you mark your attendance using the RFID cards or face recognition scanner at the entry terminal.</p>
                
                <h4>3. Confidentiality Agreement</h4>
                <p>You must protect all proprietary, client, and company information. Access to the backend system, databases, and API keys must not be shared under any circumstances.</p>
            `,
            version: '1.0',
            status: 'active',
            severity: 'high',
            changeLog: 'Initial corporate rules release.',
            subdomain,
            createdBy: admin._id
        });
        console.log(`Created active rule: "${rule.title}" (v${rule.version})`);

        // 3. Make sure Settings has currentVersion set to 1.0 and forceAcceptance active
        let settings = await Settings.findOne({ subdomain });
        if (!settings) {
            settings = await Settings.create({ subdomain });
        }
        settings.rulesConfiguration = {
            forceAcceptance: true,
            scrollValidation: true,
            allowPdfDownload: true,
            requireCheckbox: true,
            autoNotify: true,
            gracePeriodDays: 0,
            mobileAcceptance: true,
            currentVersion: '1.0'
        };
        settings.lastUpdated = Date.now();
        await settings.save();
        console.log('Verified settings for arun-tv');

        // 4. Reset all workers on arun-tv to acceptedRulesVersion: '0' to trigger acceptance
        const result = await Worker.updateMany(
            { subdomain },
            { acceptedRulesVersion: '0' }
        );
        console.log(`Reset ${result.modifiedCount} workers in arun-tv to acceptedRulesVersion: "0"`);

        console.log('\n✅ SEED COMPLETED successfully! If you log in as a worker under arun-tv, you will now see the rules acceptance gate.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
