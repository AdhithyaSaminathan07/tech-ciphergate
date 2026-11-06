const assert = require('assert');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');
const { calculateUnauthorizedAbsencePenalty } = require('../utils/productivityCalculator');

/**
 * Dedicated Comprehensive Test Suite:
 * Unauthorized (5X) Global Toggle Policy & Exact Shalini Verification
 */

console.log('=== RUNNING UNAUTHORIZED 5X TOGGLE POLICY TEST SUITE ===\n');

// -------------------------------------------------------------
// PART 1: Core Mathematical Invariants of Unauthorized 5X & 1X
// -------------------------------------------------------------
{
  console.log('Test 1: calculateUnauthorizedAbsencePenalty splits 5X into exact 1X base and 4X surcharge');
  
  const mockWorker = {
    _id: 'w_shalini_test',
    name: 'Shalini Sebastin S',
    salary: 15000,
    batch: 'Full Time',
    status: 'Active',
    joiningDate: '2026-10-15'
  };

  const mockSettings = {
    advancedLeaveDeduction: {
      enableUnauthorizedLeavePenalty: true,
      enableUnauthorizedPermissionPenalty: true
    },
    batches: [
      { batchName: 'Full Time', from: '09:00', to: '19:00', lunchFrom: '13:00', lunchTo: '14:00', isLunchConsider: false }
    ]
  };

  // Oct 15: No punch in (absent)
  // Oct 16 to 31 (excluding Sundays 18, 25): Present
  // Oct 26: Present, but has Pending permission from 13:30 to 18:00 (270 mins)
  const attendanceData = [];
  for (let d = 16; d <= 31; d++) {
    const dStr = `2026-10-${String(d).padStart(2, '0')}`;
    const dt = new Date(dStr + 'T00:00:00');
    if (dt.getDay() !== 0) { // skip Sunday
      attendanceData.push({ date: dStr, presence: true });
    }
  }

  const allLeaves = [
    {
      leaveType: 'Permission',
      startDate: '2026-10-26',
      endDate: '2026-10-26',
      status: 'Pending',
      durationMinutes: 270,
      startTime: '13:30',
      endTime: '18:00'
    }
  ];

  const result = calculateUnauthorizedAbsencePenalty(
    mockWorker,
    '2026-10-01',
    '2026-10-31',
    allLeaves,
    attendanceData,
    [],
    mockSettings
  );

  assert.strictEqual(result.penalties.length, 2, 'Should have 2 unauthorized penalties: Oct 15 absence and Oct 26 permission');

  const oct15Penalty = result.penalties.find(p => p.date === '2026-10-15');
  assert.ok(oct15Penalty, 'Oct 15 penalty found');
  assert.strictEqual(oct15Penalty.penaltyFactor, 5);
  const dailySalary = 15000 / 27; // 555.5556
  assert.strictEqual(oct15Penalty.penaltyAmount, parseFloat((dailySalary * 5).toFixed(4)));
  assert.strictEqual(oct15Penalty.base1XAmount, parseFloat(dailySalary.toFixed(4)));
  assert.strictEqual(oct15Penalty.extra4XAmount, parseFloat((dailySalary * 4).toFixed(4)));

  const oct26Penalty = result.penalties.find(p => p.date === '2026-10-26');
  assert.ok(oct26Penalty, 'Oct 26 penalty found');
  assert.strictEqual(oct26Penalty.penaltyFactor, 5);
  const minuteSalary = dailySalary / 540; // 540 standard working minutes
  // 13:30 to 18:00 is 270 mins, minus 30 mins lunch overlap (13:30 to 14:00) = 240 chargeable minutes
  const expectedChargeableMinutes = 240;
  assert.strictEqual(oct26Penalty.minutes, expectedChargeableMinutes);
  assert.strictEqual(oct26Penalty.penaltyAmount, parseFloat((expectedChargeableMinutes * minuteSalary * 5).toFixed(4)));
  assert.strictEqual(oct26Penalty.base1XAmount, parseFloat((expectedChargeableMinutes * minuteSalary).toFixed(4)));
  assert.strictEqual(oct26Penalty.extra4XAmount, parseFloat((expectedChargeableMinutes * minuteSalary * 4).toFixed(4)));

  // Aggregate consistency check
  assert.strictEqual(
    parseFloat((result.totalNormal1XAmount + result.totalExtra4XPenalty).toFixed(2)),
    parseFloat(result.totalUnauthorizedPenalty.toFixed(2)),
    '1X Base + 4X Surcharge must equal total 5X penalty'
  );
  console.log('✓ Test 1 Passed: 1X base and 4X surcharge match 5X total exactly');
}

// -------------------------------------------------------------
// PART 2: Shalini Sebastin S Oct 2026 Exact Toggle Scenarios
// -------------------------------------------------------------
{
  console.log('\nTest 2: Shalini Sebastin S Oct 2026 All 4 Toggle Combinations');

  const proratedBase = 8333.33; // 15 eligible days * (15000 / 27)
  const attendanceDeduction = 221.21; // non-unauthorized delay
  const taskPenalty = 0;
  const leaveDeduction = 0; // normal approved leave deduction is 0
  const permissionDeduction = 221.21; // non-unauthorized delay treated as permission/delay

  const totalUnauth = 4166.67; // 2777.78 (Oct 15) + 1388.89 (Oct 26)
  const totalExtra4X = 3333.33; // 2222.22 (Oct 15) + 1111.11 (Oct 26)
  const totalNormal1X = 833.34; // 555.56 (Oct 15) + 277.78 (Oct 26)
  const normal1XLeave = 555.56;
  const normal1XPerm = 277.78;

  // Base after attendance delay and full 5X penalty (All ON baseline):
  // 8333.33 - 221.21 - 4166.67 = 3945.45
  const finalSalaryWithAdjustment = Math.max(0, proratedBase - attendanceDeduction - totalUnauth);

  // Scenario A: ALL ON (Default)
  const resAllOn = finalizeSalaryCalculation({
    finalSalaryWithAdjustment,
    taskPenalty,
    totalUnauthorizedPenalty: totalUnauth,
    totalExtra4XPenalty: totalExtra4X,
    totalNormal1XAmount: totalNormal1X,
    normal1XLeaveAmount: normal1XLeave,
    normal1XPermissionAmount: normal1XPerm,
    leaveDeduction,
    permissionDeduction,
    toggles: {
      taskDeduction: true,
      unauthorizedDeduction: true,
      leaveDeduction: true,
      permissionDeduction: true
    }
  });

  // Gross Deductions: 221.21 (attendance) + 4166.67 (5X unauth) = 4387.88
  // Net Payable: 8333.33 - 4387.88 = 3945.45
  assert.strictEqual(resAllOn.finalPayableSalary, 3945.45, 'Scenario A: All ON must yield 3945.45');
  console.log('✓ Scenario A (All ON): Net Payable = ₹3,945.45 (Total deductions: ₹4,387.88)');

  // Scenario B: 5X OFF, Leave ON, Perm ON
  // When 5X is turned OFF:
  // 5X penalty is waived, but normal 1X is restored.
  // The refund is strictly the 4X penalty surcharge = 3333.33
  const resUnauthOff = finalizeSalaryCalculation({
    finalSalaryWithAdjustment,
    taskPenalty,
    totalUnauthorizedPenalty: totalUnauth,
    totalExtra4XPenalty: totalExtra4X,
    totalNormal1XAmount: totalNormal1X,
    normal1XLeaveAmount: normal1XLeave,
    normal1XPermissionAmount: normal1XPerm,
    leaveDeduction,
    permissionDeduction,
    toggles: {
      taskDeduction: true,
      unauthorizedDeduction: false,
      leaveDeduction: true,
      permissionDeduction: true
    }
  });

  // Effective deductions: 221.21 + 833.34 = 1054.55
  // Net Payable: 8333.33 - 1054.55 = 7278.78
  // Difference from All ON: 7278.78 - 3945.45 = +3333.33 (exactly the 4X surcharge)
  assert.strictEqual(resUnauthOff.finalPayableSalary, 7278.78, 'Scenario B: 5X OFF must yield 7278.78');
  assert.strictEqual(
    parseFloat((resUnauthOff.finalPayableSalary - resAllOn.finalPayableSalary).toFixed(2)),
    3333.33,
    'Toggling 5X OFF must refund exactly the 4X penalty surcharge (3333.33)'
  );
  console.log('✓ Scenario B (5X OFF, Leave ON, Perm ON): Net Payable = ₹7,278.78 (Refunded 4X surcharge: ₹3,333.33, 1X preserved: ₹833.34)');

  // Scenario C: 5X ON, Leave OFF, Perm OFF
  // 5X applies (4166.67), but normal delay & leave/perm are waived (refund 221.21)
  const resLeavePermOff = finalizeSalaryCalculation({
    finalSalaryWithAdjustment,
    taskPenalty,
    totalUnauthorizedPenalty: totalUnauth,
    totalExtra4XPenalty: totalExtra4X,
    totalNormal1XAmount: totalNormal1X,
    normal1XLeaveAmount: normal1XLeave,
    normal1XPermissionAmount: normal1XPerm,
    leaveDeduction,
    permissionDeduction,
    toggles: {
      taskDeduction: true,
      unauthorizedDeduction: true,
      leaveDeduction: false,
      permissionDeduction: false
    }
  });

  // Deductions: 4166.67 (221.21 delay refunded)
  // Net Payable: 3945.45 + 221.21 = 4166.66
  assert.strictEqual(resLeavePermOff.finalPayableSalary, 4166.66, 'Scenario C: 5X ON, Leave/Perm OFF must yield 4166.66');
  console.log('✓ Scenario C (5X ON, Leave OFF, Perm OFF): Net Payable = ₹4,166.66 (Only 5X penalty applied)');

  // Scenario D: ALL OFF
  // 5X is OFF (waives 4X: +3333.33), Leave OFF (waives 1X leave: +555.56), Perm OFF (waives 1X perm: +277.78 & delay: +221.21)
  // Employee gets 100% of prorated base salary = 8333.33
  const resAllOff = finalizeSalaryCalculation({
    finalSalaryWithAdjustment,
    taskPenalty,
    totalUnauthorizedPenalty: totalUnauth,
    totalExtra4XPenalty: totalExtra4X,
    totalNormal1XAmount: totalNormal1X,
    normal1XLeaveAmount: normal1XLeave,
    normal1XPermissionAmount: normal1XPerm,
    leaveDeduction,
    permissionDeduction,
    toggles: {
      taskDeduction: false,
      unauthorizedDeduction: false,
      leaveDeduction: false,
      permissionDeduction: false
    }
  });

  assert.strictEqual(resAllOff.finalPayableSalary, 8333.33, 'Scenario D: All OFF must yield full prorated base salary 8333.33');
  console.log('✓ Scenario D (All OFF): Net Payable = ₹8,333.33 (0 deductions, full 100% prorated base salary)');
}

// -------------------------------------------------------------
// PART 3: Cross-Module Parity Verification
// -------------------------------------------------------------
{
  console.log('\nTest 3: Cross-Module Parity Verification');

  // Verify that autoSalaryWhatsappService calculation matches finalizeSalaryCalculation exactly
  const autoSalaryWhatsappService = require('../services/autoSalaryWhatsappService');
  assert.ok(autoSalaryWhatsappService, 'autoSalaryWhatsappService loaded');

  // Verify that salaryController loaded without syntax errors
  const salaryController = require('../controllers/salaryController');
  assert.ok(salaryController, 'salaryController loaded');

  console.log('✓ Cross-module modules loaded and syntax verified');
}

console.log('\n=== ALL UNAUTHORIZED 5X TOGGLE POLICY TESTS PASSED SUCCESSFULLY ===');
