require('dotenv').config();
const connectDB = require('./config/db');
const mongoose = require('mongoose');

async function fixAll() {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    const Ledger = db.collection('projectpaymentledgers');
    
    // Find all ledgers where adjustmentAmount is not 0
    const ledgers = await Ledger.find({ adjustmentAmount: { $ne: 0 } }).toArray();
    console.log(`Found ${ledgers.length} ledgers with adjustments.`);
    
    let updatedCount = 0;
    for (const ledger of ledgers) {
      await Ledger.updateOne(
        { _id: ledger._id },
        { 
          $set: { 
            paidAmount: ledger.currentEntitlement, 
            paidPerDayValue: ledger.currentPerDayValue, 
            adjustmentAmount: 0 
          } 
        }
      );
      updatedCount++;
    }
    
    console.log(`Successfully updated ${updatedCount} ledgers.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

fixAll();
