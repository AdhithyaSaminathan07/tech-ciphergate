const assert = require('assert');

// Helper function implementing the exact resolution logic from dashboardController.js
function resolveDashboardPayout({ activeWorkersCount, monthlyBaseSalary, cachedSalaryStats, currentDate = new Date() }) {
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  let totalNetPayout = monthlyBaseSalary;

  if (activeWorkersCount === 0) {
    totalNetPayout = 0;
  } else if (
    cachedSalaryStats &&
    cachedSalaryStats.month === currentMonth &&
    cachedSalaryStats.year === currentYear &&
    cachedSalaryStats.isCohortComplete &&
    cachedSalaryStats.status === 'Finalized'
  ) {
    totalNetPayout = Math.max(0, Math.round(Number(cachedSalaryStats.totalNetPayout || 0) * 100) / 100);
  } else {
    totalNetPayout = monthlyBaseSalary;
  }

  return totalNetPayout;
}

// Helper function implementing the cache update logic from salaryController.js
function simulateBulkSalaryCacheUpdate({
  bulkMonth,
  bulkYear,
  activeWorkers,
  payrollRecords,
  totalNetPayoutCalculated,
  currentDate = new Date()
}) {
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const isCurrentCalendarMonth = Number(bulkMonth) === currentMonth && Number(bulkYear) === currentYear;

  if (!isCurrentCalendarMonth) {
    // Past month export: does not update current month cache
    return null;
  }

  const activeWorkerIds = new Set(activeWorkers.map(w => w._id.toString()));
  const distinctApprovedWorkerIds = new Set();

  payrollRecords.forEach(pr => {
    const wIdStr = pr.workerId?.toString();
    if (wIdStr && activeWorkerIds.has(wIdStr)) {
      if (['Approved', 'Locked', 'Paid'].includes(pr.status)) {
        distinctApprovedWorkerIds.add(wIdStr);
      }
    }
  });

  const isCohortComplete = activeWorkerIds.size > 0 && distinctApprovedWorkerIds.size === activeWorkerIds.size;
  const status = isCohortComplete ? 'Finalized' : 'Generated';
  const cleanNetPayout = Math.max(0, Math.round(totalNetPayoutCalculated * 100) / 100);

  return {
    month: Number(bulkMonth),
    year: Number(bulkYear),
    status,
    isCohortComplete,
    activeWorkerCount: activeWorkerIds.size,
    recordedWorkerCount: distinctApprovedWorkerIds.size,
    totalNetPayout: cleanNetPayout,
    lastCalculated: new Date()
  };
}

function runTests() {
  console.log('Running 10 Comprehensive Dashboard Total Net Payout Regression Tests...\n');
  const now = new Date(2026, 9, 10); // October 2026 (month 10)

  // 1. Verified Positive Finalized Payout
  {
    const cachedSalaryStats = {
      month: 10,
      year: 2026,
      status: 'Finalized',
      isCohortComplete: true,
      totalNetPayout: 185000.50
    };
    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats, currentDate: now });
    assert.strictEqual(payout, 185000.50);
    console.log('✓ Test 1 Passed: Verified positive finalized payout (₹1,85,000.50)');
  }

  // 2. Verified Genuine Finalized Zero Payout
  {
    const cachedSalaryStats = {
      month: 10,
      year: 2026,
      status: 'Finalized',
      isCohortComplete: true,
      totalNetPayout: 0
    };
    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats, currentDate: now });
    assert.strictEqual(payout, 0);
    console.log('✓ Test 2 Passed: Verified genuine finalized zero payout (₹0)');
  }

  // 3. Zero Active Workforce
  {
    const cachedSalaryStats = null;
    const payout = resolveDashboardPayout({ activeWorkersCount: 0, monthlyBaseSalary: 0, cachedSalaryStats, currentDate: now });
    assert.strictEqual(payout, 0);
    console.log('✓ Test 3 Passed: Zero active workforce returns ₹0');
  }

  // 4. Floating-Point Noise Elimination on Zero Attendance
  {
    const rawFloatingNoise = 2.0009549572819196e-11;
    const cachedSalaryStats = {
      month: 10,
      year: 2026,
      status: 'Finalized',
      isCohortComplete: true,
      totalNetPayout: rawFloatingNoise
    };
    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats, currentDate: now });
    assert.strictEqual(payout, 0);
    console.log('✓ Test 4 Passed: Floating-point noise (2e-11) cleanly eliminates to ₹0');
  }

  // 5. Missing Payroll Records
  {
    const cachedSalaryStats = null;
    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats, currentDate: now });
    assert.strictEqual(payout, 164501);
    console.log('✓ Test 5 Passed: Missing payroll falls back to Monthly Base Salary (₹1,64,501)');
  }

  // 6. Incomplete Employee Cohort (14 of 19 records)
  {
    const activeWorkers = Array.from({ length: 19 }, (_, i) => ({ _id: `worker_${i + 1}` }));
    const payrollRecords = Array.from({ length: 14 }, (_, i) => ({ workerId: `worker_${i + 1}`, status: 'Approved' }));
    const cacheResult = simulateBulkSalaryCacheUpdate({
      bulkMonth: 10,
      bulkYear: 2026,
      activeWorkers,
      payrollRecords,
      totalNetPayoutCalculated: 0,
      currentDate: now
    });
    assert.strictEqual(cacheResult.isCohortComplete, false);
    assert.strictEqual(cacheResult.status, 'Generated');

    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats: cacheResult, currentDate: now });
    assert.strictEqual(payout, 164501);
    console.log('✓ Test 6 Passed: Incomplete employee cohort falls back to Monthly Base Salary');
  }

  // 7. Duplicate Employee Records (19 entries with duplicates, only 18 distinct)
  {
    const activeWorkers = Array.from({ length: 19 }, (_, i) => ({ _id: `worker_${i + 1}` }));
    // 19 records, but worker_1 is duplicated and worker_19 is missing
    const payrollRecords = [
      ...Array.from({ length: 18 }, (_, i) => ({ workerId: `worker_${i + 1}`, status: 'Approved' })),
      { workerId: 'worker_1', status: 'Approved' }
    ];
    const cacheResult = simulateBulkSalaryCacheUpdate({
      bulkMonth: 10,
      bulkYear: 2026,
      activeWorkers,
      payrollRecords,
      totalNetPayoutCalculated: 0,
      currentDate: now
    });
    assert.strictEqual(cacheResult.isCohortComplete, false);
    assert.strictEqual(cacheResult.recordedWorkerCount, 18);

    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats: cacheResult, currentDate: now });
    assert.strictEqual(payout, 164501);
    console.log('✓ Test 7 Passed: Duplicate records rejected; falls back to Monthly Base Salary');
  }

  // 8. Partial Approval State (All 19 present, but 5 are in Draft)
  {
    const activeWorkers = Array.from({ length: 19 }, (_, i) => ({ _id: `worker_${i + 1}` }));
    const payrollRecords = [
      ...Array.from({ length: 14 }, (_, i) => ({ workerId: `worker_${i + 1}`, status: 'Approved' })),
      ...Array.from({ length: 5 }, (_, i) => ({ workerId: `worker_${i + 15}`, status: 'Draft' }))
    ];
    const cacheResult = simulateBulkSalaryCacheUpdate({
      bulkMonth: 10,
      bulkYear: 2026,
      activeWorkers,
      payrollRecords,
      totalNetPayoutCalculated: 0,
      currentDate: now
    });
    assert.strictEqual(cacheResult.isCohortComplete, false);
    assert.strictEqual(cacheResult.status, 'Generated');

    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats: cacheResult, currentDate: now });
    assert.strictEqual(payout, 164501);
    console.log('✓ Test 8 Passed: Partial approval state safely falls back to Monthly Base Salary');
  }

  // 9. Past-Month Export Protection (Exporting May 2025 does not touch Oct 2026 cache)
  {
    const activeWorkers = Array.from({ length: 19 }, (_, i) => ({ _id: `worker_${i + 1}` }));
    const payrollRecords = Array.from({ length: 19 }, (_, i) => ({ workerId: `worker_${i + 1}`, status: 'Paid' }));
    const pastExportCache = simulateBulkSalaryCacheUpdate({
      bulkMonth: 5,
      bulkYear: 2025,
      activeWorkers,
      payrollRecords,
      totalNetPayoutCalculated: 250000,
      currentDate: now
    });
    assert.strictEqual(pastExportCache, null);
    console.log('✓ Test 9 Passed: Past-month export does not overwrite current-month dashboard cache');
  }

  // 10. Legacy Cache Compatibility (Document lacking month/year metadata)
  {
    const legacyCachedSalaryStats = {
      totalNetPayout: 185000
      // month, year, status, isCohortComplete are undefined
    };
    const payout = resolveDashboardPayout({ activeWorkersCount: 19, monthlyBaseSalary: 164501, cachedSalaryStats: legacyCachedSalaryStats, currentDate: now });
    assert.strictEqual(payout, 164501);
    console.log('✓ Test 10 Passed: Legacy cache without period metadata safely falls back to Monthly Base Salary');
  }

  console.log('\nAll 10 Total Net Payout Regression Tests Passed Successfully!');
}

runTests();
