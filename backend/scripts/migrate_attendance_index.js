const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function migrateAttendanceIndexes() {
  console.log('========================================================================');
  console.log('  Tech Ciphergate — Safe Automatic OUT MongoDB Index Migration Script  ');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from environment.');
  }

  // 1. Verify target database and collection
  const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = conn.connection.db;
  const dbName = conn.connection.name;
  const collName = 'attendances';
  const coll = db.collection(collName);

  console.log(`[Step 1] Target verified: Database="${dbName}", Collection="${collName}"`);

  // 2. Confirm a recent restorable backup exists
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    throw new Error('ABORT: Backup directory does not exist. Run backup_attendances.js first.');
  }
  const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('attendances_backup_') && f.endsWith('.json'));
  if (backupFiles.length === 0) {
    throw new Error('ABORT: No restorable backup file found. Run backup_attendances.js first.');
  }
  const latestBackupPath = path.join(backupDir, backupFiles.sort().pop());
  const backupStats = fs.statSync(latestBackupPath);
  const backupAgeMinutes = (Date.now() - backupStats.mtimeMs) / (1000 * 60);
  console.log(`[Step 2] Backup verified: ${latestBackupPath} (${Math.round(backupAgeMinutes)} mins ago)`);
  if (backupAgeMinutes > 120) {
    throw new Error('ABORT: Latest backup is older than 2 hours. Run a fresh backup.');
  }

  // 3. Run read-only duplicate checks
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
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (duplicates.length > 0) {
    throw new Error(`ABORT: Found ${duplicates.length} duplicate records under proposed uniqueness rule!`);
  }
  console.log('[Step 3] Duplicate check passed: 0 duplicates found under proposed compound rule.');

  // Check current indexes
  let indexes = await coll.indexes();
  console.log('[Current Indexes on attendances]:');
  indexes.forEach(idx => {
    console.log(` - ${idx.name}: key=${JSON.stringify(idx.key)} unique=${!!idx.unique} partial=${JSON.stringify(idx.partialFilterExpression || null)}`);
  });

  const legacyIndexName = 'worker_1_date_1_punchType_1';
  const sessionIndexName = 'worker_1_date_1_punchType_1_outSessionId_1';

  // 4. Update/Create the session-aware index
  console.log('\n[Step 4] Ensuring session-aware unique index with partialFilterExpression { punchType: "LUNCH_OUT", outSessionId: { $type: "string" } }...');
  
  const existingSessionIdx = indexes.find(i => i.name === sessionIndexName);
  if (existingSessionIdx) {
    const existingFilter = existingSessionIdx.partialFilterExpression;
    const isStrictStringFilter = existingFilter?.punchType === 'LUNCH_OUT' && existingFilter?.outSessionId?.$type === 'string';
    if (!isStrictStringFilter) {
      console.log(`Re-creating "${sessionIndexName}" to include outSessionId: { $type: "string" } partial filter...`);
      await coll.dropIndex(sessionIndexName);
    }
  }

  await coll.createIndex(
    { worker: 1, date: 1, punchType: 1, outSessionId: 1 },
    {
      name: sessionIndexName,
      unique: true,
      partialFilterExpression: {
        punchType: 'LUNCH_OUT',
        outSessionId: { $type: 'string' }
      }
    }
  );

  // 5. Verify the new index exists and behaves correctly
  indexes = await coll.indexes();
  const verifiedSessionIdx = indexes.find(i => i.name === sessionIndexName);
  if (!verifiedSessionIdx || !verifiedSessionIdx.unique || verifiedSessionIdx.partialFilterExpression?.outSessionId?.$type !== 'string') {
    throw new Error('ABORT: Verification of new session-aware unique index failed.');
  }
  console.log(`[Step 5] New session-aware index "${sessionIndexName}" verified successfully.`);

  // 6. Only then remove the obsolete legacy unique index
  const hasLegacyIndex = indexes.some(i => i.name === legacyIndexName);
  if (hasLegacyIndex) {
    console.log(`\n[Step 6] Removing obsolete legacy unique index: "${legacyIndexName}"...`);
    await coll.dropIndex(legacyIndexName);
    console.log(`[Step 6] Legacy unique index "${legacyIndexName}" dropped successfully.`);
  } else {
    console.log(`[Step 6] Legacy index "${legacyIndexName}" was already absent.`);
  }

  // 7. Verify the final index list
  const finalIndexes = await coll.indexes();
  console.log('\n[Step 7] Final indexes on attendances:');
  finalIndexes.forEach(idx => {
    console.log(` - ${idx.name}: key=${JSON.stringify(idx.key)} unique=${!!idx.unique} partial=${JSON.stringify(idx.partialFilterExpression || null)}`);
  });

  const legacyStillExists = finalIndexes.some(i => i.name === legacyIndexName);
  const sessionIdxActive = finalIndexes.some(i => i.name === sessionIndexName && i.unique);

  if (legacyStillExists) {
    throw new Error('Migration verification error: Legacy index is still present!');
  }
  if (!sessionIdxActive) {
    throw new Error('Migration verification error: Session-aware index is missing!');
  }

  console.log('\n========================================================================');
  console.log(' Migration Completed Successfully: Zero Document Mutations, Full Uniqueness ');
  console.log('========================================================================\n');

  await mongoose.disconnect();
  return { success: true, finalIndexes };
}

if (require.main === module) {
  migrateAttendanceIndexes().then(() => process.exit(0)).catch(err => {
    console.error(`Migration error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = migrateAttendanceIndexes;

