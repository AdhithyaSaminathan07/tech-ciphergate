const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function listDbs() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    const admin = conn.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log('--- Databases on this MongoDB Atlas Cluster ---');
    dbs.databases.forEach(d => {
      console.log(` - Name: "${d.name}", SizeOnDisk: ${(d.sizeOnDisk / 1024 / 1024).toFixed(2)} MB, Empty: ${d.empty}`);
    });
  } catch (err) {
    console.error('Error listing databases:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
listDbs();

