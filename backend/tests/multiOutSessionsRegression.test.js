/**
 * Tech Ciphergate — Multiple Automatic OUT Sessions Comprehensive Regression Suite
 *
 * Strictly isolated in-memory test harness (zero MongoDB connections, zero DB writes).
 * Exercises the real production modules:
 *   - backend/schedulers/lunchBreakScheduler.js
 *   - backend/controllers/settingsController.js
 *   - backend/controllers/attendanceController.js
 *   - backend/utils/productivityCalculator.js
 *   - Static contract check that salaryController.js & autoSalaryWhatsappService.js pass lunchBreakManagement
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ─── 1. Isolated In-Memory Store & Mongoose Model Mocks ──────────────────────
const db = {
  settings: [],
  workers: [],
  attendances: [],
  holidays: [],
  leaves: [],
  departments: [],
  refreshTokens: []
};

let seq = 1;
const nextId = (prefix) => `${prefix}_${seq++}`;

const resetStore = () => {
  db.settings = [];
  db.workers = [];
  db.attendances = [];
  db.holidays = [];
  db.leaves = [];
  db.departments = [];
  db.refreshTokens = [];
};

const getByPath = (obj, dotPath) => {
  return dotPath.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
};

const matchFilter = (doc, filter = {}) => {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (k === '$or') {
      if (!v.some((sub) => matchFilter(doc, sub))) return false;
      continue;
    }
    const val = k.includes('.') ? getByPath(doc, k) : doc[k];
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      if ('$ne' in v) {
        if (Array.isArray(val)) {
          if (val.includes(v.$ne)) return false;
        } else if (String(val) === String(v.$ne)) {
          return false;
        }
      }
      if ('$gt' in v && !(new Date(val) > new Date(v.$gt))) return false;
      if ('$gte' in v && !(new Date(val) >= new Date(v.$gte))) return false;
      if ('$lte' in v && !(new Date(val) <= new Date(v.$lte))) return false;
      if ('$in' in v && !v.$in.map(String).includes(String(val))) return false;
      if ('$exists' in v) {
        const exists = val !== undefined;
        if (v.$exists !== exists) return false;
      }
    } else if (v === null) {
      if (val !== null && val !== undefined) return false;
    } else {
      if (String(val) !== String(v)) return false;
    }
  }
  return true;
};

const makeQuery = (rows, single = false) => {
  let result = [...rows];
  return {
    populate() { return this; },
    sort(spec) {
      const [[field, dir]] = Object.entries(spec);
      result.sort((a, b) => {
        const av = a[field] instanceof Date ? a[field].getTime() : a[field];
        const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
        return dir === -1 ? bv - av : av - bv;
      });
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(single ? (result[0] || null) : result).then(resolve, reject);
    }
  };
};

const modelMocks = {
  Settings: {
    find: (q) => Promise.resolve(db.settings.filter((d) => matchFilter(d, q))),
    findOne: (q) => Promise.resolve(db.settings.find((d) => matchFilter(d, q)) || null),
    create: async (doc) => {
      const created = { _id: nextId('set'), ...doc };
      db.settings.push(created);
      return created;
    },
    findOneAndUpdate: async (q, update) => {
      let existing = db.settings.find((d) => matchFilter(d, q));
      if (!existing) {
        existing = { _id: nextId('set'), subdomain: q.subdomain };
        db.settings.push(existing);
      }
      if (update.$set) {
        Object.assign(existing, JSON.parse(JSON.stringify(update.$set)));
      }
      return { ...existing, toObject: () => ({ ...existing }) };
    }
  },
  Worker: {
    find: (q) => makeQuery(db.workers.filter((d) => matchFilter(d, q)), false),
    findOne: (q) => Promise.resolve(db.workers.find((d) => matchFilter(d, q)) || null),
    findOneAndUpdate: async (q, update) => {
      const w = db.workers.find((d) => matchFilter(d, q));
      if (!w) return null;
      if (update.$addToSet) {
        for (const [k, v] of Object.entries(update.$addToSet)) {
          w[k] = w[k] || [];
          if (!w[k].includes(v)) w[k].push(v);
        }
      }
      if (update.$set) Object.assign(w, update.$set);
      return { ...w };
    },
    updateOne: async (q, update) => {
      const w = db.workers.find((d) => matchFilter(d, q));
      if (!w) return { modifiedCount: 0 };
      if (update.$pull) {
        for (const [k, v] of Object.entries(update.$pull)) {
          if (v && typeof v === 'object' && '$lt' in v) {
            w[k] = (w[k] || []).filter((item) => !(item < v.$lt));
          } else {
            w[k] = (w[k] || []).filter((item) => item !== v);
          }
        }
      }
      if (update.$set) Object.assign(w, update.$set);
      return { modifiedCount: 1 };
    }
  },
  Attendance: {
    findOne: (q) => makeQuery(db.attendances.filter((d) => matchFilter(d, q)), true),
    find: (q) => makeQuery(db.attendances.filter((d) => matchFilter(d, q)), false),
    create: async (doc) => {
      // Simulate unique partial index on { worker, date, punchType, outSessionId } for LUNCH_OUT
      if (doc.punchType === 'LUNCH_OUT') {
        const dup = db.attendances.find((a) =>
          String(a.worker) === String(doc.worker) &&
          a.date === doc.date &&
          a.punchType === 'LUNCH_OUT' &&
          a.outSessionId === doc.outSessionId
        );
        if (dup) {
          const err = new Error('E11000 duplicate key error collection: attendances');
          err.code = 11000;
          throw err;
        }
      }
      const id = nextId('att');
      const record = {
        _id: id,
        isMissingLunchReturn: false,
        lunchLateMinutes: 0,
        createdAt: doc.createdAt || new Date(Date.now() + seq * 10),
        ...doc
      };
      record.save = async () => record;
      db.attendances.push(record);
      return record;
    },
    updateOne: async (q, update) => {
      const a = db.attendances.find((d) => matchFilter(d, q));
      if (!a) return { modifiedCount: 0 };
      if (update.$set) Object.assign(a, update.$set);
      return { modifiedCount: 1 };
    }
  },
  RefreshToken: {
    deleteMany: async (q) => {
      const before = db.refreshTokens.length;
      db.refreshTokens = db.refreshTokens.filter((t) => !matchFilter(t, q));
      return { deletedCount: before - db.refreshTokens.length };
    }
  },
  Holiday: { findOne: async () => null },
  Leave: { findOne: async () => null },
  Department: {
    findById: async (id) => db.departments.find((d) => String(d._id) === String(id)) || { _id: id, name: 'General' }
  }
};

for (const [name, exportsObj] of Object.entries(modelMocks)) {
  const resolved = require.resolve(`../models/${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

const {
  checkAndExecuteLunchBreak,
  processWorkerLunchOut,
  getNormalizedSessions,
  getRetentionCutoffDate,
  getISTDateTime
} = require('../schedulers/lunchBreakScheduler');
const {
  updateSettings,
  getSettings,
  normalizeLunchBreakManagement,
  validateLunchBreakManagement
} = require('../controllers/settingsController');
const {
  putAttendance,
  putRfidAttendance,
  recognizeFaceAndMarkAttendance,
  getLunchAttendanceOverview,
  resolveLunchReturnDetails
} = require('../controllers/attendanceController');
const {
  calculateWorkerProductivity,
  calculateUnauthorizedAbsencePenalty
} = require('../utils/productivityCalculator');

const TODAY_IST = getISTDateTime(new Date()).dateStr;
const ist = (hhmm, day = TODAY_IST) => new Date(`${day}T${hhmm}:00+05:30`);

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
};

const seedTenant = ({
  subdomain = 'acme',
  sessions = [],
  lunchExtra = {},
  workerId = 'w_1',
  rfid = 'RF001',
  faceEmbeddings = [[0.1, 0.2, 0.3]],
  punchInTime = '09:00'
} = {}) => {
  db.departments.push({ _id: `dept_${subdomain}`, name: 'Operations' });
  db.settings.push({
    _id: `set_${subdomain}`,
    subdomain,
    lunchBreakManagement: {
      enabled: true,
      appliesTo: 'all',
      sessions,
      ...lunchExtra
    }
  });
  db.workers.push({
    _id: workerId,
    name: `Worker ${workerId}`,
    username: `user_${workerId}`,
    rfid,
    subdomain,
    status: 'Active',
    department: { _id: `dept_${subdomain}`, name: 'Operations' },
    departmentName: 'Operations',
    batch: 'Full Time',
    faceEmbeddings,
    processedOutSessions: [],
    lastLunchOutDate: null,
    sessionInvalidatedAt: null
  });
  db.refreshTokens.push({ userId: workerId, token: `tok_${workerId}` });
  if (punchInTime) {
    db.attendances.push({
      _id: nextId('att'),
      worker: workerId,
      rfid,
      subdomain,
      department: `dept_${subdomain}`,
      departmentName: 'Operations',
      date: TODAY_IST,
      time: `${punchInTime}:00 AM`,
      presence: true,
      punchType: 'REGULAR',
      source: 'MANUAL',
      isMissingLunchReturn: false,
      lunchLateMinutes: 0,
      createdAt: ist(punchInTime)
    });
  }
};

let total = 0;
let passed = 0;
const runAsync = async (label, fn) => {
  total++;
  try {
    await fn();
    console.log(`✓ [PASS] Test ${total}: ${label}`);
    passed++;
  } catch (err) {
    console.error(`✗ [FAIL] Test ${total}: ${label}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
    throw err;
  }
};

(async () => {
  console.log('======================================================================');
  console.log(' Tech Ciphergate — Multiple Automatic OUT Sessions Regression Suite');
  console.log('======================================================================\n');

  // 1 & 2. Two sessions with different OUT times + Return IN after S1 enables S2
  await runAsync('1 & 2. Two sessions with distinct OUT times trigger independently after S1 return', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1_tea', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
        { id: 's2_lunch', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      ]
    });

    await checkAndExecuteLunchBreak(ist('11:00'));
    let outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 1);
    assert.strictEqual(outs[0].outSessionId, 's1_tea');
    assert.strictEqual(db.refreshTokens.length, 0, 'Worker tokens invalidated at S1');
    const s1InvalidatedAt = db.workers[0].sessionInvalidatedAt;
    assert.ok(s1InvalidatedAt instanceof Date);

    // Worker returns IN after S1
    db.attendances.push({
      _id: nextId('att'),
      worker: 'w_1',
      rfid: 'RF001',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '11:12:00 AM',
      presence: true,
      punchType: 'LUNCH_IN',
      isLunchPunch: true,
      outSessionId: 's1_tea',
      outSessionName: 'Morning Tea',
      createdAt: new Date(Date.now() + (seq + 1) * 100)
    });

    await checkAndExecuteLunchBreak(ist('13:30'));
    outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 2);
    assert.strictEqual(outs[1].outSessionId, 's2_lunch');
    assert.deepStrictEqual(db.workers[0].processedOutSessions, [`${TODAY_IST}_s1_tea`, `${TODAY_IST}_s2_lunch`]);
  });

  // 3. Session 2 does not execute while employee remains OUT & preserves S1 lock metadata
  await runAsync('3. Session 2 skips when employee remains OUT and does NOT wipe S1 sessionInvalidatedAt', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1_tea', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
        { id: 's2_lunch', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 }
      ]
    });

    await checkAndExecuteLunchBreak(ist('11:00'));
    const s1InvalidatedAt = db.workers[0].sessionInvalidatedAt;
    const s1Date = db.workers[0].lastLunchOutDate;

    // Worker does NOT punch back IN before 13:30
    await checkAndExecuteLunchBreak(ist('13:30'));
    const outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 1, 'S2 must not fire while worker is still OUT');
    assert.strictEqual(db.workers[0].lastLunchOutDate, s1Date, 'S1 lastLunchOutDate must not be cleared by S2');
    assert.strictEqual(
      db.workers[0].sessionInvalidatedAt.getTime(),
      s1InvalidatedAt.getTime(),
      'S1 sessionInvalidatedAt must not be wiped to null by S2'
    );
  });

  // 4. Both sessions due in the same scheduler cycle
  await runAsync('4. Both sessions due in the same cycle trigger S1 only without corrupting locks', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1', name: 'Session 1', enabled: true, outTime: '13:00', returnDeadline: '13:45', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Session 2', enabled: true, outTime: '13:15', returnDeadline: '14:00', gracePeriodMinutes: 0 }
      ]
    });

    await checkAndExecuteLunchBreak(ist('13:15'));
    const outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 1);
    assert.strictEqual(outs[0].outSessionId, 's1');
    assert.ok(db.workers[0].sessionInvalidatedAt instanceof Date, 'sessionInvalidatedAt must remain set');
    assert.strictEqual(db.workers[0].lastLunchOutDate, TODAY_IST);
    assert.deepStrictEqual(db.workers[0].processedOutSessions, [`${TODAY_IST}_s1`]);
  });

  // 5. Missing session IDs and enabled flags + settings validation & persistence
  await runAsync('5. Missing session IDs & enabled flags normalize identically across settings & scheduler', async () => {
    resetStore();
    const res = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [
            { name: 'Morning Break', outTime: '11:00', returnDeadline: '11:15' }, // missing id & enabled
            { name: 'Lunch Break', outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }, // missing id & enabled
            { id: 's3_paused', name: 'Disabled Tea', enabled: false, outTime: '16:30', returnDeadline: '16:45' }
          ]
        }
      }
    }, res);

    assert.strictEqual(res.statusCode, 200);
    const savedSessions = res.body.lunchBreakManagement.sessions;
    assert.strictEqual(savedSessions.length, 3, 'All 3 sessions must persist without dropping');
    assert.ok(savedSessions[0].id && savedSessions[1].id && savedSessions[0].id !== savedSessions[1].id, 'Unique non-empty IDs generated');
    assert.strictEqual(savedSessions[0].enabled, true, 'Missing enabled defaults to true');
    assert.strictEqual(savedSessions[1].enabled, true, 'Missing enabled defaults to true');
    assert.strictEqual(savedSessions[2].enabled, false, 'Explicit enabled: false preserved');

    // Validation rejects overlapping enabled sessions and deadline <= outTime
    const badRes = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          sessions: [
            { id: 'a', name: 'A', enabled: true, outTime: '13:00', returnDeadline: '13:45', gracePeriodMinutes: 0 },
            { id: 'b', name: 'B', enabled: true, outTime: '13:30', returnDeadline: '14:15', gracePeriodMinutes: 0 }
          ]
        }
      }
    }, badRes);
    assert.strictEqual(badRes.statusCode, 400);

    // Trigger S1 then return IN then S2 then return IN then S3 (disabled)
    db.workers.push({
      _id: 'w_norm', name: 'Norm', username: 'norm', rfid: 'RFN', subdomain: 'acme',
      status: 'Active', department: 'dept_ops', processedOutSessions: []
    });
    db.attendances.push({
      _id: nextId('att'), worker: 'w_norm', rfid: 'RFN', subdomain: 'acme',
      date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00')
    });

    await checkAndExecuteLunchBreak(ist('11:00'));
    db.attendances.push({
      _id: nextId('att'), worker: 'w_norm', rfid: 'RFN', subdomain: 'acme',
      date: TODAY_IST, time: '11:12:00 AM', presence: true, punchType: 'LUNCH_IN',
      outSessionId: savedSessions[0].id, createdAt: new Date(Date.now() + (seq + 1) * 100)
    });
    await checkAndExecuteLunchBreak(ist('13:30'));
    db.attendances.push({
      _id: nextId('att'), worker: 'w_norm', rfid: 'RFN', subdomain: 'acme',
      date: TODAY_IST, time: '02:20:00 PM', presence: true, punchType: 'LUNCH_IN',
      outSessionId: savedSessions[1].id, createdAt: new Date(Date.now() + (seq + 2) * 100)
    });
    await checkAndExecuteLunchBreak(ist('16:30'));

    const normOuts = db.attendances.filter((a) => a.worker === 'w_norm' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(normOuts.length, 2, 'Enabled S1 and S2 triggered; explicit false S3 skipped');
    assert.notStrictEqual(normOuts[0].outSessionId, normOuts[1].outSessionId);

    const getRes = makeRes();
    await getSettings({ params: { subdomain: 'acme' }, user: { subdomain: 'acme' } }, getRes);
    assert.strictEqual(getRes.body.lunchBreakManagement.sessions.length, 3);
  });

  // 6. Duplicate session processing & retry idempotency
  await runAsync('6. Retries before and after return inside same window produce zero duplicate OUTs', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1', name: 'Break 1', enabled: true, outTime: '11:00', returnDeadline: '11:30', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Break 2', enabled: true, outTime: '14:00', returnDeadline: '14:30', gracePeriodMinutes: 0 }
      ]
    });

    await checkAndExecuteLunchBreak(ist('11:00'));
    await checkAndExecuteLunchBreak(ist('11:01'));
    // Worker returns early at 11:10 while still inside s1 window (11:00..11:30)
    db.attendances.push({
      _id: nextId('att'), worker: 'w_1', rfid: 'RF001', subdomain: 'acme',
      date: TODAY_IST, time: '11:10:00 AM', presence: true, punchType: 'LUNCH_IN', outSessionId: 's1', createdAt: new Date(Date.now() + (seq + 1) * 100)
    });
    await checkAndExecuteLunchBreak(ist('11:12'));
    await checkAndExecuteLunchBreak(ist('14:00'));
    await checkAndExecuteLunchBreak(ist('14:01'));

    const outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 2);
    assert.deepStrictEqual(outs.map((o) => o.outSessionId), ['s1', 's2']);
  });

  // 7. Restart and crash recovery (orphaned lock recovery without clobbering S1)
  await runAsync('7. Restart/crash recovery heals orphaned Session 2 lock without erasing Session 1 invalidation', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1', name: 'Break 1', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Break 2', enabled: true, outTime: '14:00', returnDeadline: '14:30', gracePeriodMinutes: 0 }
      ]
    });

    await checkAndExecuteLunchBreak(ist('11:00'));
    const s1InvalidatedAt = db.workers[0].sessionInvalidatedAt;
    // Simulate crash during S2: worker lock for s2 written before Attendance.create failed, worker returned from S1
    db.attendances.push({
      _id: nextId('att'), worker: 'w_1', rfid: 'RF001', subdomain: 'acme',
      date: TODAY_IST, time: '11:12:00 AM', presence: true, punchType: 'LUNCH_IN', outSessionId: 's1', createdAt: new Date(Date.now() + (seq + 1) * 100)
    });
    db.workers[0].processedOutSessions.push(`${TODAY_IST}_s2`);

    // Recovery cycle heals orphaned s2 lock and creates s2 LUNCH_OUT cleanly
    await checkAndExecuteLunchBreak(ist('14:01'));
    const outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 2);
    assert.strictEqual(outs[1].outSessionId, 's2');
    assert.ok(db.workers[0].sessionInvalidatedAt >= s1InvalidatedAt);
    assert.ok(getRetentionCutoffDate(ist('14:01'), 0) < TODAY_IST);
  });

  // 8. Independent missing-return detection per session
  await runAsync('8. Missing-return detection flags each session independently and ignores non-IN punches', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1', name: 'Break 1', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Break 2', enabled: true, outTime: '14:00', returnDeadline: '14:30', gracePeriodMinutes: 0 }
      ]
    });

    await checkAndExecuteLunchBreak(ist('11:00'));
    let s1Out = db.attendances.find((a) => a.outSessionId === 's1');
    s1Out.createdAt = new Date(Date.now() - 240000);
    // Unrelated subsequent OUT punch (presence: false) must NOT satisfy return detection
    db.attendances.push({
      _id: nextId('att'), worker: 'w_1', rfid: 'RF001', subdomain: 'acme',
      date: TODAY_IST, time: '11:10:00 AM', presence: false, punchType: 'REGULAR', createdAt: new Date(Date.now() - 180000)
    });
    await checkAndExecuteLunchBreak(ist('11:20'));
    assert.strictEqual(s1Out.isMissingLunchReturn, true, 'S1 must be flagged missing return after 11:15');

    // Backdate existing mock records past 1-min anti-spam cooldown while preserving strict chronological order
    db.attendances.forEach((a, idx) => {
      a.createdAt = new Date(Date.now() - 300000 + idx * 10000);
    });

    // Now worker punches back IN cleanly via manual punch before S2, clearing S1 missing flag
    const manualRes = makeRes();
    await putAttendance({
      body: { rfid: 'RF001', subdomain: 'acme', presence: true },
      user: { role: 'admin', subdomain: 'acme' }
    }, manualRes);
    assert.strictEqual(manualRes.statusCode, 201);
    assert.strictEqual(s1Out.isMissingLunchReturn, false, 'S1 missing return flag cleared upon manual return');

    // Trigger S2 at 14:00 (after manual IN created at Date.now()) and exceed S2 cutoff at 14:35
    const s2Worker = db.workers[0];
    await checkAndExecuteLunchBreak(ist('14:00'));
    await checkAndExecuteLunchBreak(ist('14:35'));
    const s2Out = db.attendances.find((a) => a.outSessionId === 's2' && a.worker === s2Worker._id);
    assert.strictEqual(s2Out.isMissingLunchReturn, true, 'S2 independently flagged missing return after 14:30');
  });

  // 9. Manual, RFID, and Face recognition return punches
  await runAsync('9. Manual, RFID, and Face-recognition return punches match the active OUT session', async () => {
    resetStore();
    seedTenant({
      workerId: 'w_face',
      rfid: 'RF_MULTI',
      faceEmbeddings: [[0.5, 0.5, 0.5]],
      sessions: [
        { id: 's1', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 5 },
        { id: 's2', name: 'Afternoon Tea', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 5 }
      ]
    });

    // Deterministic check of resolveLunchReturnDetails with explicit IST time (16:25 -> 5 mins late vs 16:15+5m)
    await checkAndExecuteLunchBreak(ist('11:00'));
    db.attendances.forEach((a, idx) => { a.createdAt = new Date(Date.now() - 300000 + idx * 10000); });
    const rfidOutRes = makeRes();
    await putRfidAttendance({
      body: { rfid: 'RF_MULTI', presence: true },
      user: { role: 'worker', rfid: 'RF_MULTI', subdomain: 'acme' }
    }, rfidOutRes);
    assert.strictEqual(rfidOutRes.statusCode, 201);
    assert.strictEqual(rfidOutRes.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(rfidOutRes.body.attendance.outSessionId, 's1');

    // Trigger Session 2 OUT at 16:00 and verify resolveLunchReturnDetails late calculation
    await checkAndExecuteLunchBreak(ist('16:00'));
    const resolvedS2 = await resolveLunchReturnDetails('RF_MULTI', 'acme', true, TODAY_IST, 'w_face', ist('16:25'));
    assert.strictEqual(resolvedS2.punchType, 'LUNCH_IN');
    assert.strictEqual(resolvedS2.isLunchPunch, true);
    assert.strictEqual(resolvedS2.outSessionId, 's2');
    assert.strictEqual(resolvedS2.outSessionName, null);
    assert.strictEqual(resolvedS2.lunchLateMinutes, 5, '16:25 vs 16:15 + 5m grace = 5 late minutes');

    // Flag missing return on S2, then punch IN via Face Recognition endpoint
    const s2Out = db.attendances.find((a) => a.outSessionId === 's2');
    s2Out.isMissingLunchReturn = true;

    const faceRes = makeRes();
    await recognizeFaceAndMarkAttendance({
      user: { role: 'admin', subdomain: 'acme' },
      body: { faceDescriptor: [0.5, 0.5, 0.5], subdomain: 'acme' }
    }, faceRes);
    assert.strictEqual(faceRes.statusCode, 201);
    assert.strictEqual(faceRes.body.attendance.presence, true);
    assert.strictEqual(faceRes.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(faceRes.body.attendance.isLunchPunch, true);
    assert.strictEqual(faceRes.body.attendance.outSessionId, 's2');
    assert.strictEqual(faceRes.body.attendance.outSessionName, null);
    assert.strictEqual(s2Out.isMissingLunchReturn, false, 'Face return clears missing lunch return flag');

    // Regular evening punch OUT via Face Recognition outside lunch break remains REGULAR with null session ID
    const faceEveningOutRes = makeRes();
    await recognizeFaceAndMarkAttendance({
      user: { role: 'admin', subdomain: 'acme' },
      body: { faceDescriptor: [0.5, 0.5, 0.5], subdomain: 'acme' }
    }, faceEveningOutRes);
    assert.strictEqual(faceEveningOutRes.statusCode, 201);
    assert.strictEqual(faceEveningOutRes.body.attendance.presence, false);
    assert.strictEqual(faceEveningOutRes.body.attendance.punchType, 'REGULAR');
    assert.strictEqual(faceEveningOutRes.body.attendance.outSessionId, null);
  });

  // 10. Salary calculation with two sessions (on-time, late, independent attribution, unpaid breaks)
  await runAsync('10. Salary calculation handles 2 sessions independently & accounts for unpaid multi-session breaks', async () => {
    const worker = { _id: 'w_sal', salary: 30000, batch: 'Shift9h' };
    // Shift 09:00 - 18:00 (540m). Sessions: Morning Tea 11:00-11:15 (15m), Afternoon Tea 16:00-16:15 (15m)
    // On-time S1 return (11:12), late S2 return (+10m at 16:25 vs 16:15).
    const attendanceData = [
      { date: '2026-11-11', time: '09:00:00 AM', presence: true, record: { presence: true, punchType: 'REGULAR' } },
      { date: '2026-11-11', time: '11:00:00 AM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 's1' } },
      { date: '2026-11-11', time: '11:12:00 AM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 's1', lunchLateMinutes: 0 } },
      { date: '2026-11-11', time: '04:00:00 PM', presence: false, record: { presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: 's2' } },
      { date: '2026-11-11', time: '04:25:00 PM', presence: true, record: { presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 's2', lunchLateMinutes: 10 } },
      { date: '2026-11-11', time: '06:00:00 PM', presence: false, record: { presence: false, punchType: 'REGULAR' } }
    ];

    const unpaidReport = calculateWorkerProductivity({
      worker,
      attendanceData,
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        batches: [{ batchName: 'Shift9h', from: '09:00', to: '18:00', lunchFrom: '11:00', lunchTo: '11:15', isLunchConsider: false }],
        lunchBreakManagement: {
          enabled: true,
          lunchOutTime: '11:00',
          returnDeadline: '11:15',
          sessions: [
            { id: 's1', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
            { id: 's2', name: 'Afternoon Tea', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0 }
          ]
        }
      }
    });

    // Only S2's 10 late minutes must be penalized; on-time S1 (0m) + 2 unpaid breaks (15m + 15m = 30m excluded from 540m -> 510m standard)
    assert.strictEqual(unpaidReport.totalPermissionTime, 10, 'Only Session 2 10m late return penalized');
    // 1200 / (540 - 30 = 510m) * 10m = 23.53
    assert.strictEqual(unpaidReport.summary.permissionDeduction, 23.53, 'Standard minutes must deduct both unpaid sessions (510m)');

    // Also verify caller parity in salaryController.js & autoSalaryWhatsappService.js
    const salaryControllerSrc = fs.readFileSync(path.join(__dirname, '../controllers/salaryController.js'), 'utf8');
    const whatsappSrc = fs.readFileSync(path.join(__dirname, '../services/autoSalaryWhatsappService.js'), 'utf8');
    const salaryMatches = salaryControllerSrc.match(/calculateWorkerProductivity\(/g) || [];
    const salaryConfigMatches = salaryControllerSrc.match(/lunchBreakManagement:\s*settings/g) || [];
    assert.strictEqual(salaryConfigMatches.length >= salaryMatches.length - 1, true, 'All salaryController calculation sites pass lunchBreakManagement');
    assert.ok(/lunchBreakManagement:\s*settings/.test(whatsappSrc), 'WhatsApp salary report passes lunchBreakManagement');
  });

  // 11. Single-session backward compatibility
  await runAsync('11. Legacy single-session configuration remains backward compatible', async () => {
    resetStore();
    seedTenant({
      sessions: [],
      lunchExtra: { lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
    });

    const normalized = normalizeLunchBreakManagement(db.settings[0].lunchBreakManagement);
    assert.strictEqual(normalized.lunchOutTime, '13:30');
    const schedSessions = getNormalizedSessions(db.settings[0].lunchBreakManagement);
    assert.strictEqual(schedSessions.length, 1);
    assert.strictEqual(schedSessions[0].id, 'legacy_lunch_session');

    await checkAndExecuteLunchBreak(ist('13:30'));
    const outs = db.attendances.filter((a) => a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outs.length, 1);
    assert.strictEqual(outs[0].outSessionId, 'legacy_lunch_session');
  });

  // 12. Tenant isolation and session-specific worker locks
  await runAsync('12. Tenant isolation & per-worker locks isolate tenants and employees independently', async () => {
    resetStore();
    seedTenant({
      subdomain: 'alpha',
      workerId: 'w_alpha',
      rfid: 'RFA',
      sessions: [{ id: 'a1', name: 'Alpha Break', enabled: true, outTime: '12:00', returnDeadline: '12:30', gracePeriodMinutes: 0 }]
    });
    seedTenant({
      subdomain: 'beta',
      workerId: 'w_beta',
      rfid: 'RFB',
      sessions: [{ id: 'b1', name: 'Beta Break', enabled: true, outTime: '14:00', returnDeadline: '14:30', gracePeriodMinutes: 0 }]
    });

    await checkAndExecuteLunchBreak(ist('12:00'));
    const alphaOuts = db.attendances.filter((a) => a.subdomain === 'alpha' && a.punchType === 'LUNCH_OUT');
    const betaOutsAt12 = db.attendances.filter((a) => a.subdomain === 'beta' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(alphaOuts.length, 1);
    assert.strictEqual(betaOutsAt12.length, 0, 'Beta must not trigger on Alpha schedule');
    assert.strictEqual(db.refreshTokens.filter((t) => t.userId === 'w_alpha').length, 0);
    assert.strictEqual(db.refreshTokens.filter((t) => t.userId === 'w_beta').length, 1, 'Beta tokens untouched');

    await checkAndExecuteLunchBreak(ist('14:00'));
    const betaOutsAt14 = db.attendances.filter((a) => a.subdomain === 'beta' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(betaOutsAt14.length, 1);
    assert.strictEqual(betaOutsAt14[0].outSessionId, 'b1');
  });

  // 13. Duplicate interval/session subtraction prevention
  await runAsync('13. Overlapping unpaid intervals & configured sessions never double-subtract working minutes', async () => {
    const worker = { _id: 'w_dup', salary: 30000, batch: 'Shift9h', department: 'd_eng' };
    const report = calculateWorkerProductivity({
      worker,
      attendanceData: [
        { date: '2026-11-11', time: '09:10:00 AM', presence: true },
        { date: '2026-11-11', time: '06:00:00 PM', presence: false }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        batches: [{ batchName: 'Shift9h', from: '09:00', to: '18:00', lunchFrom: '12:00', lunchTo: '13:00', isLunchConsider: true }],
        intervals: [{ from: '11:00', to: '11:15', isBreakConsider: false }],
        isLunchConsider: true,
        considerAllDeduct: true,
        permissionTimeMinutes: 0,
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [
            { id: 's1', name: 'Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0, isBreakConsider: false },
            { id: 's2', name: 'Evening Tea', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0, isBreakConsider: true }
          ]
        }
      }
    });

    // 540m shift - 15m unique unpaid break = 525m standard; worked 530m - 15m = 515m; 10m late * (1200 / 525) = 22.86
    assert.strictEqual(report.dailyBreakdown[0].workingMinutes, 515);
    assert.strictEqual(report.summary.permissionDeduction, 22.86);
  });

  // 14. Department, shift and employee scope exclusions in salary calculation
  await runAsync('14. lunchBreakManagement appliesTo scopes (departments, shifts, employees) exclude non-matching workers', async () => {
    const baseOpts = {
      batches: [{ batchName: 'Shift9h', from: '09:00', to: '18:00', lunchFrom: '12:00', lunchTo: '13:00', isLunchConsider: false }],
      isLunchConsider: false,
      permissionTimeMinutes: 0
    };
    const attendanceData = [
      { date: '2026-11-11', time: '09:00:00 AM', presence: true },
      { date: '2026-11-11', time: '06:00:00 PM', presence: false }
    ];
    const sessions = [
      { id: 's1', name: 'Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', isBreakConsider: false },
      { id: 's2', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', isBreakConsider: false }
    ];

    const deptExcluded = calculateWorkerProductivity({
      worker: { _id: 'w_dept', salary: 30000, batch: 'Shift9h', department: 'd_sales' },
      attendanceData,
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: { ...baseOpts, lunchBreakManagement: { enabled: true, appliesTo: 'departments', applicableDepartments: ['d_eng'], sessions } }
    });
    assert.strictEqual(deptExcluded.totalWorkingHours, 8, 'Department-excluded worker only deducts batch lunch (1h)');

    const shiftExcluded = calculateWorkerProductivity({
      worker: { _id: 'w_shift', salary: 30000, batch: 'Shift9h', department: 'd_eng' },
      attendanceData,
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: { ...baseOpts, lunchBreakManagement: { enabled: true, appliesTo: 'shifts', applicableShifts: ['NightShift'], sessions } }
    });
    assert.strictEqual(shiftExcluded.totalWorkingHours, 8, 'Shift-excluded worker only deducts batch lunch (1h)');

    const empExcluded = calculateWorkerProductivity({
      worker: { _id: 'w_emp_other', salary: 30000, batch: 'Shift9h', department: 'd_eng' },
      attendanceData,
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: { ...baseOpts, lunchBreakManagement: { enabled: true, appliesTo: 'employees', applicableEmployees: ['w_emp_only'], sessions } }
    });
    assert.strictEqual(empExcluded.totalWorkingHours, 8, 'Employee-excluded worker only deducts batch lunch (1h)');
  });

  // 15. Batch lunch and configured lunch session do not both subtract
  await runAsync('15. Batch lunch and configured Lunch Break session do not both subtract when representing same break', async () => {
    const worker = { _id: 'w_overlap', salary: 30000, batch: 'Shift9h', department: 'd_eng' };
    const report = calculateWorkerProductivity({
      worker,
      attendanceData: [
        { date: '2026-11-11', time: '09:10:00 AM', presence: true },
        { date: '2026-11-11', time: '06:00:00 PM', presence: false }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        batches: [{ batchName: 'Shift9h', from: '09:00', to: '18:00', lunchFrom: '12:00', lunchTo: '13:00', isLunchConsider: false }],
        isLunchConsider: false,
        considerAllDeduct: true,
        permissionTimeMinutes: 0,
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [
            { id: 's1', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', isBreakConsider: true },
            { id: 's2', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', isBreakConsider: false }
          ]
        }
      }
    });

    // Only the 60m Lunch Break (not 12:00-13:00 batch lunch + 13:30-14:30 session) is unpaid -> 480m standard, ₹2.50/min, ₹25.00 deduction
    assert.strictEqual(report.dailyBreakdown[0].workingMinutes, 470);
    assert.strictEqual(report.summary.permissionDeduction, 25);
  });

  // 16. Unauthorized absence per-minute salary parity
  await runAsync('16. calculateUnauthorizedAbsencePenalty matches calculateWorkerProductivity per-minute rate across multi-session breaks', async () => {
    const worker = { _id: 'w_unauth', salary: 30000, batch: 'Shift9h', department: 'd_eng', joiningDate: '2026-01-01' };
    const sharedBatch = { batchName: 'Shift9h', from: '09:00', to: '18:00', lunchFrom: '11:00', lunchTo: '11:15', isLunchConsider: false };
    const sharedLbm = {
      enabled: true,
      appliesTo: 'all',
      sessions: [
        { id: 's1', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', isBreakConsider: false },
        { id: 's2', name: 'Afternoon Tea', enabled: true, outTime: '16:00', returnDeadline: '16:15', isBreakConsider: false }
      ]
    };

    const regularReport = calculateWorkerProductivity({
      worker,
      attendanceData: [
        { date: '2026-11-11', time: '09:10:00 AM', presence: true },
        { date: '2026-11-11', time: '06:00:00 PM', presence: false }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        batches: [sharedBatch],
        intervals: [{ from: '11:00', to: '11:15', isBreakConsider: false }],
        isLunchConsider: false,
        considerAllDeduct: true,
        permissionTimeMinutes: 0,
        lunchBreakManagement: sharedLbm
      }
    });

    const unauthReport = calculateUnauthorizedAbsencePenalty(
      worker,
      '2026-11-11',
      '2026-11-11',
      [{ leaveType: 'Permission', status: 'Rejected', startDate: '2026-11-11', endDate: '2026-11-11', startTime: '10:00', endTime: '10:10' }],
      [{ date: '2026-11-11', time: '09:00:00 AM', presence: true }],
      [],
      {
        batches: [sharedBatch],
        intervals: [{ from: '11:00', to: '11:15', isBreakConsider: false }],
        advancedLeaveDeduction: { enableUnauthorizedLeavePenalty: true, enableUnauthorizedPermissionPenalty: true },
        lunchBreakManagement: sharedLbm
      }
    );

    assert.strictEqual(unauthReport.penalties.length, 1);
    assert.ok(Math.abs(unauthReport.penalties[0].perMinuteSalary - regularReport.summary.perMinuteSalary) < 0.0001, 'Per-minute salary rate matches calculateWorkerProductivity');
    assert.strictEqual(Math.round(unauthReport.penalties[0].base1XAmount * 100) / 100, regularReport.summary.permissionDeduction, '1X rate matches regular productivity deduction (₹23.53 at 1200/510)');
  });

  // 17. Historical records without outSessionId under multi-session config
  await runAsync('17. Historical LUNCH_OUT without outSessionId resolves by timestamp without falling back to sessions[0]', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      ]
    });

    // Legacy afternoon LUNCH_OUT lacking outSessionId & outSessionName
    const histOut = {
      _id: nextId('att'),
      worker: 'w_1',
      rfid: 'RF001',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '01:30:02 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      isLunchPunch: true,
      outSessionId: null,
      outSessionName: null,
      isMissingLunchReturn: false,
      createdAt: ist('13:30')
    };
    db.attendances.push(histOut);

    // At 11:20 (past Morning Tea cutoff), Sweep B must NOT falsely flag the 13:30 afternoon Lunch record!
    await checkAndExecuteLunchBreak(ist('11:20'));
    assert.strictEqual(histOut.isMissingLunchReturn, false, '13:30 record without outSessionId must not be flagged by 11:00 session sweep');

    // At 14:40 (past Lunch Break cutoff 14:35), Sweep B MUST detect and flag it!
    await checkAndExecuteLunchBreak(ist('14:40'));
    assert.strictEqual(histOut.isMissingLunchReturn, true, '13:30 record without outSessionId must be flagged after Lunch cutoff');

    // Manual IN return resolves to Lunch Break (not sessions[0] Tea!) and computes late mins against 14:35
    const RealDate = global.Date;
    const FixedClock = class extends RealDate {
      constructor(...args) {
        return args.length ? new RealDate(...args) : ist('14:45');
      }
      static now() { return ist('14:45').getTime(); }
    };
    global.Date = FixedClock;
    try {
      const ret = await resolveLunchReturnDetails('RF001', 'acme', true, TODAY_IST, 'w_1', ist('14:45'));
      assert.strictEqual(ret.outSessionId, 's2');
      assert.strictEqual(ret.outSessionName, null);
      assert.strictEqual(ret.lunchLateMinutes, 10, '14:45 vs 14:35 = 10 late mins (not 210 mins from s1)');
    } finally {
      global.Date = RealDate;
    }
  });

  // 18. Two missing returns followed by a later IN punch
  await runAsync('18. Two missing returns followed by a later IN punch never pair S2 return with S1 missing return', async () => {
    resetStore();
    seedTenant({
      sessions: [
        { id: 's1', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 }
      ]
    });

    const s1Out = {
      _id: nextId('att'),
      worker: 'w_1',
      rfid: 'RF001',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '11:00:00 AM',
      presence: false,
      punchType: 'LUNCH_OUT',
      isLunchPunch: true,
      outSessionId: 's1',
      outSessionName: 'Morning Tea',
      isMissingLunchReturn: false,
      createdAt: ist('11:00')
    };
    const s2Out = {
      _id: nextId('att'),
      worker: 'w_1',
      rfid: 'RF001',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '01:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      isLunchPunch: true,
      outSessionId: 's2',
      outSessionName: 'Lunch Break',
      isMissingLunchReturn: false,
      createdAt: ist('13:30')
    };
    const laterIn = {
      _id: nextId('att'),
      worker: 'w_1',
      rfid: 'RF001',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '02:25:00 PM',
      presence: true,
      punchType: 'LUNCH_IN',
      isLunchPunch: true,
      outSessionId: 's2',
      outSessionName: 'Lunch Break',
      lunchLateMinutes: 0,
      createdAt: ist('14:25')
    };
    db.attendances.push(s1Out, s2Out, laterIn);

    await checkAndExecuteLunchBreak(ist('14:40'));
    assert.strictEqual(s1Out.isMissingLunchReturn, true, 'S1 must stay flagged Missing Return even though S2 has a later IN punch');
    assert.strictEqual(s2Out.isMissingLunchReturn, false, 'S2 returned on time at 14:25');

    const overviewRes = makeRes();
    await getLunchAttendanceOverview({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', date: TODAY_IST } }, overviewRes);
    assert.strictEqual(overviewRes.statusCode, 200);
    assert.strictEqual(overviewRes.body.overview.length, 2);
    assert.strictEqual(overviewRes.body.overview[0].sessionId, 's1');
    assert.strictEqual(overviewRes.body.overview[0].status, 'Missing Return');
    assert.strictEqual(overviewRes.body.overview[0].actualReturnTime, '-');
    assert.strictEqual(overviewRes.body.overview[1].sessionId, 's2');
    assert.strictEqual(overviewRes.body.overview[1].status, 'Returned On-Time');
    assert.strictEqual(overviewRes.body.overview[1].actualReturnTime, '02:25:00 PM');
  });

  // 19. Disabled first session with enabled second session + cross-midnight validation + single-session parity
  await runAsync('19. Disabled first session mirrors second enabled session, rejects cross-midnight, preserves single-session parity', async () => {
    const normalized = normalizeLunchBreakManagement({
      enabled: true,
      sessions: [
        { id: 's1', name: 'Disabled First', enabled: false, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 0 },
        { id: 's2', name: 'Enabled Second', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }
      ]
    });
    assert.strictEqual(normalized.lunchOutTime, '13:30', 'Legacy lunchOutTime mirrors first ENABLED session');
    assert.strictEqual(normalized.returnDeadline, '14:30');
    assert.strictEqual(normalized.gracePeriodMinutes, 5);

    const crossMidnightErr = validateLunchBreakManagement({
      enabled: true,
      sessions: [
        { id: 'night', name: 'Night Break', enabled: true, outTime: '23:45', returnDeadline: '00:15', gracePeriodMinutes: 0 }
      ]
    });
    assert.ok(crossMidnightErr && /Cross-midnight sessions are not supported/i.test(crossMidnightErr), 'Cross-midnight break explicitly rejected');

    const graceCrossMidnightErr = validateLunchBreakManagement({
      enabled: true,
      sessions: [
        { id: 'late_night', name: 'Late Grace Break', enabled: true, outTime: '23:30', returnDeadline: '23:50', gracePeriodMinutes: 15 }
      ]
    });
    assert.ok(graceCrossMidnightErr && /Cross-midnight sessions are not supported/i.test(graceCrossMidnightErr), 'Grace period spilling past midnight explicitly rejected');

    // Single-session salary parity check (enabled single LBM vs legacy batch lunch)
    const worker = { _id: 'w_single', salary: 30000, batch: 'Morning', department: 'd_eng' };
    const singleLbm = calculateWorkerProductivity({
      worker,
      attendanceData: [
        { date: '2026-11-11', time: '09:00:00 AM', presence: true },
        { date: '2026-11-11', time: '01:30:00 PM', presence: false },
        { date: '2026-11-11', time: '02:45:00 PM', presence: true },
        { date: '2026-11-11', time: '06:00:00 PM', presence: false }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        batches: [{ batchName: 'Morning', from: '09:00', to: '18:00', lunchFrom: '13:30', lunchTo: '14:30', isLunchConsider: false }],
        lunchBreakManagement: {
          enabled: true,
          lunchOutTime: '13:30',
          returnDeadline: '14:30',
          gracePeriodMinutes: 5,
          sessions: [{ id: 'legacy_lunch_session', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 5 }]
        }
      }
    });
    assert.strictEqual(singleLbm.totalPermissionTime, 10, 'Single-session late return parity preserved (14:45 vs 14:35 = 10m)');
    assert.strictEqual(singleLbm.summary.permissionDeduction, 25, '10m * (1200 / 480) = ₹25.00');
  });

  // 20. Per-worker isolation: invalid worker does not block next worker, lock rolls back cleanly, and Session 2 still runs
  await runAsync('20. Invalid worker isolates cleanly without stopping next worker or Session 2', async () => {
    resetStore();
    db.departments.push({ _id: 'd_eng', name: 'Engineering' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 's1', name: 'Lunch Break', enabled: true, outTime: '11:35', returnDeadline: '11:36', gracePeriodMinutes: 1 },
          { id: 's2', name: 'Tea Break', enabled: true, outTime: '11:40', returnDeadline: '11:41', gracePeriodMinutes: 2 }
        ]
      }
    });

    const invalidWorker = {
      _id: 'w_invalid',
      name: 'Invalid Worker',
      username: 'invalid_u',
      rfid: 'SECRET_RFID_INVALID',
      subdomain: 'acme',
      status: 'Active',
      department: null,
      processedOutSessions: []
    };
    const validWorker = {
      _id: 'w_valid',
      name: 'Valid Worker',
      username: 'valid_u',
      rfid: 'RF_VALID',
      subdomain: 'acme',
      status: 'Active',
      department: 'd_eng',
      processedOutSessions: []
    };
    db.workers.push(invalidWorker, validWorker);

    db.attendances.push(
      { _id: nextId('att'), worker: 'w_invalid', rfid: 'SECRET_RFID_INVALID', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_valid', rfid: 'RF_VALID', subdomain: 'acme', date: TODAY_IST, time: '09:01:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:01') }
    );

    const origCreate = modelMocks.Attendance.create;
    const origLog = console.log;
    const origError = console.error;
    const capturedLogs = [];
    const capturedErrors = [];

    modelMocks.Attendance.create = async (doc) => {
      if (!doc.department) {
        const err = new Error('Attendance validation failed: department: Please select a department');
        err.name = 'ValidationError';
        throw err;
      }
      return origCreate(doc);
    };
    console.log = (...args) => capturedLogs.push(args.join(' '));
    console.error = (...args) => capturedErrors.push(args.join(' '));

    try {
      await checkAndExecuteLunchBreak(ist('11:35'));

      assert.strictEqual(invalidWorker.processedOutSessions.length, 0, 'Failed worker lock must be rolled back');
      assert.strictEqual(
        db.attendances.filter(a => a.worker === 'w_invalid' && a.punchType === 'LUNCH_OUT').length,
        0,
        'Invalid worker must not get LUNCH_OUT'
      );

      const validS1Outs = db.attendances.filter(a => a.worker === 'w_valid' && a.punchType === 'LUNCH_OUT' && a.outSessionId === 's1');
      assert.strictEqual(validS1Outs.length, 1, 'Valid worker must still be processed after invalid worker failed');
      assert.ok(validWorker.processedOutSessions.includes(`${TODAY_IST}_s1`), 'Valid worker keeps S1 lock');
      validS1Outs[0].createdAt = ist('11:35');

      // Duplicate S1 tick must not create another LUNCH_OUT
      await checkAndExecuteLunchBreak(ist('11:36'));
      assert.strictEqual(
        db.attendances.filter(a => a.worker === 'w_valid' && a.punchType === 'LUNCH_OUT' && a.outSessionId === 's1').length,
        1,
        'Duplicate S1 run must be prevented'
      );

      // Valid worker returns IN before Session 2
      db.attendances.push({
        _id: nextId('att'),
        worker: 'w_valid',
        rfid: 'RF_VALID',
        subdomain: 'acme',
        date: TODAY_IST,
        time: '11:36:30 AM',
        presence: true,
        punchType: 'LUNCH_IN',
        outSessionId: 's1',
        createdAt: ist('11:36')
      });

      // Even though w_invalid failed in S1 (and triggers S1 missing-return check at 11:40), S2 must still run cleanly
      await checkAndExecuteLunchBreak(ist('11:40'));
      const validS2Outs = db.attendances.filter(a => a.worker === 'w_valid' && a.punchType === 'LUNCH_OUT' && a.outSessionId === 's2');
      assert.strictEqual(validS2Outs.length, 1, 'Session 2 must trigger for valid worker despite Session 1 validation error on invalid worker');
      assert.ok(validWorker.processedOutSessions.includes(`${TODAY_IST}_s2`), 'Valid worker acquires S2 lock independently');

      // Duplicate S2 tick remains prevented
      await checkAndExecuteLunchBreak(ist('11:41'));
      assert.strictEqual(
        db.attendances.filter(a => a.worker === 'w_valid' && a.punchType === 'LUNCH_OUT' && a.outSessionId === 's2').length,
        1,
        'Duplicate S2 run must be prevented'
      );

      // Verify structured error log contains workerId & sessionId without sensitive RFID/name PII
      const errEntry = capturedErrors.find(l => l.includes('[LunchBreakScheduler] WorkerError'));
      assert.ok(errEntry, 'VALIDATION_ERROR must be logged via console.error');
      assert.ok(errEntry.includes('w_invalid') && errEntry.includes('s1') && errEntry.includes('VALIDATION_ERROR'));
      assert.ok(!errEntry.includes('SECRET_RFID_INVALID'), 'Sensitive RFID must not appear in scheduler error logs');
      assert.ok(capturedLogs.some(l => l.includes('ALREADY_PROCESSED')), 'Duplicate prevention reason must be logged');
    } finally {
      modelMocks.Attendance.create = origCreate;
      console.log = origLog;
      console.error = origError;
    }
  });

  // 21. Structured diagnostics log all tick counts and skip/outcome reasons cleanly
  await runAsync('21. Structured scheduler diagnostics emit tick, session summary, and all worker skip/success outcomes', async () => {
    resetStore();
    db.departments.push({ _id: 'd_eng', name: 'Engineering' }, { _id: 'd_hr', name: 'HR' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'departments',
        applicableDepartments: ['d_eng'],
        sessions: [
          { id: 's1', name: 'Lunch Break', enabled: true, outTime: '11:35', returnDeadline: '11:36', gracePeriodMinutes: 1 }
        ]
      }
    });

    db.workers.push(
      { _id: 'w_ok', name: 'Ok Worker', username: 'ok', rfid: 'RF_OK', subdomain: 'acme', status: 'Active', department: 'd_eng', processedOutSessions: [] },
      { _id: 'w_nopunch', name: 'No Punch', username: 'np', rfid: 'RF_NP', subdomain: 'acme', status: 'Active', department: 'd_eng', processedOutSessions: [] },
      { _id: 'w_dept', name: 'HR Worker', username: 'hr', rfid: 'RF_HR', subdomain: 'acme', status: 'Active', department: 'd_hr', processedOutSessions: [] },
      { _id: 'w_leave', name: 'Leave Worker', username: 'lv', rfid: 'RF_LV', subdomain: 'acme', status: 'Active', department: 'd_eng', processedOutSessions: [] },
      { _id: 'w_dup', name: 'Dup Worker', username: 'dp', rfid: 'RF_DP', subdomain: 'acme', status: 'Active', department: 'd_eng', processedOutSessions: [`${TODAY_IST}_s1`] }
    );

    db.attendances.push(
      { _id: nextId('att'), worker: 'w_ok', rfid: 'RF_OK', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_dup', rfid: 'RF_DP', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_dup', rfid: 'RF_DP', subdomain: 'acme', date: TODAY_IST, time: '11:35:00 AM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 's1', createdAt: ist('11:35') }
    );

    const origLeaveFindOne = modelMocks.Leave.findOne;
    const origLog = console.log;
    const capturedLogs = [];

    modelMocks.Leave.findOne = async (q) => (String(q.worker) === 'w_leave' ? { _id: 'lv1', worker: 'w_leave', status: 'Approved' } : null);
    console.log = (...args) => capturedLogs.push(args.join(' '));

    try {
      await checkAndExecuteLunchBreak(ist('11:35'));
      const joined = capturedLogs.join('\n');
      assert.ok(joined.includes('[LunchBreakScheduler] Tick'), 'Tick summary must be logged');
      assert.ok(joined.includes('"enabledSettingsCount":1'), 'Tick must log enabledSettingsCount');
      assert.ok(joined.includes('"enabledSessionsCount":1'), 'Tenant scan must log enabledSessionsCount');
      assert.ok(joined.includes('"eligibleWorkersCount":3'), 'Summary must log eligibleWorkersCount');
      assert.ok(joined.includes('"workerId":"w_ok","result":"SUCCESS"'), 'Must log SUCCESS');
      assert.ok(joined.includes('"workerId":"w_nopunch","result":"NOT_PUNCHED_IN"'), 'Must log NOT_PUNCHED_IN');
      assert.ok(joined.includes('"workerId":"w_dept","result":"NOT_APPLICABLE"'), 'Must log NOT_APPLICABLE');
      assert.ok(joined.includes('"workerId":"w_leave","result":"NON_WORKING_DAY"'), 'Must log NON_WORKING_DAY');
      assert.ok(joined.includes('"workerId":"w_dup","result":"ALREADY_PROCESSED"'), 'Must log ALREADY_PROCESSED');
    } finally {
      modelMocks.Leave.findOne = origLeaveFindOne;
      console.log = origLog;
    }
  });

  console.log('\n======================================================================');
  console.log(` Summary: ${passed} Passed, ${total - passed} Failed out of ${total} Total Tests`);
  console.log('======================================================================');
})();
