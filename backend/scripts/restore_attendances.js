const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');

dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Dry-run or execute restoration from a backup file.
 * Defaults to dry-run unless --confirm-restore is passed.
 */
async function restoreAttendances(backupFilePath, execute = false) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist: ${backupFilePath}`);
  }

  const raw = fs.readFileSync(backupFilePath, 'utf-8');
  const backup = JSON.parse(raw);

  console.log(`[Restore] Backup metadata:`);
  console.log(`  Database:   ${backup.database}`);
  console.log(`  Collection: ${backup.collection}`);
  console.log(`  Exported:   ${backup.exportedAt}`);
  console.log(`  Count:      ${backup.count}`);

  if (!execute) {
    console.log(`[Restore] Dry run completed successfully. (Pass execute=true or --confirm-restore to apply).`);
    return { ok: true, dryRun: true, count: backup.count };
  }

  const conn = await mongoose.connect(process.env.MONGO_URI);
  const coll = conn.connection.db.collection(backup.collection);

  // Restore docs using bulk write / upsert
  let restored = 0;
  for (const doc of backup.documents) {
    const docBson = BSON.EJSON.deserialize(doc);
    await coll.replaceOne({ _id: docBson._id }, docBson, { upsert: true });
    restored++;
  }

  await mongoose.disconnect();
  console.log(`[Restore] Successfully restored ${restored} documents.`);
  return { ok: true, dryRun: false, restored };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.endsWith('.json'));
  const execute = args.includes('--confirm-restore');

  if (!fileArg) {
    const backupDir = path.join(__dirname, '../backups');
    const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter(f => f.endsWith('.json')) : [];
    if (files.length === 0) {
      console.error('No backup files found in backend/backups/');
      process.exit(1);
    }
    const latest = path.join(backupDir, files.sort().pop());
    console.log(`Using latest backup: ${latest}`);
    restoreAttendances(latest, execute)
      .then(() => process.exit(0))
      .catch(e => { console.error(e); process.exit(1); });
  } else {
    restoreAttendances(fileArg, execute)
      .then(() => process.exit(0))
      .catch(e => { console.error(e); process.exit(1); });
  }
}

module.exports = restoreAttendances;

