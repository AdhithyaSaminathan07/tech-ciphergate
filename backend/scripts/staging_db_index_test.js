const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const assert = require('assert');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runStagingDbTests() {
  console.log('========================================================================');
  console.log('  Isolated Staging Database Index Test Suite (10 Mandatory Scenarios)  ');
  console.log('========================================================================\n');

  const conn = await mongoose.connect(process.env.MONGO_URI);
  const db = conn.connection.db;
  const testCollName = 'attendances_index_staging_test';

  // Ensure fresh isolated test collection
  try {
    await db.collection(testCollName).drop();
  } catch (e) {
    // collection may not exist yet
  }

  const coll = db.collection(testCollName);

  // Create the exact proposed index:
  // { worker: 1, date: 1, punchType: 1, outSessionId: 1 }
  // unique: true, partialFilterExpression: { punchType: 'LUNCH_OUT', outSessionId: { $type: 'string' } }
  console.log('Creating proposed session-aware unique partial index on test collection...');
  await coll.createIndex(
    { worker: 1, date: 1, punchType: 1, outSessionId: 1 },
    {
      name: 'worker_1_date_1_punchType_1_outSessionId_1',
      unique: true,
      partialFilterExpression: {
        punchType: 'LUNCH_OUT',
        outSessionId: { $type: 'string' }
      }
    }
  );

  const indexes = await coll.indexes();
  console.log('Test collection indexes:');
  console.log(JSON.stringify(indexes, null, 2));

  const workerA = new mongoose.Types.ObjectId();
  const workerB = new mongoose.Types.ObjectId();
  const dateToday = '2026-11-14';
  const dateTomorrow = '2026-11-15';

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`[PASS] Scenario ${total}: ${name}`);
    } catch (err) {
      console.error(`[FAIL] Scenario ${total}: ${name}`);
      console.error(`       Error: ${err.message}`);
    }
  }

  // 1. Same employee, same date, Morning OUT – succeeds
  await test('Same employee, same date, Morning OUT – succeeds', async () => {
    const res = await coll.insertOne({
      worker: workerA,
      date: dateToday,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_morning',
      presence: false,
      createdAt: new Date('2026-11-14T10:30:00Z')
    });
    assert(res.insertedId, 'Morning OUT was not inserted');
  });

  // 2. Same employee, same date, Lunch OUT – succeeds
  await test('Same employee, same date, Lunch OUT – succeeds', async () => {
    const res = await coll.insertOne({
      worker: workerA,
      date: dateToday,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_lunch',
      presence: false,
      createdAt: new Date('2026-11-14T13:00:00Z')
    });
    assert(res.insertedId, 'Lunch OUT was not inserted');
  });

  // 3. Same employee, same date, Evening OUT – succeeds
  await test('Same employee, same date, Evening OUT – succeeds', async () => {
    const res = await coll.insertOne({
      worker: workerA,
      date: dateToday,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_evening',
      presence: false,
      createdAt: new Date('2026-11-14T16:00:00Z')
    });
    assert(res.insertedId, 'Evening OUT was not inserted');
  });

  // 4. Duplicate Morning OUT for the same session – rejected by database index
  await test('Duplicate Morning OUT for the same session – rejected by DB index', async () => {
    let duplicateRejected = false;
    let errorCode = null;
    try {
      await coll.insertOne({
        worker: workerA,
        date: dateToday,
        punchType: 'LUNCH_OUT',
        outSessionId: 'sess_morning',
        presence: false,
        createdAt: new Date('2026-11-14T10:31:00Z')
      });
    } catch (err) {
      duplicateRejected = true;
      errorCode = err.code;
    }
    assert(duplicateRejected, 'Duplicate Morning OUT was unexpectedly permitted!');
    assert.strictEqual(errorCode, 11000, `Expected E11000 duplicate key error, got ${errorCode}`);
  });

  // 5. Duplicate Lunch OUT for the same session – rejected by database index
  await test('Duplicate Lunch OUT for the same session – rejected by DB index', async () => {
    let duplicateRejected = false;
    let errorCode = null;
    try {
      await coll.insertOne({
        worker: workerA,
        date: dateToday,
        punchType: 'LUNCH_OUT',
        outSessionId: 'sess_lunch',
        presence: false,
        createdAt: new Date('2026-11-14T13:02:00Z')
      });
    } catch (err) {
      duplicateRejected = true;
      errorCode = err.code;
    }
    assert(duplicateRejected, 'Duplicate Lunch OUT was unexpectedly permitted!');
    assert.strictEqual(errorCode, 11000, `Expected E11000 duplicate key error, got ${errorCode}`);
  });

  // 6. Same employee, different dates – allowed
  await test('Same employee, different dates – allowed', async () => {
    const res = await coll.insertOne({
      worker: workerA,
      date: dateTomorrow,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_morning',
      presence: false,
      createdAt: new Date('2026-11-15T10:30:00Z')
    });
    assert(res.insertedId, 'OUT on different date was not inserted');
  });

  // 7. Different employees, same session – allowed
  await test('Different employees, same session – allowed', async () => {
    const res = await coll.insertOne({
      worker: workerB,
      date: dateToday,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_morning',
      presence: false,
      createdAt: new Date('2026-11-14T10:30:00Z')
    });
    assert(res.insertedId, 'Different employee for same session was not inserted');
  });

  // 8. Correct Break IN closes only its matching OUT
  await test('Correct Break IN closes only its matching OUT', async () => {
    // Insert matching IN for Morning
    const inRes = await coll.insertOne({
      worker: workerA,
      date: dateToday,
      punchType: 'LUNCH_IN',
      outSessionId: 'sess_morning',
      presence: true,
      createdAt: new Date('2026-11-14T10:45:00Z')
    });
    assert(inRes.insertedId, 'Morning IN was not inserted');

    // Query open sessions for workerA on dateToday:
    // A session is closed if there is an IN with matching outSessionId
    const dayPunches = await coll.find({ worker: workerA, date: dateToday }).sort({ createdAt: 1 }).toArray();
    const morningOut = dayPunches.find(p => p.punchType === 'LUNCH_OUT' && p.outSessionId === 'sess_morning');
    const morningIn = dayPunches.find(p => p.punchType === 'LUNCH_IN' && p.outSessionId === 'sess_morning');
    const lunchOut = dayPunches.find(p => p.punchType === 'LUNCH_OUT' && p.outSessionId === 'sess_lunch');
    const lunchIn = dayPunches.find(p => p.punchType === 'LUNCH_IN' && p.outSessionId === 'sess_lunch');

    assert(morningOut && morningIn, 'Morning session should have paired OUT and IN');
    assert(lunchOut && !lunchIn, 'Lunch session must remain OPEN and unclosed by Morning IN');
  });

  // 9. Concurrent scheduler execution does not generate duplicates
  await test('Concurrent scheduler execution does not generate duplicates', async () => {
    const concurrentSession = 'sess_concurrent';
    const attempts = await Promise.allSettled([
      coll.insertOne({
        worker: workerA,
        date: dateToday,
        punchType: 'LUNCH_OUT',
        outSessionId: concurrentSession,
        presence: false,
        createdAt: new Date()
      }),
      coll.insertOne({
        worker: workerA,
        date: dateToday,
        punchType: 'LUNCH_OUT',
        outSessionId: concurrentSession,
        presence: false,
        createdAt: new Date()
      }),
      coll.insertOne({
        worker: workerA,
        date: dateToday,
        punchType: 'LUNCH_OUT',
        outSessionId: concurrentSession,
        presence: false,
        createdAt: new Date()
      })
    ]);

    const successes = attempts.filter(a => a.status === 'fulfilled');
    const rejections = attempts.filter(a => a.status === 'rejected');

    assert.strictEqual(successes.length, 1, `Expected exactly 1 successful insert, got ${successes.length}`);
    assert.strictEqual(rejections.length, 2, `Expected 2 rejections, got ${rejections.length}`);
    for (const rej of rejections) {
      assert.strictEqual(rej.reason.code, 11000, 'Rejection should be E11000 duplicate key');
    }
  });

  // 10. Legacy attendance records without session IDs remain readable and non-conflicting
  await test('Legacy attendance records without session IDs remain readable and non-conflicting', async () => {
    const workerLegacy = new mongoose.Types.ObjectId();
    // Insert 2 legacy records without session IDs (or outSessionId: null / undefined)
    const leg1 = await coll.insertOne({
      worker: workerLegacy,
      date: '2026-11-01',
      punchType: 'LUNCH_OUT',
      outSessionId: null,
      presence: false,
      createdAt: new Date('2026-11-01T13:00:00Z')
    });
    const leg2 = await coll.insertOne({
      worker: workerLegacy,
      date: '2026-11-02',
      punchType: 'LUNCH_OUT',
      // omitted outSessionId
      presence: false,
      createdAt: new Date('2026-11-02T13:00:00Z')
    });

    assert(leg1.insertedId && leg2.insertedId, 'Legacy records should insert without index error');

    // Even another document with null outSessionId on the SAME date does not conflict because of partialFilterExpression
    const leg3 = await coll.insertOne({
      worker: workerLegacy,
      date: '2026-11-01',
      punchType: 'LUNCH_OUT',
      outSessionId: null,
      presence: false,
      createdAt: new Date('2026-11-01T16:00:00Z')
    });
    assert(leg3.insertedId, 'Second legacy record without string outSessionId does not conflict');

    const readBack = await coll.find({ worker: workerLegacy, punchType: 'LUNCH_OUT' }).toArray();
    assert.strictEqual(readBack.length, 3, 'All 3 legacy records are readable');
  });

  // Cleanup test collection
  await coll.drop();
  console.log('\n[Cleanup] Test collection dropped cleanly.');

  console.log(`\n========================================================================`);
  console.log(` Results: ${passed} / ${total} Scenarios Passed`);
  console.log(`========================================================================\n`);

  await mongoose.disconnect();
  return { passed, total };
}

if (require.main === module) {
  runStagingDbTests().then(res => {
    if (res.passed !== res.total) {
      process.exit(1);
    }
    process.exit(0);
  });
}

module.exports = runStagingDbTests;
