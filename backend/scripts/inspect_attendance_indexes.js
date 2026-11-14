const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000
    });
    const db = conn.connection.db;
    console.log('Database Name:', conn.connection.name);
    console.log('Host:', conn.connection.host);
    const collections = await db.listCollections().toArray();
    console.log('Collections count:', collections.length);
    const hasAttendances = collections.some(c => c.name === 'attendances');
    console.log('Has attendances collection:', hasAttendances);

    if (hasAttendances) {
      const coll = db.collection('attendances');
      const indexes = await coll.indexes();
      console.log('Current indexes on attendances:');
      console.log(JSON.stringify(indexes, null, 2));

      const totalDocs = await coll.countDocuments();
      const lunchOutDocs = await coll.countDocuments({ punchType: 'LUNCH_OUT' });
      const withSessionId = await coll.countDocuments({ punchType: 'LUNCH_OUT', outSessionId: { $ne: null } });
      const withoutSessionId = await coll.countDocuments({ 
        punchType: 'LUNCH_OUT', 
        $or: [{ outSessionId: null }, { outSessionId: { $exists: false } }] 
      });

      console.log('Total documents:', totalDocs);
      console.log('LUNCH_OUT documents:', lunchOutDocs);
      console.log('LUNCH_OUT with outSessionId:', withSessionId);
      console.log('LUNCH_OUT without outSessionId:', withoutSessionId);

      // Sample a document with outSessionId
      const sampleWith = await coll.findOne({ punchType: 'LUNCH_OUT', outSessionId: { $ne: null } });
      if (sampleWith) {
        console.log('Sample outSessionId:', sampleWith.outSessionId, 'typeof:', typeof sampleWith.outSessionId);
      }

      // Check for any duplicate records under proposed index:
      // { worker: 1, date: 1, punchType: 1, outSessionId: 1 } where punchType: 'LUNCH_OUT' and outSessionId is string
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

      console.log('Duplicates under proposed compound rule:', duplicates.length);
      if (duplicates.length > 0) {
        console.log('Duplicate details:', JSON.stringify(duplicates, null, 2));
      }
    }
  } catch (err) {
    console.error('Error connecting or querying:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();

