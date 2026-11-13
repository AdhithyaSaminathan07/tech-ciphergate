const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

// Strictly in-memory test harness — NEVER connects to MongoDB or reads .env
const db = {
  settings: [],
  workers: [],
  attendances: [],
  refreshTokens: [],
  holidays: [],
  leaves: [],
  departments: []
};

let seq = 1;
let simNow = null;
const nextId = (prefix) => `${prefix}_${seq++}`;
let legacyUniqueIndexWithoutSessionId = false;

const resetStore = () => {
  db.settings = [];
  db.workers = [];
  db.attendances = [];
  db.refreshTokens = [];
  db.holidays = [];
  db.leaves = [];
  db.departments = [];
  legacyUniqueIndexWithoutSessionId = false;
  simNow = null;
  seq = 1;
};

const matchFilter = (doc, query = {}) => {
  for (const [k, v] of Object.entries(query)) {
    if (k === '$or') {
      if (!v.some((clause) => matchFilter(doc, clause))) return false;
      continue;
    }
    if (k === 'punchType' && v && typeof v === 'object' && '$ne' in v) {
      if (doc.punchType === v.$ne) return false;
      continue;
    }
    const val = doc[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('$in' in v) {
        if (!v.$in.map(String).includes(String(val))) return false;
        continue;
      }
      if ('$ne' in v) {
        if (String(val) === String(v.$ne)) return false;
        continue;
      }
      if ('$gt' in v) {
        if (!(new Date(val) > new Date(v.$gt))) return false;
        continue;
      }
      if ('$gte' in v) {
        if (new Date(val) < new Date(v.$gte)) return false;
        continue;
      }
      if ('$lte' in v) {
        if (new Date(val) > new Date(v.$lte)) return false;
        continue;
      }
    }
    if (String(val) !== String(v)) return false;
  }
  return true;
};

const makeQuery = (rows, single = false) => {
  let current = [...rows];
  const q = {
    sort(spec) {
      const [[field, dir]] = Object.entries(spec);
      current.sort((a, b) => {
        const av = field === 'createdAt' ? new Date(a[field] || 0).getTime() : String(a[field] || '');
        const bv = field === 'createdAt' ? new Date(b[field] || 0).getTime() : String(b[field] || '');
        if (av === bv) return 0;
        return dir < 0 ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1);
      });
      return q;
    },
    populate() { return q; },
    then(resolve, reject) {
      return Promise.resolve(single ? (current[0] || null) : current).then(resolve, reject);
    }
  };
  return q;
};

const modelMocks = {
  Settings: {
    find: async (q) => db.settings.filter((s) => matchFilter({ ...s, 'lunchBreakManagement.enabled': s.lunchBreakManagement?.enabled }, q)),
    findOne: async (q) => db.settings.find((s) => matchFilter(s, q)) || null,
    create: async (doc) => { db.settings.push(doc); return doc; },
    findOneAndUpdate: async (q, update) => {
      let s = db.settings.find((d) => matchFilter(d, q));
      if (!s) {
        s = { subdomain: q.subdomain };
        db.settings.push(s);
      }
      if (update.$set) Object.assign(s, update.$set);
      return s;
    }
  },
  Worker: {
    find: (q) => makeQuery(db.workers.filter((w) => matchFilter(w, q)), false),
    findOne: async (q) => db.workers.find((w) => matchFilter(w, q)) || null,
    countDocuments: async (q) => db.workers.filter((w) => matchFilter(w, q)).length,
    findOneAndUpdate: async (q, update) => {
      const w = db.workers.find((d) => {
        if (String(d._id) !== String(q._id)) return false;
        if (q.processedOutSessions?.$ne) {
          return !(d.processedOutSessions || []).includes(q.processedOutSessions.$ne);
        }
        return true;
      });
      if (!w) return null;
      if (update.$addToSet) {
        for (const [k, v] of Object.entries(update.$addToSet)) {
          w[k] = w[k] || [];
          if (!w[k].includes(v)) w[k].push(v);
        }
      }
      return w;
    },
    updateOne: async (q, update) => {
      const w = db.workers.find((d) => String(d._id) === String(q._id));
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
    distinct: async (field, q) => {
      const rows = db.attendances.filter((d) => matchFilter(d, q));
      return [...new Set(rows.map((r) => String(r[field])))];
    },
    create: async (doc) => {
      if (doc.punchType === 'LUNCH_OUT') {
        const dup = db.attendances.find((a) =>
          String(a.worker) === String(doc.worker) &&
          a.date === doc.date &&
          a.punchType === 'LUNCH_OUT' &&
          (legacyUniqueIndexWithoutSessionId ? true : a.outSessionId === doc.outSessionId)
        );
        if (dup) {
          const err = new Error(
            legacyUniqueIndexWithoutSessionId
              ? 'E11000 duplicate key error collection: techgate.attendances index: worker_1_date_1_punchType_1'
              : 'E11000 duplicate key error collection: techgate.attendances index: worker_1_date_1_punchType_1_outSessionId_1'
          );
          err.code = 11000;
          throw err;
        }
      }
      const record = {
        _id: nextId('att'),
        isMissingLunchReturn: false,
        lunchLateMinutes: 0,
        createdAt: doc.createdAt || (simNow ? new Date(simNow.getTime() + seq * 10) : new Date(Date.now() + seq * 10)),
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
    findOne: async (q) => db.holidays.find((h) => matchFilter(h, q)) || null
  },
  Leave: {
    findOne: async (q) => db.leaves.find((lv) => matchFilter(lv, q)) || null
  },
  Department: {
    findById: async (id) => db.departments.find((d) => String(d._id) === String(id)) || { _id: id, name: 'Engineering' }
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

const connectDB = require('../config/db');
const {
  checkAndExecuteLunchBreak,
  getISTDateTime,
  DOWNTIME_RECOVERY_POLICY
} = require('../schedulers/lunchBreakScheduler');
const {
  putAttendance,
  putRfidAttendance,
  recognizeFaceAndMarkAttendance,
  getAttendance,
  getPaginatedAttendance,
  getWorkerAttendance,
  getWorkerLastAttendance,
  getLunchAttendanceOverview,
  resolveLunchReturnDetails
} = require('../controllers/attendanceController');
const {
  getSettings,
  getSettingsPublic,
  updateSettings
} = require('../controllers/settingsController');
const {
  calculateWorkerProductivity,
  calculateUnauthorizedAbsencePenalty
} = require('../utils/productivityCalculator');

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(p) { this.body = p; return this; }
});

const TODAY_IST = getISTDateTime(new Date()).dateStr;
const ist = (hhmm, day = TODAY_IST) => new Date(`${day}T${hhmm}:00+05:30`);
const runTick = async (hhmm, day = TODAY_IST) => {
  simNow = ist(hhmm, day);
  return checkAndExecuteLunchBreak(simNow);
};

const formatClock12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}:00 ${ampm}`;
};

let passed = 0;
let total = 0;
const runTest = async (name, fn) => {
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
  console.log(' Tech Ciphergate — Generic Multi-Break Engine Verification Suite');
  console.log('======================================================================\n');

  const frontendHelpers = await import(
    pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/attendanceHelpers.js')).href
  );

  // 1. 1, 2, 3, 5, and 10 configured sessions with custom admin names execute independently
  await runTest('1, 2, 3, 5 & 10 custom-named break sessions execute independently with exact OUT/IN pairing', async () => {
    const sessionCounts = [1, 2, 3, 5, 10];
    for (const count of sessionCounts) {
      resetStore();
      db.departments.push({ _id: 'd1', name: 'Operations' });
      const sessions = [];
      for (let i = 0; i < count; i++) {
        const startMins = 9 * 60 + 30 + i * 50; // 09:30, 10:20, ..., cleanly non-overlapping
        const endMins = startMins + 15;
        const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
        sessions.push({
          id: `custom_brk_${count}_${i + 1}`,
          name: `Custom Pause Alpha-${count}-${i + 1}`,
          enabled: true,
          outTime: fmt(startMins),
          returnDeadline: fmt(endMins),
          gracePeriodMinutes: 0
        });
      }

      const updateRes = makeRes();
      await updateSettings({
        params: { subdomain: 'acme' },
        user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
        body: { lunchBreakManagement: { enabled: true, appliesTo: 'all', sessions } }
      }, updateRes);
      assert.strictEqual(updateRes.statusCode, 200);
      assert.strictEqual(updateRes.body.lunchBreakManagement.sessions.length, count);

      const worker = { _id: `w_${count}`, name: `Worker ${count}`, rfid: `RF_${count}`, subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
      db.workers.push(worker);
      db.attendances.push({
        _id: nextId('att'),
        worker: worker._id,
        rfid: worker.rfid,
        subdomain: 'acme',
        date: TODAY_IST,
        time: '09:00:00 AM',
        presence: true,
        punchType: 'REGULAR',
        createdAt: ist('09:00')
      });

      for (let i = 0; i < count; i++) {
        const s = sessions[i];
        await runTick(s.outTime);
        const outsForSession = db.attendances.filter(a => a.worker === worker._id && a.punchType === 'LUNCH_OUT' && a.outSessionId === s.id);
        assert.strictEqual(outsForSession.length, 1, `Expected 1 LUNCH_OUT for ${s.id} in ${count}-session run`);
        assert.strictEqual(outsForSession[0].outSessionName, null, 'Must never persist configured break name onto Attendance');

        // Simulate return IN right at returnDeadline
        const retDetails = await resolveLunchReturnDetails(worker.rfid, 'acme', true, TODAY_IST, worker._id, ist(s.returnDeadline));
        assert.strictEqual(retDetails.punchType, 'LUNCH_IN');
        assert.strictEqual(retDetails.outSessionId, s.id);
        assert.strictEqual(retDetails.lunchLateMinutes, 0);

        await modelMocks.Attendance.create({
          worker: worker._id,
          rfid: worker.rfid,
          subdomain: 'acme',
          date: TODAY_IST,
          time: formatClock12(s.returnDeadline),
          presence: true,
          punchType: retDetails.punchType,
          isLunchPunch: retDetails.isLunchPunch,
          lunchLateMinutes: retDetails.lunchLateMinutes,
          outSessionId: retDetails.outSessionId,
          outSessionName: null,
          createdAt: ist(s.returnDeadline)
        });
      }

      const allOuts = db.attendances.filter(a => a.worker === worker._id && a.punchType === 'LUNCH_OUT');
      const allIns = db.attendances.filter(a => a.worker === worker._id && a.punchType === 'LUNCH_IN');
      assert.strictEqual(allOuts.length, count);
      assert.strictEqual(allIns.length, count);
    }
  });

  // 2. Dynamic config: ID preservation across edits + same-day rescheduling behavior
  await runTest('Editing preserves session IDs; rescheduled unexecuted session runs & never duplicates executed OUTs', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 'stable_brk_1', name: 'Morning Recess', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 },
          { id: 'stable_brk_2', name: 'Afternoon Pause', enabled: true, outTime: '15:00', returnDeadline: '15:15', gracePeriodMinutes: 0 }
        ]
      }
    });

    const wAlready = { _id: 'w_a', name: 'AlreadyOut', rfid: 'RFA', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [`${TODAY_IST}_stable_brk_1`] };
    const wOrphan = { _id: 'w_o', name: 'OrphanLocked', rfid: 'RFO', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [`${TODAY_IST}_stable_brk_1`] };
    const wLateJoin = { _id: 'w_l', name: 'JoinedAfter1115', rfid: 'RFL', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(wAlready, wOrphan, wLateJoin);

    // Worker wAlready received stable_brk_1 OUT at 11:00 and returned IN at 11:12
    db.attendances.push(
      { _id: nextId('att'), worker: 'w_a', rfid: 'RFA', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_a', rfid: 'RFA', subdomain: 'acme', date: TODAY_IST, time: '11:00:00 AM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'stable_brk_1', createdAt: ist('11:00') },
      { _id: nextId('att'), worker: 'w_a', rfid: 'RFA', subdomain: 'acme', date: TODAY_IST, time: '11:12:00 AM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'stable_brk_1', createdAt: ist('11:12') },
      { _id: nextId('att'), worker: 'w_o', rfid: 'RFO', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_l', rfid: 'RFL', subdomain: 'acme', date: TODAY_IST, time: '11:30:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('11:30') }
    );

    // Admin renames and reschedules stable_brk_1 to 12:30-12:45 with explicit same-day retry
    const editRes = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [
            { id: 'stable_brk_1', name: 'Renamed Morning Recess', enabled: true, outTime: '12:30', returnDeadline: '12:45', gracePeriodMinutes: 0 },
            { id: 'stable_brk_2', name: 'Afternoon Pause', enabled: true, outTime: '15:00', returnDeadline: '15:15', gracePeriodMinutes: 0 }
          ]
        },
        explicitRescheduleSessionIds: ['stable_brk_1']
      },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' }
    }, editRes);

    assert.strictEqual(editRes.body.lunchBreakManagement.sessions[0].id, 'stable_brk_1');
    assert.strictEqual(editRes.body.rescheduleAudit.unlockedOrphanLocks, 1);
    assert.strictEqual(editRes.body.rescheduleAudit.preservedExecutedRecords, 1);

    await checkAndExecuteLunchBreak(ist('12:30'));

    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_a' && a.outSessionId === 'stable_brk_1' && a.punchType === 'LUNCH_OUT').length, 1, 'Executed worker must never get duplicate OUT');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_o' && a.outSessionId === 'stable_brk_1' && a.punchType === 'LUNCH_OUT').length, 1, 'Orphan-locked worker must execute at rescheduled time');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_l' && a.outSessionId === 'stable_brk_1' && a.punchType === 'LUNCH_OUT').length, 1, 'Unprocessed worker must execute at rescheduled time');
  });

  // 3. Disabled and newly enabled sessions (including mid-break disabling)
  await runTest('Disabled session skips OUT; disabling mid-break preserves Missing Return sweep; newly enabled runs', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 's_mid', name: 'Midday Break', enabled: true, outTime: '12:00', returnDeadline: '12:15', gracePeriodMinutes: 0 },
          { id: 's_off', name: 'Paused Break', enabled: false, outTime: '14:00', returnDeadline: '14:15', gracePeriodMinutes: 0 }
        ]
      }
    });
    const w = { _id: 'w_dis', name: 'MidDis', rfid: 'RFMD', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: nextId('att'), worker: 'w_dis', rfid: 'RFMD', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    // s_mid fires OUT at 12:00
    await runTick('12:00');
    const midOut = db.attendances.find(a => a.worker === 'w_dis' && a.outSessionId === 's_mid');
    assert.ok(midOut);

    // Admin disables s_mid at 12:10 and enables s_off for 14:00
    db.settings[0].lunchBreakManagement.sessions[0].enabled = false;
    db.settings[0].lunchBreakManagement.sessions[1].enabled = true;

    // Missing Return sweep at 12:20 (> 12:15) MUST still mark s_mid as Missing Return even though s_mid was disabled mid-break
    await runTick('12:20');
    assert.strictEqual(midOut.isMissingLunchReturn, true, 'Mid-break disabled session must still mark Missing Return after cutoff');

    // Worker returns late at 12:25, clearing missing flag and punching IN so newly enabled s_off can trigger at 14:00
    const ret = await resolveLunchReturnDetails('RFMD', 'acme', true, TODAY_IST, 'w_dis', ist('12:25'));
    assert.strictEqual(ret.lunchLateMinutes, 10);
    assert.strictEqual(midOut.isMissingLunchReturn, false);
    await modelMocks.Attendance.create({
      worker: 'w_dis', rfid: 'RFMD', subdomain: 'acme', date: TODAY_IST, time: '12:25:00 PM', presence: true,
      punchType: ret.punchType, isLunchPunch: true, outSessionId: ret.outSessionId, lunchLateMinutes: ret.lunchLateMinutes, createdAt: ist('12:25')
    });

    await runTick('14:00');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_dis' && a.outSessionId === 's_off' && a.punchType === 'LUNCH_OUT').length, 1);
  });

  // 4. Scopes (departments, shifts, employees) + multi-tenant isolation
  await runTest('Department, shift, employee scopes & multi-tenant isolation remain independent', async () => {
    resetStore();
    db.departments.push({ _id: 'dept_eng', name: 'Engineering' }, { _id: 'dept_sales', name: 'Sales' });
    db.settings.push(
      {
        subdomain: 'tenant-alpha',
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'departments',
          applicableDepartments: ['dept_eng'],
          sessions: [{ id: 'alpha_s1', name: 'Eng Break', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
        }
      },
      {
        subdomain: 'tenant-beta',
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'shifts',
          applicableShifts: ['NightShift'],
          sessions: [{ id: 'beta_s1', name: 'Night Break', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
        }
      }
    );

    db.workers.push(
      { _id: 'w_a_eng', name: 'AlphaEng', rfid: 'R1', subdomain: 'tenant-alpha', status: 'Active', department: 'dept_eng', processedOutSessions: [] },
      { _id: 'w_a_sal', name: 'AlphaSales', rfid: 'R2', subdomain: 'tenant-alpha', status: 'Active', department: 'dept_sales', processedOutSessions: [] },
      { _id: 'w_b_night', name: 'BetaNight', rfid: 'R3', subdomain: 'tenant-beta', status: 'Active', department: 'dept_sales', batch: 'NightShift', processedOutSessions: [] },
      { _id: 'w_b_day', name: 'BetaDay', rfid: 'R4', subdomain: 'tenant-beta', status: 'Active', department: 'dept_eng', batch: 'DayShift', processedOutSessions: [] }
    );
    for (const w of db.workers) {
      db.attendances.push({ _id: nextId('att'), worker: w._id, rfid: w.rfid, subdomain: w.subdomain, date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });
    }

    await runTick('11:00');

    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_a_eng' && a.punchType === 'LUNCH_OUT').length, 1);
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_a_sal' && a.punchType === 'LUNCH_OUT').length, 0);
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_b_night' && a.punchType === 'LUNCH_OUT').length, 1);
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_b_day' && a.punchType === 'LUNCH_OUT').length, 0);

    // Employee-level scope check
    db.settings[0].lunchBreakManagement = {
      enabled: true,
      appliesTo: 'employees',
      applicableEmployees: ['w_a_sal'],
      sessions: [{ id: 'alpha_emp', name: 'Emp Break', enabled: true, outTime: '15:00', returnDeadline: '15:15', gracePeriodMinutes: 0 }]
    };
    await checkAndExecuteLunchBreak(ist('15:00'));
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_a_sal' && a.outSessionId === 'alpha_emp').length, 1);
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_a_eng' && a.outSessionId === 'alpha_emp').length, 0);
  });

  // 5. Repeated ticks & concurrent scheduler instances prevent duplicate OUTs
  await runTest('Repeated ticks and concurrent scheduler instances produce zero duplicate LUNCH_OUT records', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [{ id: 'conc_s1', name: 'Pause', enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
      }
    });
    const w = { _id: 'w_conc', name: 'Conc', rfid: 'RFC', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: nextId('att'), worker: 'w_conc', rfid: 'RFC', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    // Launch 5 concurrent scheduler instances + subsequent ticks inside the window
    await Promise.all([
      checkAndExecuteLunchBreak(ist('11:00')),
      checkAndExecuteLunchBreak(ist('11:00')),
      checkAndExecuteLunchBreak(ist('11:00')),
      checkAndExecuteLunchBreak(ist('11:01')),
      checkAndExecuteLunchBreak(ist('11:05'))
    ]);

    const outs = db.attendances.filter(a => a.worker === 'w_conc' && a.punchType === 'LUNCH_OUT' && a.outSessionId === 'conc_s1');
    assert.strictEqual(outs.length, 1, 'Exactly one LUNCH_OUT record must exist despite concurrent ticks');
  });

  // 6. Legacy unique index detection: read-only startup audit + scheduler E11000 conflict handling
  await runTest('Read-only startup index audit detects legacy unique index without mutating DB; scheduler logs conflict safely', async () => {
    let mutated = false;
    const silentLogger = { warn: () => {}, error: () => {}, log: () => {} };
    const makeMockDb = (indexes) => ({
      listCollections: () => ({ toArray: async () => [{ name: 'attendances' }] }),
      collection: () => ({
        indexes: async () => indexes,
        dropIndex: async () => { mutated = true; },
        createIndex: async () => { mutated = true; }
      })
    });

    const badAudit = await connectDB.auditAttendanceIndexes(makeMockDb([
      { name: '_id_', key: { _id: 1 } },
      { name: 'worker_1_date_1_punchType_1', key: { worker: 1, date: 1, punchType: 1 }, unique: true, partialFilterExpression: { punchType: 'LUNCH_OUT' } }
    ]), silentLogger);

    assert.strictEqual(badAudit.ok, false);
    assert.strictEqual(badAudit.legacyUniqueIndexes.length, 1);
    assert.strictEqual(badAudit.legacyUniqueIndexes[0].name, 'worker_1_date_1_punchType_1');
    assert.strictEqual(badAudit.hasMultiSessionIndex, false);
    assert.strictEqual(mutated, false, 'Startup audit must strictly remain read-only');

    const goodAudit = await connectDB.auditAttendanceIndexes(makeMockDb([
      { name: '_id_', key: { _id: 1 } },
      { name: 'worker_1_date_1_punchType_1_outSessionId_1', key: { worker: 1, date: 1, punchType: 1, outSessionId: 1 }, unique: true, partialFilterExpression: { punchType: 'LUNCH_OUT' } }
    ]), silentLogger);
    assert.strictEqual(goodAudit.ok, true);
    assert.strictEqual(goodAudit.legacyUniqueIndexes.length, 0);
    assert.strictEqual(goodAudit.hasMultiSessionIndex, true);

    // Simulate live scenario from report: default_lunch succeeds, then legacy index causes E11000 on session 2
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 'default_lunch', name: 'Break 1', enabled: true, outTime: '12:07', returnDeadline: '12:10', gracePeriodMinutes: 0 },
          { id: 'session_1794372321260', name: 'Break 2', enabled: true, outTime: '12:12', returnDeadline: '12:20', gracePeriodMinutes: 0 }
        ]
      }
    });
    const w = { _id: 'w_idx', name: 'IdxUser', rfid: 'RFIX', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: nextId('att'), worker: 'w_idx', rfid: 'RFIX', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    await runTick('12:07');
    await modelMocks.Attendance.create({
      worker: 'w_idx', rfid: 'RFIX', subdomain: 'acme', date: TODAY_IST, time: '12:10:00 PM', presence: true,
      punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: 'default_lunch', createdAt: ist('12:10')
    });

    // Enable legacy unique index bug for session 2 -> must NOT fail with NOT_PUNCHED_IN; must hit E11000 LegacyIndexConflict and roll back lock!
    legacyUniqueIndexWithoutSessionId = true;
    await runTick('12:12');
    assert.ok(w.processedOutSessions.includes(`${TODAY_IST}_default_lunch`), 'First session lock preserved');
    assert.ok(!w.processedOutSessions.includes(`${TODAY_IST}_session_1794372321260`), 'Blocked second session lock must roll back cleanly');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_idx' && a.punchType === 'LUNCH_OUT').length, 1, 'Only default_lunch LUNCH_OUT exists when legacy unique index blocks session 2');
  });

  // 7. Backend downtime & explicit recovery policy
  await runTest('Downtime inside window recovers once with actual IST time; downtime past cutoff never backfills OUTs', async () => {
    assert.strictEqual(DOWNTIME_RECOVERY_POLICY.insideWindow, 'EXECUTE_ONCE_ON_RECOVERY_WITH_ACTUAL_IST_TIME');
    assert.strictEqual(DOWNTIME_RECOVERY_POLICY.afterCutoff, 'SKIP_OUT_NO_BACKFILL_PRESERVE_MISSING_RETURN_SWEEP');

    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: 'missed_win', name: 'Morning Recess', enabled: true, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 2 },
          { id: 'open_win', name: 'Afternoon Recess', enabled: true, outTime: '15:00', returnDeadline: '15:20', gracePeriodMinutes: 5 }
        ]
      }
    });
    const w = { _id: 'w_down', name: 'DownUser', rfid: 'RFDW', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: nextId('att'), worker: 'w_down', rfid: 'RFDW', subdomain: 'acme', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    // Server recovers at 11:00 after missed_win (10:00..10:17) completely closed -> must NOT backfill missed_win
    await runTick('11:00');
    assert.strictEqual(db.attendances.filter(a => a.outSessionId === 'missed_win').length, 0, 'Closed missed window must never fabricate late OUT');

    // Server recovers at 15:08 inside open_win (15:00..15:25) -> recovers once using actual current time
    await runTick('15:08');
    const openOut = db.attendances.find(a => a.outSessionId === 'open_win' && a.punchType === 'LUNCH_OUT');
    assert.ok(openOut);
    assert.ok(openOut.time.startsWith('03:08:'), `Expected actual recovery timestamp around 03:08 PM, got ${openOut.time}`);

    // Missing Return sweep at 15:26 still flags open_win
    await runTick('15:26');
    assert.strictEqual(openOut.isMissingLunchReturn, true);
  });

  // 8. Matching each OUT to IN (Manual/RFID/Face) + late return & missing return + generic labels & zero ID/name leakage
  await runTest('Generic labels, zero session ID/name exposure in employee attendance/APIs/CSV, accurate late/missing return', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    const secretSessionName = 'CONFIDENTIAL_CUSTOM_BREAK_NAME';
    const internalId = 'internal_brk_xyz_99';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [{ id: internalId, name: secretSessionName, enabled: true, outTime: '11:00', returnDeadline: '11:15', gracePeriodMinutes: 0 }]
      }
    });
    const w = { _id: 'w_vis', name: 'VisUser', username: 'vis', rfid: 'RFVS', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: nextId('att'), worker: 'w_vis', name: 'VisUser', username: 'vis', rfid: 'RFVS', subdomain: 'acme', department: 'd1', departmentName: 'Eng', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    await runTick('11:00');
    assert.ok(w.sessionInvalidatedAt instanceof Date, 'Auto Break OUT must set sessionInvalidatedAt for force-logout');

    // Public settings endpoint must not leak internal session ID or configured break name
    const pubRes = makeRes();
    await getSettingsPublic({ params: { subdomain: 'acme' } }, pubRes);
    const pubJson = JSON.stringify(pubRes.body);
    assert.ok(!pubJson.includes(secretSessionName), 'Public settings must not expose configured break names');
    assert.ok(!pubJson.includes(internalId), 'Public settings must not expose internal session IDs');

    // Employee attendance endpoints must expose generic Break OUT label, zero outSessionId & zero outSessionName
    const workerHistRes = makeRes();
    await getWorkerAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RFVS', subdomain: 'acme' } }, workerHistRes);
    const histJson = JSON.stringify(workerHistRes.body);
    assert.ok(!histJson.includes(secretSessionName));
    assert.ok(!histJson.includes(internalId), 'Employee attendance history must never expose internal outSessionId');
    const outEntry = workerHistRes.body.attendance.find(r => r.punchType === 'LUNCH_OUT');
    assert.strictEqual(outEntry.breakLabel, 'Break OUT');

    const lastRes = makeRes();
    await getWorkerLastAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { rfid: 'RFVS', subdomain: 'acme' } }, lastRes);
    assert.strictEqual(lastRes.body.lastAttendance.breakLabel, 'Break OUT');
    assert.strictEqual(lastRes.body.lastAttendance.outSessionId, undefined);
    assert.strictEqual(lastRes.body.lastAttendance.outSessionName, undefined);
    assert.strictEqual(lastRes.body.isOnLunchBreak, true);
    assert.deepStrictEqual(lastRes.body.lunchConfig, { returnDeadline: '11:15', gracePeriodMinutes: 0 });
    assert.ok(!JSON.stringify(lastRes.body).includes(secretSessionName));
    assert.ok(!JSON.stringify(lastRes.body).includes(internalId));

    const allAttRes = makeRes();
    await getAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme' } }, allAttRes);
    assert.ok(!JSON.stringify(allAttRes.body).includes(internalId));

    const pagAttRes = makeRes();
    await getPaginatedAttendance({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', page: 1, limit: 10 } }, pagAttRes);
    assert.ok(!JSON.stringify(pagAttRes.body).includes(internalId));

    // Employee misses return -> Missing Return sweep sets flag -> late RFID return clears flag and records late minutes
    await runTick('11:16');
    const dbOut = db.attendances.find(a => a.worker === 'w_vis' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(dbOut.isMissingLunchReturn, true);

    await modelMocks.Attendance.create({
      worker: 'w_vis', name: 'VisUser', username: 'vis', rfid: 'RFVS', subdomain: 'acme', department: 'd1', departmentName: 'Eng',
      date: TODAY_IST, time: '11:20:00 AM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: internalId, outSessionName: null, lunchLateMinutes: 5,
      createdAt: ist('11:20')
    });
    dbOut.isMissingLunchReturn = false;

    const overviewRes = makeRes();
    await getLunchAttendanceOverview({ user: { role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', date: TODAY_IST } }, overviewRes);
    assert.strictEqual(overviewRes.body.overview.length, 1);
    assert.strictEqual(overviewRes.body.overview[0].breakOutLabel, 'Break OUT');
    assert.strictEqual(overviewRes.body.overview[0].breakInLabel, 'Break IN');
    assert.strictEqual(overviewRes.body.overview[0].actualReturnTime, '11:20:00 AM');
    assert.strictEqual(overviewRes.body.overview[0].lateMinutes, 5);
    assert.strictEqual(overviewRes.body.overview[0].status, 'Late Return');
    assert.ok(!JSON.stringify(overviewRes.body).includes(secretSessionName));

    const grouped = frontendHelpers.processAttendanceByDay(workerHistRes.body.attendance.concat([{
      _id: 'ret_vis', worker: 'w_vis', name: 'VisUser', rfid: 'RFVS', departmentName: 'Eng',
      date: TODAY_IST, time: '11:20:00 AM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, lunchLateMinutes: 5,
      createdAt: ist('11:20')
    }]));
    assert.strictEqual(grouped[0].inTimes[1].outSessionId, undefined);
    assert.strictEqual(grouped[0].outTimes[0].outSessionId, undefined);

    const dailyCsv = frontendHelpers.buildAttendanceCsvContent({ activeTab: 'daily', processedAttendance: grouped });
    const overviewCsv = frontendHelpers.buildAttendanceCsvContent({ activeTab: 'lunch', filteredLunchOverview: overviewRes.body.overview, lunchDate: TODAY_IST });
    assert.ok(dailyCsv.includes('Break OUT') && dailyCsv.includes('Break IN') && dailyCsv.includes('+5m late'));
    assert.ok(!dailyCsv.includes(secretSessionName) && !dailyCsv.includes(internalId));
    assert.ok(overviewCsv.includes('Break OUT') && overviewCsv.includes('Break IN') && !overviewCsv.includes(secretSessionName) && !overviewCsv.includes(internalId));
  });

  // 9. Salary calculation with 1, 2 & 5 break windows + late returns (no double deduction)
  await runTest('Salary calculation reuses existing calculator for 1, 2 & 5 break windows without double deduction', async () => {
    const batch = [{ batchName: 'Standard', from: '09:00', to: '19:00', lunchFrom: '13:00', lunchTo: '14:00', isLunchConsider: false }];
    // Case A: Single Lunch Break 13:00-14:00 (60m unpaid), 5m late return at 14:05
    const sessions5 = [
      { id: 'b1', name: 'Break 1', enabled: true, outTime: '10:30', returnDeadline: '10:45', gracePeriodMinutes: 0 }, // 15m
      { id: 'b2', name: 'Break 2', enabled: true, outTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 0 }, // 60m (lunch overlap)
      { id: 'b3', name: 'Break 3', enabled: true, outTime: '15:30', returnDeadline: '15:45', gracePeriodMinutes: 0 }, // 15m
      { id: 'b4', name: 'Break 4', enabled: true, outTime: '16:30', returnDeadline: '16:45', gracePeriodMinutes: 0 }, // 15m
      { id: 'b5', name: 'Break 5', enabled: true, outTime: '17:30', returnDeadline: '17:45', gracePeriodMinutes: 0 }  // 15m
    ];
    // Total unpaid break minutes = 15 + 60 + 15 + 15 + 15 = 120m => standardWorkingMinutes = 600 - 120 = 480m (8h)
    const attendance5 = [
      { date: '2026-11-11', time: '09:00:00 AM', presence: true, punchType: 'REGULAR' },
      { date: '2026-11-11', time: '10:30:00 AM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'b1' },
      { date: '2026-11-11', time: '10:50:00 AM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'b1', lunchLateMinutes: 5 },
      { date: '2026-11-11', time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'b2' },
      { date: '2026-11-11', time: '02:00:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'b2', lunchLateMinutes: 0 },
      { date: '2026-11-11', time: '03:30:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'b3' },
      { date: '2026-11-11', time: '03:45:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'b3', lunchLateMinutes: 0 },
      { date: '2026-11-11', time: '04:30:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'b4' },
      { date: '2026-11-11', time: '04:45:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'b4', lunchLateMinutes: 0 },
      { date: '2026-11-11', time: '05:30:00 PM', presence: false, punchType: 'LUNCH_OUT', outSessionId: 'b5' },
      { date: '2026-11-11', time: '05:45:00 PM', presence: true, punchType: 'LUNCH_IN', outSessionId: 'b5', lunchLateMinutes: 0 },
      { date: '2026-11-11', time: '07:00:00 PM', presence: false, punchType: 'REGULAR' }
    ];

    const sal5 = calculateWorkerProductivity({
      worker: { _id: 'w_s5', salary: 12000, batch: 'Standard' },
      attendanceData: attendance5,
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        deductSalary: true,
        permissionTimeMinutes: 0,
        isLunchConsider: false,
        batches: batch,
        lunchBreakManagement: { enabled: true, appliesTo: 'all', sessions: sessions5 }
      }
    });

    assert.strictEqual(sal5.finalSummary['Total Working Hours'], '7.92 hours', '475m worked out of 480m standard working minutes');
    assert.strictEqual(sal5.finalSummary['Total Permission Time'], '5 minutes', 'Only the 5m late return after b1 must be penalized (zero double deduction)');

    // Unauthorized absence penalty must share exact per-minute divisor (480m/day for 5-break config)
    const unauth = calculateUnauthorizedAbsencePenalty(
      { _id: 'w_s5', salary: 12000, batch: 'Standard' },
      '2026-11-11',
      '2026-11-11',
      [{ worker: 'w_s5', leaveType: 'Permission', status: 'Pending', startDate: '2026-11-11', endDate: '2026-11-11', startTime: '11:00', endTime: '11:10' }],
      attendance5.map(a => ({ ...a, worker: 'w_s5' })),
      [],
      {
        batches: batch,
        advancedLeaveDeduction: { enableUnauthorizedPermissionPenalty: true },
        lunchBreakManagement: { enabled: true, appliesTo: 'all', sessions: sessions5 }
      }
    );
    assert.strictEqual(unauth.penalties.length, 1);
    assert.strictEqual(unauth.penalties[0].perMinuteSalary, 1, 'Rs 12000 / 25 working days / 480m = Rs 1/min');
    assert.strictEqual(unauth.totalNormal1XAmount, 10, '10m unauthorized permission * Rs 1/min = Rs 10');
  });

  // 10. Overlapping processing windows + per-session Applicable Scope overrides (dept, shift, employee, all)
  await runTest('Overlapping processing windows & per-session scopes execute independently across cohorts and salary calculation', async () => {
    resetStore();
    db.departments.push({ _id: 'd_eng', name: 'Engineering' }, { _id: 'd_ops', name: 'Operations' });
    const overlappingPayload = {
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          {
            id: 'cohort_eng',
            name: 'Arbitrary Pause One',
            enabled: true,
            outTime: '12:00',
            returnDeadline: '12:30',
            gracePeriodMinutes: 0,
            appliesTo: 'departments',
            applicableDepartments: ['d_eng']
          },
          {
            id: 'cohort_ops',
            name: 'Arbitrary Pause Two',
            enabled: true,
            outTime: '12:15',
            returnDeadline: '12:45',
            gracePeriodMinutes: 5,
            appliesTo: 'shifts',
            applicableShifts: ['OpsShift']
          },
          {
            id: 'cohort_vip',
            name: 'Arbitrary Pause Three',
            enabled: true,
            outTime: '12:20',
            returnDeadline: '12:35',
            gracePeriodMinutes: 0,
            appliesTo: 'employees',
            applicableEmployees: ['w_vip']
          }
        ]
      }
    };

    const upRes = makeRes();
    await updateSettings({ params: { subdomain: 'acme' }, user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' }, body: overlappingPayload }, upRes);
    assert.strictEqual(upRes.statusCode, 200, 'Overlapping processing windows across cohorts must save cleanly');

    const wEng = { _id: 'w_eng', name: 'Eng', rfid: 'RFE', subdomain: 'acme', status: 'Active', department: 'd_eng', batch: 'Day', processedOutSessions: [] };
    const wOps = { _id: 'w_ops', name: 'Ops', rfid: 'RFO', subdomain: 'acme', status: 'Active', department: 'd_ops', batch: 'OpsShift', processedOutSessions: [] };
    const wVip = { _id: 'w_vip', name: 'Vip', rfid: 'RFV', subdomain: 'acme', status: 'Active', department: 'd_ops', batch: 'OtherShift', processedOutSessions: [] };
    db.workers.push(wEng, wOps, wVip);
    db.refreshTokens.push(
      { _id: 'rt_e', userId: 'w_eng' },
      { _id: 'rt_o', userId: 'w_ops' },
      { _id: 'rt_v', userId: 'w_vip' }
    );
    db.attendances.push(
      { _id: nextId('att'), worker: 'w_eng', rfid: 'RFE', subdomain: 'acme', department: 'd_eng', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_ops', rfid: 'RFO', subdomain: 'acme', department: 'd_ops', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_vip', rfid: 'RFV', subdomain: 'acme', department: 'd_ops', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') }
    );

    await runTick('12:22');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_eng' && a.punchType === 'LUNCH_OUT').map(a => a.outSessionId).join(','), 'cohort_eng');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_ops' && a.punchType === 'LUNCH_OUT').map(a => a.outSessionId).join(','), 'cohort_ops');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_vip' && a.punchType === 'LUNCH_OUT').map(a => a.outSessionId).join(','), 'cohort_vip');
    assert.strictEqual(db.refreshTokens.length, 0, 'All three auto OUTs revoke active app tokens');

    // Per-session salary windows: wOps only gets 30m break (12:15-12:45), not cohort_eng or cohort_vip
    const opsSalary = calculateWorkerProductivity({
      worker: { _id: 'w_ops', salary: 12000, batch: 'OpsShift', department: 'd_ops' },
      attendanceData: [
        { date: '2026-11-11', time: '09:00:00 AM', presence: true, punchType: 'REGULAR' },
        { date: '2026-11-11', time: '06:00:00 PM', presence: false, punchType: 'REGULAR' }
      ],
      fromDate: '2026-11-11',
      toDate: '2026-11-11',
      options: {
        deductSalary: true,
        permissionTimeMinutes: 0,
        isLunchConsider: false,
        batches: [{ batchName: 'OpsShift', from: '09:00', to: '18:00', lunchFrom: '12:00', lunchTo: '12:30', isLunchConsider: false }],
        lunchBreakManagement: upRes.body.lunchBreakManagement
      }
    });
    assert.strictEqual(opsSalary.totalWorkingHours, 8.5, '9h shift minus single 30m applicable break = 8.5h (ignores non-matching cohort breaks)');
  });

  // 11. Renaming a break mid-day never breaks OUT/IN matching or salary calculation (fully name-agnostic)
  await runTest('Renaming a session preserves sessionId, OUT/IN matching, late minutes, and salary calculation', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    const stableId = 'session_stable_rename_1';
    const initSetRes = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [
            { id: stableId, name: 'Coffee Stop', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 },
            { id: 'tea_two', name: 'Short Stretch', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0, isBreakConsider: true }
          ]
        }
      }
    }, initSetRes);
    assert.strictEqual(initSetRes.statusCode, 200);
    const w = { _id: 'w_ren', name: 'RenameUser', rfid: 'RFRN', subdomain: 'acme', status: 'Active', department: 'd1', batch: 'Shift9h', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({ _id: nextId('att'), worker: 'w_ren', rfid: 'RFRN', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') });

    await runTick('13:30');
    const outPunch = db.attendances.find(a => a.worker === 'w_ren' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(outPunch.outSessionId, stableId);

    // Admin renames the session mid-break to a completely different custom name + adds a 3rd break without altering stableId
    const renameRes = makeRes();
    await updateSettings({
      params: { subdomain: 'acme' },
      user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' },
      body: {
        lunchBreakManagement: {
          enabled: true,
          appliesTo: 'all',
          sessions: [
            { id: stableId, name: 'Completely Renamed Pause Z', enabled: true, outTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0 },
            { id: 'tea_two', name: 'Short Stretch', enabled: true, outTime: '16:00', returnDeadline: '16:15', gracePeriodMinutes: 0, isBreakConsider: true },
            { id: 'new_late_brk', name: 'Late Afternoon Water', enabled: true, outTime: '17:30', returnDeadline: '17:40', gracePeriodMinutes: 0, isBreakConsider: true }
          ]
        }
      }
    }, renameRes);
    assert.strictEqual(renameRes.body.lunchBreakManagement.sessions[0].id, stableId);
    assert.strictEqual(renameRes.body.lunchBreakManagement.sessions[1].id, 'tea_two');

    // Employee punches IN 10m past deadline (14:40) -> still matches stableId & computes exact 10 late minutes
    const ret = await resolveLunchReturnDetails('RFRN', 'acme', true, TODAY_IST, 'w_ren', ist('14:40'));
    assert.strictEqual(ret.punchType, 'LUNCH_IN');
    assert.strictEqual(ret.outSessionId, stableId);
    assert.strictEqual(ret.lunchLateMinutes, 10);

    // Salary calculation with non-overlapping arbitrary break name still treats 60m session identically to batch lunch duration (no double subtraction)
    const salaryCustomName = calculateWorkerProductivity({
      worker: { _id: 'w_ren', salary: 30000, batch: 'Shift9h', department: 'd1' },
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
        lunchBreakManagement: renameRes.body.lunchBreakManagement
      }
    });
    assert.strictEqual(salaryCustomName.dailyBreakdown[0].workingMinutes, 470, 'Schedule duration (60m), not name, avoids double subtraction against 12:00-13:00 batch lunch');
    assert.strictEqual(salaryCustomName.summary.permissionDeduction, 25);
  });

  // 12. Two arbitrary custom-named sessions execute independently even when one has already processed or passed its window
  await runTest('Two arbitrary custom-named sessions execute independently even when one is already processed or past window', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    const s1Id = 'custom_early_brk_a';
    const s2Id = 'custom_later_brk_b';
    const s1Name = 'SECRET_MORNING_HYDRATION';
    const s2Name = 'SECRET_MIDDAY_RESET';

    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: s1Id, name: s1Name, enabled: true, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 1 },
          { id: s2Id, name: s2Name, enabled: true, outTime: '13:30', returnDeadline: '13:45', gracePeriodMinutes: 1 }
        ]
      }
    });

    const w = { _id: 'w_dual', name: 'DualWorker', rfid: 'RFDL', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [] };
    db.workers.push(w);
    db.attendances.push({
      _id: nextId('att'), worker: 'w_dual', rfid: 'RFDL', subdomain: 'acme', department: 'd1',
      date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00')
    });

    // Part A: Tick at 13:32 (after s1 closed at 10:16, inside s2 13:30..13:46) -> TenantScan reports enabledSessionsCount=2 & WINDOW_CLOSED vs IN_WINDOW; zero custom break names in logs
    const origLog = console.log;
    const captured = [];
    console.log = (...args) => captured.push(args.join(' '));
    try {
      await runTick('13:32');
    } finally {
      console.log = origLog;
    }
    const logBlob = captured.join('\n');
    assert.ok(logBlob.includes('"enabledSessionsCount":2'), 'Both enabled sessions detected');
    assert.ok(logBlob.includes(`"sessionId":"${s1Id}"`) && logBlob.includes('"state":"WINDOW_CLOSED"'), 'Closed earlier session state visible cleanly in TenantScan');
    assert.ok(logBlob.includes(`"sessionId":"${s2Id}"`) && logBlob.includes('"state":"IN_WINDOW"'), 'Active session executes inside window');
    assert.ok(!logBlob.includes(s1Name) && !logBlob.includes(s2Name), 'Configured custom break names must NOT leak in scheduler logs');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_dual' && a.punchType === 'LUNCH_OUT' && a.outSessionId === s1Id).length, 0, 'Closed earlier session does not backfill OUT');
    assert.strictEqual(db.attendances.filter(a => a.worker === 'w_dual' && a.punchType === 'LUNCH_OUT' && a.outSessionId === s2Id).length, 1, 'Active second session triggers LUNCH_OUT independently');

    // Part B: Now reset and pre-populate s2 as ALREADY processed earlier, return IN, then run s1 at 10:02 -> existing s2 LUNCH_OUT & lock must NEVER block s1 execution
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Eng' });
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: s1Id, name: s1Name, enabled: true, outTime: '10:00', returnDeadline: '10:15', gracePeriodMinutes: 1 },
          { id: s2Id, name: s2Name, enabled: true, outTime: '13:30', returnDeadline: '13:45', gracePeriodMinutes: 1 }
        ]
      }
    });
    const w2 = {
      _id: 'w_indep', name: 'IndepWorker', rfid: 'RFIN', subdomain: 'acme', status: 'Active', department: 'd1',
      processedOutSessions: [`${TODAY_IST}_${s2Id}`]
    };
    db.workers.push(w2);
    db.attendances.push(
      { _id: nextId('att'), worker: 'w_indep', rfid: 'RFIN', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w_indep', rfid: 'RFIN', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:30:00 AM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: s2Id, createdAt: ist('09:30') },
      { _id: nextId('att'), worker: 'w_indep', rfid: 'RFIN', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:45:00 AM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: s2Id, createdAt: ist('09:45') }
    );

    await runTick('10:02');
    const indepOuts = db.attendances.filter(a => a.worker === 'w_indep' && a.punchType === 'LUNCH_OUT');
    assert.strictEqual(indepOuts.length, 2, 'Session 1 must execute independently alongside already-processed Session 2');
    assert.deepStrictEqual(indepOuts.map(o => o.outSessionId).sort(), [s1Id, s2Id].sort());
    assert.ok(w2.processedOutSessions.includes(`${TODAY_IST}_${s1Id}`) && w2.processedOutSessions.includes(`${TODAY_IST}_${s2Id}`));
  });

  // 13. 15:02 production scenario reproduction: EXISTING_ATTENDANCE on same-day default_lunch + E11000 legacy index block + post-DBA Attendance Management & Break Overview display
  await runTest('15:02 EXISTING_ATTENDANCE root cause, legacy index block on Session 2, and post-remediation UI/API reflection', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Operations' });
    const s1Id = 'default_lunch';
    const s2Id = 'session_second_break';
    db.settings.push({
      subdomain: 'prodco',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [
          { id: s1Id, name: 'Lunch Break', enabled: true, outTime: '15:00', returnDeadline: '15:10', gracePeriodMinutes: 0 },
          { id: s2Id, name: 'Tea Break', enabled: true, outTime: '15:20', returnDeadline: '15:35', gracePeriodMinutes: 2 }
        ]
      }
    });

    const YESTERDAY_IST = getISTDateTime(new Date(ist('12:00').getTime() - 86400000)).dateStr;
    const workers = [
      { _id: 'e1', name: 'Emp One', username: 'emp1', rfid: 'RF01', subdomain: 'prodco', status: 'Active', department: 'd1', processedOutSessions: [] },
      { _id: 'e2', name: 'Emp Two', username: 'emp2', rfid: 'RF02', subdomain: 'prodco', status: 'Active', department: 'd1', processedOutSessions: [] },
      { _id: 'e3', name: 'Emp Three', username: 'emp3', rfid: 'RF03', subdomain: 'prodco', status: 'Active', department: 'd1', processedOutSessions: [] }
    ];
    db.workers.push(...workers);

    for (const w of workers) {
      // Prior-day default_lunch LUNCH_OUT must NEVER match today's EXISTING_ATTENDANCE check
      db.attendances.push({
        _id: nextId('att'), worker: w._id, name: w.name, rfid: w.rfid, subdomain: 'prodco', department: 'd1', departmentName: 'Operations',
        date: YESTERDAY_IST, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: s1Id,
        createdAt: new Date(ist('13:00').getTime() - 86400000)
      });
      // Today's morning punch IN + earlier same-day default_lunch LUNCH_OUT (e.g., before session reschedule to 15:00)
      db.attendances.push(
        {
          _id: nextId('att'), worker: w._id, name: w.name, rfid: w.rfid, subdomain: 'prodco', department: 'd1', departmentName: 'Operations',
          date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00')
        },
        {
          _id: nextId('att'), worker: w._id, name: w.name, rfid: w.rfid, subdomain: 'prodco', department: 'd1', departmentName: 'Operations',
          date: TODAY_IST, time: '12:05:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, source: 'SYSTEM/AUTOMATIC', outSessionId: s1Id,
          createdAt: ist('12:05')
        },
        {
          _id: nextId('att'), worker: w._id, name: w.name, rfid: w.rfid, subdomain: 'prodco', department: 'd1', departmentName: 'Operations',
          date: TODAY_IST, time: '12:15:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, outSessionId: s1Id,
          createdAt: ist('12:15')
        }
      );
    }

    // 1. At 15:02: default_lunch is IN_WINDOW; all 3 return ALREADY_PROCESSED / EXISTING_ATTENDANCE (despite fresh empty processedOutSessions!)
    const origLog = console.log;
    const captured = [];
    console.log = (...args) => captured.push(args.join(' '));
    try {
      await runTick('15:02');
    } finally {
      console.log = origLog;
    }
    const logBlob = captured.join('\n');
    assert.ok(logBlob.includes('"enabledSessionsCount":2'), 'Two enabled sessions reported');
    assert.ok(logBlob.includes(`"sessionId":"${s1Id}"`) && logBlob.includes('"state":"IN_WINDOW"'), 'Lunch session is IN_WINDOW at 15:02');
    assert.ok(logBlob.includes('"ALREADY_PROCESSED":3') && logBlob.includes('"EXISTING_ATTENDANCE":3'), 'All 3 employees skipped with ALREADY_PROCESSED / EXISTING_ATTENDANCE');
    assert.strictEqual(db.attendances.filter(a => a.date === TODAY_IST && a.punchType === 'LUNCH_OUT').length, 3, 'No duplicate default_lunch LUNCH_OUT inserted at 15:02');

    // 2. With legacy unique index worker_1_date_1_punchType_1 active, Session 2 at 15:20 hits E11000 DUPLICATE_KEY for all 3 employees
    legacyUniqueIndexWithoutSessionId = true;
    const capturedLegacy = [];
    console.log = (...args) => capturedLegacy.push(args.join(' '));
    const origErr = console.error;
    const errLogs = [];
    console.error = (...args) => errLogs.push(args.join(' '));
    try {
      await runTick('15:20');
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    assert.ok(errLogs.join('\n').includes('LegacyIndexConflict'), 'E11000 legacy index conflict logged safely');
    assert.ok(capturedLegacy.join('\n').includes('"DUPLICATE_KEY":3'), 'All 3 employees fail Session 2 with DUPLICATE_KEY under legacy index');
    assert.strictEqual(db.attendances.filter(a => a.date === TODAY_IST && a.outSessionId === s2Id).length, 0, 'Zero Session 2 LUNCH_OUT rows under legacy index');
    assert.ok(workers.every(w => !w.processedOutSessions.includes(`${TODAY_IST}_${s2Id}`)), 'Session 2 lock rolled back cleanly on E11000');

    // 3. After DBA drops legacy index and ensures partial compound unique index, Session 2 executes independently at 15:21
    legacyUniqueIndexWithoutSessionId = false;
    await runTick('15:21');
    assert.strictEqual(db.attendances.filter(a => a.date === TODAY_IST && a.outSessionId === s2Id && a.punchType === 'LUNCH_OUT').length, 3, 'All 3 employees get independent Session 2 LUNCH_OUT after remediation');

    // Verify Admin Attendance APIs & Daily Grouping reflect BOTH sessions' Break OUT punches cleanly
    const pagRes = makeRes();
    await getPaginatedAttendance({ user: { role: 'admin', subdomain: 'prodco' }, body: { subdomain: 'prodco', page: 1, limit: 2 } }, pagRes);
    assert.strictEqual(pagRes.statusCode, 200);
    const todayApiRows = pagRes.body.attendance.filter(r => r.date === TODAY_IST);
    assert.strictEqual(todayApiRows.filter(r => r.punchType === 'LUNCH_OUT').length, 6, 'Paginated API returns all 6 Break OUT rows across both sessions');
    assert.ok(todayApiRows.filter(r => r.punchType === 'LUNCH_OUT').every(r => r.breakLabel === 'Break OUT' && r.outSessionId === undefined && r.outSessionName === undefined));

    const groupedDaily = frontendHelpers.processAttendanceByDay(pagRes.body.attendance).filter(g => g.date === TODAY_IST);
    assert.strictEqual(groupedDaily.length, 3, 'All 3 employees appear once for today in Daily Attendance');
    assert.ok(groupedDaily.every(g => g.outTimes.length === 2 && g.outTimes.every(o => frontendHelpers.getBreakPunchLabel({ ...o, presence: false }) === 'Break OUT')), 'Daily table displays both Break OUT badges per employee');

    const overviewRes = makeRes();
    await getLunchAttendanceOverview({ user: { role: 'admin', subdomain: 'prodco' }, body: { subdomain: 'prodco', date: TODAY_IST } }, overviewRes);
    assert.strictEqual(overviewRes.body.overview.length, 6, 'Break Overview API displays all 6 session break rows across 3 employees');
  });

  console.log('\n======================================================================');
  console.log(` Summary: ${passed} Passed, ${total - passed} Failed out of ${total} Total Tests`);
  console.log('======================================================================');
})();
