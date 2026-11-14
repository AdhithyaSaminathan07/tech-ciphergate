const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyDuplicates() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    const coll = conn.connection.db.collection('attendances');

    console.log('--- Duplicate Check Analysis ---');

    // 1. Proposed rule duplicates:
    const duplicates = await coll.aggregate([
      { 
        $match: { 
          punchType: 'LUNCH_OUT', 
          outSessionId: { $type: 'string' } 
        } 
      },
      {
        $group: {
          _id: {
            worker: '$worker',
            date: '$date',
            punchType: '$punchType',
            outSessionId: '$outSessionId'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log('Duplicates under proposed partial rule ({ punchType: "LUNCH_OUT", outSessionId: { $type: "string" } }):', duplicates.length);

    // 2. Historical records check:
    const historicalDocs = await coll.find({
      punchType: 'LUNCH_OUT',
      $or: [
        { outSessionId: null },
        { outSessionId: { $exists: false } },
        { outSessionId: { $not: { $type: 'string' } } }
      ]
    }).toArray();

    console.log('Historical LUNCH_OUT records without valid string outSessionId:', historicalDocs.length);
    historicalDocs.forEach(h => {
      console.log(` - ID: ${h._id}, Worker: ${h.worker}, Date: ${h.date}, outSessionId: ${h.outSessionId}`);
    });

    // 3. Check if any duplicate historical records exist for same worker + date:
    const historicalDuplicates = await coll.aggregate([
      {
        $match: {
          punchType: 'LUNCH_OUT',
          $or: [
            { outSessionId: null },
            { outSessionId: { $exists: false } },
            { outSessionId: { $not: { $type: 'string' } } }
          ]
        }
      },
      {
        $group: {
          _id: { worker: '$worker', date: '$date' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log('Duplicate historical records for same worker & date:', historicalDuplicates.length);

  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
verifyDuplicates();

