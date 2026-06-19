/**
 * Phase 1 Production Hardening Migration Script
 * 
 * 1. Purge mock AwsResource records for placeholder account 123456789012
 * 2. Drop globally-unique resourceId index
 * 3. Create compound unique index { resourceId, awsAccountId }
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  console.log('[Migration] Connecting to database...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[Migration] Connected.\n');

  const db = mongoose.connection.db;
  const collection = db.collection('awsresources');

  // ── Step 1: Purge mock records ─────────────────────────────────────────────
  console.log('[Step 1] Purging AwsResource records for placeholder account 123456789012...');
  const deleteResult = await collection.deleteMany({ awsAccountId: '123456789012' });
  console.log(`[Step 1] Deleted ${deleteResult.deletedCount} mock AwsResource record(s).\n`);

  // Verify no other placeholder accounts remain
  const remaining = await collection.countDocuments({
    awsAccountId: { $in: ['123456789012', '000000000000', '111111111111', '111122223333'] }
  });
  console.log(`[Step 1] Remaining placeholder records: ${remaining} (expected: 0)\n`);

  // ── Step 2: Drop old global unique index on resourceId ─────────────────────
  console.log('[Step 2] Dropping old global unique index on resourceId...');
  try {
    const indexes = await collection.indexes();
    const oldIndex = indexes.find(idx => idx.key && idx.key.resourceId === 1 && !idx.key.awsAccountId);
    if (oldIndex) {
      await collection.dropIndex(oldIndex.name);
      console.log(`[Step 2] Dropped old index: ${oldIndex.name}\n`);
    } else {
      console.log('[Step 2] Old global unique index not found (may have already been changed).\n');
    }
  } catch (err) {
    console.warn(`[Step 2] Index drop warning: ${err.message}\n`);
  }

  // ── Step 3: Create compound unique index { resourceId, awsAccountId } ──────
  console.log('[Step 3] Creating compound unique index { resourceId: 1, awsAccountId: 1 }...');
  try {
    await collection.createIndex(
      { resourceId: 1, awsAccountId: 1 },
      { unique: true, name: 'resourceId_awsAccountId_unique' }
    );
    console.log('[Step 3] Compound unique index created successfully.\n');
  } catch (err) {
    if (err.code === 85 || err.code === 11000) {
      console.log('[Step 3] Index already exists with this specification.\n');
    } else {
      console.error(`[Step 3] Index creation error: ${err.message}\n`);
    }
  }

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('[Verify] Final index list on awsresources collection:');
  const finalIndexes = await collection.indexes();
  finalIndexes.forEach(idx => {
    console.log(`  • ${idx.name}: ${JSON.stringify(idx.key)} unique=${idx.unique || false}`);
  });

  const totalDocs = await collection.countDocuments();
  console.log(`\n[Verify] Total AwsResource documents remaining: ${totalDocs}`);

  await mongoose.disconnect();
  console.log('\n[Migration] Complete. ✅');
}

main().catch(err => {
  console.error('[Migration] Fatal error:', err.message);
  process.exit(1);
});
