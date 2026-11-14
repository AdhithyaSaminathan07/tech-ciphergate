const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    const coll = conn.connection.db.collection('attendances');
    const docs = await coll.find({ punchType: 'LUNCH_OUT' }).toArray();
    console.log('--- LUNCH_OUT docs ---');
    docs.forEach(d => {
      console.log({
        _id: d._id,
        worker: d.worker,
        date: d.date,
        punchType: d.punchType,
        outSessionId: d.outSessionId,
        outSessionName: d.outSessionName,
        createdAt: d.createdAt
      });
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();

