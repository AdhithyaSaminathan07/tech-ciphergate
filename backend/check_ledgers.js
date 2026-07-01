require('dotenv').config();
const connectDB = require('./config/db');
const mongoose = require('mongoose');

async function check() {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    const Ledger = db.collection('projectpaymentledgers');
    const Project = db.collection('salaryprojects');
    
    // Find all ledgers with non-zero adjustment amount
    const ledgers = await Ledger.find({ adjustmentAmount: { $ne: 0 } }).toArray();
    console.log('Ledgers with adjustments:', ledgers);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
