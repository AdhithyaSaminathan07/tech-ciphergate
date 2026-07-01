require('dotenv').config();
const connectDB = require('./config/db');
const mongoose = require('mongoose');

async function check() {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    const Worker = db.collection('workers');
    const worker = await Worker.findOne({ name: 'Infant Ansker A' });
    console.log('Worker:', worker._id);
    const ledgers = await db.collection('projectpaymentledgers').find({ employeeId: worker._id }).toArray();
    console.log('Ledgers:', ledgers);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
