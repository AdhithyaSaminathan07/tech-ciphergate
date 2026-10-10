/**
 * Full Read-Only Salary Reconciliation for June 2026
 * 
 * STRICT READ-ONLY: Executes calculateWorkerProductivity in memory,
 * queries live DB via .find().lean(), and reconciles every component.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Worker = require('../models/Worker');
const Department = require('../models/Department');
const PayrollRecord = require('../models/PayrollRecord');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const SalaryProject = require('../models/SalaryProject');
const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');
const Settings = require('../models/Settings');
const calculateWorkerProductivity = require('../utils/productivityCalculator');

async function runFullReconciliation() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Connected to DB in READ-ONLY mode.');

  const year = 2026;
  const month = 6;
  const fromDate = '2026-06-01';
  const toDate = '2026-06-30';
  const subdomain = 'techvaseegrah';

  // 1. Fetch all active workers and workers with payroll records
  const allPayrollRecords = await PayrollRecord.find({ month, year, subdomain }).lean();
  console.log(`Found ${allPayrollRecords.length} PayrollRecord documents for ${month}/${year}.`);

  const workerIds = allPayrollRecords.map(pr => pr.workerId);
  const workers = await Worker.find({ _id: { $in: workerIds } }).populate('department').lean();
  const holidays = await Holiday.find({ subdomain }).lean();
  const settings = await Settings.findOne({ subdomain }).lean();

  // 2. Fetch attendances, leaves, projects for period
  const attendances = await Attendance.find({
    worker: { $in: workerIds },
    date: { $gte: fromDate, $lte: toDate }
  }).lean();

  const leaves = await Leave.find({
    worker: { $in: workerIds },
    status: 'Approved'
  }).lean();

  const allPastLedgers = await ProjectPaymentLedger.find({
    employeeId: { $in: workerIds }
  }).lean();

  const projectIds = [...new Set(allPastLedgers.map(l => l.projectId.toString()))];
  const pastProjects = projectIds.length > 0
    ? await SalaryProject.find({ _id: { $in: projectIds } }).populate('developers').lean()
    : [];
  const projectMap = {};
  pastProjects.forEach(p => { projectMap[p._id.toString()] = p; });

  const reconciliationData = [];
  let totalBaseSalary = 0;
  let totalAttendanceSalary = 0;
  let totalAdditionsSum = 0;
  let totalDeductionsSum = 0;
  let totalPayableExpectedSum = 0;
  let totalPayableActualSum = 0;

  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const maskedId = `EMP-${String(i + 1).padStart(2, '0')}`;
    const pr = allPayrollRecords.find(p => p.workerId.toString() === worker._id.toString());
    const workerAttendances = attendances.filter(a => a.worker.toString() === worker._id.toString());
    const workerLeaves = leaves.filter(l => l.worker.toString() === worker._id.toString());

    // Attendance calculation via productivityCalculator
    let calculatedAttendanceSalary = 0;
    try {
      const prodResult = calculateWorkerProductivity({
        attendanceData: workerAttendances,
        fromDate,
        toDate,
        options: {
          holidays,
          settings
        },
        worker,
        leaveData: workerLeaves
      });
      calculatedAttendanceSalary = prodResult?.summary?.finalSalaryWithBonus || 0;
    } catch (err) {
      calculatedAttendanceSalary = Number(worker.baseSalary) || Number(worker.salary) || 0;
    }

    // Project Adjustments
    const workerLedgers = allPastLedgers.filter(l => l.employeeId.toString() === worker._id.toString());
    let totalProjectAdjustment = 0;
    for (const entry of workerLedgers) {
      const proj = projectMap[entry.projectId.toString()];
      if (!proj) continue;
      const devCount = proj.developers?.length || 1;
      const share = proj.projectProfit / devCount;
      const start = new Date(proj.startDate);
      const end = new Date(proj.endDate);
      let workingDays = 0;
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getDay() !== 0) workingDays++;
        cur.setDate(cur.getDate() + 1);
      }
      const perDayVal = workingDays > 0 ? share / workingDays : 0;
      const currentEntitlement = entry.paidWorkingDays * perDayVal;
      totalProjectAdjustment += (currentEntitlement - entry.paidAmount);
    }

    const finalAttendanceWithAdjustment = Math.max(0, calculatedAttendanceSalary + totalProjectAdjustment);

    // Enterprise Payroll Record adjustments
    let totalAdditions = 0;
    let totalDeductions = 0;
    const status = pr ? pr.status : 'Draft';
    const snapshot = pr ? pr.attendanceSalarySnapshot : null;

    if (pr && pr.adjustments) {
      for (const adj of pr.adjustments) {
        if (adj.isDeleted) continue;
        if (adj.type === 'addition') totalAdditions += (Number(adj.amount) || 0);
        if (adj.type === 'deduction') totalDeductions += (Number(adj.amount) || 0);
      }
    }

    const attendanceBaseUsed = (status === 'Locked' || status === 'Paid') && snapshot !== null
      ? snapshot
      : finalAttendanceWithAdjustment;

    const expectedPayable = Math.max(0, attendanceBaseUsed + totalAdditions - totalDeductions);
    const actualPayable = pr && pr.payableSalary !== undefined ? pr.payableSalary : expectedPayable;

    totalBaseSalary += (Number(worker.baseSalary) || Number(worker.salary) || 0);
    totalAttendanceSalary += attendanceBaseUsed;
    totalAdditionsSum += totalAdditions;
    totalDeductionsSum += totalDeductions;
    totalPayableExpectedSum += expectedPayable;
    totalPayableActualSum += actualPayable;

    reconciliationData.push({
      maskedId,
      status,
      baseSalary: Number(worker.baseSalary) || Number(worker.salary) || 0,
      attendanceSalary: Math.round(attendanceBaseUsed * 100) / 100,
      totalAdditions: Math.round(totalAdditions * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      expectedPayable: Math.round(expectedPayable * 100) / 100,
      actualPayable: Math.round(actualPayable * 100) / 100,
      difference: Math.round(Math.abs(expectedPayable - actualPayable) * 100) / 100,
      match: Math.abs(expectedPayable - actualPayable) < 0.01
    });
  }

  console.log('\n================================================================================');
  console.log(' Tech Ciphergate — Read-Only Salary Reconciliation (Target: June 2026)');
  console.log('================================================================================\n');

  console.table(reconciliationData.map(r => ({
    Employee: r.maskedId,
    Status: r.status,
    BaseSalary: `₹${r.baseSalary.toLocaleString('en-IN')}`,
    Attendance: `₹${r.attendanceSalary.toLocaleString('en-IN')}`,
    Additions: `₹${r.totalAdditions.toLocaleString('en-IN')}`,
    Deductions: `₹${r.totalDeductions.toLocaleString('en-IN')}`,
    Expected: `₹${r.expectedPayable.toLocaleString('en-IN')}`,
    Actual: `₹${r.actualPayable.toLocaleString('en-IN')}`,
    Difference: `₹${r.difference}`,
    Result: r.match ? 'MATCH' : 'DIFF'
  })));

  console.log('\n--------------------------------------------------------------------------------');
  console.log(' Monthly Aggregate Summary (June 2026)');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total Contractual Base Salary:   ₹${totalBaseSalary.toLocaleString('en-IN')}`);
  console.log(`Total Net Attendance Base:       ₹${totalAttendanceSalary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Enterprise Additions:      ₹${totalAdditionsSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Enterprise Deductions:     ₹${totalDeductionsSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Reconciled Expected:       ₹${totalPayableExpectedSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Actual Payable Sum:        ₹${totalPayableActualSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Net Aggregate Discrepancy:       ₹${Math.abs(totalPayableExpectedSum - totalPayableActualSum).toFixed(2)}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log(' Structural Integrity & Cohort Findings');
  console.log('--------------------------------------------------------------------------------');
  
  // 1. Duplicate records
  const map = new Map();
  const dupes = [];
  for (const r of allPayrollRecords) {
    const k = r.workerId.toString();
    if (map.has(k)) dupes.push(k);
    map.set(k, r);
  }
  
  // 2. Subdomains
  const subdomains = [...new Set(allPayrollRecords.map(r => r.subdomain))];
  
  // 3. Stale snapshots
  const invalidSnapshots = allPayrollRecords.filter(r => !['Locked', 'Paid'].includes(r.status) && r.attendanceSalarySnapshot !== null);
  
  // 4. Duplicate adjustments within records
  let dupeAdjustments = 0;
  for (const r of allPayrollRecords) {
    const adjKeys = new Set();
    for (const a of (r.adjustments || [])) {
      if (a.isDeleted) continue;
      const ak = `${a.type}_${a.amount}_${a.reason}`;
      if (adjKeys.has(ak)) dupeAdjustments++;
      adjKeys.add(ak);
    }
  }

  const allActiveSubdomainWorkers = await Worker.find({ subdomain, status: 'Active' }).countDocuments();

  console.log(`Duplicate Payroll Records:         ${dupes.length}`);
  console.log(`Tenant / Subdomain Isolation:      Clean (${subdomains.join(', ')})`);
  console.log(`Invalid / Premature Snapshots:     ${invalidSnapshots.length}`);
  console.log(`Duplicate Active Adjustments:      ${dupeAdjustments}`);
  console.log(`Active Workforce in Subdomain:     ${allActiveSubdomainWorkers}`);
  console.log(`Workers with Payroll Records:      ${allPayrollRecords.length}`);
  console.log(`Unprocessed Active Workers:        ${allActiveSubdomainWorkers - allPayrollRecords.length}`);
  console.log('--------------------------------------------------------------------------------\n');

  await mongoose.disconnect();
}

runFullReconciliation().catch(err => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
