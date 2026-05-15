const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Attendance = require('../models/Attendance');

dotenv.config();

async function findAllNames() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find all unique names in arun-tv subdomain
        const names = await Attendance.distinct('name', { subdomain: 'arun-tv' });
        
        console.log('\n--- Unique Names in arun-tv Subdomain ---');
        console.log(names);
        
        // Let's also check if there are any records with NO subdomain that might be leaking in
        const noSubdomain = await Attendance.find({ subdomain: { $exists: false } }).limit(5);
        if (noSubdomain.length > 0) {
            console.log('\n--- Records with NO subdomain (Possible leak) ---');
            noSubdomain.forEach(r => console.log(`Name: ${r.name}`));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findAllNames();
