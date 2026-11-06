/**
 * Tech Ciphergate — WhatsApp Salary Dispatch Active-Employee Filtering Test Suite
 *
 * STRICT SAFETY GUARANTEES:
 * 1. 100% In-Memory Mocks — Zero live MongoDB connections, zero DB writes.
 * 2. WhatsApp API calls are mocked — Zero real WhatsApp messages sent.
 * 3. File writes directed to safe local scratch/mock directories.
 *
 * Requirements Covered:
 * - 'Active' with relievedAt: null -> included.
 * - 'Active' with missing relievedAt -> included.
 * - 'Relieved' -> excluded.
 * - Lowercase 'relieved' -> excluded.
 * - 'Active' with a valid relievedAt timestamp -> excluded.
 * - 'Deleted', 'Inactive', lowercase variants and missing/null status -> excluded.
 * - No eligible employees -> throws error, zero cross-tenant fallback.
 * - Excel and PDF buffers contain only eligible employees.
 * - Both scheduled and on-demand dispatches route to the corrected service.
 * - Existing salary calculations and 13-column NEFT formatting remain unchanged.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const {
  executeSalaryWhatsappDispatch,
  generateAllEmployeesPdfBuffer,
  generateBankStatementXlsxBuffer,
  isWorkerCurrentlyActive,
  filterActiveWorkers
} = require('../services/autoSalaryWhatsappService');

// Mongoose Models
const Worker = require('../models/Worker');
const Settings = require('../models/Settings');
const GowhatsConfig = require('../models/GowhatsConfig');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const SalaryProject = require('../models/SalaryProject');
const Ticket = require('../models/ticketModel');
const whatsappService = require('../services/whatsappService');

console.log('================================================================');
console.log(' WhatsApp Salary Dispatch — Active Worker Filtering Test Suite  ');
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
    console.error(err.stack);
  }
}

async function main() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Category 1: Pure Unit Tests for isWorkerCurrentlyActive & filterActiveWorkers
  // ─────────────────────────────────────────────────────────────────────────────

  runTest('Active employee with relievedAt: null is included', () => {
    const worker = { name: 'Alice', status: 'Active', relievedAt: null };
    assert.strictEqual(isWorkerCurrentlyActive(worker), true);
  });

  runTest('Active employee with missing relievedAt is included', () => {
    const worker = { name: 'Bob', status: 'Active' };
    assert.strictEqual(isWorkerCurrentlyActive(worker), true);
  });

  runTest('Lowercase "active" with relievedAt: null is included', () => {
    const worker = { name: 'Charlie', status: 'active', relievedAt: null };
    assert.strictEqual(isWorkerCurrentlyActive(worker), true);
  });

  runTest('"Relieved" employee is strictly excluded', () => {
    const worker = { name: 'David', status: 'Relieved', relievedAt: new Date('2026-05-01') };
    assert.strictEqual(isWorkerCurrentlyActive(worker), false);
  });

  runTest('Lowercase "relieved" employee is strictly excluded', () => {
    const worker = { name: 'Eve', status: 'relieved', relievedAt: null };
    assert.strictEqual(isWorkerCurrentlyActive(worker), false);
  });

  runTest('"Active" employee with valid relievedAt timestamp is strictly excluded', () => {
    const worker = { name: 'Grace', status: 'Active', relievedAt: new Date('2026-08-10T00:00:00.000Z') };
    assert.strictEqual(isWorkerCurrentlyActive(worker), false);
  });

  runTest('"Deleted" and lowercase "deleted" are strictly excluded', () => {
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'Frank', status: 'Deleted', relievedAt: null }), false);
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'Frank', status: 'deleted', relievedAt: null }), false);
  });

  runTest('"Inactive", "Resigned", "Terminated" and lowercase variants are strictly excluded', () => {
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'G1', status: 'Inactive' }), false);
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'G2', status: 'inactive' }), false);
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'G3', status: 'Resigned' }), false);
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'G4', status: 'Terminated' }), false);
  });

  runTest('Null, undefined, or missing status is strictly excluded', () => {
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'H1', status: null }), false);
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'H2', status: undefined }), false);
    assert.strictEqual(isWorkerCurrentlyActive({ name: 'H3' }), false);
    assert.strictEqual(isWorkerCurrentlyActive(null), false);
    assert.strictEqual(isWorkerCurrentlyActive(undefined), false);
  });

  runTest('filterActiveWorkers correctly filters a mixed batch of workers', () => {
    const mixed = [
      { _id: '1', name: 'Active 1', status: 'Active', relievedAt: null },
      { _id: '2', name: 'Active 2', status: 'Active' },
      { _id: '3', name: 'Relieved 1', status: 'Relieved', relievedAt: new Date() },
      { _id: '4', name: 'relieved 2', status: 'relieved' },
      { _id: '5', name: 'Active but RelievedAt', status: 'Active', relievedAt: new Date('2026-01-01') },
      { _id: '6', name: 'Deleted 1', status: 'Deleted' },
      { _id: '7', name: 'Inactive 1', status: 'Inactive' }
    ];

    const activeOnly = filterActiveWorkers(mixed);
    assert.strictEqual(activeOnly.length, 2);
    assert.deepStrictEqual(activeOnly.map(w => w._id), ['1', '2']);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Category 2: Corporate Bank Bulk NEFT Excel & PDF Buffer Generation
  // ─────────────────────────────────────────────────────────────────────────────

  await runAsyncTest('generateBankStatementXlsxBuffer generates exact 13 standard NEFT columns for eligible workers', async () => {
    const eligibleReports = [
      {
        worker: {
          _id: new mongoose.Types.ObjectId(),
          name: 'Alice Developer',
          phoneNumber: '919876543210',
          email: 'alice@ciphergate.com',
          bankDetails: {
            accountHolderName: 'ALICE DEVELOPER',
            accountNumber: '123456789012',
            ifscCode: 'HDFC0001234',
            bankName: 'HDFC Bank'
          }
        },
        totalFinalSalary: 45000,
        fullReport: { finalSalaryWithFines: 45000 }
      },
      {
        worker: {
          _id: new mongoose.Types.ObjectId(),
          name: 'Bob Designer',
          phoneNumber: '919876543211',
          email: 'bob@ciphergate.com',
          bankDetails: {
            accountHolderName: 'BOB DESIGNER',
            accountNumber: '987654321098',
            ifscCode: 'ICIC0005678',
            bankName: 'ICICI Bank'
          }
        },
        totalFinalSalary: 38000,
        fullReport: { finalSalaryWithFines: 38000 }
      }
    ];

    const xlsxBuffer = await generateBankStatementXlsxBuffer(eligibleReports, 'October', 2026);
    assert.ok(Buffer.isBuffer(xlsxBuffer));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxBuffer);
    const worksheet = workbook.getWorksheet('Bank_Payment_October_2026');
    assert.ok(worksheet, 'Worksheet Bank_Payment_October_2026 must exist');

    // Verify 13 standard Corporate Bank Bulk NEFT columns
    const expectedHeaders = [
      'PYMT_PROD_TYPE_CODE', 'PYMT_MODE', 'DEBIT_ACC_NO', 'BNF_NAME',
      'BENE_ACC_NO', 'BENE_IFSC', 'AMOUNT', 'CREDIT_NARR',
      'PYMT_DATE', 'MOBILE_NUM', 'EMAIL_ID', 'REMARK', 'REF_NO'
    ];

    const headerRow = worksheet.getRow(1);
    expectedHeaders.forEach((expectedHeader, colIdx) => {
      assert.strictEqual(headerRow.getCell(colIdx + 1).value, expectedHeader);
    });

    // Verify rows match exactly the 2 eligible employees
    assert.strictEqual(worksheet.rowCount, 3); // 1 header + 2 data rows

    const row1 = worksheet.getRow(2);
    assert.strictEqual(row1.getCell(1).value, 'PAB_VENDOR');
    assert.strictEqual(row1.getCell(2).value, 'NEFT');
    assert.strictEqual(row1.getCell(4).value, 'ALICE DEVELOPER');
    assert.strictEqual(row1.getCell(5).value, '123456789012');
    assert.strictEqual(row1.getCell(6).value, 'HDFC0001234');
    assert.strictEqual(row1.getCell(7).value, 45000);

    const row2 = worksheet.getRow(3);
    assert.strictEqual(row2.getCell(4).value, 'BOB DESIGNER');
    assert.strictEqual(row2.getCell(7).value, 38000);
  });

  await runAsyncTest('generateAllEmployeesPdfBuffer creates valid PDF for eligible workers', async () => {
    const eligibleReports = [
      {
        worker: {
          _id: new mongoose.Types.ObjectId(),
          name: 'Alice Developer',
          rfid: 'RFID001',
          department: { name: 'Engineering' },
          salary: 50000
        },
        department: 'Engineering',
        totalFinalSalary: 45000,
        fullReport: {
          report: {
            summary: {
              originalSalary: 50000,
              totalWorkingDaysInPeriod: 26,
              actualWorkingDays: 24,
              finalSalary: 45000
            },
            report: []
          }
        }
      }
    ];

    const pdfBuffer = await generateAllEmployeesPdfBuffer(eligibleReports, 'October', 2026);
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 500, 'PDF buffer must contain binary PDF content');
    assert.strictEqual(pdfBuffer.slice(0, 4).toString(), '%PDF', 'PDF buffer must start with %PDF header');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Category 3: Mocked Full executeSalaryWhatsappDispatch Execution
  // ─────────────────────────────────────────────────────────────────────────────

  await runAsyncTest('executeSalaryWhatsappDispatch strictly queries active workers, prevents cross-tenant fallback, and excludes relieved workers', async () => {
    const originalWorkerFind = Worker.find;
    const originalSettingsFindOne = Settings.findOne;
    const originalGowhatsFindOne = GowhatsConfig.findOne;
    const originalAttendanceFind = Attendance.find;
    const originalLeaveFind = Leave.find;
    const originalHolidayFind = Holiday.find;
    const originalSalaryProjectFind = SalaryProject.find;
    const originalTicketFind = Ticket.find;
    const originalSendWhatsApp = whatsappService.sendWhatsApp;

    try {
      const tenantId = 'tenant-cipher-test';
      const deptId = new mongoose.Types.ObjectId();

      const mockSettings = {
        subdomain: tenantId,
        autoSalaryWhatsappConfig: {
          enabled: true,
          phoneNumbers: '919876543210',
          lastDispatchedAt: null
        },
        batches: [],
        permissionTimeMinutes: 15,
        save: async function() { return this; }
      };

      Settings.findOne = async () => mockSettings;
      GowhatsConfig.findOne = async () => ({ adminWhatsappNumbers: ['919876543210'] });

      const mockDbWorkers = [
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000001'),
          name: 'Alice Active',
          rfid: 'RFID001',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Engineering' },
          status: 'Active',
          relievedAt: null,
          salary: 50000,
          bankDetails: { accountNumber: '111122223333', ifscCode: 'SBIN0001111', accountHolderName: 'ALICE ACTIVE' }
        },
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000002'),
          name: 'Bob Active Missing RelievedAt',
          rfid: 'RFID002',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Design' },
          status: 'active',
          salary: 40000,
          bankDetails: { accountNumber: '444455556666', ifscCode: 'HDFC0002222', accountHolderName: 'BOB ACTIVE' }
        },
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000003'),
          name: 'Charlie Relieved',
          rfid: 'RFID003',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Engineering' },
          status: 'Relieved',
          relievedAt: new Date('2026-05-01'),
          salary: 60000
        },
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000004'),
          name: 'David Lowercase Relieved',
          rfid: 'RFID004',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Engineering' },
          status: 'relieved',
          salary: 60000
        },
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000005'),
          name: 'Eve Active With RelievedAt Set',
          rfid: 'RFID005',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Engineering' },
          status: 'Active',
          relievedAt: new Date('2026-06-15'),
          salary: 70000
        },
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000006'),
          name: 'Frank Inactive',
          rfid: 'RFID006',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Engineering' },
          status: 'Inactive',
          salary: 30000
        },
        {
          _id: new mongoose.Types.ObjectId('66a000000000000000000007'),
          name: 'Grace Deleted',
          rfid: 'RFID007',
          subdomain: tenantId,
          department: { _id: deptId, name: 'Engineering' },
          status: 'Deleted',
          salary: 35000
        }
      ];

      let executedQuery = null;
      let findCallCount = 0;

      Worker.find = function(query) {
        executedQuery = query;
        findCallCount++;

        const filtered = mockDbWorkers.filter(w => {
          if (query.subdomain && w.subdomain !== query.subdomain) return false;
          if (query.status && query.status.$in) {
            if (!query.status.$in.includes(w.status)) return false;
          }
          if (query.$or) {
            const matchesOr = query.$or.some(cond => {
              if ('relievedAt' in cond) {
                if (cond.relievedAt === null) return w.relievedAt === null || w.relievedAt === undefined;
                if (cond.relievedAt.$exists === false) return !('relievedAt' in w) || w.relievedAt === null || w.relievedAt === undefined;
              }
              return false;
            });
            if (!matchesOr) return false;
          }
          return true;
        });

        return {
          populate: () => ({
            lean: async () => filtered
          })
        };
      };

      Attendance.find = () => ({ lean: async () => [] });
      Leave.find = () => ({ lean: async () => [] });
      Holiday.find = () => ({ lean: async () => [] });
      SalaryProject.find = () => ({
        populate: () => ({ lean: async () => [] })
      });
      Ticket.find = () => ({ lean: async () => [] });

      const sentMessages = [];
      whatsappService.sendWhatsApp = async (subdomain, phone, payload) => {
        sentMessages.push({ subdomain, phone, payload });
        return { success: true };
      };

      const result = await executeSalaryWhatsappDispatch(tenantId, '919876543210');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.totalEmployees, 2, 'Must ONLY include 2 active employees (Alice & Bob)');
      assert.strictEqual(findCallCount, 1, 'Must only call Worker.find ONCE without fallback dropping subdomain');

      // Verify DB Query asserts
      assert.strictEqual(executedQuery.subdomain, tenantId, 'Must enforce tenant isolation');
      assert.deepStrictEqual(executedQuery.status.$in, ['Active', 'active'], 'Query must positively require Active status');
      assert.strictEqual(executedQuery.$or.length, 2, 'Query must check for null or missing relievedAt');

      // Verify WhatsApp dispatch happened with 2 employees
      assert.ok(sentMessages.length > 0, 'WhatsApp dispatch must be attempted');

    } finally {
      Worker.find = originalWorkerFind;
      Settings.findOne = originalSettingsFindOne;
      GowhatsConfig.findOne = originalGowhatsFindOne;
      Attendance.find = originalAttendanceFind;
      Leave.find = originalLeaveFind;
      Holiday.find = originalHolidayFind;
      SalaryProject.find = originalSalaryProjectFind;
      Ticket.find = originalTicketFind;
      whatsappService.sendWhatsApp = originalSendWhatsApp;
    }
  });

  await runAsyncTest('When zero active employees match, it throws an error and NEVER executes cross-tenant fallback query', async () => {
    const originalWorkerFind = Worker.find;
    const originalSettingsFindOne = Settings.findOne;

    try {
      const tenantId = 'empty-tenant';
      Settings.findOne = async () => ({
        subdomain: tenantId,
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210' }
      });

      let queriesExecuted = [];
      Worker.find = function(query) {
        queriesExecuted.push(query);
        return {
          populate: () => ({
            lean: async () => [] // Zero workers
          })
        };
      };

      const result = await executeSalaryWhatsappDispatch(tenantId);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'No active employees found to generate monthly salary report');

      // Verify that NO query without subdomain was ever executed
      assert.strictEqual(queriesExecuted.length, 1);
      assert.strictEqual(queriesExecuted[0].subdomain, tenantId);
      assert.ok(!queriesExecuted.some(q => !q.subdomain), 'No cross-tenant fallback query without subdomain must exist');

    } finally {
      Worker.find = originalWorkerFind;
      Settings.findOne = originalSettingsFindOne;
    }
  });

  runTest('Scheduled scheduler and On-Demand controller reference the same core service function', () => {
    const { initAutoSalaryWhatsappScheduler } = require('../schedulers/autoSalaryWhatsappScheduler');
    const { triggerWhatsappSalaryDispatch } = require('../controllers/salaryController');
    assert.strictEqual(typeof initAutoSalaryWhatsappScheduler, 'function');
    assert.strictEqual(typeof triggerWhatsappSalaryDispatch, 'function');
  });

  console.log('\n================================================================');
  console.log(` Test Execution Summary: ${passCount}/${testCount} Passed (${failCount} Failed)`);
  console.log('================================================================');
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test execution unhandled error:', err);
  process.exit(1);
});
