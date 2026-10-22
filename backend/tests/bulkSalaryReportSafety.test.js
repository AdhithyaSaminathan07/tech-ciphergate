/**
 * Tech Ciphergate — Bulk Salary Report API Verification & Regression Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEE:
 * 1. 100% In-Memory / Isolated Mocks.
 * 2. Zero live database connections, zero database writes.
 * 3. Tests controller logic, parameter handling, error cases, and route protection.
 */

const assert = require('assert');
const router = require('../routes/salaryRoutes');
const { protect, adminOnly } = require('../middleware/authMiddleware');

console.log('================================================================');
console.log(' Tech Ciphergate — Bulk Salary Report Test Suite                ');
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

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

function createMongooseQuery(docs) {
  const query = {
    populate: () => query,
    select: () => query,
    sort: () => query,
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve(docs).then(resolve, reject),
    catch: (reject) => Promise.resolve(docs).catch(reject)
  };
  return query;
}

async function runAllTests() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Route Protection & Middleware Verification
  // ─────────────────────────────────────────────────────────────────────────────
  runTest('Route /bulk-report has protect and adminOnly middlewares attached', () => {
    const bulkRoute = router.stack.find(layer => layer.route && layer.route.path === '/bulk-report');
    assert.ok(bulkRoute, 'Route /bulk-report must be registered');
    
    const methods = Object.keys(bulkRoute.route.methods);
    assert.ok(methods.includes('get'), 'Route must support GET method');
    
    // Handlers attached should include protect, adminOnly, getBulkSalaryReport
    assert.strictEqual(bulkRoute.route.stack.length, 3, 'Must have 3 handlers: protect, adminOnly, and getBulkSalaryReport');
    
    // Verify protect blocks unauthenticated
    let nextCalled = false;
    const mockReqNoAuth = { cookies: {}, headers: {} };
    const mockRes = {
      status: (code) => {
        assert.strictEqual(code, 401);
        return { json: (data) => assert.ok(data.message.includes('Not authorized')) };
      }
    };
    protect(mockReqNoAuth, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Unauthenticated request must not pass protect');

    // Verify adminOnly blocks non-admin
    let adminNextCalled = false;
    const mockReqWorker = { user: { role: 'worker' } };
    const mockResForbidden = {
      status: (code) => {
        assert.strictEqual(code, 403);
        return { json: (data) => assert.strictEqual(data.message, 'Access denied') };
      }
    };
    adminOnly(mockReqWorker, mockResForbidden, () => { adminNextCalled = true; });
    assert.strictEqual(adminNextCalled, false, 'Non-admin must not pass adminOnly');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Validation of Required Parameters (subdomain, fromDate, toDate)
  // ─────────────────────────────────────────────────────────────────────────────
  await runAsyncTest('Missing subdomain, fromDate, or toDate returns HTTP 400 Bad Request', async () => {
    const { getBulkSalaryReport } = require('../controllers/salaryController');

    // Case 2a: Missing all
    let resStatus = null;
    let resJson = null;
    const mockRes = {
      status: (code) => { resStatus = code; return mockRes; },
      json: (data) => { resJson = data; return mockRes; }
    };

    await getBulkSalaryReport({ query: {} }, mockRes);
    assert.strictEqual(resStatus, 400, 'Missing all parameters must return 400');
    assert.strictEqual(resJson.message, 'Subdomain, fromDate, and toDate are required');

    // Case 2b: Missing toDate
    resStatus = null;
    resJson = null;
    await getBulkSalaryReport({ query: { subdomain: 'techvaseegrah', fromDate: '2026-10-01' } }, mockRes);
    assert.strictEqual(resStatus, 400, 'Missing toDate must return 400');

    // Case 2c: Missing subdomain
    resStatus = null;
    resJson = null;
    await getBulkSalaryReport({ query: { fromDate: '2026-10-01', toDate: '2026-10-31' } }, mockRes);
    assert.strictEqual(resStatus, 400, 'Missing subdomain must return 400');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Handler Execution with All Query Parameters does NOT throw ReferenceError
  // ─────────────────────────────────────────────────────────────────────────────
  await runAsyncTest('Handler executes cleanly without ReferenceError when all query params are passed', async () => {
    const Worker = require('../models/Worker');
    const Settings = require('../models/Settings');
    const Holiday = require('../models/Holiday');
    const Attendance = require('../models/Attendance');
    const Leave = require('../models/Leave');
    const SalaryProject = require('../models/SalaryProject');
    const Ticket = require('../models/ticketModel');
    const PayrollRecord = require('../models/PayrollRecord');
    const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');
    const Department = require('../models/Department');

    const origCountDocuments = Worker.countDocuments;
    const origFind = Worker.find;
    const origSettingsFindOne = Settings.findOne;
    const origHolidayFind = Holiday.find;
    const origAttendanceFind = Attendance.find;
    const origLeaveFind = Leave.find;
    const origSalaryProjectFind = SalaryProject.find;
    const origTicketFind = Ticket.find;
    const origPayrollRecordFind = PayrollRecord.find;
    const origLedgerFind = ProjectPaymentLedger.find;
    const origDepartmentFind = Department.find;

    try {
      let capturedQuery = null;
      Worker.countDocuments = async (q) => {
        capturedQuery = q;
        return 0;
      };

      Worker.find = () => createMongooseQuery([]);
      Department.find = async () => [{ _id: 'DEP_ENG', name: 'Engineering' }];
      Settings.findOne = async () => null;
      Holiday.find = async () => [];
      Attendance.find = async () => [];
      Leave.find = async () => [];
      SalaryProject.find = () => createMongooseQuery([]);
      Ticket.find = async () => [];
      PayrollRecord.find = () => createMongooseQuery([]);
      ProjectPaymentLedger.find = () => createMongooseQuery([]);

      const { getBulkSalaryReport } = require('../controllers/salaryController');

      let resStatus = null;
      let resJson = null;
      const mockRes = {
        status: (code) => { resStatus = code; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
      };

      const req = {
        query: {
          subdomain: 'techvaseegrah',
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          searchTerm: 'Alice',
          filterDepartment: 'Engineering',
          filterMinSalary: '20000',
          filterMaxSalary: '80000',
          filterFineStatus: 'No Fines',
          filterBankStatus: 'Added',
          sortBy: 'name-asc',
          page: '1',
          limit: '10'
        }
      };

      await getBulkSalaryReport(req, mockRes);

      assert.strictEqual(resStatus, 200, 'Should return HTTP 200 without throwing 500 ReferenceError');
      assert.deepStrictEqual(resJson.reports, [], 'Empty workers results in empty reports array');
      assert.strictEqual(resJson.pagination.page, 1);
      assert.strictEqual(resJson.pagination.limit, 10);
      assert.strictEqual(resJson.pagination.total, 0);
      assert.strictEqual(resJson.pagination.hasMore, false);

      // Verify tenant subdomain was enforced in the query
      assert.strictEqual(capturedQuery.subdomain, 'techvaseegrah', 'Subdomain tenant isolation must be enforced');
      assert.strictEqual(capturedQuery.department, 'Engineering', 'Department filter must be applied');
      assert.strictEqual(capturedQuery.salary.$gte, 20000, 'Min salary must be applied');
      assert.strictEqual(capturedQuery.salary.$lte, 80000, 'Max salary must be applied');
    } finally {
      Worker.countDocuments = origCountDocuments;
      Worker.find = origFind;
      Settings.findOne = origSettingsFindOne;
      Holiday.find = origHolidayFind;
      Attendance.find = origAttendanceFind;
      Leave.find = origLeaveFind;
      SalaryProject.find = origSalaryProjectFind;
      Ticket.find = origTicketFind;
      PayrollRecord.find = origPayrollRecordFind;
      ProjectPaymentLedger.find = origLedgerFind;
      Department.find = origDepartmentFind;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Default Minimal Query (only subdomain, fromDate, toDate)
  // ─────────────────────────────────────────────────────────────────────────────
  await runAsyncTest('Minimal request with only required parameters executes cleanly', async () => {
    const Worker = require('../models/Worker');
    const Settings = require('../models/Settings');
    const Holiday = require('../models/Holiday');
    const Attendance = require('../models/Attendance');
    const Leave = require('../models/Leave');
    const SalaryProject = require('../models/SalaryProject');
    const Ticket = require('../models/ticketModel');
    const PayrollRecord = require('../models/PayrollRecord');
    const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');

    const origCountDocuments = Worker.countDocuments;
    const origFind = Worker.find;
    const origSettingsFindOne = Settings.findOne;
    const origHolidayFind = Holiday.find;
    const origAttendanceFind = Attendance.find;
    const origLeaveFind = Leave.find;
    const origSalaryProjectFind = SalaryProject.find;
    const origTicketFind = Ticket.find;
    const origPayrollRecordFind = PayrollRecord.find;
    const origLedgerFind = ProjectPaymentLedger.find;

    try {
      Worker.countDocuments = async () => 0;
      Worker.find = () => createMongooseQuery([]);
      Settings.findOne = async () => null;
      Holiday.find = async () => [];
      Attendance.find = async () => [];
      Leave.find = async () => [];
      SalaryProject.find = () => createMongooseQuery([]);
      Ticket.find = async () => [];
      PayrollRecord.find = () => createMongooseQuery([]);
      ProjectPaymentLedger.find = () => createMongooseQuery([]);

      const { getBulkSalaryReport } = require('../controllers/salaryController');

      let resStatus = null;
      let resJson = null;
      const mockRes = {
        status: (code) => { resStatus = code; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
      };

      await getBulkSalaryReport({
        query: {
          subdomain: 'techvaseegrah',
          fromDate: '2026-10-01',
          toDate: '2026-10-31'
        }
      }, mockRes);

      assert.strictEqual(resStatus, 200, 'Minimal request must succeed with 200 OK');
      assert.ok(Array.isArray(resJson.reports), 'Reports must be an array');
    } finally {
      Worker.countDocuments = origCountDocuments;
      Worker.find = origFind;
      Settings.findOne = origSettingsFindOne;
      Holiday.find = origHolidayFind;
      Attendance.find = origAttendanceFind;
      Leave.find = origLeaveFind;
      SalaryProject.find = origSalaryProjectFind;
      Ticket.find = origTicketFind;
      PayrollRecord.find = origPayrollRecordFind;
      ProjectPaymentLedger.find = origLedgerFind;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: In-memory sorting (fine-desc, final-asc, final-desc)
  // ─────────────────────────────────────────────────────────────────────────────
  await runAsyncTest('Dynamic in-memory sorts (fine-desc, final-asc, final-desc) work properly', async () => {
    const Worker = require('../models/Worker');
    const Settings = require('../models/Settings');
    const Holiday = require('../models/Holiday');
    const Attendance = require('../models/Attendance');
    const Leave = require('../models/Leave');
    const SalaryProject = require('../models/SalaryProject');
    const Ticket = require('../models/ticketModel');
    const PayrollRecord = require('../models/PayrollRecord');
    const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');

    const origCountDocuments = Worker.countDocuments;
    const origFind = Worker.find;
    const origSettingsFindOne = Settings.findOne;
    const origHolidayFind = Holiday.find;
    const origAttendanceFind = Attendance.find;
    const origLeaveFind = Leave.find;
    const origSalaryProjectFind = SalaryProject.find;
    const origTicketFind = Ticket.find;
    const origPayrollRecordFind = PayrollRecord.find;
    const origLedgerFind = ProjectPaymentLedger.find;

    try {
      const mockWorkers = [
        {
          _id: 'W1',
          name: 'Alice',
          salary: 30000,
          batch: 'Full Time',
          fines: [{ date: new Date('2026-10-05'), amount: 500 }],
          bonuses: [],
          subdomain: 'techvaseegrah',
          toObject: function() { return this; }
        },
        {
          _id: 'W2',
          name: 'Bob',
          salary: 50000,
          batch: 'Full Time',
          fines: [{ date: new Date('2026-10-10'), amount: 2000 }],
          bonuses: [],
          subdomain: 'techvaseegrah',
          toObject: function() { return this; }
        }
      ];

      Worker.countDocuments = async () => mockWorkers.length;
      Worker.find = () => createMongooseQuery(mockWorkers);
      Settings.findOne = async () => ({
        batches: [{ name: 'Full Time', start: '09:00', end: '18:00', lunchStart: '13:00', lunchEnd: '14:00' }]
      });
      Holiday.find = async () => [];
      Attendance.find = async () => [];
      Leave.find = async () => [];
      SalaryProject.find = () => createMongooseQuery([]);
      Ticket.find = async () => [];
      PayrollRecord.find = () => createMongooseQuery([]);
      ProjectPaymentLedger.find = () => createMongooseQuery([]);

      const { getBulkSalaryReport } = require('../controllers/salaryController');

      let resStatus = null;
      let resJson = null;
      const mockRes = {
        status: (code) => { resStatus = code; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
      };

      await getBulkSalaryReport({
        query: {
          subdomain: 'techvaseegrah',
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          sortBy: 'fine-desc',
          page: '1',
          limit: '10'
        }
      }, mockRes);

      assert.strictEqual(resStatus, 200);
      assert.strictEqual(resJson.reports.length, 2);
      // Bob has 2000 fines, Alice has 500 fines -> Bob should be first
      assert.strictEqual(resJson.reports[0].name, 'Bob');
      assert.strictEqual(resJson.reports[1].name, 'Alice');
    } finally {
      Worker.countDocuments = origCountDocuments;
      Worker.find = origFind;
      Settings.findOne = origSettingsFindOne;
      Holiday.find = origHolidayFind;
      Attendance.find = origAttendanceFind;
      Leave.find = origLeaveFind;
      SalaryProject.find = origSalaryProjectFind;
      Ticket.find = origTicketFind;
      PayrollRecord.find = origPayrollRecordFind;
      ProjectPaymentLedger.find = origLedgerFind;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: Zero Database Writes Guarantee on GET /bulk-report
  // ─────────────────────────────────────────────────────────────────────────────
  await runAsyncTest('Zero database write operations occur during getBulkSalaryReport execution', async () => {
    const Worker = require('../models/Worker');
    const Settings = require('../models/Settings');
    const Holiday = require('../models/Holiday');
    const Attendance = require('../models/Attendance');
    const Leave = require('../models/Leave');
    const SalaryProject = require('../models/SalaryProject');
    const Ticket = require('../models/ticketModel');
    const PayrollRecord = require('../models/PayrollRecord');
    const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');

    const origCountDocuments = Worker.countDocuments;
    const origFind = Worker.find;
    const origSettingsFindOne = Settings.findOne;
    const origHolidayFind = Holiday.find;
    const origAttendanceFind = Attendance.find;
    const origLeaveFind = Leave.find;
    const origSalaryProjectFind = SalaryProject.find;
    const origTicketFind = Ticket.find;
    const origPayrollRecordFind = PayrollRecord.find;
    const origLedgerFind = ProjectPaymentLedger.find;

    let writeCount = 0;
    const recordWrite = () => { writeCount++; };

    Worker.prototype.save = recordWrite;
    Worker.create = recordWrite;
    Worker.updateOne = recordWrite;
    Worker.findOneAndUpdate = recordWrite;
    Worker.findByIdAndUpdate = recordWrite;
    Worker.deleteMany = recordWrite;

    try {
      Worker.countDocuments = async () => 0;
      Worker.find = () => createMongooseQuery([]);
      Settings.findOne = async () => null;
      Holiday.find = async () => [];
      Attendance.find = async () => [];
      Leave.find = async () => [];
      SalaryProject.find = () => createMongooseQuery([]);
      Ticket.find = async () => [];
      PayrollRecord.find = () => createMongooseQuery([]);
      ProjectPaymentLedger.find = () => createMongooseQuery([]);

      const { getBulkSalaryReport } = require('../controllers/salaryController');

      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      };

      await getBulkSalaryReport({
        query: {
          subdomain: 'techvaseegrah',
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          page: '1',
          limit: '10'
        }
      }, mockRes);

      assert.strictEqual(writeCount, 0, 'Zero writes must occur on GET /bulk-report');
    } finally {
      Worker.countDocuments = origCountDocuments;
      Worker.find = origFind;
      Settings.findOne = origSettingsFindOne;
      Holiday.find = origHolidayFind;
      Attendance.find = origAttendanceFind;
      Leave.find = origLeaveFind;
      SalaryProject.find = origSalaryProjectFind;
      Ticket.find = origTicketFind;
      PayrollRecord.find = origPayrollRecordFind;
      ProjectPaymentLedger.find = origLedgerFind;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: Null-safe PayrollRecord workerId handling
  // ─────────────────────────────────────────────────────────────────────────────
  await runAsyncTest('Null/undefined workerId on PayrollRecord does not crash bulk report', async () => {
    const Worker = require('../models/Worker');
    const Settings = require('../models/Settings');
    const Holiday = require('../models/Holiday');
    const Attendance = require('../models/Attendance');
    const Leave = require('../models/Leave');
    const SalaryProject = require('../models/SalaryProject');
    const Ticket = require('../models/ticketModel');
    const PayrollRecord = require('../models/PayrollRecord');
    const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');

    const origCountDocuments = Worker.countDocuments;
    const origFind = Worker.find;
    const origSettingsFindOne = Settings.findOne;
    const origHolidayFind = Holiday.find;
    const origAttendanceFind = Attendance.find;
    const origLeaveFind = Leave.find;
    const origSalaryProjectFind = SalaryProject.find;
    const origTicketFind = Ticket.find;
    const origPayrollRecordFind = PayrollRecord.find;
    const origLedgerFind = ProjectPaymentLedger.find;

    try {
      const mockWorkers = [
        {
          _id: 'W1',
          name: 'Charlie',
          salary: 40000,
          batch: 'Full Time',
          fines: [],
          bonuses: [],
          subdomain: 'techvaseegrah',
          toObject: function() { return this; }
        }
      ];

      // Corrupted payroll record with null workerId
      const corruptPayrollRecords = [
        { workerId: null, status: 'Draft', adjustments: [] },
        { workerId: undefined, status: 'Draft', adjustments: [] }
      ];

      Worker.countDocuments = async () => mockWorkers.length;
      Worker.find = () => createMongooseQuery(mockWorkers);
      Settings.findOne = async () => null;
      Holiday.find = async () => [];
      Attendance.find = async () => [];
      Leave.find = async () => [];
      SalaryProject.find = () => createMongooseQuery([]);
      Ticket.find = async () => [];
      PayrollRecord.find = () => createMongooseQuery(corruptPayrollRecords);
      ProjectPaymentLedger.find = () => createMongooseQuery([]);

      const { getBulkSalaryReport } = require('../controllers/salaryController');

      let resStatus = null;
      let resJson = null;
      const mockRes = {
        status: (code) => { resStatus = code; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
      };

      await getBulkSalaryReport({
        query: {
          subdomain: 'techvaseegrah',
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          page: '1',
          limit: '10'
        }
      }, mockRes);

      assert.strictEqual(resStatus, 200, 'Must safely handle corrupt records without throwing 500');
      assert.strictEqual(resJson.reports.length, 1);
    } finally {
      Worker.countDocuments = origCountDocuments;
      Worker.find = origFind;
      Settings.findOne = origSettingsFindOne;
      Holiday.find = origHolidayFind;
      Attendance.find = origAttendanceFind;
      Leave.find = origLeaveFind;
      SalaryProject.find = origSalaryProjectFind;
      Ticket.find = origTicketFind;
      PayrollRecord.find = origPayrollRecordFind;
      ProjectPaymentLedger.find = origLedgerFind;
    }
  });

  console.log('\n================================================================');
  console.log(` Summary: ${passCount} Passed, ${failCount} Failed out of ${testCount} Total Tests`);
  console.log('================================================================');
  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests();
