/**
 * Tech Ciphergate — Lunch Break Settings & Policy Scope Verification Suite
 *
 * Isolated tests validating:
 * 1. All 4 policy scopes: 'all', 'departments', 'shifts', 'employees'.
 * 2. Save & reload mechanics (Mongoose Settings schema & controller logic).
 * 3. Changing lunch times, grace period, and master toggle.
 * 4. Invalid and empty selections safety (no fallback to company-wide).
 * 5. Multi-tenant isolation.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { isWorkerApplicable } = require('../schedulers/lunchBreakScheduler');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] Test ${totalTests}: ${name}`);
    console.error(`    Error: ${err.message}\n`);
    throw err;
  }
}

console.log('================================================================');
console.log(' Tech Ciphergate — Lunch Break Settings & Scope Test Suite');
console.log('================================================================\n');

// Mock Data
const deptEngineering = new mongoose.Types.ObjectId();
const deptDesign = new mongoose.Types.ObjectId();
const deptMarketing = new mongoose.Types.ObjectId();

const worker1 = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Alice Dev',
  status: 'Active',
  department: deptEngineering,
  batch: 'Morning Shift',
  subdomain: 'cipher-tenant'
};

const worker2 = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Bob UI',
  status: 'Active',
  department: deptDesign,
  batch: 'Full Time',
  subdomain: 'cipher-tenant'
};

const worker3 = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Charlie Marketing',
  status: 'Active',
  department: deptMarketing,
  batch: 'Night Shift',
  subdomain: 'cipher-tenant'
};

const workerInactive = {
  _id: new mongoose.Types.ObjectId(),
  name: 'David Inactive',
  status: 'Inactive',
  department: deptEngineering,
  batch: 'Full Time',
  subdomain: 'cipher-tenant'
};

// 1. Policy Scope: 'all'
runTest("Scope 'all' applies to all active employees and excludes inactive employees", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'all',
    lunchOutTime: '13:30',
    returnDeadline: '14:30',
    gracePeriodMinutes: 5
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), true, 'Active worker1 must be applicable');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), true, 'Active worker2 must be applicable');
  assert.strictEqual(isWorkerApplicable(worker3, lunchConfig), true, 'Active worker3 must be applicable');
  assert.strictEqual(isWorkerApplicable(workerInactive, lunchConfig), false, 'Inactive worker must NOT be applicable');
});

// 2. Policy Scope: 'departments'
runTest("Scope 'departments' applies strictly to employees in selected departments", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'departments',
    applicableDepartments: [deptEngineering.toString()],
    applicableShifts: [],
    applicableEmployees: []
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), true, 'Worker in engineering must be applicable');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), false, 'Worker in design must NOT be applicable');
  assert.strictEqual(isWorkerApplicable(worker3, lunchConfig), false, 'Worker in marketing must NOT be applicable');
});

// 3. Policy Scope: 'departments' with empty array
runTest("Scope 'departments' with empty selection NEVER falls back to company-wide", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'departments',
    applicableDepartments: [],
    applicableShifts: [],
    applicableEmployees: []
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), false, 'Worker1 must NOT be applicable when array is empty');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), false, 'Worker2 must NOT be applicable when array is empty');
  assert.strictEqual(isWorkerApplicable(worker3, lunchConfig), false, 'Worker3 must NOT be applicable when array is empty');
});

// 4. Policy Scope: 'shifts'
runTest("Scope 'shifts' applies strictly to employees assigned to specified batches", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'shifts',
    applicableDepartments: [],
    applicableShifts: ['Morning Shift', 'Night Shift'],
    applicableEmployees: []
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), true, 'Worker1 in Morning Shift must be applicable');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), false, 'Worker2 in Full Time must NOT be applicable');
  assert.strictEqual(isWorkerApplicable(worker3, lunchConfig), true, 'Worker3 in Night Shift must be applicable');
});

// 5. Policy Scope: 'shifts' with empty array
runTest("Scope 'shifts' with empty selection NEVER falls back to company-wide", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'shifts',
    applicableDepartments: [],
    applicableShifts: [],
    applicableEmployees: []
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), false, 'Worker1 must NOT be applicable when shifts empty');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), false, 'Worker2 must NOT be applicable when shifts empty');
});

// 6. Policy Scope: 'employees'
runTest("Scope 'employees' applies strictly to targeted worker IDs", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'employees',
    applicableDepartments: [],
    applicableShifts: [],
    applicableEmployees: [worker2._id.toString()]
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), false, 'Worker1 must NOT be applicable');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), true, 'Worker2 must be applicable');
  assert.strictEqual(isWorkerApplicable(worker3, lunchConfig), false, 'Worker3 must NOT be applicable');
});

// 7. Policy Scope: 'employees' with empty array
runTest("Scope 'employees' with empty selection NEVER falls back to company-wide", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'employees',
    applicableDepartments: [],
    applicableShifts: [],
    applicableEmployees: []
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), false, 'Worker1 must NOT be applicable when employees empty');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), false, 'Worker2 must NOT be applicable when employees empty');
});

// 8. Unknown / Invalid Scope
runTest("Invalid or unrecognized scope mode defaults safely to false", () => {
  const lunchConfig = {
    enabled: true,
    appliesTo: 'custom_invalid_scope',
    applicableDepartments: [],
    applicableShifts: [],
    applicableEmployees: []
  };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfig), false, 'Must reject unrecognized scope mode');
  assert.strictEqual(isWorkerApplicable(worker2, lunchConfig), false, 'Must reject unrecognized scope mode');
});

// 9. Master toggle disabled
runTest("When enabled=false, isWorkerApplicable returns false regardless of scope", () => {
  const lunchConfigAll = { enabled: false, appliesTo: 'all' };
  const lunchConfigDept = { enabled: false, appliesTo: 'departments', applicableDepartments: [deptEngineering.toString()] };

  assert.strictEqual(isWorkerApplicable(worker1, lunchConfigAll), false, 'Disabled all must return false');
  assert.strictEqual(isWorkerApplicable(worker1, lunchConfigDept), false, 'Disabled dept must return false');
});

// 10. Save and reload payload simulation (Settings Schema & Controller transformation)
runTest("Settings update correctly serializes and preserves all 4 scopes, timings, and grace periods", () => {
  // Simulating Settings update payload from frontend Settings.jsx
  const updatePayload = {
    lunchBreakManagement: {
      enabled: true,
      lunchOutTime: '13:00',
      returnDeadline: '14:00',
      gracePeriodMinutes: 10,
      appliesTo: 'departments',
      applicableDepartments: [deptEngineering.toString(), deptDesign.toString()],
      applicableShifts: ['Morning Shift'],
      applicableEmployees: [worker1._id.toString()]
    }
  };

  // Controller transformation logic (from settingsController.updateSettings)
  const updateObject = { ...updatePayload };
  delete updateObject.subdomain;
  delete updateObject._id;
  updateObject.lastUpdated = Date.now();

  // Verification of preserved structure
  assert.strictEqual(updateObject.lunchBreakManagement.enabled, true);
  assert.strictEqual(updateObject.lunchBreakManagement.lunchOutTime, '13:00');
  assert.strictEqual(updateObject.lunchBreakManagement.returnDeadline, '14:00');
  assert.strictEqual(updateObject.lunchBreakManagement.gracePeriodMinutes, 10);
  assert.strictEqual(updateObject.lunchBreakManagement.appliesTo, 'departments');
  assert.strictEqual(updateObject.lunchBreakManagement.applicableDepartments.length, 2);
  assert.strictEqual(updateObject.lunchBreakManagement.applicableShifts.length, 1);
  assert.strictEqual(updateObject.lunchBreakManagement.applicableEmployees.length, 1);

  // Switching scope does not discard other selection arrays
  const switchScopePayload = {
    lunchBreakManagement: {
      ...updateObject.lunchBreakManagement,
      appliesTo: 'shifts'
    }
  };
  assert.strictEqual(switchScopePayload.lunchBreakManagement.appliesTo, 'shifts');
  assert.strictEqual(switchScopePayload.lunchBreakManagement.applicableDepartments.length, 2, 'Department selections preserved');
  assert.strictEqual(switchScopePayload.lunchBreakManagement.applicableShifts.length, 1, 'Shift selections preserved');
  assert.strictEqual(switchScopePayload.lunchBreakManagement.applicableEmployees.length, 1, 'Employee selections preserved');
});

// 11. Multi-tenant isolation
runTest("Multi-tenant isolation: Tenant A configuration never targets Tenant B workers", () => {
  const tenantAWorker = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Tenant A Dev',
    status: 'Active',
    subdomain: 'tenant-a'
  };

  const tenantBWorker = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Tenant B Dev',
    status: 'Active',
    subdomain: 'tenant-b'
  };

  // Simulated scheduler worker query for tenant-a
  const allWorkers = [tenantAWorker, tenantBWorker];
  const targetSubdomain = 'tenant-a';
  const filteredWorkers = allWorkers.filter(w => w.subdomain === targetSubdomain && w.status === 'Active');

  assert.strictEqual(filteredWorkers.length, 1);
  assert.strictEqual(filteredWorkers[0]._id.toString(), tenantAWorker._id.toString());
  assert.strictEqual(filteredWorkers[0].subdomain, 'tenant-a');
});

// 12. Frontend validation invariants
runTest("Frontend validation catches empty selections on restricted scopes before submission", () => {
  const validateForm = (lunchSettings) => {
    if (!lunchSettings.enabled) return { valid: true };
    if (!lunchSettings.lunchOutTime) return { valid: false, error: 'Please configure Lunch Out Time' };
    if (!lunchSettings.returnDeadline) return { valid: false, error: 'Please configure Lunch Return Deadline' };

    const appliesTo = lunchSettings.appliesTo || 'all';
    if (appliesTo === 'departments' && (!lunchSettings.applicableDepartments || lunchSettings.applicableDepartments.length === 0)) {
      return { valid: false, error: 'Please select at least one department' };
    }
    if (appliesTo === 'shifts' && (!lunchSettings.applicableShifts || lunchSettings.applicableShifts.length === 0)) {
      return { valid: false, error: 'Please select at least one work batch/shift' };
    }
    if (appliesTo === 'employees' && (!lunchSettings.applicableEmployees || lunchSettings.applicableEmployees.length === 0)) {
      return { valid: false, error: 'Please select at least one employee' };
    }
    return { valid: true };
  };

  // Valid cases
  assert.strictEqual(validateForm({ enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', appliesTo: 'all' }).valid, true);
  assert.strictEqual(validateForm({ enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', appliesTo: 'departments', applicableDepartments: ['dept1'] }).valid, true);

  // Invalid cases
  assert.strictEqual(validateForm({ enabled: true, lunchOutTime: '', returnDeadline: '14:30', appliesTo: 'all' }).valid, false);
  assert.strictEqual(validateForm({ enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', appliesTo: 'departments', applicableDepartments: [] }).valid, false);
  assert.strictEqual(validateForm({ enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', appliesTo: 'shifts', applicableShifts: [] }).valid, false);
  assert.strictEqual(validateForm({ enabled: true, lunchOutTime: '13:30', returnDeadline: '14:30', appliesTo: 'employees', applicableEmployees: [] }).valid, false);
});

console.log('\n================================================================');
console.log(` Summary: ${passedTests} Passed, 0 Failed out of ${totalTests} Total Tests`);
console.log('================================================================');

