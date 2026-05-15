const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Attendance = require('../models/Attendance');

dotenv.config();

async function checkAkash() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const records = await Attendance.find({ name: 'Akash', subdomain: 'arun-tv' }).sort({ date: -1 });
        
        console.log('\n--- Akash Attendance Records ---');
        records.forEach(r => {
            console.log(`Date: ${r.date} | Time: ${r.time} | Presence: ${r.presence}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkAkash();
