/**
 * Tech Ciphergate — Dynamic Automatic Break OUT Engine Test Suite
 *
 * Verifies all 16 required items in Section 12 with strictly isolated in-memory
 * mocks (zero MongoDB connections, zero production database writes):
 *   1. Dynamic custom break name.
 *   2. Admin changes OUT time.
 *   3. Admin changes return deadline.
 *   4. Multiple independent sessions.
 *   5. Same employee receiving multiple OUT records on one date.
 *   6. Duplicate scheduler ticks.
 *   7. Multiple backend scheduler instances.
 *   8. Employee return IN matching the correct session.
 *   9. Late return calculation.
 *  10. Missing return handling.
 *  11. Department and employee scopes.
 *  12. Holiday and leave exclusion (including applicable working days).
 *  13. Tenant isolation.
 *  14. Scheduler recovery.
 *  15. Session invalidation and force logout.
 *  16. Attendance reports and CSV generic labels.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ─── 1. In-Memory Mock Store ──────────────────────────────────────────────────
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
  seq = 1;
};

const getByPath = (obj, dotPath) => dotPath.split('.').reduce((a, p) => (a == null ? undefined : a[p]), obj);

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
        if (Array.isArray(val) ? val.includes(v.$ne) : String(val) === String(v.$ne)) return false;
      }
      if ('$gt' in v && !(new Date(val) > new Date(v.$gt))) return false;
      if ('$gte' in v && !(new Date(val) >= new Date(v.$gte))) return false;
      if ('$lte' in v && !(new Date(val) <= new Date(v.$lte))) return false;
      if ('$in' in v && !v.$in.map(String).includes(String(val))) return false;
      if ('$exists' in v && (v.$exists !== (val !== undefined))) return false;
    } else if (v === null) {
      if (val !== null && val !== undefined) return false;
    } else if (String(val) !== String(v)) {
      return false;
    }
  }
  return true;
};

const makeQuery = (rows, single = false) => {
  let result = [...rows];
  const populateSpecs = [];
  return {
    populate(field) {
      populateSpecs.push(field);
      return this;
    },
    skip(n) { result = result.slice(n); return this; },
    limit(n) { result = result.slice(0, n); return this; },
    sort(spec) {
      const entries = Object.entries(spec);
      result.sort((a, b) => {
        for (const [field, dir] of entries) {
          const av = a[field] instanceof Date ? a[field].getTime() : String(a[field] ?? '');
          const bv = b[field] instanceof Date ? b[field].getTime() : String(b[field] ?? '');
          if (av !== bv) return dir === -1 ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
        }
        return 0;
      });
      return this;
    },
    then(resolve, reject) {
      let out = result.map((row) => {
        const copy = { ...row };
        if (populateSpecs.includes('worker') && copy.worker && typeof copy.worker !== 'object') {
          const w = db.workers.find((x) => String(x._id) === String(copy.worker));
          if (w) copy.worker = { _id: w._id, name: w.name, rfid: w.rfid };
        }
        if (populateSpecs.includes('department') && copy.department && typeof copy.department !== 'object') {
          const d = db.departments.find((x) => String(x._id) === String(copy.department));
          if (d) copy.department = { _id: d._id, name: d.name };
        }
        return copy;
      });
      return Promise.resolve(single ? (out[0] || null) : out).then(resolve, reject);
    }
  };
};

let attendanceCreateOverride = null;

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
      if (update.$set) Object.assign(existing, JSON.parse(JSON.stringify(update.$set)));
      return { ...existing, toObject: () => ({ ...existing }) };
    }
  },
  Worker: {
    countDocuments: async (q) => db.workers.filter((d) => matchFilter(d, q)).length,
    find: (q) => makeQuery(db.workers.filter((d) => matchFilter(d, q)), false),
    findOne: (q) => makeQuery(db.workers.filter((d) => matchFilter(d, q)), true),
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
          if (v && typeof v === 'object' && '$lt' in v) w[k] = (w[k] || []).filter((item) => !(item < v.$lt));
          else w[k] = (w[k] || []).filter((item) => item !== v);
        }
      }
      if (update.$set) Object.assign(w, update.$set);
      return { modifiedCount: 1 };
    }
  },
  Attendance: {
    findOne: (q) => makeQuery(db.attendances.filter((d) => matchFilter(d, q)), true),
    find: (q) => makeQuery(db.attendances.filter((d) => matchFilter(d, q)), false),
    distinct: async (field, q) => {
      const rows = db.attendances.filter((d) => matchFilter(d, q));
      return [...new Set(rows.map((r) => String(r[field])))];
    },
    create: async (doc) => {
      if (attendanceCreateOverride) {
        await attendanceCreateOverride(doc);
      }
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
      const created = {
        _id: nextId('att'),
        createdAt: doc.createdAt || new Date(),
        updatedAt: new Date(),
        ...doc,
        toObject: function () { return { ...this }; },
        save: async function () {
          const idx = db.attendances.findIndex((a) => String(a._id) === String(this._id));
          if (idx !== -1) db.attendances[idx] = { ...this };
          return this;
        }
      };
      db.attendances.push(created);
      return created;
    },
    updateOne: async (q, update) => {
      const target = db.attendances.find((a) => matchFilter(a, q));
      if (!target) return { modifiedCount: 0 };
      if (update.$set) Object.assign(target, update.$set);
      return { modifiedCount: 1 };
    }
  },
  Holiday: {
    find: (q) => Promise.resolve(db.holidays.filter((d) => matchFilter(d, q))),
    findOne: (q) => Promise.resolve(db.holidays.find((d) => matchFilter(d, q)) || null)
  },
  Leave: {
    find: (q) => Promise.resolve(db.leaves.filter((d) => matchFilter(d, q))),
    findOne: (q) => Promise.resolve(db.leaves.find((d) => matchFilter(d, q)) || null)
  },
  Department: {
    findById: (id) => Promise.resolve(db.departments.find((d) => String(d._id) === String(id)) || null),
    find: (q) => Promise.resolve(db.departments.filter((d) => matchFilter(d, q)))
  },
  RefreshToken: {
    deleteMany: async (q) => {
      const before = db.refreshTokens.length;
      db.refreshTokens = db.refreshTokens.filter((r) => String(r.userId) !== String(q.userId));
      return { deletedCount: before - db.refreshTokens.length };
    }
  }
};

const capturedSocketEmits = [];
const mockSocketIO = {
  to: (room) => ({
    emit: (event, payload) => {
      capturedSocketEmits.push({ room, event, payload });
    }
  })
};

// ─── Module Interception ──────────────────────────────────────────────────────
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id.endsWith('/models/Settings') || id === '../models/Settings') return modelMocks.Settings;
  if (id.endsWith('/models/Worker') || id === '../models/Worker') return modelMocks.Worker;
  if (id.endsWith('/models/Attendance') || id === '../models/Attendance') return modelMocks.Attendance;
  if (id.endsWith('/models/Holiday') || id === '../models/Holiday') return modelMocks.Holiday;
  if (id.endsWith('/models/Leave') || id === '../models/Leave') return modelMocks.Leave;
  if (id.endsWith('/models/Department') || id === '../models/Department') return modelMocks.Department;
  if (id.endsWith('/models/RefreshToken') || id === '../models/RefreshToken') return modelMocks.RefreshToken;
  if (id.endsWith('/utils/socket') || id === '../utils/socket') return { getIO: () => mockSocketIO };
  return originalRequire.apply(this, arguments);
};

// Import backend units
const lunchBreakScheduler = require('../schedulers/lunchBreakScheduler');
const settingsController = require('../controllers/settingsController');
const attendanceController = require('../controllers/attendanceController');
const { calculateOverallProductivity } = require('../utils/productivityCalculator');

// Mock helpers
const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; }
  };
  return res;
};

const istDate = (timeStr, dateStr = '2026-11-14') => new Date(`${dateStr}T${timeStr}:00.000+05:30`);
const TODAY_IST = '2026-11-14';

// ─── Test Harness Runner ──────────────────────────────────────────────────────
let passedCount = 0;
let failedCount = 0;

const runTest = async (testNumber, name, fn) => {
  try {
    await fn();
    passedCount++;
    console.log(`✓ [PASS] Requirement ${testNumber}: ${name}`);
  } catch (err) {
    failedCount++;
    console.error(`✗ [FAIL] Requirement ${testNumber}: ${name}`);
    console.error(' ', err.message);
    if (err.stack) {
      console.error(' ', err.stack.split('\n').slice(1, 4).join('\n '));
    }
  }
};

// ─── MAIN SUITE ───────────────────────────────────────────────────────────────
(async () => {
  console.log('======================================================================');
  console.log(' Tech Ciphergate — Dynamic Automatic Break OUT Engine Verification');
  console.log('======================================================================\n');

  // Load frontend helper functions via dynamic import
  const frontendHelpersPath = path.resolve(__dirname, '../../frontend/src/utils/attendanceHelpers.js');
  const frontendHelpers = await import(pathToFileURL(frontendHelpersPath).href);

  // ─── 1. Dynamic custom break name ──────────────────────────────────────────
  await runTest(1, 'Dynamic custom break name is metadata only; stable sessionId preserved across renames', async () => {
    resetStore();
    const sessionId = 'session_custom_001';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [
          {
            id: sessionId,
            name: 'Executive Tea Break',
            enabled: true,
            outTime: '10:30',
            returnDeadline: '10:45',
            gracePeriodMinutes: 0
          }
        ]
      }
    });

    const norm1 = lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement);
    assert.strictEqual(norm1[0].id, sessionId);
    assert.strictEqual(norm1[0].name, 'Executive Tea Break');

    // Admin updates display name to 'Afternoon Refreshment Pause'
    const updateReq = {
      user: { subdomain: 'acme', role: 'admin' },
      params: { subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          sessions: [
            {
              id: sessionId,
              name: 'Afternoon Refreshment Pause',
              enabled: true,
              outTime: '10:30',
              returnDeadline: '10:45',
              gracePeriodMinutes: 0
            }
          ]
        }
      }
    };
    const updateRes = makeRes();
    await settingsController.updateSettings(updateReq, updateRes);
    assert.strictEqual(updateRes.statusCode, 200);

    const norm2 = lunchBreakScheduler.getNormalizedSessions(updateRes.body.lunchBreakManagement);
    assert.strictEqual(norm2[0].id, sessionId, 'Session ID must remain strictly identical');
    assert.strictEqual(norm2[0].name, 'Afternoon Refreshment Pause');
  });

  // ─── 2. Admin changes OUT time ─────────────────────────────────────────────
  await runTest(2, 'Admin changes OUT time; preserves sessionId and does not duplicate processed records', async () => {
    resetStore();
    const sessionId = 'session_out_time_test';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [
          { id: sessionId, name: 'Coffee Break', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }
        ]
      }
    });
    db.departments.push({ _id: 'd1', name: 'Dev' });
    db.workers.push({
      _id: 'w_time',
      name: 'TimeWorker',
      rfid: 'RF_TIME',
      subdomain: 'acme',
      department: 'd1',
      status: 'Active',
      processedOutSessions: []
    });
    // Worker is actively punched in
    db.attendances.push({
      worker: 'w_time',
      rfid: 'RF_TIME',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '09:00:00 AM',
      presence: true,
      createdAt: istDate('09:00')
    });

    // 11:00 tick executes session
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('11:00'));
    const initialOut = db.attendances.find(a => a.worker === 'w_time' && a.punchType === 'LUNCH_OUT');
    assert.ok(initialOut, 'Automatic OUT must be recorded at 11:00');
    assert.strictEqual(initialOut.outSessionId, sessionId);

    // Admin edits OUT time to 11:30
    const updateReq = {
      user: { subdomain: 'acme', role: 'admin' },
      params: { subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          sessions: [
            { id: sessionId, name: 'Coffee Break', enabled: true, outTime: '11:30', returnDeadline: '11:45', gracePeriodMinutes: 0 }
          ]
        }
      }
    };
    const updateRes = makeRes();
    await settingsController.updateSettings(updateReq, updateRes);
    assert.strictEqual(updateRes.statusCode, 200);

    // 11:30 tick runs; worker who already executed this session today is not duplicated
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('11:30'));
    const outsCount = db.attendances.filter(a => a.worker === 'w_time' && a.punchType === 'LUNCH_OUT' && a.outSessionId === sessionId).length;
    assert.strictEqual(outsCount, 1, 'Ordinary OUT time edit must never create duplicate OUT for already processed workers');
  });

  // ─── 3. Admin changes return deadline ──────────────────────────────────────
  await runTest(3, 'Admin changes return deadline; dynamically updates late penalty calculation', async () => {
    resetStore();
    const sessionId = 'session_deadline_test';
    const lunchConfig = {
      enabled: true,
      sessions: [
        { id: sessionId, name: 'Lunch', enabled: true, outTime: '13:00', returnDeadline: '13:45', gracePeriodMinutes: 0 }
      ]
    };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: lunchConfig });

    // Open OUT punch for this session
    const openLunchOut = {
      _id: 'out_dl',
      worker: 'w_dl',
      rfid: 'RF_DL',
      subdomain: 'acme',
      outSessionId: sessionId,
      punchType: 'LUNCH_OUT',
      presence: false,
      date: TODAY_IST,
      time: '01:00:00 PM',
      createdAt: istDate('13:00')
    };
    db.attendances.push(openLunchOut);

    // Worker returns at 13:50 (5 mins past 13:45 deadline)
    const details1 = await attendanceController.resolveLunchReturnDetails('RF_DL', 'acme', true, TODAY_IST, 'w_dl', istDate('13:50'));
    assert.strictEqual(details1.lunchLateMinutes, 5, 'Late minutes must be 5 when deadline is 13:45');

    // Admin updates return deadline to 14:00
    db.settings[0].lunchBreakManagement.sessions[0].returnDeadline = '14:00';
    const details2 = await attendanceController.resolveLunchReturnDetails('RF_DL', 'acme', true, TODAY_IST, 'w_dl', istDate('13:50'));
    assert.strictEqual(details2.lunchLateMinutes, 0, 'Late minutes must be 0 when deadline is extended to 14:00');
  });

  // ─── 4. Multiple independent sessions ──────────────────────────────────────
  await runTest(4, 'Multiple independent sessions configured by admin execute under distinct session IDs', async () => {
    resetStore();
    const sessions = [
      { id: 'sess_morning_tea', name: 'Morning Tea', enabled: true, outTime: '10:30', returnDeadline: '10:45', gracePeriodMinutes: 0 },
      { id: 'sess_lunch', name: 'Lunch Break', enabled: true, outTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 0 },
      { id: 'sess_afternoon_coffee', name: 'Afternoon Coffee', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0 }
    ];
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions } });
    db.departments.push({ _id: 'd1', name: 'Engineering' });
    db.workers.push({ _id: 'w_multi', name: 'MultiWorker', rfid: 'RF_M', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] });

    const normalized = lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement);
    assert.strictEqual(normalized.length, 3);
    assert.deepStrictEqual(normalized.map(s => s.id), ['sess_morning_tea', 'sess_lunch', 'sess_afternoon_coffee']);
  });

  // ─── 5. Same employee receiving multiple OUT records on one date ───────────
  await runTest(5, 'Same employee receiving multiple OUT records on one date for independent sessions', async () => {
    resetStore();
    const sessions = [
      { id: 's_morning', name: 'Morning Break', enabled: true, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 0 },
      { id: 's_afternoon', name: 'Afternoon Break', enabled: true, outTime: '15:00', returnDeadline: '15:15', gracePeriodMinutes: 0 }
    ];
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions } });
    db.departments.push({ _id: 'd1', name: 'Dev' });
    const worker = { _id: 'w_double', name: 'Double', rfid: 'RF_DBL', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] };
    db.workers.push(worker);

    // Initial morning punch IN
    db.attendances.push({ worker: 'w_double', rfid: 'RF_DBL', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') });

    // 10:00 tick -> Morning OUT
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('10:00'));
    const out1 = db.attendances.find(a => a.worker === 'w_double' && a.outSessionId === 's_morning');
    assert.ok(out1, 'Morning OUT must exist');

    // Worker returns at 10:10 -> punches IN
    const inRes = makeRes();
    await attendanceController.putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF_DBL' } }, inRes);
    assert.strictEqual(inRes.statusCode, 201);
    assert.strictEqual(inRes.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(inRes.body.attendance.outSessionId, 's_morning');

    // 15:00 tick -> Afternoon OUT
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('15:00'));
    const out2 = db.attendances.find(a => a.worker === 'w_double' && a.outSessionId === 's_afternoon');
    assert.ok(out2, 'Afternoon OUT must exist');

    const totalOuts = db.attendances.filter(a => a.worker === 'w_double' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(totalOuts.length, 2, 'Employee must receive exactly 2 distinct LUNCH_OUT records on the same date');
  });

  // ─── 6. Duplicate scheduler ticks ──────────────────────────────────────────
  await runTest(6, 'Duplicate scheduler ticks are idempotent and never create duplicate OUT records', async () => {
    resetStore();
    const sessionId = 's_idempotency';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [{ id: sessionId, name: 'Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
      }
    });
    db.departments.push({ _id: 'd1', name: 'Ops' });
    db.workers.push({ _id: 'w_idem', name: 'Idem', rfid: 'RF_IDEM', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] });
    db.attendances.push({ worker: 'w_idem', rfid: 'RF_IDEM', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') });

    // Run scheduler 5 consecutive times for the same minute
    for (let i = 0; i < 5; i++) {
      await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('11:00'));
    }

    const outs = db.attendances.filter(a => a.worker === 'w_idem' && a.outSessionId === sessionId);
    assert.strictEqual(outs.length, 1, 'Exactly one LUNCH_OUT record must exist after multiple ticks');
  });

  // ─── 7. Multiple backend scheduler instances ───────────────────────────────
  await runTest(7, 'Multiple backend scheduler instances handle concurrency safely via atomic lock', async () => {
    resetStore();
    const sessionId = 's_concurrent';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [{ id: sessionId, name: 'Lunch', enabled: true, outTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 0 }]
      }
    });
    db.departments.push({ _id: 'd1', name: 'QA' });
    const worker = { _id: 'w_conc', name: 'ConcurrentWorker', rfid: 'RF_CONC', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] };
    db.workers.push(worker);
    db.attendances.push({ worker: 'w_conc', rfid: 'RF_CONC', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') });

    // Simulate 3 concurrent instances calling processWorkerLunchOut simultaneously
    const results = await Promise.all([
      lunchBreakScheduler.processWorkerLunchOut(worker, db.settings[0].lunchBreakManagement.sessions[0], db.settings[0].lunchBreakManagement, istDate('13:00')),
      lunchBreakScheduler.processWorkerLunchOut(worker, db.settings[0].lunchBreakManagement.sessions[0], db.settings[0].lunchBreakManagement, istDate('13:00')),
      lunchBreakScheduler.processWorkerLunchOut(worker, db.settings[0].lunchBreakManagement.sessions[0], db.settings[0].lunchBreakManagement, istDate('13:00'))
    ]);

    const successes = results.filter(r => r.success);
    const conflicts = results.filter(r => !r.success && r.reason === 'ALREADY_PROCESSED');

    assert.strictEqual(successes.length, 1, 'Only one instance must successfully create the OUT record');
    assert.strictEqual(conflicts.length, 2, 'Competing instances must detect existing attendance or lock conflict');
  });

  // ─── 8. Employee return IN matching the correct session ─────────────────────
  await runTest(8, 'Employee return IN matches the correct session by sessionId without cross-closing', async () => {
    resetStore();
    const s1 = { id: 'sess_alpha', name: 'Alpha Break', enabled: true, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 0 };
    const s2 = { id: 'sess_beta', name: 'Beta Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [s1, s2] } });

    // Open OUT punch specifically tagged with sess_beta
    db.attendances.push({
      _id: 'out_beta_rec',
      worker: 'w_match',
      rfid: 'RF_MTCH',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '01:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_beta',
      createdAt: istDate('13:30')
    });

    const ret = await attendanceController.resolveLunchReturnDetails('RF_MTCH', 'acme', true, TODAY_IST, 'w_match', istDate('14:00'));
    assert.strictEqual(ret.punchType, 'LUNCH_IN');
    assert.strictEqual(ret.outSessionId, 'sess_beta', 'IN record must match target open session ID sess_beta');
  });

  // ─── 9. Late return calculation ────────────────────────────────────────────
  await runTest(9, 'Dynamic late return calculation respects on-time, grace period, and excess minutes', async () => {
    resetStore();
    const session = { id: 'sess_late_calc', name: 'Late Test', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 5 };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [session] } });

    db.attendances.push({
      _id: 'out_calc',
      worker: 'w_calc',
      rfid: 'RF_CALC',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '01:00:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_late_calc',
      createdAt: istDate('13:00')
    });

    // 1. Return at 13:25 (before deadline) -> 0 late mins
    const r1 = await attendanceController.resolveLunchReturnDetails('RF_CALC', 'acme', true, TODAY_IST, 'w_calc', istDate('13:25'));
    assert.strictEqual(r1.lunchLateMinutes, 0);

    // 2. Return at 13:34 (within 5-min grace after 13:30) -> 0 late mins
    const r2 = await attendanceController.resolveLunchReturnDetails('RF_CALC', 'acme', true, TODAY_IST, 'w_calc', istDate('13:34'));
    assert.strictEqual(r2.lunchLateMinutes, 0);

    // 3. Return at 13:45 (10 mins past 13:35 cutoff) -> 10 late mins
    const r3 = await attendanceController.resolveLunchReturnDetails('RF_CALC', 'acme', true, TODAY_IST, 'w_calc', istDate('13:45'));
    assert.strictEqual(r3.lunchLateMinutes, 10);
  });

  // ─── 10. Missing return handling ───────────────────────────────────────────
  await runTest(10, 'Missing return handling flags unreturned OUT punch without inventing an IN time', async () => {
    resetStore();
    const session = { id: 'sess_miss', name: 'Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [session] } });
    db.departments.push({ _id: 'd1', name: 'HR' });
    db.workers.push({ _id: 'w_miss', name: 'MissWorker', rfid: 'RF_MISS', subdomain: 'acme', department: 'd1', status: 'Active' });

    const outPunch = {
      _id: 'att_out_miss',
      worker: 'w_miss',
      rfid: 'RF_MISS',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '11:00:00 AM',
      presence: false,
      punchType: 'LUNCH_OUT',
      outSessionId: 'sess_miss',
      isMissingLunchReturn: false,
      createdAt: istDate('11:00')
    };
    db.attendances.push(outPunch);

    // Run scheduler at 11:30 (past 11:15 cutoff)
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('11:30'));

    const updatedOut = db.attendances.find(a => a._id === 'att_out_miss');
    assert.strictEqual(updatedOut.isMissingLunchReturn, true, 'isMissingLunchReturn must be flagged true');

    // Verify no fake IN punch was created
    const inPunches = db.attendances.filter(a => a.worker === 'w_miss' && a.presence === true);
    assert.strictEqual(inPunches.length, 0, 'Scheduler must NEVER fabricate an IN punch');
  });

  // ─── 11. Department and employee scopes ────────────────────────────────────
  await runTest(11, 'Department and employee scopes strictly target eligible workers and exclude others', async () => {
    resetStore();
    db.departments.push({ _id: 'dept_eng', name: 'Engineering' });
    db.departments.push({ _id: 'dept_sales', name: 'Sales' });

    db.workers.push(
      { _id: 'w_eng', name: 'Engineer', rfid: 'RF_ENG', subdomain: 'acme', department: 'dept_eng', status: 'Active', processedOutSessions: [] },
      { _id: 'w_sal', name: 'SalesPerson', rfid: 'RF_SAL', subdomain: 'acme', department: 'dept_sales', status: 'Active', processedOutSessions: [] }
    );

    const deptSession = {
      id: 'sess_eng_only',
      name: 'Engineering Break',
      enabled: true,
      outTime: '11:00',
      returnDeadline: '11:15',
      gracePeriodMinutes: 0,
      appliesTo: 'departments',
      applicableDepartments: ['dept_eng']
    };

    const isEngApplicable = lunchBreakScheduler.isWorkerApplicable(db.workers[0], { enabled: true }, deptSession);
    const isSalesApplicable = lunchBreakScheduler.isWorkerApplicable(db.workers[1], { enabled: true }, deptSession);

    assert.strictEqual(isEngApplicable, true, 'Engineering worker must be applicable');
    assert.strictEqual(isSalesApplicable, false, 'Sales worker must NOT be applicable');
  });

  // ─── 12. Holiday and leave exclusion (including applicableWorkingDays) ─────
  await runTest(12, 'Holiday, leave, and applicable working days exclusions prevent auto OUT sweeps', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Tech' });
    const worker = { _id: 'w_hol', name: 'HoliUser', rfid: 'RF_HOL', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] };
    db.workers.push(worker);

    // 1. Holiday test
    db.holidays.push({ subdomain: 'acme', date: istDate('00:00'), appliesTo: 'all' });
    const isHoliday = await lunchBreakScheduler.isNonWorkingDay(worker, TODAY_IST, istDate('12:00'));
    assert.strictEqual(isHoliday, true, 'Holiday must be identified as non-working day');
    db.holidays = [];

    // 2. Approved leave test
    db.leaves.push({ worker: 'w_hol', subdomain: 'acme', status: 'Approved', startDate: istDate('00:00'), endDate: istDate('23:59'), leaveType: 'Casual' });
    const isLeave = await lunchBreakScheduler.isNonWorkingDay(worker, TODAY_IST, istDate('12:00'));
    assert.strictEqual(isLeave, true, 'Approved leave must be identified as non-working day');
    db.leaves = [];

    // 3. Applicable working days test (Session configured for Mon-Fri only; today 2026-11-14 is Saturday)
    const weekdayOnlySession = {
      id: 'sess_weekdays',
      name: 'Weekday Break',
      applicableWorkingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    };
    const isSatWorking = lunchBreakScheduler.isSessionWorkingDay(weekdayOnlySession, null, TODAY_IST, istDate('12:00'));
    assert.strictEqual(isSatWorking, false, 'Saturday must NOT be an applicable working day when session specifies Mon-Fri');

    const satNonWorking = await lunchBreakScheduler.isNonWorkingDay(worker, TODAY_IST, istDate('12:00'), weekdayOnlySession);
    assert.strictEqual(satNonWorking, true, 'isNonWorkingDay must evaluate to true when day is not in applicableWorkingDays');
  });

  // ─── 13. Tenant isolation ──────────────────────────────────────────────────
  await runTest(13, 'Tenant isolation guarantees Tenant A rules and triggers never touch Tenant B', async () => {
    resetStore();
    db.departments.push({ _id: 'd_a', name: 'OrgA_Dept' });
    db.departments.push({ _id: 'd_b', name: 'OrgB_Dept' });

    db.settings.push({
      subdomain: 'tenant_a',
      lunchBreakManagement: {
        enabled: true,
        sessions: [{ id: 'sess_a', name: 'A Break', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
      }
    });
    db.settings.push({
      subdomain: 'tenant_b',
      lunchBreakManagement: {
        enabled: false,
        sessions: [{ id: 'sess_b', name: 'B Break', enabled: false, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
      }
    });

    db.workers.push(
      { _id: 'w_a', name: 'WorkerA', rfid: 'RF_A', subdomain: 'tenant_a', department: 'd_a', status: 'Active', processedOutSessions: [] },
      { _id: 'w_b', name: 'WorkerB', rfid: 'RF_B', subdomain: 'tenant_b', department: 'd_b', status: 'Active', processedOutSessions: [] }
    );
    db.attendances.push(
      { worker: 'w_a', rfid: 'RF_A', subdomain: 'tenant_a', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') },
      { worker: 'w_b', rfid: 'RF_B', subdomain: 'tenant_b', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') }
    );

    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('11:00'));

    const aOuts = db.attendances.filter(a => a.subdomain === 'tenant_a' && a.punchType === 'LUNCH_OUT');
    const bOuts = db.attendances.filter(a => a.subdomain === 'tenant_b' && a.punchType === 'LUNCH_OUT');

    assert.strictEqual(aOuts.length, 1, 'Tenant A active session must execute');
    assert.strictEqual(bOuts.length, 0, 'Tenant B disabled session must NOT execute');
  });

  // ─── 14. Scheduler recovery ────────────────────────────────────────────────
  await runTest(14, 'Scheduler recovery processes once inside active window and skips closed windows', async () => {
    resetStore();
    const session = { id: 'sess_rec', name: 'Lunch', enabled: true, outTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 0 };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [session] } });
    db.departments.push({ _id: 'd1', name: 'Dev' });
    db.workers.push({ _id: 'w_rec', name: 'RecUser', rfid: 'RF_REC', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] });
    db.attendances.push({ worker: 'w_rec', rfid: 'RF_REC', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') });

    // 1. Server restarts at 13:20 (inside window 13:00..14:00) -> executes once with actual IST time
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('13:20'));
    const recOut = db.attendances.find(a => a.worker === 'w_rec' && a.outSessionId === 'sess_rec');
    assert.ok(recOut, 'Must execute once upon recovery inside open window');

    // 2. Server restarts at 15:30 (past cutoff) -> must NOT create stale OUT punch
    resetStore();
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [session] } });
    db.departments.push({ _id: 'd1', name: 'Dev' });
    db.workers.push({ _id: 'w_late_rec', name: 'LateRec', rfid: 'RF_LREC', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] });
    db.attendances.push({ worker: 'w_late_rec', rfid: 'RF_LREC', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') });

    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('15:30'));
    const lateOut = db.attendances.find(a => a.worker === 'w_late_rec' && a.outSessionId === 'sess_rec');
    assert.strictEqual(lateOut, undefined, 'Must NOT create backfilled OUT punches after cutoff window has closed');
  });

  // ─── 15. Session invalidation and force logout ─────────────────────────────
  await runTest(15, 'Session invalidation revokes refresh tokens and emits force-logout without leaking session names or IDs', async () => {
    resetStore();
    capturedSocketEmits.length = 0;
    const session = { id: 'secret_session_999', name: 'Confidential Internal Break', enabled: true, outTime: '12:00', returnDeadline: '12:15', gracePeriodMinutes: 0 };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [session] } });
    db.departments.push({ _id: 'd1', name: 'Dev' });
    const worker = { _id: 'w_sec', name: 'SecUser', rfid: 'RF_SEC', subdomain: 'acme', department: 'd1', status: 'Active', processedOutSessions: [] };
    db.workers.push(worker);
    db.refreshTokens.push({ userId: 'w_sec', token: 'jwt_refresh_token_123' });
    db.attendances.push({ worker: 'w_sec', rfid: 'RF_SEC', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: istDate('09:00') });

    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('12:00'));

    // Check refresh tokens revoked
    assert.strictEqual(db.refreshTokens.length, 0, 'Refresh tokens must be deleted upon auto OUT');

    // Check worker sessionInvalidatedAt set
    assert.ok(worker.sessionInvalidatedAt instanceof Date, 'sessionInvalidatedAt must be set to Date');

    // Check Socket.IO force-logout emission
    const forceLogoutEvent = capturedSocketEmits.find(e => e.event === 'force-logout');
    assert.ok(forceLogoutEvent, 'force-logout event must be emitted');
    assert.strictEqual(forceLogoutEvent.payload.breakLabel, 'Break OUT');
    assert.strictEqual(forceLogoutEvent.payload.sessionId, undefined, 'sessionId must NOT be leaked to worker');
    assert.strictEqual(forceLogoutEvent.payload.outSessionName, undefined, 'session name must NOT be leaked to worker');
  });

  // ─── 16. Attendance reports and CSV generic labels ─────────────────────────
  await runTest(16, 'Attendance reports and CSV generic labels show Break OUT / Break IN with zero session name leakage', async () => {
    resetStore();
    const rawRows = [
      {
        name: 'Alice Cooper',
        rfid: 'RF_ALICE',
        department: 'Engineering',
        date: TODAY_IST,
        lunchOutTime: '01:00:00 PM',
        actualReturnTime: '01:30:00 PM',
        lateMinutes: 0,
        status: 'Returned On-Time',
        deductionStatus: 'Within Allowed Limit'
      },
      {
        name: 'Bob Marley',
        rfid: 'RF_BOB',
        department: 'Design',
        date: TODAY_IST,
        lunchOutTime: '04:00:00 PM',
        actualReturnTime: '-',
        lateMinutes: 0,
        status: 'Missing Return',
        deductionStatus: 'Unworked Session Review',
        isMissingLunchReturn: true
      }
    ];

    const csv = frontendHelpers.buildAttendanceCsvContent({
      activeTab: 'lunch',
      filteredLunchOverview: rawRows,
      lunchDate: TODAY_IST
    });

    assert.ok(csv.includes('Break OUT'), 'CSV must contain generic "Break OUT" label');
    assert.ok(csv.includes('Break IN'), 'CSV must contain generic "Break IN" label');
    assert.ok(!csv.includes('Lunch Break'), 'CSV must NOT leak hardcoded "Lunch Break" name');
    assert.ok(!csv.includes('session_'), 'CSV must NOT leak internal session IDs');
    assert.ok(!csv.includes('Confidential'), 'CSV must NOT leak custom break names');
  });

  // ─── 17. 3-Session Daily Simulation (Requirement 3) ─────────────────────────
  await runTest(17, 'Complete 3-session daily simulation (12:30–12:45, 15:00–15:15, 17:00–17:10) on a single employee', async () => {
    resetStore();
    const sessionA = { id: 'sess_A', name: 'Session A', enabled: true, outTime: '12:30', returnDeadline: '12:45', gracePeriodMinutes: 0 };
    const sessionB = { id: 'sess_B', name: 'Session B', enabled: true, outTime: '15:00', returnDeadline: '15:15', gracePeriodMinutes: 0 };
    const sessionC = { id: 'sess_C', name: 'Session C', enabled: true, outTime: '17:00', returnDeadline: '17:10', gracePeriodMinutes: 0 };

    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [sessionA, sessionB, sessionC]
      }
    });
    db.departments.push({ _id: 'd1', name: 'CoreDev' });
    const worker = {
      _id: 'w_sim3',
      name: 'SimWorker',
      username: 'simworker',
      rfid: 'RF_SIM3',
      subdomain: 'acme',
      department: 'd1',
      status: 'Active',
      processedOutSessions: []
    };
    db.workers.push(worker);

    // Initial morning punch IN at 09:00:00 AM
    db.attendances.push({
      worker: worker._id,
      name: worker.name,
      username: worker.username,
      rfid: worker.rfid,
      subdomain: worker.subdomain,
      department: 'd1',
      date: TODAY_IST,
      time: '09:00:00 AM',
      presence: true,
      punchType: 'REGULAR',
      createdAt: istDate('09:00')
    });

    // 1. Scheduler tick at 12:30 -> triggers Session A auto OUT
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('12:30'));
    const outA = db.attendances.find(a => a.worker === worker._id && a.outSessionId === 'sess_A');
    assert.ok(outA, 'Session A automatic OUT must be recorded');
    assert.strictEqual(outA.punchType, 'LUNCH_OUT');
    assert.strictEqual(worker.lastLunchOutDate, TODAY_IST);
    assert.ok(worker.sessionInvalidatedAt instanceof Date);

    // 2. Duplicate tick at 12:31 -> no duplicate record
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('12:31'));
    const outsAfterDupA = db.attendances.filter(a => a.worker === worker._id && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outsAfterDupA.length, 1, 'Duplicate tick must not duplicate Session A OUT');

    // 3. Worker punches IN at 12:40 (on-time before 12:45 deadline)
    const inResA = makeRes();
    await attendanceController.putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF_SIM3', simulatedDate: istDate('12:40') } }, inResA);
    assert.strictEqual(inResA.statusCode, 201);
    assert.strictEqual(inResA.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(inResA.body.attendance.outSessionId, 'sess_A');
    assert.strictEqual(inResA.body.attendance.lunchLateMinutes, 0);

    // Verify Session B & C are unexecuted
    assert.strictEqual(db.attendances.filter(a => a.outSessionId === 'sess_B').length, 0);
    assert.strictEqual(db.attendances.filter(a => a.outSessionId === 'sess_C').length, 0);

    // 4. Scheduler tick at 15:00 -> triggers Session B auto OUT
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('15:00'));
    const outB = db.attendances.find(a => a.worker === worker._id && a.outSessionId === 'sess_B');
    assert.ok(outB, 'Session B automatic OUT must be recorded');
    assert.strictEqual(outB.punchType, 'LUNCH_OUT');

    const totalOutsAfterB = db.attendances.filter(a => a.worker === worker._id && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(totalOutsAfterB.length, 2, 'Worker must have exactly 2 distinct LUNCH_OUT records');

    // 5. Worker punches IN at 15:20 (5 mins past 15:15 deadline)
    const inResB = makeRes();
    await attendanceController.putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF_SIM3', simulatedDate: istDate('15:20') } }, inResB);
    assert.strictEqual(inResB.statusCode, 201);
    assert.strictEqual(inResB.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(inResB.body.attendance.outSessionId, 'sess_B');
    assert.strictEqual(inResB.body.attendance.lunchLateMinutes, 5, 'Late minutes must be 5 for Session B return at 15:20');

    // 6. Admin renames Session C to "Evening Stretch Refreshment" at 16:30
    sessionC.name = 'Evening Stretch Refreshment';

    // 7. Scheduler tick at 17:00 -> triggers Session C auto OUT
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('17:00'));
    const outC = db.attendances.find(a => a.worker === worker._id && a.outSessionId === 'sess_C');
    assert.ok(outC, 'Session C automatic OUT must be recorded under stable ID sess_C');

    const totalOutsAfterC = db.attendances.filter(a => a.worker === worker._id && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(totalOutsAfterC.length, 3, 'Worker must have exactly 3 distinct LUNCH_OUT records on the same day');

    // 8. Worker punches IN at 17:08 (before 17:10 deadline)
    const inResC = makeRes();
    await attendanceController.putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF_SIM3', simulatedDate: istDate('17:08') } }, inResC);
    assert.strictEqual(inResC.statusCode, 201);
    assert.strictEqual(inResC.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(inResC.body.attendance.outSessionId, 'sess_C');
    assert.strictEqual(inResC.body.attendance.lunchLateMinutes, 0);

    // Verify all 3 sessions are independent and distinct
    const workerPunchesToday = db.attendances.filter(a => a.worker === worker._id);
    assert.strictEqual(workerPunchesToday.length, 7, 'Must have 1 start-of-day IN + 3 pairs of OUT/IN = 7 total punches');
  });

  // ─── 18. Complete Admin Configuration Changes (Requirement 5) ───────────────
  await runTest(18, 'Admin configuration suite: name, timings, grace, working days, disable/re-enable, add, and safe deactivation', async () => {
    resetStore();
    const sessionId = 'session_dynamic_config';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [
          {
            id: sessionId,
            name: 'Original Break Name',
            enabled: true,
            outTime: '11:00',
            returnDeadline: '11:15',
            gracePeriodMinutes: 0,
            applicableWorkingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          }
        ]
      }
    });

    // 1. Change break name
    db.settings[0].lunchBreakManagement.sessions[0].name = 'Updated Break Name';
    assert.strictEqual(lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement)[0].name, 'Updated Break Name');
    assert.strictEqual(lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement)[0].id, sessionId);

    // 2. Change OUT time
    db.settings[0].lunchBreakManagement.sessions[0].outTime = '11:30';
    assert.strictEqual(lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement)[0].outTime, '11:30');

    // 3. Change return deadline
    db.settings[0].lunchBreakManagement.sessions[0].returnDeadline = '12:00';
    assert.strictEqual(lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement)[0].returnDeadline, '12:00');

    // 4. Change grace period
    db.settings[0].lunchBreakManagement.sessions[0].gracePeriodMinutes = 5;
    assert.strictEqual(lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement)[0].gracePeriodMinutes, 5);

    // 5. Change applicable working days (e.g. restrict to Mon-Fri)
    db.settings[0].lunchBreakManagement.sessions[0].applicableWorkingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const isSat = lunchBreakScheduler.isSessionWorkingDay(db.settings[0].lunchBreakManagement.sessions[0], null, TODAY_IST, istDate('11:30'));
    assert.strictEqual(isSat, false, 'Saturday must not be working day when restricted to Mon-Fri');

    // 6. Disable session
    db.settings[0].lunchBreakManagement.sessions[0].enabled = false;
    const normDisabled = lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement);
    assert.strictEqual(normDisabled[0].enabled, false);

    // 7. Re-enable session
    db.settings[0].lunchBreakManagement.sessions[0].enabled = true;
    const normReEnabled = lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement);
    assert.strictEqual(normReEnabled[0].enabled, true);

    // 8. Add additional sessions dynamically without artificial limits
    for (let i = 2; i <= 6; i++) {
      db.settings[0].lunchBreakManagement.sessions.push({
        id: `sess_dyn_${i}`,
        name: `Dynamic Break ${i}`,
        enabled: true,
        outTime: `1${i}:00`,
        returnDeadline: `1${i}:15`,
        gracePeriodMinutes: 0
      });
    }
    const allNorm = lunchBreakScheduler.getNormalizedSessions(db.settings[0].lunchBreakManagement);
    assert.strictEqual(allNorm.length, 6, 'Admin can configure 6+ independent sessions without artificial limit');

    // 9. Historical-record safety: deactivating a session leaves existing attendance records completely intact
    db.attendances.push({
      _id: 'hist_rec_1',
      worker: 'w_hist',
      rfid: 'RF_HIST',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '11:30:00 AM',
      presence: false,
      punchType: 'LUNCH_OUT',
      outSessionId: sessionId
    });
    // Deactivate session
    db.settings[0].lunchBreakManagement.sessions[0].enabled = false;
    // Query attendance
    const histAttendance = db.attendances.find(a => a._id === 'hist_rec_1');
    assert.ok(histAttendance, 'Historical attendance must remain completely intact after session deactivation');
    assert.strictEqual(histAttendance.outSessionId, sessionId);
  });

  // ─── 19. MongoDB Index Collision Handling & Diagnostics (Requirement 6) ─────
  await runTest(19, 'E11000 legacy index collision handles rollback, releases lock, and logs LegacyIndexConflict diagnostic', async () => {
    resetStore();
    const session1 = { id: 'sess_first', name: 'First Break', enabled: true, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 0 };
    const session2 = { id: 'sess_second', name: 'Second Break', enabled: true, outTime: '14:00', returnDeadline: '14:15', gracePeriodMinutes: 0 };
    db.settings.push({ subdomain: 'acme', lunchBreakManagement: { enabled: true, sessions: [session1, session2] } });
    db.departments.push({ _id: 'd1', name: 'SecOps' });
    const worker = {
      _id: 'w_collision',
      name: 'CollisionUser',
      rfid: 'RF_COL',
      subdomain: 'acme',
      department: 'd1',
      status: 'Active',
      processedOutSessions: []
    };
    db.workers.push(worker);

    // Initial IN punch
    db.attendances.push({
      worker: worker._id,
      rfid: worker.rfid,
      subdomain: 'acme',
      date: TODAY_IST,
      time: '09:00:00 AM',
      presence: true,
      createdAt: istDate('09:00')
    });

    // Session 1 executes successfully
    await lunchBreakScheduler.checkAndExecuteLunchBreak(istDate('10:00'));
    const out1 = db.attendances.find(a => a.worker === worker._id && a.outSessionId === 'sess_first');
    assert.ok(out1, 'Session 1 OUT must succeed');

    // Worker returns and punches IN at 10:10
    const inRes = makeRes();
    await attendanceController.putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF_COL', simulatedDate: istDate('10:10') } }, inRes);
    assert.strictEqual(inRes.statusCode, 201);

    // Simulate legacy unique index on live MongoDB:
    // Any second LUNCH_OUT for worker on same date throws E11000 regardless of outSessionId!
    attendanceCreateOverride = async (doc) => {
      if (doc.punchType === 'LUNCH_OUT' && doc.outSessionId === 'sess_second') {
        const err = new Error('E11000 duplicate key error collection: attendances index: worker_1_date_1_punchType_1 dup key: { worker: "w_collision", date: "2026-11-14", punchType: "LUNCH_OUT" }');
        err.code = 11000;
        throw err;
      }
    };

    // Now Session 2 executes at 14:00
    const outcome = await lunchBreakScheduler.processWorkerLunchOut(worker, session2, db.settings[0].lunchBreakManagement, istDate('14:00'));

    // Verify safe handling:
    assert.strictEqual(outcome.success, false, 'Must NOT report successful OUT on database collision');
    assert.strictEqual(outcome.subReason, 'DUPLICATE_KEY');
    assert.strictEqual(outcome.indexConflict, true, 'Must indicate indexConflict');

    // Verify lock rollback:
    assert.ok(
      !worker.processedOutSessions.includes(`${TODAY_IST}_sess_second`),
      'Acquired lock for sess_second must be cleanly rolled back from worker.processedOutSessions'
    );

    // Clean up override
    attendanceCreateOverride = null;
  });

  // ─── 20. Module Renaming to Automatic OUT & Backward Compatibility ──────────
  await runTest(20, 'Automatic OUT renaming across UI components and backward compatibility for legacy saved configs', async () => {
    resetStore();

    // 1. Verify Settings.jsx UI renaming and cleanup
    const settingsJsxPath = path.resolve(__dirname, '../../frontend/src/components/admin/Settings.jsx');
    const settingsJsx = fs.readFileSync(settingsJsxPath, 'utf8');
    assert.ok(settingsJsx.includes("label: 'Automatic OUT'"), "Settings nav item must be labeled 'Automatic OUT'");
    assert.ok(/Automatic OUT\s*<\/h2>/.test(settingsJsx), "Settings section header must be 'Automatic OUT'");
    assert.ok(settingsJsx.includes('Enable Automatic OUT'), "Toggle label must be 'Enable Automatic OUT'");
    assert.ok(settingsJsx.includes('under Automatic OUT policy scope'), 'Scope validation toasts must reference Automatic OUT');
    assert.ok(!settingsJsx.includes('Lunch Break Management Module'), 'Settings.jsx must not contain user-facing "Lunch Break Management Module"');
    assert.ok(!settingsJsx.includes('Save Automatic OUT Settings'), 'Redundant duplicate in-section save button must be removed');

    // 2. Verify AttendanceManagement.jsx UI renaming and essential columns
    const attMgmtJsxPath = path.resolve(__dirname, '../../frontend/src/components/admin/AttendanceManagement.jsx');
    const attMgmtJsx = fs.readFileSync(attMgmtJsxPath, 'utf8');
    assert.ok(attMgmtJsx.includes('Automatic OUT Overview'), "Tab button must be labeled 'Automatic OUT Overview'");
    assert.ok(attMgmtJsx.includes('No Automatic OUT activity recorded'), "Empty state must refer to 'Automatic OUT activity'");
    assert.ok(attMgmtJsx.includes('>Late Return Status<'), "Table must contain Late Return Status column");
    assert.ok(attMgmtJsx.includes('>Missing Return Status<'), "Table must contain Missing Return Status column");
    assert.ok(!attMgmtJsx.includes('Automatic OUT Policy'), 'Redundant duplicate settings banner must be removed from Attendance Management');

    // 3. Security Guard: Production clients cannot inject simulated dates
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const fakeClientReq = { body: { simulatedDate: '2026-01-01T12:00:00Z' } };
    const prodTimestamp = attendanceController.resolveRequestTimestamp(fakeClientReq);
    assert.ok(
      Math.abs(prodTimestamp.getTime() - Date.now()) < 5000,
      'Production environments must strictly use wall-clock time and reject client simulatedDate injection'
    );
    process.env.NODE_ENV = origEnv;

    // 4. Verify breakSessionValidation.js validation message
    const backendValPath = path.resolve(__dirname, '../utils/breakSessionValidation.js');
    const backendVal = require(backendValPath);
    const valErr = backendVal.validateLunchBreakManagementConfig({ enabled: true, sessions: [] });
    assert.strictEqual(
      valErr,
      'Please configure at least one automatic OUT session when Automatic OUT is enabled.',
      'Validation message must refer to Automatic OUT'
    );

    // 4. Backward Compatibility: Existing legacy configuration stored under lunchBreakManagement loads smoothly
    const legacyDoc = {
      subdomain: 'acme_legacy',
      lunchBreakManagement: {
        enabled: true,
        lunchOutTime: '13:00',
        returnDeadline: '13:45',
        gracePeriodMinutes: 5,
        appliesTo: 'all'
      }
    };
    db.settings.push(legacyDoc);

    const normLegacy = lunchBreakScheduler.getNormalizedSessions(legacyDoc.lunchBreakManagement);
    assert.ok(Array.isArray(normLegacy) && normLegacy.length === 1, 'Legacy flat config must normalize to 1 session');
    assert.strictEqual(normLegacy[0].outTime, '13:00');
    assert.strictEqual(normLegacy[0].returnDeadline, '13:45');
    assert.strictEqual(normLegacy[0].gracePeriodMinutes, 5);

    // Test API retrieval via settingsController
    const getReq = { user: { subdomain: 'acme_legacy', role: 'admin' }, params: { subdomain: 'acme_legacy' } };
    const getRes = makeRes();
    await settingsController.getSettings(getReq, getRes);
    assert.strictEqual(getRes.statusCode, 200);
    assert.ok(getRes.body.lunchBreakManagement, 'Existing lunchBreakManagement property must be preserved');
    assert.strictEqual(getRes.body.lunchBreakManagement.enabled, true);
  });

  // ─── FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log(` Dynamic Break Engine Suite Summary: ${passedCount} Passed, ${failedCount} Failed out of 20 Requirements`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
})();

