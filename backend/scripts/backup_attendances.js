const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function backupAttendances() {
  const result = {
    success: false,
    backupFile: null,
    totalDocuments: 0,
    indexes: [],
    verified: false,
    timestamp: new Date().toISOString()
  };

  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is missing from environment.');
    }

    const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    const db = conn.connection.db;
    const dbName = conn.connection.name;
    const collName = 'attendances';

    console.log(`[Backup] Connected to database: ${dbName}`);
    const coll = db.collection(collName);

    // 1. Fetch indexes
    const indexes = await coll.indexes();
    result.indexes = indexes;

    // 2. Fetch all documents
    const docs = await coll.find({}).toArray();
    result.totalDocuments = docs.length;

    // 3. Prepare backup directory
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `attendances_backup_${dateStamp}.json`;
    const backupFilePath = path.join(backupDir, backupFileName);

    const payload = {
      database: dbName,
      collection: collName,
      exportedAt: result.timestamp,
      count: docs.length,
      indexes: indexes,
      documents: docs
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    result.backupFile = backupFilePath;

    // 4. Verify restorable integrity
    const readBack = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
    if (readBack.count === docs.length && readBack.documents.length === docs.length) {
      result.verified = true;
      result.success = true;
      console.log(`[Backup] SUCCESS: ${docs.length} documents and ${indexes.length} indexes backed up to:`);
      console.log(`         ${backupFilePath}`);
    } else {
      throw new Error('Backup integrity verification failed: count mismatch.');
    }
  } catch (err) {
    console.error(`[Backup] FAILED: ${err.message}`);
    result.error = err.message;
  } finally {
    await mongoose.disconnect();
  }

  return result;
}

if (require.main === module) {
  backupAttendances().then(res => {
    if (!res.success) {
      process.exit(1);
    }
    process.exit(0);
  });
}

module.exports = backupAttendances;

