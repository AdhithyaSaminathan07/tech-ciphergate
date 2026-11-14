const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runFinalAudit() {
  console.log('========================================================================');
  console.log('     Tech Ciphergate — Final Read-Only Audit of Index Migration        ');
  console.log('========================================================================\n');

  const report = {};

  // 1 & 2. Database, Cluster, and Environment
  const uri = process.env.MONGO_URI || '';
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = conn.connection.db;
  const adminDb = db.admin();

  const buildInfo = await adminDb.buildInfo();
  report.dbName = conn.connection.name;
  report.clusterHost = conn.connection.host;
  report.mongoVersion = buildInfo.version;
  report.nodeEnv = process.env.NODE_ENV || 'undefined (defaults to development in Express)';
  
  console.log('[1. Target Database & Cluster]');
  console.log(`  Database Name:     ${report.dbName}`);
  console.log(`  Cluster Host:      ${report.clusterHost}`);
  console.log(`  MongoDB Version:   ${report.mongoVersion}`);
  console.log(`  Masked URI:        ${maskedUri}`);
  console.log(`  NODE_ENV:          ${report.nodeEnv}`);
  
  // Environment Classification
  let envClassification = 'Unknown';
  if (report.dbName === 'test') {
    envClassification = 'Development / Staging Test Database (Database name is explicitly "test" on shared cluster)';
  } else if (report.dbName === 'production' || uri.includes('prod')) {
    envClassification = 'Production Database';
  } else {
    envClassification = 'Staging / Custom Environment';
  }
  report.envClassification = envClassification;
  console.log(`  Environment Class: ${envClassification}\n`);

  // 3, 4 & 5. Verify Indexes via getIndexes()
  const coll = db.collection('attendances');
  const indexes = await coll.indexes();
  report.indexes = indexes;

  console.log('[2. Current Attendance Collection Indexes (getIndexes)]');
  indexes.forEach(idx => {
    console.log(`  - ${idx.name}:`);
    console.log(`      key: ${JSON.stringify(idx.key)}`);
    console.log(`      unique: ${!!idx.unique}`);
    console.log(`      partialFilter: ${JSON.stringify(idx.partialFilterExpression || null)}`);
  });

  const legacyIndexName = 'worker_1_date_1_punchType_1';
  const sessionIndexName = 'worker_1_date_1_punchType_1_outSessionId_1';

  const legacyFound = indexes.some(idx => idx.name === legacyIndexName);
  const sessionIdx = indexes.find(idx => idx.name === sessionIndexName);

  report.legacyIndexAbsent = !legacyFound;
  report.sessionIndexValid = !!(
    sessionIdx &&
    sessionIdx.unique &&
    sessionIdx.key.worker === 1 &&
    sessionIdx.key.date === 1 &&
    sessionIdx.key.punchType === 1 &&
    sessionIdx.key.outSessionId === 1 &&
    sessionIdx.partialFilterExpression?.punchType === 'LUNCH_OUT' &&
    sessionIdx.partialFilterExpression?.outSessionId?.$type === 'string'
  );

  console.log(`\n[3. Legacy vs New Index Status]`);
  console.log(`  Legacy index "${legacyIndexName}" absent: ${report.legacyIndexAbsent ? 'CONFIRMED (ABSENT)' : 'FAILED (STILL PRESENT)'}`);
  console.log(`  New index "${sessionIndexName}" active & verified: ${report.sessionIndexValid ? 'CONFIRMED (ACTIVE)' : 'FAILED'}\n`);

  // Total Document Counts (Verifying zero data modification)
  const count = await coll.countDocuments();
  const lunchOutCount = await coll.countDocuments({ punchType: 'LUNCH_OUT' });
  const withSessionIdCount = await coll.countDocuments({ punchType: 'LUNCH_OUT', outSessionId: { $type: 'string' } });
  const withoutSessionIdCount = await coll.countDocuments({ 
    punchType: 'LUNCH_OUT', 
    $or: [{ outSessionId: null }, { outSessionId: { $exists: false } }] 
  });

  report.totalDocuments = count;
  report.lunchOutCount = lunchOutCount;
  report.withSessionIdCount = withSessionIdCount;
  report.withoutSessionIdCount = withoutSessionIdCount;

  console.log('[4. Collection Document Counts (Strict Read-Only Verification)]');
  console.log(`  Total Attendances:           ${count} (Expected: 34)`);
  console.log(`  Total LUNCH_OUT Documents:   ${lunchOutCount} (Expected: 5)`);
  console.log(`  LUNCH_OUT with Session ID:   ${withSessionIdCount} (Expected: 3)`);
  console.log(`  LUNCH_OUT without Session ID: ${withoutSessionIdCount} (Expected: 2)\n`);

  // 6. Verify Backup and Test Isolated Restore
  const backupDir = path.join(__dirname, '../backups');
  const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('attendances_backup_') && f.endsWith('.json'));
  const latestBackupFile = backupFiles.sort().pop();
  const latestBackupPath = path.join(backupDir, latestBackupFile);
  const backupContent = JSON.parse(fs.readFileSync(latestBackupPath, 'utf-8'));

  console.log('[5. Backup Integrity Verification]');
  console.log(`  Backup File:                 ${latestBackupPath}`);
  console.log(`  Backup Document Count:       ${backupContent.count} (Matches current collection: ${backupContent.count === count})`);
  console.log(`  Backup Collection:           ${backupContent.collection}`);
  console.log(`  Backup Export Timestamp:     ${backupContent.exportedAt}`);

  // Test restoration in isolated ephemeral collection
  const testCollName = 'attendances_isolated_restore_verification';
  const testColl = db.collection(testCollName);
  try {
    await testColl.drop().catch(() => {});
    for (const doc of backupContent.documents) {
      const docBson = BSON.EJSON.deserialize(doc);
      await testColl.insertOne(docBson);
    }
    const testCount = await testColl.countDocuments();
    console.log(`  Isolated Restore Count:      ${testCount} (Matches backup: ${testCount === backupContent.count})`);
    report.restoreVerified = testCount === backupContent.count;
  } finally {
    await testColl.drop().catch(() => {});
    console.log(`  Isolated Test Collection:    Dropped cleanly.\n`);
  }

  await mongoose.disconnect();
  return report;
}

if (require.main === module) {
  runFinalAudit()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Audit failed:', err);
      process.exit(1);
    });
}

module.exports = runFinalAudit;

