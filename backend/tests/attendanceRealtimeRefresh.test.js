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
const nextId = (prefix) => `${prefix}_${seq++}`;
let emittedSocketEvents = [];

const resetStore = () => {
  db.settings = [];
  db.workers = [];
  db.attendances = [];
  db.refreshTokens = [];
  db.holidays = [];
  db.leaves = [];
  db.departments = [];
  emittedSocketEvents = [];
  seq = 1;
};

const matchFilter = (doc, query = {}) => {
  for (const [k, v] of Object.entries(query)) {
    if (k === '$or') {
      if (!v.some((clause) => matchFilter(doc, clause))) return false;
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
      if ('$gte' in v) {
        if (new Date(val) < new Date(v.$gte)) return false;
        continue;
      }
      if ('$lte' in v) {
        if (new Date(val) > new Date(v.$lte)) return false;
        continue;
      }
      if ('$lt' in v) {
        if (!(String(val) < String(v.$lt))) return false;
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
      const entries = Object.entries(spec);
      current.sort((a, b) => {
        for (const [field, dir] of entries) {
          const av = field === 'createdAt' ? new Date(a[field] || 0).getTime() : String(a[field] || '');
          const bv = field === 'createdAt' ? new Date(b[field] || 0).getTime() : String(b[field] || '');
          if (av !== bv) {
            return dir < 0 ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1);
          }
        }
        return 0;
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
    findOne: async (q) => db.settings.find((s) => matchFilter(s, q)) || null
  },
  Worker: {
    find: (q) => makeQuery(db.workers.filter((w) => matchFilter(w, q)), false),
    findOne: async (q) => db.workers.find((w) => matchFilter(w, q)) || null,
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
    distinct: async (field, q) => [...new Set(db.attendances.filter((d) => matchFilter(d, q)).map((r) => String(r[field])))],
    create: async (doc) => {
      const record = {
        _id: nextId('att'),
        isMissingLunchReturn: false,
        lunchLateMinutes: 0,
        createdAt: doc.createdAt || new Date(Date.now() + seq * 10),
        ...doc
      };
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
    deleteMany: async () => ({ deletedCount: 0 })
  },
  Holiday: {
    findOne: async () => null
  },
  Leave: {
    findOne: async () => null
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
  exports: {
    getIO: () => ({
      to: (room) => ({
        emit: (event, payload) => {
          emittedSocketEvents.push({ room, event, payload });
        }
      })
    })
  }
};

const { checkAndExecuteLunchBreak, getISTDateTime } = require('../schedulers/lunchBreakScheduler');
const { putAttendance, getPaginatedAttendance } = require('../controllers/attendanceController');

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
  console.log(' Tech Ciphergate — Real-Time Attendance Refresh Verification Suite');
  console.log('======================================================================\n');

  const frontendHelpers = await import(
    pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/attendanceHelpers.js')).href
  );

  // 1. Scheduler emits sanitized attendance-update for Break OUT & Missing Return without sessionId/name leakage
  await runTest('Scheduler emits tenant attendance-update for Break OUT & Missing Return without session ID/name', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Engineering' });
    const secretSessionId = 'secret_sess_991';
    const secretSessionName = 'CONFIDENTIAL_TEA_NAME';
    db.settings.push({
      subdomain: 'AcmeCorp',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [{ id: secretSessionId, name: secretSessionName, enabled: true, outTime: '15:00', returnDeadline: '15:15', gracePeriodMinutes: 0 }]
      }
    });
    db.workers.push({ _id: 'w1', name: 'Asha', rfid: 'RF101', subdomain: 'AcmeCorp', status: 'Active', department: 'd1', processedOutSessions: [] });
    db.attendances.push({
      _id: nextId('att'), worker: 'w1', name: 'Asha', rfid: 'RF101', subdomain: 'AcmeCorp', department: 'd1', departmentName: 'Engineering',
      date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00')
    });

    await checkAndExecuteLunchBreak(ist('15:02'));

    const tenantOutEvents = emittedSocketEvents.filter(e => e.room === 'acmecorp' && e.event === 'attendance-update');
    assert.strictEqual(tenantOutEvents.length, 1, 'One tenant attendance-update emitted on auto Break OUT');
    assert.strictEqual(tenantOutEvents[0].payload.punchType, 'LUNCH_OUT');
    assert.strictEqual(tenantOutEvents[0].payload.breakLabel, 'Break OUT');
    assert.strictEqual(tenantOutEvents[0].payload.presence, false);
    assert.strictEqual(tenantOutEvents[0].payload.date, TODAY_IST);
    const outPayloadStr = JSON.stringify(tenantOutEvents[0].payload);
    assert.ok(!outPayloadStr.includes(secretSessionId) && !outPayloadStr.includes(secretSessionName), 'Tenant broadcast must not expose sessionId or name');

    emittedSocketEvents = [];
    await checkAndExecuteLunchBreak(ist('15:16'));
    const missingEvents = emittedSocketEvents.filter(e => e.room === 'acmecorp' && e.event === 'attendance-update');
    assert.strictEqual(missingEvents.length, 1, 'Missing Return sweep emits attendance-update once on transition');
    assert.strictEqual(missingEvents[0].payload.isMissingLunchReturn, true);
    assert.strictEqual(missingEvents[0].payload.breakLabel, 'Break OUT');
    assert.ok(!JSON.stringify(missingEvents[0].payload).includes(secretSessionId) && !JSON.stringify(missingEvents[0].payload).includes(secretSessionName));

    // Re-running after isMissingLunchReturn=true (modifiedCount=0) emits zero redundant updates
    emittedSocketEvents = [];
    await checkAndExecuteLunchBreak(ist('15:17'));
    assert.strictEqual(emittedSocketEvents.filter(e => e.event === 'attendance-update').length, 0);
  });

  // 2. Break IN punch emits sanitized attendance-update for real-time Break IN reflection
  await runTest('Manual/worker Break IN emits sanitized attendance-update event without session IDs or names', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Engineering' });
    const secretSessionId = 'lunch_hidden_id';
    const secretSessionName = 'Secret_Lunch_Label';
    db.settings.push({
      subdomain: 'acme',
      lunchBreakManagement: {
        enabled: true,
        appliesTo: 'all',
        sessions: [{ id: secretSessionId, name: secretSessionName, enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 0 }]
      }
    });
    db.workers.push({ _id: 'w2', name: 'Ravi', username: 'ravi', rfid: 'RF202', subdomain: 'acme', status: 'Active', department: 'd1', processedOutSessions: [`${TODAY_IST}_${secretSessionId}`] });
    db.attendances.push(
      { _id: nextId('att'), worker: 'w2', rfid: 'RF202', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00') },
      { _id: nextId('att'), worker: 'w2', rfid: 'RF202', subdomain: 'acme', department: 'd1', date: TODAY_IST, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true, outSessionId: secretSessionId, createdAt: ist('13:00') }
    );

    const req = { user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' }, body: { rfid: 'RF202', subdomain: 'acme', presence: true } };
    const res = makeRes();
    await putAttendance(req, res);
    assert.strictEqual(res.statusCode, 201);

    const events = emittedSocketEvents.filter(e => e.room === 'acme' && e.event === 'attendance-update');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].payload.punchType, 'LUNCH_IN');
    assert.strictEqual(events[0].payload.breakLabel, 'Break IN');
    assert.strictEqual(events[0].payload.presence, true);
    const jsonStr = JSON.stringify(events[0].payload);
    assert.ok(!jsonStr.includes(secretSessionId) && !jsonStr.includes(secretSessionName));
  });

  // 3. getPaginatedAttendance preserves pagination while also returning refreshed selected date
  await runTest('getPaginatedAttendance preserves pagination and refreshes selected filter date cleanly', async () => {
    resetStore();
    db.departments.push({ _id: 'd1', name: 'Engineering' });
    const dates = ['2026-11-11', '2026-11-10', '2026-11-09', '2026-11-08'];
    for (const d of dates) {
      db.attendances.push({
        _id: nextId('att'), worker: 'w1', name: 'Asha', rfid: 'RF1', subdomain: 'acme', department: 'd1', departmentName: 'Engineering',
        date: d, time: '01:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true,
        outSessionId: 'hidden_sess_id', outSessionName: 'Hidden Custom Name',
        createdAt: new Date(`${d}T13:00:00+05:30`)
      });
    }

    const res = makeRes();
    await getPaginatedAttendance({ user: { _id: 'admin_1', role: 'admin', subdomain: 'acme' }, body: { subdomain: 'acme', page: 1, limit: 2, date: '2026-11-08' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.currentPage, 1);
    assert.strictEqual(res.body.hasMore, true, 'Pagination metadata preserved for limit=2 across 4 dates');
    const returnedDates = [...new Set(res.body.attendance.map(r => r.date))].sort();
    assert.deepStrictEqual(returnedDates, ['2026-11-08', '2026-11-10', '2026-11-11']);
    assert.ok(res.body.attendance.every(r => r.breakLabel === 'Break OUT' && r.outSessionId === undefined && r.outSessionName === undefined));
  });

  // 4. mergeAttendanceRecords deduplicates, updates fields in-place, and supports Daily Break OUT + Break IN reflection
  await runTest('mergeAttendanceRecords prevents duplicates & reflects automatic Break OUT and Break IN without reload', async () => {
    const initial = [
      {
        _id: 'a1', worker: 'w1', name: 'Asha', rfid: 'RF1', departmentName: 'Engineering',
        date: TODAY_IST, time: '09:00:00 AM', presence: true, punchType: 'REGULAR', createdAt: ist('09:00').toISOString()
      }
    ];
    let state = frontendHelpers.mergeAttendanceRecords([], initial, { mode: 'replace' });
    assert.strictEqual(frontendHelpers.processAttendanceByDay(state)[0].outTimes.length, 1); // pending '-' out

    // Scheduler adds automatic LUNCH_OUT -> refreshed page arrives
    const afterBreakOut = [
      ...initial,
      {
        _id: 'a2', worker: 'w1', name: 'Asha', rfid: 'RF1', departmentName: 'Engineering',
        date: TODAY_IST, time: '03:00:00 PM', presence: false, punchType: 'LUNCH_OUT', isLunchPunch: true,
        outSessionId: 'leak_check_id', outSessionName: 'Secret Tea Break',
        createdAt: ist('15:00').toISOString()
      }
    ];
    state = frontendHelpers.mergeAttendanceRecords(state, afterBreakOut, { mode: 'replace' });
    assert.strictEqual(state.length, 2);
    assert.ok(state.every(r => r.outSessionId === undefined && r.outSessionName === undefined));

    const groupedOut = frontendHelpers.processAttendanceByDay(state);
    assert.strictEqual(groupedOut[0].outTimes.length, 1);
    assert.strictEqual(groupedOut[0].outTimes[0].time, '03:00:00 PM');
    assert.strictEqual(frontendHelpers.getBreakPunchLabel({ ...groupedOut[0].outTimes[0], presence: false }), 'Break OUT');

    // Duplicate append via Load More or overlapping snapshot must never create duplicate rows
    state = frontendHelpers.mergeAttendanceRecords(state, [afterBreakOut[1]], { mode: 'append' });
    assert.strictEqual(state.length, 2, 'Duplicate _id must never double-render');

    // Worker completes Break IN -> refreshed snapshot includes LUNCH_IN
    const afterBreakIn = [
      ...afterBreakOut,
      {
        _id: 'a3', worker: 'w1', name: 'Asha', rfid: 'RF1', departmentName: 'Engineering',
        date: TODAY_IST, time: '03:20:00 PM', presence: true, punchType: 'LUNCH_IN', isLunchPunch: true, lunchLateMinutes: 5,
        createdAt: ist('15:20').toISOString()
      }
    ];
    state = frontendHelpers.mergeAttendanceRecords(state, afterBreakIn, { mode: 'replace' });
    const groupedIn = frontendHelpers.processAttendanceByDay(state);
    assert.strictEqual(groupedIn[0].inTimes.length, 2);
    assert.strictEqual(frontendHelpers.getBreakPunchLabel({ ...groupedIn[0].inTimes[1], presence: true }), 'Break IN');
    assert.strictEqual(groupedIn[0].inTimes[1].lunchLateMinutes, 5);
  });

  // 5. createRefreshCoordinator prevents overlapping requests, coalesces bursts, skips busy polls, and cleans up on unmount
  await runTest('createRefreshCoordinator prevents overlapping calls, skips busy polls, coalesces bursts, and disposes cleanly', async () => {
    let activeCalls = 0;
    let maxConcurrent = 0;
    let totalCalls = 0;
    let releaseCurrent = null;

    const coord = createRefreshCoordinatorMock(frontendHelpers.createRefreshCoordinator);

    function createRefreshCoordinatorMock(factory) {
      return factory(async () => {
        totalCalls++;
        activeCalls++;
        maxConcurrent = Math.max(maxConcurrent, activeCalls);
        await new Promise((resolve) => {
          releaseCurrent = resolve;
        });
        activeCalls--;
      }, { debounceMs: 30 });
    }

    // Start first request -> stays in flight
    const firstPromise = coord.trigger({ manual: true });
    assert.strictEqual(coord.isInFlight(), true);

    // Periodic poll arrives while in-flight -> skipIfBusy must ignore it cleanly
    await coord.trigger({ skipIfBusy: true });
    assert.strictEqual(activeCalls, 1);

    // Rapid socket event arrives while in-flight -> must NOT start overlapping request; coalesces into 1 trailing call
    const burstPromise1 = coord.trigger({ debounce: true });
    const burstPromise2 = coord.trigger({ debounce: true });

    // Wait past debounce window while first request still in-flight
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(activeCalls, 1, 'Coalesced socket trigger must wait for in-flight request instead of overlapping');

    // Finish first request -> trailing coalesced call runs cleanly
    releaseCurrent();
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(maxConcurrent, 1, 'Never allow >1 concurrent refresh request');
    assert.strictEqual(totalCalls, 2, 'Initial request + 1 coalesced trailing request ran sequentially');

    // Finish trailing request
    releaseCurrent();
    await Promise.all([firstPromise, burstPromise1, burstPromise2]);
    assert.strictEqual(coord.isInFlight(), false);

    // Test unmount disposal cancels pending debounced timer and blocks queued execution
    const beforeDisposeCalls = totalCalls;
    coord.trigger({ debounce: true });
    coord.dispose();
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(coord.isDisposed(), true);
    assert.strictEqual(totalCalls, beforeDisposeCalls, 'Disposed coordinator on unmount must cancel pending refresh timers');
  });

  console.log('\n======================================================================');
  console.log(` Summary: ${passed} Passed, ${total - passed} Failed out of ${total} Total Tests`);
  console.log('======================================================================');
})();

