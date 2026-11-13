/**
 * Tech Ciphergate — Break Session Overlap Validation Test Suite
 *
 * Strictly isolated in-memory tests (zero MongoDB connections, zero live writes).
 * Tests both backend validation (settingsController + backend/utils/breakSessionValidation)
 * and frontend validation (frontend/src/utils/breakSessionValidation + Settings.jsx static contracts).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const { getNormalizedSessions, timeToMinutes } = require('../schedulers/lunchBreakScheduler');
const settingsController = require('../controllers/settingsController');
const backendVal = require('../utils/breakSessionValidation');

const createMockRes = () => {
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

let savedSettingsStore = null;
let mockActiveWorkers = [];

Settings.findOne = async ({ subdomain }) => {
  if (savedSettingsStore && savedSettingsStore.subdomain === subdomain) {
    return savedSettingsStore;
  }
  return { _id: 'set_1', subdomain };
};

Settings.findOneAndUpdate = async (filter, updateObj) => {
  savedSettingsStore = {
    _id: 'set_1',
    subdomain: filter.subdomain,
    ...updateObj.$set
  };
  return savedSettingsStore;
};

Worker.find = () => ({
  select() {
    return this;
  },
  lean: async () => mockActiveWorkers
});

const run = async () => {
  const frontendValUrl = pathToFileURL(
    path.resolve(__dirname, '../../frontend/src/utils/breakSessionValidation.js')
  ).href;
  const frontendVal = await import(frontendValUrl);

  const settingsJsxSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/components/admin/Settings.jsx'),
    'utf8'
  );

  let passed = 0;
  const test = async (name, fn) => {
    savedSettingsStore = null;
    mockActiveWorkers = [];
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (err) {
      console.error(`FAIL: ${name}\n`, err);
      process.exitCode = 1;
    }
  };

  // 1. Production exact config must PASS
  await test('Tea Break (13:54-13:57 + 2m grace = 13:59) & Lunch Break (15:29-15:40 + 1m grace = 15:41) with all scope MUST PASS', async () => {
    const lunchBreakManagement = {
      enabled: true,
      appliesTo: 'all',
      lunchOutTime: '15:29',
      returnDeadline: '15:40',
      gracePeriodMinutes: 1,
      sessions: [
        {
          id: 'session_1794372321260',
          name: 'Tea Break',
          enabled: true,
          outTime: '13:54',
          returnDeadline: '13:57',
          gracePeriodMinutes: 2,
          appliesTo: 'all'
        },
        {
          id: 'default_lunch',
          name: 'Lunch Break',
          enabled: true,
          outTime: '15:29',
          returnDeadline: '15:40',
          gracePeriodMinutes: 1,
          appliesTo: 'all'
        }
      ]
    };

    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(lunchBreakManagement), null);
    assert.strictEqual(backendVal.validateLunchBreakManagementConfig(lunchBreakManagement), null);
    assert.strictEqual(settingsController.validateLunchBreakManagement(lunchBreakManagement), null);

    const req = { params: { subdomain: 'test-tenant' }, user: { _id: 'admin_1', role: 'admin', subdomain: 'test-tenant' }, body: { lunchBreakManagement } };
    const res = createMockRes();
    await settingsController.updateSettings(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lunchBreakManagement.sessions.length, 2);
  });

  // 2. Overlapping windows with same/intersecting scope MUST FAIL
  await test('Overlapping windows with same or intersecting employee scope MUST FAIL on both frontend and backend', async () => {
    const overlappingAll = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'Tea Break', enabled: true, outTime: '13:50', returnDeadline: '14:10', gracePeriodMinutes: 0, appliesTo: 'all' },
        { id: 's2', name: 'Lunch Break', enabled: true, outTime: '14:00', returnDeadline: '14:20', gracePeriodMinutes: 0, appliesTo: 'all' }
      ]
    };

    const feErr = frontendVal.validateLunchBreakManagementConfig(overlappingAll);
    const beErr = settingsController.validateLunchBreakManagement(overlappingAll);
    assert.ok(feErr && /overlap/i.test(feErr), `Expected frontend overlap error, got ${feErr}`);
    assert.strictEqual(feErr, beErr);

    const req = { params: { subdomain: 'test-tenant' }, user: { _id: 'admin_1', role: 'admin', subdomain: 'test-tenant' }, body: { lunchBreakManagement: overlappingAll } };
    const res = createMockRes();
    await settingsController.updateSettings(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body.message, /Sessions Tea Break and Lunch Break overlap/i);

    // Same department intersection
    const sameDept = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'A', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 0, appliesTo: 'departments', applicableDepartments: ['dept_eng', 'dept_qa'] },
        { id: 's2', name: 'B', enabled: true, outTime: '13:15', returnDeadline: '13:45', gracePeriodMinutes: 0, appliesTo: 'departments', applicableDepartments: ['dept_qa'] }
      ]
    };
    assert.match(frontendVal.validateLunchBreakManagementConfig(sameDept), /overlap/i);
    assert.match(settingsController.validateLunchBreakManagement(sameDept), /overlap/i);

    // Mixed dimension (departments vs employees) intersecting via active workers
    mockActiveWorkers = [
      { _id: 'w_eng_1', department: 'dept_eng', batch: 'DayShift' },
      { _id: 'w_ops_1', department: 'dept_ops', batch: 'NightShift' }
    ];
    const mixedIntersect = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'DeptBreak', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 0, appliesTo: 'departments', applicableDepartments: ['dept_eng'] },
        { id: 's2', name: 'VipBreak', enabled: true, outTime: '13:15', returnDeadline: '13:45', gracePeriodMinutes: 0, appliesTo: 'employees', applicableEmployees: ['w_eng_1'] }
      ]
    };
    assert.match(
      frontendVal.validateLunchBreakManagementConfig(mixedIntersect, { workers: mockActiveWorkers }),
      /overlap/i
    );
    const reqMixed = { params: { subdomain: 'test-tenant' }, user: { _id: 'admin_1', role: 'admin', subdomain: 'test-tenant' }, body: { lunchBreakManagement: mixedIntersect } };
    const resMixed = createMockRes();
    await settingsController.updateSettings(reqMixed, resMixed);
    assert.strictEqual(resMixed.statusCode, 400);
    assert.match(resMixed.body.message, /overlap/i);
  });

  // 3. Overlapping windows with completely disjoint employee scopes MUST PASS
  await test('Overlapping windows with disjoint employee scopes MUST PASS', async () => {
    mockActiveWorkers = [
      { _id: 'w_eng_1', department: 'dept_eng', batch: 'DayShift' },
      { _id: 'w_ops_1', department: 'dept_ops', batch: 'NightShift' }
    ];

    const disjointScopes = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'Eng Tea', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 5, appliesTo: 'departments', applicableDepartments: ['dept_eng'] },
        { id: 's2', name: 'Ops Tea', enabled: true, outTime: '13:10', returnDeadline: '13:40', gracePeriodMinutes: 5, appliesTo: 'departments', applicableDepartments: ['dept_ops'] },
        { id: 's3', name: 'Night Worker Break', enabled: true, outTime: '13:15', returnDeadline: '13:45', gracePeriodMinutes: 0, appliesTo: 'employees', applicableEmployees: ['w_ops_1'] }
      ]
    };

    // Wait: Ops Tea (dept_ops) and Night Worker Break (w_ops_1 in dept_ops) DO overlap! Test strict disjoint set:
    const trulyDisjoint = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'Eng Break', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 5, appliesTo: 'departments', applicableDepartments: ['dept_eng'] },
        { id: 's2', name: 'Ops Break', enabled: true, outTime: '13:10', returnDeadline: '13:40', gracePeriodMinutes: 5, appliesTo: 'departments', applicableDepartments: ['dept_ops'] }
      ]
    };
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(trulyDisjoint, { workers: mockActiveWorkers }), null);
    const res1 = createMockRes();
    await settingsController.updateSettings({ params: { subdomain: 'test-tenant' }, user: { _id: 'admin_1', role: 'admin', subdomain: 'test-tenant' }, body: { lunchBreakManagement: trulyDisjoint } }, res1);
    assert.strictEqual(res1.statusCode, 200);

    // Cross-dimension disjoint: dept_eng vs w_ops_1 (in dept_ops)
    const crossDimDisjoint = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'Eng Break', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 5, appliesTo: 'departments', applicableDepartments: ['dept_eng'] },
        { id: 's2', name: 'Ops Individual', enabled: true, outTime: '13:15', returnDeadline: '13:45', gracePeriodMinutes: 0, appliesTo: 'employees', applicableEmployees: ['w_ops_1'] }
      ]
    };
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(crossDimDisjoint, { workers: mockActiveWorkers }), null);
    const res2 = createMockRes();
    await settingsController.updateSettings({ params: { subdomain: 'test-tenant' }, user: { _id: 'admin_1', role: 'admin', subdomain: 'test-tenant' }, body: { lunchBreakManagement: crossDimDisjoint } }, res2);
    assert.strictEqual(res2.statusCode, 200);

    // Shifts disjoint
    const shiftsDisjoint = {
      enabled: true,
      sessions: [
        { id: 's1', name: 'Morning Shift Break', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 0, appliesTo: 'shifts', applicableShifts: ['Morning'] },
        { id: 's2', name: 'Evening Shift Break', enabled: true, outTime: '13:00', returnDeadline: '13:30', gracePeriodMinutes: 0, appliesTo: 'shifts', applicableShifts: ['Evening'] }
      ]
    };
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(shiftsDisjoint, { workers: mockActiveWorkers }), null);
  });

  // 4. Grace-period boundary conditions
  await test('Grace-period boundary conditions handled accurately on frontend and backend', () => {
    const mk = (grace1, out2) => ({
      enabled: true,
      sessions: [
        { id: 's1', name: 'Break 1', enabled: true, outTime: '13:54', returnDeadline: '13:57', gracePeriodMinutes: grace1, appliesTo: 'all' },
        { id: 's2', name: 'Break 2', enabled: true, outTime: out2, returnDeadline: '14:15', gracePeriodMinutes: 0, appliesTo: 'all' }
      ]
    });

    // 13:57 + 1m grace = 13:58 vs 13:59 -> PASS
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(mk(1, '13:59')), null);
    assert.strictEqual(backendVal.validateLunchBreakManagementConfig(mk(1, '13:59')), null);

    // 13:57 + 2m grace = 13:59 vs 14:00 -> PASS
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(mk(2, '14:00')), null);
    assert.strictEqual(backendVal.validateLunchBreakManagementConfig(mk(2, '14:00')), null);

    // 13:57 + 2m grace = 13:59 vs 13:59 -> FAIL (inclusive tick boundary 13:59)
    assert.match(frontendVal.validateLunchBreakManagementConfig(mk(2, '13:59')), /overlap/i);
    assert.match(backendVal.validateLunchBreakManagementConfig(mk(2, '13:59')), /overlap/i);

    // 13:57 + 5m grace = 14:02 vs 14:00 -> FAIL
    assert.match(frontendVal.validateLunchBreakManagementConfig(mk(5, '14:00')), /overlap/i);
    assert.match(backendVal.validateLunchBreakManagementConfig(mk(5, '14:00')), /overlap/i);

    // 13:57 + 0m grace = 13:57 vs 13:58 -> PASS
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(mk(0, '13:58')), null);
  });

  // 5. Midnight-crossing sessions & wrapped interval math
  await test('Midnight-crossing validation and wrapped interval comparison math work correctly', () => {
    const nightReject1 = {
      enabled: true,
      sessions: [
        { id: 'n1', name: 'Night Tea', enabled: true, outTime: '23:45', returnDeadline: '00:15', gracePeriodMinutes: 0 }
      ]
    };
    assert.match(frontendVal.validateLunchBreakManagementConfig(nightReject1), /Cross-midnight sessions are not supported/i);
    assert.match(settingsController.validateLunchBreakManagement(nightReject1), /Cross-midnight sessions are not supported/i);

    const nightReject2 = {
      enabled: true,
      sessions: [
        { id: 'n2', name: 'Grace Wrap', enabled: true, outTime: '23:30', returnDeadline: '23:50', gracePeriodMinutes: 15 }
      ]
    };
    assert.match(frontendVal.validateLunchBreakManagementConfig(nightReject2), /Cross-midnight sessions are not supported/i);
    assert.match(settingsController.validateLunchBreakManagement(nightReject2), /Cross-midnight sessions are not supported/i);

    const validLateNight = {
      enabled: true,
      sessions: [
        { id: 'n3', name: 'Late Night', enabled: true, outTime: '23:45', returnDeadline: '23:55', gracePeriodMinutes: 4 }
      ]
    };
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(validLateNight), null);
    assert.strictEqual(backendVal.validateLunchBreakManagementConfig(validLateNight), null);

    // Interval math across midnight boundary [23:50..00:10]
    const midnightWrap = { outTime: '23:50', returnDeadline: '00:05', gracePeriodMinutes: 5 }; // wraps to 00:10
    assert.strictEqual(
      backendVal.doBreakIntervalsOverlap(midnightWrap, { outTime: '00:05', returnDeadline: '00:20', gracePeriodMinutes: 0 }),
      true
    );
    assert.strictEqual(
      frontendVal.doBreakIntervalsOverlap(midnightWrap, { outTime: '00:05', returnDeadline: '00:20', gracePeriodMinutes: 0 }),
      true
    );
    assert.strictEqual(
      backendVal.doBreakIntervalsOverlap(midnightWrap, { outTime: '00:15', returnDeadline: '00:30', gracePeriodMinutes: 0 }),
      false
    );
    assert.strictEqual(
      backendVal.doBreakIntervalsOverlap(midnightWrap, { outTime: '13:54', returnDeadline: '13:57', gracePeriodMinutes: 2 }),
      false
    );
  });

  // 6. Session renaming does not affect validation
  await test('Renaming sessions does not alter validation pass/fail outcomes', () => {
    const renamedNonOverlapping = {
      enabled: true,
      sessions: [
        { id: 'session_1794372321260', name: 'Midnight Chai', enabled: true, outTime: '13:54', returnDeadline: '13:57', gracePeriodMinutes: 2, appliesTo: 'all' },
        { id: 'default_lunch', name: 'Midday Meal', enabled: true, outTime: '15:29', returnDeadline: '15:40', gracePeriodMinutes: 1, appliesTo: 'all' }
      ]
    };
    assert.strictEqual(frontendVal.validateLunchBreakManagementConfig(renamedNonOverlapping), null);
    assert.strictEqual(backendVal.validateLunchBreakManagementConfig(renamedNonOverlapping), null);

    // Swapped names with overlapping windows still reject identically
    const renamedOverlapping = {
      enabled: true,
      sessions: [
        { id: 'a', name: 'Lunch Break', enabled: true, outTime: '13:54', returnDeadline: '14:05', gracePeriodMinutes: 0, appliesTo: 'all' },
        { id: 'b', name: 'Tea Break', enabled: true, outTime: '14:00', returnDeadline: '14:20', gracePeriodMinutes: 0, appliesTo: 'all' }
      ]
    };
    assert.match(frontendVal.validateLunchBreakManagementConfig(renamedOverlapping), /Sessions Lunch Break and Tea Break overlap/i);
    assert.match(backendVal.validateLunchBreakManagementConfig(renamedOverlapping), /Sessions Lunch Break and Tea Break overlap/i);
  });

  // 7. Unsaved edited values / blank explicit session does NOT clone module-level lunchOutTime
  await test('Cleared or unsaved session times never fall back to legacy module-level lunchOutTime', () => {
    const clearedTea = {
      enabled: true,
      lunchOutTime: '15:29',
      returnDeadline: '15:40',
      gracePeriodMinutes: 1,
      sessions: [
        { id: 'session_tea', name: 'Tea Break', enabled: true, outTime: '', returnDeadline: '13:57', gracePeriodMinutes: 2, appliesTo: 'all' },
        { id: 'default_lunch', name: 'Lunch Break', enabled: true, outTime: '15:29', returnDeadline: '15:40', gracePeriodMinutes: 1, appliesTo: 'all' }
      ]
    };

    const normalized = getNormalizedSessions(clearedTea);
    assert.strictEqual(normalized[0].outTime, '', 'Explicit Tea Break outTime must NOT inherit module-level 15:29');

    const feErr = frontendVal.validateLunchBreakManagementConfig(clearedTea);
    const beErr = settingsController.validateLunchBreakManagement(clearedTea);
    assert.match(feErr, /Tea Break.*requires an automatic OUT time/i);
    assert.doesNotMatch(feErr, /overlap/i);
    assert.strictEqual(feErr, beErr);

    // 12-hour vs 24-hour parsing safety
    assert.strictEqual(backendVal.parseBreakTimeToMinutes('01:54 PM'), 13 * 60 + 54);
    assert.strictEqual(frontendVal.parseBreakTimeToMinutes('01:54 PM'), 13 * 60 + 54);
    assert.strictEqual(timeToMinutes('13:54'), 13 * 60 + 54);
    assert.strictEqual(backendVal.parseBreakTimeToMinutes('not-a-time'), null);

    // Frontend Settings.jsx uses settingsRef + applySettingsUpdate + validateLunchBreakManagementConfig (never stale closure)
    assert.ok(settingsJsxSource.includes('settingsRef = useRef(settings)'));
    assert.ok(settingsJsxSource.includes('applySettingsUpdate((prev)'));
    assert.ok(settingsJsxSource.includes('validateLunchBreakManagementConfig('));
    assert.ok(settingsJsxSource.includes('value={session.outTime ?? \'\'}'));
    assert.ok(settingsJsxSource.includes('value={session.returnDeadline ?? \'\'}'));
  });

  console.log(`\nTotal passed: ${passed}/7`);
};

run();

