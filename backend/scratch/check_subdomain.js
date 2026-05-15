const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Attendance = require('../models/Attendance');

dotenv.config();

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find the 5 most recent attendance records to see their subdomain
        const recent = await Attendance.find({}).sort({ createdAt: -1 }).limit(5);
        
        console.log('\n--- Recent Attendance Records ---');
        recent.forEach(r => {
            console.log(`Worker: ${r.name} | Subdomain: ${r.subdomain} | Date: ${r.date}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
