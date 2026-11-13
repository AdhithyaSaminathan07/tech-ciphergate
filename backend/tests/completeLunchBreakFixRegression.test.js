/**
 * Tech Ciphergate — Complete Lunch Break Management Fix Regression Suite
 *
 * Strictly isolated in-memory test harness (zero MongoDB connections, zero DB writes).
 * Tests all 15 regression scenarios across:
 *   - backend/schedulers/lunchBreakScheduler.js
 *   - backend/controllers/attendanceController.js
 *   - backend/controllers/settingsController.js
 *   - backend/utils/productivityCalculator.js
 *   - frontend/src/utils/attendanceHelpers.js
 */

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

// ─── 1. In-Memory Store & Mongoose Mocks ─────────────────────────────────────
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

let attendanceCreateOverride = null;

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
      const record = {
        _id: nextId('att'),
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
  Holiday: {
    findOne: async (q) => db.holidays.find((h) => {
      if (h.subdomain !== q.subdomain) return false;
      const hd = new Date(h.date);
      if (q.date?.$gte && hd < q.date.$gte) return false;
      if (q.date?.$lte && hd > q.date.$lte) return false;
      return true;
    }) || null
  },
  Leave: {
    findOne: async (q) => db.leaves.find((lv) => {
      if (String(lv.worker) !== String(q.worker) || lv.subdomain !== q.subdomain || lv.status !== q.status) return false;
      const s = new Date(lv.startDate);
      const e = new Date(lv.endDate);
      if (q.startDate?.$lte && s > q.startDate.$lte) return false;
      if (q.endDate?.$gte && e < q.endDate.$gte) return false;
      return true;
    }) || null
  },
  Department: {
    findById: async (id) => db.departments.find((d) => String(d._id) === String(id)) || { _id: id, name: 'General' }
  }
};

for (const [name, exportsObj] of Object.entries(modelMocks)) {
  const resolved = require.resolve(`../models/${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}
const socketPath = require.resolve('../utils/socket');
require.cache[socketPath] = {
  id: socketPath,
  filename: socketPath,
  loaded: true,
  exports: { getIO: () => ({ to: () => ({ emit: () => {} }) }) }
};

const {
  isNonWorkingDay,
  processWorkerLunchOut,
  checkAndExecuteLunchBreak,
  getISTDateTime
} = require('../schedulers/lunchBreakScheduler');
const {
  putAttendance,
  putRfidAttendance,
  recognizeFaceAndMarkAttendance,
  getAttendance,
  getPaginatedAttendance,
  getWorkerAttendance,
  getAttendanceSummary,
  getLunchAttendanceOverview,
  resolveLunchReturnDetails
} = require('../controllers/attendanceController');
const { updateSettings } = require('../controllers/settingsController');
const { calculateWorkerProductivity } = require('../utils/productivityCalculator');

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(p) { this.body = p; return this; }
});

const TODAY_IST = getISTDateTime(new Date()).dateStr;
const ist = (hhmm, day = TODAY_IST) => new Date(`${day}T${hhmm}:00+05:30`);

let passed = 0;
let total = 0;
const runAsync = async (name, fn) => {
  total++;
  try {
    await fn();
    passed++;
    console.log(`✓ [PASS] Test ${total}: ${name}`);
  } catch (err) {
    console.error(`✗ [FAIL] Test ${total}: ${name}\n  ${err.stack}`);
    process.exitCode = 1;
  }
};

(async () => {
  console.log('======================================================================');
  console.log(' Tech Ciphergate — Complete Lunch Break Fix Regression Suite (15 Cases)');
  console.log('======================================================================\n');

  const frontendHelpers = await import(
    pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/attendanceHelpers.js')).href
  );

  // 1. IST holiday and leave date boundaries under TZ=UTC
  await runAsync('1. IST holiday and leave date boundaries work accurately under TZ=UTC', async () => {
    const childScript = `
      const assert = require('assert');
      const holidayQueries = [];
      const leaveQueries = [];
      const mock = (p, e) => { require.cache[require.resolve(p)] = { id: p, filename: p, loaded: true, exports: e }; };
      mock('./backend/models/Settings', {});
      mock('./backend/models/Worker', {});
      mock('./backend/models/Attendance', {});
      mock('./backend/models/RefreshToken', {});
      mock('./backend/models/Department', {});
      mock('./backend/models/Holiday', {
        findOne: async (q) => { holidayQueries.push(q); return q.date.$gte.toISOString() === '2026-11-10T18:30:00.000Z' ? { _id: 'h1' } : null; }
      });
      mock('./backend/models/Leave', {
        findOne: async (q) => { leaveQueries.push(q); return { _id: 'l1' }; }
      });
      const { isNonWorkingDay } = require('./backend/schedulers/lunchBreakScheduler');
      (async () => {
        const res = await isNonWorkingDay({ _id: 'w1', subdomain: 'acme' }, '2026-11-11', new Date('2026-11-11T10:00:00+05:30'));
        assert.strictEqual(res, true);
        assert.strictEqual(holidayQueries[0].date.$gte.toISOString(), '2026-11-10T18:30:00.000Z');
        assert.strictEqual(holidayQueries[0].date.$lte.toISOString(), '2026-11-11T18:29:59.999Z');
      })();
    `;
    execFileSync(process.execPath, ['-e', childScript], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, TZ: 'UTC' }
    });

    resetStore();
    db.leaves.push({
      _id: 'lv_1',
      worker: 'w_1',
      subdomain: 'acme',
      status: 'Approved',
      startDate: new Date('2026-11-10T18:30:00.000Z'),
      endDate: new Date('2026-11-11T18:29:59.999Z')
    });
    const isLeave = await isNonWorkingDay({ _id: 'w_1', subdomain: 'acme' }, '2026-11-11', ist('11:00', '2026-11-11'));
    assert.strictEqual(isLeave, true, 'IST midnight leave range must match');
  });

  // 2. E11000 lock rollback vs same-session preservation
  await runAsync('2. E11000 without same-session Attendance rolls back lock; E11000 with same-session keeps lock', async () => {
    resetStore();
    const w = { _id: 'w_e1', name: 'A', rfid: 'RF1', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: 'in1', worker: 'w_e1', rfid: 'RF1', subdomain: 'acme', date: TODAY_IST, presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    attendanceCreateOverride = async () => {
      const err = new Error('E11000 legacy index collision');
      err.code = 11000;
      throw err;
    };
    const rLegacy = await processWorkerLunchOut(w, { id: 'tea_break', name: 'Tea Break' }, { enabled: true }, ist('16:00'));
    attendanceCreateOverride = null;

    assert.strictEqual(rLegacy.success, false);
    assert.strictEqual(rLegacy.reason, 'ALREADY_PROCESSED');
    assert.strictEqual(rLegacy.subReason, 'DUPLICATE_KEY');
    assert.deepStrictEqual(w.processedOutSessions, [], 'Orphan lock must be rolled back when same-session Attendance does not exist');

    // Now test E11000 when another worker instance inserted the same-session LUNCH_OUT right before create
    const w2 = { _id: 'w_e2', name: 'B', rfid: 'RF2', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w2);
    db.attendances.push({ _id: 'in2', worker: 'w_e2', rfid: 'RF2', subdomain: 'acme', date: TODAY_IST, presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });
    attendanceCreateOverride = async (doc) => {
      db.attendances.push({ _id: 'race_out', worker: doc.worker, subdomain: doc.subdomain, date: doc.date, punchType: 'LUNCH_OUT', outSessionId: doc.outSessionId, presence: false, createdAt: doc.time ? ist('16:00') : new Date() });
      const err = new Error('E11000 concurrent instance duplicate');
      err.code = 11000;
      throw err;
    };
    const rSameSession = await processWorkerLunchOut(w2, { id: 'tea_break', name: 'Tea Break' }, { enabled: true }, ist('16:00'));
    attendanceCreateOverride = null;

    assert.strictEqual(rSameSession.subReason, 'DUPLICATE_KEY');
    assert.ok(w2.processedOutSessions.includes(`${TODAY_IST}_tea_break`), 'Lock must stay intact when same-session Attendance exists');
  });

  // 3. Validation failure lock rollback
  await runAsync('3. Validation error during Attendance.create releases acquired lock cleanly', async () => {
    resetStore();
    const w = { _id: 'w_val', name: 'Val', rfid: 'RFV', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: 'in_v', worker: 'w_val', rfid: 'RFV', subdomain: 'acme', date: TODAY_IST, presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    attendanceCreateOverride = async () => {
      const err = new Error('Attendance validation failed: time required');
      err.name = 'ValidationError';
      throw err;
    };
    await assert.rejects(
      () => processWorkerLunchOut(w, { id: 'lunch_1', name: 'Lunch' }, { enabled: true }, ist('13:30')),
      /validation failed/i
    );
    attendanceCreateOverride = null;
    assert.deepStrictEqual(w.processedOutSessions, [], 'Validation failure must release lock so next run is unblocked');
  });

  // 4. Authentication timestamps unchanged when attendance creation fails
  await runAsync('4. sessionInvalidatedAt, lastLunchOutDate & RefreshTokens remain untouched on failed LUNCH_OUT', async () => {
    resetStore();
    const w = { _id: 'w_auth', name: 'Auth', rfid: 'RFA', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.refreshTokens.push({ _id: 'rt_1', userId: 'w_auth', token: 't1' });
    db.attendances.push({ _id: 'in_a', worker: 'w_auth', rfid: 'RFA', subdomain: 'acme', date: TODAY_IST, presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    attendanceCreateOverride = async () => {
      const err = new Error('E11000 dup');
      err.code = 11000;
      throw err;
    };
    await processWorkerLunchOut(w, { id: 'lunch_1', name: 'Lunch' }, { enabled: true }, ist('13:30'));
    attendanceCreateOverride = null;

    assert.strictEqual(w.lastLunchOutDate, undefined, 'lastLunchOutDate must not change on failed create');
    assert.strictEqual(w.sessionInvalidatedAt, undefined, 'sessionInvalidatedAt must not change on failed create');
    assert.strictEqual(db.refreshTokens.length, 1, 'RefreshToken must not be revoked when LUNCH_OUT fails');
  });

  // 5. Same-day session rescheduling
  await runAsync('5. Ordinary time edits prevent silent re-run; explicit audited reschedule never creates duplicate OUT', async () => {
    resetStore();
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [{ id: 'lunch_1', name: 'Lunch Break', enabled: true, outTime: '11:35', returnDeadline: '11:45', gracePeriodMinutes: 0 }]
      }
    });
    const wDone = { _id: 'w_done', name: 'Done', rfid: 'RFD', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [`${TODAY_IST}_lunch_1`] };
    const wOrphan = { _id: 'w_orp', name: 'Orp', rfid: 'RFO', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [`${TODAY_IST}_lunch_1`] };
    db.workers.push(wDone, wOrphan);
    db.attendances.push({ _id: 'out_done', worker: 'w_done', rfid: 'RFD', subdomain: 'acme', date: TODAY_IST, presence: false, punchType: 'LUNCH_OUT', outSessionId: 'lunch_1', createdAt: ist('11:35') });

    // Ordinary time edit (no explicitRescheduleSessionIds) keeps lock intact
    const res1 = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [{ id: 'lunch_1', name: 'Lunch Break', enabled: true, outTime: '12:07', returnDeadline: '12:20', gracePeriodMinutes: 0 }]
        }
      }
    }, res1);
    assert.strictEqual(res1.body.lunchBreakManagement.sessions[0].id, 'lunch_1');
    assert.ok(wOrphan.processedOutSessions.includes(`${TODAY_IST}_lunch_1`), 'Ordinary edit must not clear existing locks');

    // Explicit audited reschedule unlocks only orphan lock, preserves executed worker lock
    const res2 = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [{ id: 'lunch_1', name: 'Lunch Break', enabled: true, outTime: '12:15', returnDeadline: '12:30', gracePeriodMinutes: 0 }]
        },
        explicitRescheduleSessionIds: ['lunch_1']
      }
    }, res2);
    assert.ok(res2.body.rescheduleAudit);
    assert.ok(wDone.processedOutSessions.includes(`${TODAY_IST}_lunch_1`), 'Already-executed worker lock preserved (zero duplicate OUT)');
    assert.deepStrictEqual(wOrphan.processedOutSessions, [], 'Non-attendance lock released under explicit audited reschedule');
  });

  // 6. Two independent break sessions
  await runAsync('6. Two independent break sessions execute sequentially on the same day after return IN', async () => {
    resetStore();
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 'tea_am', name: 'Morning Tea', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
          { id: 'lunch_pm', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 }
        ]
      }
    });
    db.workers.push({ _id: 'w_two', name: 'Two', rfid: 'RF2S', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] });
    db.attendances.push({ _id: 'in_am', worker: 'w_two', rfid: 'RF2S', subdomain: 'acme', date: TODAY_IST, presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    await checkAndExecuteLunchBreak(ist('11:00'));
    const teaOut = db.attendances.find(a => a.worker === 'w_two' && a.outSessionId === 'tea_am');
    assert.ok(teaOut, 'First session tea_am should create LUNCH_OUT');
    db.attendances.push({ _id: 'ret_am', worker: 'w_two', rfid: 'RF2S', subdomain: 'acme', date: TODAY_IST, presence: true, punchType: 'LUNCH_IN', outSessionId: 'tea_am', createdAt: new Date(new Date(teaOut.createdAt).getTime() + 60000) });
    await checkAndExecuteLunchBreak(ist('13:30'));

    const outs = db.attendances.filter(a => a.worker === 'w_two' && a.punchType === 'LUNCH_OUT');
    assert.deepStrictEqual(outs.map(o => o.outSessionId), ['tea_am', 'lunch_pm']);
  });

  // 7. Immediate return IN after automatic LUNCH_OUT (<60s) vs normal cooldown
  await runAsync('7. Immediate return IN within 60s of auto LUNCH_OUT succeeds; unrelated punch <60s blocked', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.workers.push({ _id: 'w_fast', name: 'Fast', rfid: 'RFF', subdomain: 'acme', status: 'Active', department: 'd1' });
    db.attendances.push({
      _id: 'auto_out_now',
      worker: 'w_fast',
      rfid: 'RFF',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '01:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      isLunchPunch: true,
      outSessionId: 'lunch_1',
      outSessionName: 'Lunch Break',
      source: 'SYSTEM/AUTOMATIC',
      createdAt: new Date()
    });

    const retRes = makeRes();
    await putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RFF' } }, retRes);
    assert.strictEqual(retRes.statusCode, 201, 'Immediate return IN right after auto LUNCH_OUT must succeed');
    assert.strictEqual(retRes.body.attendance.punchType, 'LUNCH_IN');
    assert.strictEqual(retRes.body.attendance.outSessionId, 'lunch_1');

    // Immediate subsequent punch within 60s after LUNCH_IN must still be cooldown-blocked
    const dupRes = makeRes();
    await putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RFF' } }, dupRes);
    assert.strictEqual(dupRes.statusCode, 200);
    assert.strictEqual(dupRes.body.success, false, 'Unrelated punch within 60s of LUNCH_IN must still be blocked');

    // Manual endpoint also allows immediate return IN
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.workers.push({ _id: 'w_m', name: 'Man', rfid: 'RFM', subdomain: 'acme', status: 'Active', department: 'd1' });
    db.attendances.push({
      _id: 'auto_m',
      worker: 'w_m',
      rfid: 'RFM',
      subdomain: 'acme',
      date: TODAY_IST,
      time: '01:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      isLunchPunch: true,
      outSessionId: 'lunch_1',
      createdAt: new Date()
    });
    const manRes = makeRes();
    await putAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RFM', subdomain: 'acme' } }, manRes);
    assert.strictEqual(manRes.statusCode, 201);
    assert.strictEqual(manRes.body.attendance.punchType, 'LUNCH_IN');
  });

  // 8. RFID and Face cross-day open-IN handling
  await runAsync('8. RFID & Face close yesterday open-IN and guarantee today first punch is IN', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.workers.push(
      { _id: 'w_rf', name: 'RfidUser', username: 'rf', rfid: 'RFR', subdomain: 'acme', status: 'Active', department: 'd1' },
      { _id: 'w_fc', name: 'FaceUser', username: 'fc', rfid: 'RFB', subdomain: 'acme', status: 'Active', department: 'd1', faceEmbeddings: [[0.2, 0.2, 0.2]] }
    );
    const yesterday = '2026-11-10';
    db.attendances.push(
      { _id: 'y_rf', worker: 'w_rf', rfid: 'RFR', subdomain: 'acme', date: yesterday, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00', yesterday) },
      { _id: 'y_fc', worker: 'w_fc', rfid: 'RFB', subdomain: 'acme', date: yesterday, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00', yesterday) }
    );

    const rfRes = makeRes();
    await putRfidAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RFR' } }, rfRes);
    assert.strictEqual(rfRes.statusCode, 201);
    assert.strictEqual(rfRes.body.attendance.presence, true, 'RFID first punch today must be IN');
    assert.ok(db.attendances.some(a => a.worker === 'w_rf' && a.date === yesterday && a.isMissedOutPunch === true && a.presence === false));

    const fcRes = makeRes();
    await recognizeFaceAndMarkAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { faceDescriptor: [0.2, 0.2, 0.2], subdomain: 'acme' } }, fcRes);
    assert.strictEqual(fcRes.statusCode, 201);
    assert.strictEqual(fcRes.body.attendance.presence, true, 'Face first punch today must be IN');
    assert.ok(db.attendances.some(a => a.worker === 'w_fc' && a.date === yesterday && a.isMissedOutPunch === true && a.presence === false));
  });

  // 9. Correct worker profile links
  await runAsync('9. getPaginatedAttendance populates worker._id & getWorkerProfileId handles object/string IDs', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.workers.push({ _id: 'w_pop', name: 'Pop', rfid: 'RFP', subdomain: 'acme', status: 'Active', department: 'd1' });
    db.attendances.push({ _id: 'a_pop', worker: 'w_pop', name: 'Pop', rfid: 'RFP', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:00:00 AM', presence: true, createdAt: ist('09:00') });

    const res = makeRes();
    await getPaginatedAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', page: 1, limit: 5 } }, res);
    const row = res.body.attendance[0];
    assert.strictEqual(row.worker._id, 'w_pop');
    assert.strictEqual(frontendHelpers.getWorkerProfileId(row), 'w_pop');
    assert.strictEqual(frontendHelpers.getWorkerProfileId({ worker: 'w_raw' }), 'w_raw');
    assert.strictEqual(frontendHelpers.getWorkerProfileId({ workerId: 'w_ovw' }), 'w_ovw');

    // Summary excludes LUNCH_OUT from Present count
    resetStore();
    db.workers.push({ _id: 'w_s', name: 'Sum', rfid: 'RFS', subdomain: 'acme', status: 'Active' });
    db.attendances.push({ _id: 'lo_s', worker: 'w_s', rfid: 'RFS', subdomain: 'acme', date: TODAY_IST, presence: false, punchType: 'LUNCH_OUT', createdAt: ist('13:30') });
    const sumRes = makeRes();
    await getAttendanceSummary({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme' } }, sumRes);
    assert.strictEqual(sumRes.body.presentWorkers, 0, 'LUNCH_OUT must never count worker as Present');
  });

  // 10. IST attendance date grouping
  await runAsync('10. IST attendance date grouping never shifts midnight +05:30 dates back a day', async () => {
    const grouped = frontendHelpers.processAttendanceByDay([
      {
        _id: 'a1',
        rfid: 'RFIST',
        name: 'IST Worker',
        date: '2026-11-11T00:00:00+05:30',
        time: '09:00:00 AM',
        presence: true,
        punchType: 'REGULAR',
        createdAt: '2026-11-11T09:00:00+05:30'
      },
      {
        _id: 'a2',
        rfid: 'RFIST',
        name: 'IST Worker',
        date: '2026-11-11T00:00:00+05:30',
        time: '01:00:00 PM',
        presence: false,
        punchType: 'LUNCH_OUT',
        outSessionId: 'lunch_1',
        outSessionName: 'Lunch Break',
        createdAt: '2026-11-11T13:00:00+05:30'
      }
    ]);
    assert.strictEqual(grouped.length, 1);
    assert.strictEqual(grouped[0].date, '2026-11-11');
    assert.strictEqual(grouped[0].outTimes[0].punchType, 'LUNCH_OUT');
    assert.strictEqual(grouped[0].outTimes[0].outSessionName, undefined);
    assert.strictEqual(frontendHelpers.getBreakPunchLabel(grouped[0].outTimes[0]), 'Break OUT');
  });

  // 11. Break Overview filtering and generic CSV export (no configured session names)
  await runAsync('11. Break Overview filters & CSV export operate on filtered rows with generic labels only', async () => {
    const overviewRows = [
      { workerId: 'w1', name: 'Alice', rfid: 'RF01', department: 'Engineering', date: '2026-11-11', sessionName: 'Tea Break', sessionId: 'tea_1', lunchOutTime: '11:00:00 AM', expectedReturnTime: '11:15', actualReturnTime: '11:20:00 AM', lateMinutes: 5, status: 'Late Return', deductionStatus: '5 mins', isMissingLunchReturn: false },
      { workerId: 'w2', name: 'Bob', rfid: 'RF02', department: 'HR', date: '2026-11-11', sessionName: 'Custom Afternoon Pause', sessionId: 'lunch_1', lunchOutTime: '01:30:00 PM', expectedReturnTime: '14:30', actualReturnTime: '-', lateMinutes: 0, status: 'Missing Return', deductionStatus: 'Unworked Session Review', isMissingLunchReturn: true }
    ];
    const filtered = frontendHelpers.filterLunchOverviewRows(overviewRows, { searchName: 'bob', filterDepartment: 'hr' });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].rfid, 'RF02');

    const csv = frontendHelpers.buildAttendanceCsvContent({
      activeTab: 'lunch',
      processedAttendance: [],
      filteredLunchOverview: filtered,
      lunchDate: '2026-11-11'
    });
    assert.ok(csv.includes('Bob,RF02,HR,2026-11-11,Break OUT,01:30:00 PM,-,'));
    assert.ok(!csv.includes('Custom Afternoon Pause'));
    assert.ok(!csv.includes('Lunch Break'));
    assert.ok(!csv.includes('Tea Break'));
    assert.ok(!csv.includes('lunch_1'));
    assert.ok(!csv.includes('Alice'));
  });

  // 12. Missing-return and future-date handling + overview pagination
  await runAsync('12. Future date is never marked Missing Lunch Return & Lunch Overview supports pagination', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        sessions: [{ id: 'early_tea', name: 'Early Tea', enabled: true, outTime: '00:05', returnDeadline: '00:10', gracePeriodMinutes: 0 }]
      }
    });
    db.workers.push(
      { _id: 'w_f1', name: 'Fut1', rfid: 'RFF1', subdomain: 'acme', status: 'Active', department: 'd1' },
      { _id: 'w_f2', name: 'Fut2', rfid: 'RFF2', subdomain: 'acme', status: 'Active', department: 'd1' }
    );
    db.attendances.push(
      { _id: 'f_1', worker: 'w_f1', rfid: 'RFF1', subdomain: 'acme', date: '2099-01-01', time: '12:05:00 AM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'early_tea', isMissingLunchReturn: false, createdAt: ist('00:05', '2099-01-01') },
      { _id: 'f_2', worker: 'w_f2', rfid: 'RFF2', subdomain: 'acme', date: '2099-01-01', time: '12:05:00 AM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'early_tea', isMissingLunchReturn: false, createdAt: ist('00:05', '2099-01-01') }
    );

    const res = makeRes();
    await getLunchAttendanceOverview({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', date: '2099-01-01', page: 1, limit: 1 } }, res);
    assert.strictEqual(res.body.overview.length, 1);
    assert.strictEqual(res.body.pagination.totalRecords, 2);
    assert.strictEqual(res.body.pagination.totalPages, 2);
    assert.strictEqual(res.body.pagination.hasMore, true);
    assert.strictEqual(res.body.overview[0].status, 'On Break', 'Future date must not trigger Missing Lunch Return');
  });

  // 13. Historical attendance without session IDs
  await runAsync('13. Historical LUNCH_OUT without outSessionId resolves legacy deadline in overview & return IN', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        lunchOutTime: '13:30',
        returnDeadline: '14:30',
        gracePeriodMinutes: 0,
        sessions: [{ id: 'lunch_new', name: 'Lunch Break', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 }]
      }
    });
    db.workers.push({ _id: 'w_hist', name: 'Hist', rfid: 'RFH', subdomain: 'acme', status: 'Active', department: 'd1' });
    db.attendances.push({
      _id: 'hist_lo',
      worker: 'w_hist',
      rfid: 'RFH',
      subdomain: 'acme',
      date: '2026-10-01',
      time: '12:30:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      outSessionId: null,
      isMissingLunchReturn: false,
      createdAt: ist('12:30', '2026-10-01')
    });

    const ovwRes = makeRes();
    await getLunchAttendanceOverview({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', date: '2026-10-01' } }, ovwRes);
    assert.strictEqual(ovwRes.body.overview[0].expectedReturnTime, '14:30');
    assert.strictEqual(ovwRes.body.overview[0].status, 'Missing Return');

    const retDetails = await resolveLunchReturnDetails('RFH', 'acme', true, '2026-10-01', 'w_hist', ist('14:40', '2026-10-01'));
    assert.strictEqual(retDetails.punchType, 'LUNCH_IN');
    assert.strictEqual(retDetails.lunchLateMinutes, 10);
  });

  // 14. Multiple unpaid break windows in salary calculations
  await runAsync('14. Multiple unpaid break windows & break-contained pairs exclude non-lunch break windows properly', async () => {
    const res = calculateWorkerProductivity({
      worker: { _id: 'w_mb', salary: 15000, batch: 'Full' },
      attendanceData: [
        { date: '2026-11-11', time: '09:00:00 AM', presence: true, punchType: 'REGULAR' },
        { date: '2026-11-11', time: '04:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'tea_1' },
        // Stray micro-punch completely inside Tea Break 16:00-16:15 must be ignored
        { date: '2026-11-11', time: '04:05:00 PM', presence: true, punchType: 'REGULAR' },
        { date: '2026-11-11', time: '04:10:00 PM', presence: false, punchType: 'REGULAR' },
        { date: '2026-11-11', time: '04:15:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'tea_1', lunchLateMinutes: 0 },
        { date: '2026-11-11', time: '07:00:00 PM', presence: false, punchType: 'REGULAR' }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        deductSalary: true,
        permissionTimeMinutes: 0,
        isLunchConsider: false,
        batches: [{ batchName: 'Full', from: '09:00', to: '19:00', lunchFrom: '13:00', lunchTo: '14:00', isLunchConsider: false }],
        lunchBreakManagement: {
          enabled: true,
          sessions: [
            { id: 'lunch_1', name: 'Lunch Break', enabled: true, outTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 0 },
            { id: 'tea_1', name: 'Tea Break', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0 }
          ]
        }
      }
    });
    assert.strictEqual(res.finalSummary['Total Working Hours'], '8.75 hours', '525m expected (600m - 60m lunch - 15m tea) with break-contained micro-pair ignored');
    assert.strictEqual(res.finalSummary['Total Permission Time'], '0 minutes');
  });

  // 15. The 165-minute vs 180-minute salary regression
  await runAsync('15. Unreturned unpaid Tea Break 16:00-16:15 before 19:00 charges 165m (Rs 198) instead of 180m (Rs 216)', async () => {
    const res = calculateWorkerProductivity({
      worker: { _id: 'w_165', salary: 15750, perDaySalary: 630, batch: 'Full Time', fines: [], bonuses: [] },
      attendanceData: [
        { date: '2026-11-11', time: '09:00:00 AM', presence: true, punchType: 'IN' },
        { date: '2026-11-11', time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'lunch_1' },
        { date: '2026-11-11', time: '02:00:00 PM', presence: true, punchType: 'IN' },
        { date: '2026-11-11', time: '04:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'tea_1', isMissingLunchReturn: true }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        deductSalary: true,
        permissionTimeMinutes: 0,
        isLunchConsider: false,
        batches: [{ batchName: 'Full Time', from: '09:00', to: '19:00', lunchFrom: '13:00', lunchTo: '14:00', isLunchConsider: false }],
        lunchBreakManagement: {
          enabled: true,
          sessions: [
            { id: 'lunch_1', name: 'Lunch Break', enabled: true, outTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 0, appliesTo: 'all' },
            { id: 'tea_1', name: 'Tea Break', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0, appliesTo: 'all' }
          ]
        }
      }
    });
    assert.strictEqual(res.finalSummary['Total Working Hours'], '6.00 hours');
    assert.strictEqual(res.finalSummary['Total Permission Time'], '165 minutes');
    assert.strictEqual(res.finalSummary['Permission Deduction'], '₹198.00');
  });

  // 16. Generic 3 admin-defined sessions: independent OUT/IN pairing, late return, missing return, zero name leakage
  await runAsync('16. 3 custom admin breaks execute independently with generic Break OUT/IN labels & zero session name leakage', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Engineering' });
    const customSettings = {
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 'brk_alpha', name: 'Admin Pause Alpha', enabled: true, outTime: '10:30', returnDeadline: '10:45', gracePeriodMinutes: 0 },
          { id: 'brk_beta', name: 'Midday Halt Beta', enabled: true, outTime: '13:15', returnDeadline: '14:00', gracePeriodMinutes: 5 },
          { id: 'brk_gamma', name: 'Afternoon Rest Gamma', enabled: true, outTime: '16:15', returnDeadline: '16:30', gracePeriodMinutes: 0 }
        ]
      }
    };
    db.settings.push(customSettings);
    db.workers.push({ _id: 'w_3b', name: 'ThreeBreaks', rfid: 'RF3B', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] });
    db.attendances.push({ _id: 'in_3b_0', worker: 'w_3b', rfid: 'RF3B', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    // Sweep 1 (10:30) -> Break OUT #1 -> Return on time
    await checkAndExecuteLunchBreak(ist('10:30'));
    const out1 = db.attendances.find(a => a.worker === 'w_3b' && a.outSessionId === 'brk_alpha');
    assert.ok(out1 && out1.punchType === 'LUNCH_OUT');
    assert.strictEqual(out1.outSessionName, null, 'Scheduler must not persist hardcoded or exposed session names');
    out1.createdAt = ist('10:30');
    const ret1 = await resolveLunchReturnDetails('RF3B', 'acme', true, TODAY_IST, 'w_3b', ist('10:40'));
    assert.strictEqual(ret1.punchType, 'LUNCH_IN');
    assert.strictEqual(ret1.outSessionId, 'brk_alpha');
    assert.strictEqual(ret1.lunchLateMinutes, 0);
    db.attendances.push({
      _id: 'in_3b_1',
      worker: 'w_3b',
      rfid: 'RF3B',
      subdomain: 'acme',
      department: 'd1',
      date: TODAY_IST,
      time: '10:40:00 AM',
      presence: true,
      punchType: ret1.punchType,
      isLunchPunch: true,
      outSessionId: ret1.outSessionId,
      lunchLateMinutes: ret1.lunchLateMinutes,
      createdAt: ist('10:40')
    });

    // Sweep 2 (13:15) -> Break OUT #2 -> Late return (+15m past 14:00+5m)
    await checkAndExecuteLunchBreak(ist('13:15'));
    const out2 = db.attendances.find(a => a.worker === 'w_3b' && a.outSessionId === 'brk_beta');
    assert.ok(out2 && out2.punchType === 'LUNCH_OUT');
    out2.createdAt = ist('13:15');
    const ret2 = await resolveLunchReturnDetails('RF3B', 'acme', true, TODAY_IST, 'w_3b', ist('14:20'));
    assert.strictEqual(ret2.punchType, 'LUNCH_IN');
    assert.strictEqual(ret2.outSessionId, 'brk_beta');
    assert.strictEqual(ret2.lunchLateMinutes, 15);
    db.attendances.push({
      _id: 'in_3b_2',
      worker: 'w_3b',
      rfid: 'RF3B',
      subdomain: 'acme',
      department: 'd1',
      date: TODAY_IST,
      time: '02:20:00 PM',
      presence: true,
      punchType: ret2.punchType,
      isLunchPunch: true,
      outSessionId: ret2.outSessionId,
      lunchLateMinutes: ret2.lunchLateMinutes,
      createdAt: ist('14:20')
    });

    // Sweep 3 (16:15) -> Break OUT #3 -> Missing return
    await checkAndExecuteLunchBreak(ist('16:15'));
    const out3 = db.attendances.find(a => a.worker === 'w_3b' && a.outSessionId === 'brk_gamma');
    assert.ok(out3 && out3.punchType === 'LUNCH_OUT');
    out3.createdAt = ist('16:15');
    out3.isMissingLunchReturn = true;

    // Verify attendance endpoints strip outSessionName (including if historical record had one) and return breakLabel
    db.attendances.push({
      _id: 'hist_named',
      worker: 'w_3b',
      rfid: 'RF3B',
      subdomain: 'acme',
      department: 'd1',
      date: '2026-10-15',
      time: '01:00:00 PM',
      presence: false,
      punchType: 'LUNCH_OUT',
      outSessionId: 'legacy',
      outSessionName: 'HistoricalTeaBreak',
      createdAt: ist('13:00', '2026-10-15')
    });

    const allRes = makeRes();
    await getAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme' } }, allRes);
    const workerRes = makeRes();
    await getWorkerAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF3B', subdomain: 'acme' } }, workerRes);
    const pagRes = makeRes();
    await getPaginatedAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', page: 1, limit: 10 } }, pagRes);

    for (const payload of [allRes.body, workerRes.body, pagRes.body]) {
      const jsonStr = JSON.stringify(payload);
      assert.ok(!jsonStr.includes('Admin Pause Alpha'));
      assert.ok(!jsonStr.includes('Midday Halt Beta'));
      assert.ok(!jsonStr.includes('Afternoon Rest Gamma'));
      assert.ok(!jsonStr.includes('HistoricalTeaBreak'));
      const breakOutRow = payload.attendance.find(r => r._id === out1._id);
      assert.strictEqual(breakOutRow.breakLabel, 'Break OUT');
      const breakInRow = payload.attendance.find(r => r._id === 'in_3b_1');
      assert.strictEqual(breakInRow.breakLabel, 'Break IN');
    }

    // Verify overview API returns all 3 sessions with generic labels and zero custom session names
    const ovwRes = makeRes();
    await getLunchAttendanceOverview({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', date: TODAY_IST } }, ovwRes);
    assert.strictEqual(ovwRes.body.overview.length, 3);
    assert.strictEqual(ovwRes.body.overview[0].breakOutLabel, 'Break OUT');
    assert.strictEqual(ovwRes.body.overview[0].breakInLabel, 'Break IN');
    assert.strictEqual(ovwRes.body.overview[1].lateMinutes, 15);
    assert.strictEqual(ovwRes.body.overview[1].status, 'Late Return');
    assert.strictEqual(ovwRes.body.overview[2].breakInLabel, null);
    assert.strictEqual(ovwRes.body.overview[2].status, 'Missing Return');
    const ovwJson = JSON.stringify(ovwRes.body);
    assert.ok(!ovwJson.includes('Admin Pause Alpha'));
    assert.ok(!ovwJson.includes('Midday Halt Beta'));
    assert.ok(!ovwJson.includes('Afternoon Rest Gamma'));

    // Verify Daily & Overview CSV exports show generic Break OUT / Break IN and zero session names
    const grouped = frontendHelpers.processAttendanceByDay(workerRes.body.attendance);
    const dailyCsv = frontendHelpers.buildAttendanceCsvContent({ activeTab: 'daily', processedAttendance: grouped });
    const overviewCsv = frontendHelpers.buildAttendanceCsvContent({ activeTab: 'lunch', filteredLunchOverview: ovwRes.body.overview, lunchDate: TODAY_IST });
    for (const csv of [dailyCsv, overviewCsv]) {
      assert.ok(csv.includes('Break OUT'));
      assert.ok(csv.includes('Break IN'));
      assert.ok(!csv.includes('Admin Pause Alpha'));
      assert.ok(!csv.includes('Midday Halt Beta'));
      assert.ok(!csv.includes('Afternoon Rest Gamma'));
      assert.ok(!csv.includes('HistoricalTeaBreak'));
      assert.ok(!csv.includes('Lunch Break'));
      assert.ok(!csv.includes('Tea Break'));
    }
  });

  console.log('\n======================================================================');
  console.log(` Summary: ${passed} Passed, ${total - passed} Failed out of ${total} Total Tests`);
  console.log('======================================================================');
})();
