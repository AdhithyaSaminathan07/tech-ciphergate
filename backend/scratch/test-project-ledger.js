const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const Worker = require('../models/Worker');
const SalaryProject = require('../models/SalaryProject');
const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');
const salaryController = require('../controllers/salaryController');

const runTest = async () => {
  console.log('Connecting to database...');
  await connectDB();

  try {
    // 1. Create a dummy worker
    console.log('Creating dummy worker...');
    const testWorker = await Worker.create({
      name: 'Test Ledger Employee',
      username: 'test_ledger_worker_' + Date.now(),
      rfid: 'RFID_' + Date.now(),
      email: 'test.ledger@example.com',
      password: 'password123',
      subdomain: 'test-ledger-subdomain',
      salary: 50000,
      designation: 'Developer'
    });

    console.log(`Dummy worker created: ${testWorker.name} (${testWorker._id})`);

    // 2. Create a Salary Project: 21 Apr 2026 -> 21 May 2026
    console.log('Creating project: 21 Apr 2026 to 21 May 2026...');
    const testProject = new SalaryProject({
      projectName: 'Test Ledger Project',
      projectAmount: 57500, // 57500 * 60% = 34500 profit
      profitPercentage: 60,
      developers: [testWorker._id],
      startDate: new Date('2026-04-21'),
      endDate: new Date('2026-05-21'),
      subdomain: 'test-ledger-subdomain'
    });
    await testProject.save();

    console.log(`Project created: ${testProject.projectName} (${testProject._id})`);
    console.log(`Project Profit: ₹${testProject.projectProfit}, Share: ₹${testProject.perDeveloperShare}`);

    // 3. Record payment for Month 4 (April), Year 2026
    console.log('Recording project payment for April 2026 (Month 4)...');
    let req = {
      body: {
        employeeId: testWorker._id.toString(),
        projectId: testProject._id.toString(),
        subdomain: 'test-ledger-subdomain',
        month: 4,
        year: 2026
      }
    };
    let resData = null;
    let res = {
      status: (code) => {
        return {
          json: (data) => {
            resData = data;
          }
        };
      }
    };

    // Call recordProjectPayment controller directly
    await salaryController.recordProjectPayment(req, res);
    console.log('Record payment response:', resData);

    if (!resData || !resData.ledger) {
      throw new Error('Failed to record payment or no ledger returned');
    }

    // Verify ledger entry
    const ledgerEntry = await ProjectPaymentLedger.findOne({
      employeeId: testWorker._id,
      projectId: testProject._id,
      month: 4,
      year: 2026
    });

    console.log('Ledger entry recorded in DB:', {
      paidAmount: ledgerEntry.paidAmount,
      paidPerDayValue: ledgerEntry.paidPerDayValue,
      paidWorkingDays: ledgerEntry.paidWorkingDays,
      isSettled: ledgerEntry.isSettled
    });

    // 4. Generate May 2026 (Month 5) salary report BEFORE project extension
    console.log('Generating May 2026 salary report before project extension...');
    let reqReport = {
      params: { id: testWorker._id.toString() },
      query: {
        fromDate: '2026-05-01',
        toDate: '2026-05-31',
        subdomain: 'test-ledger-subdomain'
      }
    };
    let reportData = null;
    let resReport = {
      status: (code) => {
        return {
          json: (data) => {
            reportData = data;
          }
        };
      }
    };

    await salaryController.getWorkerSalaryReport(reqReport, resReport);
    console.log('Before extension, adjustment is:', reportData.projectAdjustment);
    console.log('Before extension, finalSalaryWithFines is:', reportData.finalSalaryWithFines);

    // 5. EXTEND project end date: Change to 30 May 2026
    console.log('Extending project endDate to 2026-05-30...');
    testProject.endDate = new Date('2026-05-30');
    await testProject.save();

    console.log('Generating May 2026 salary report AFTER project extension...');
    let reportDataAfter = null;
    let resReportAfter = {
      status: (code) => {
        return {
          json: (data) => {
            reportDataAfter = data;
          }
        };
      }
    };
    await salaryController.getWorkerSalaryReport(reqReport, resReportAfter);
    console.log('After extension, adjustment is:', reportDataAfter.projectAdjustment);
    console.log('After extension, finalSalaryWithFines is:', reportDataAfter.finalSalaryWithFines);
    console.log('Adjustment details breakdown:', reportDataAfter.projectAdjustmentDetails);

    // Verify correct adjustment calculation
    // Working days 21 Apr -> 30 May:
    // April: 21 (Tue) to 30 (Thu) = 9 working days.
    // May: 1 (Fri) to 30 (Sat) = 26 working days.
    // Total working days = 35.
    // Expected new per day = 34500 / 35 = ₹985.7142857
    // Expected April entitlement = 9 * 985.7142857 = ₹8,871.42857
    // Already paid in April = ₹11,500
    // Expected adjustment = 8,871.42857 - 11,500 = -₹2,628.5714
    const expectedNewPerDay = 34500 / 35;
    const expectedAprilEntitlement = 9 * expectedNewPerDay;
    const expectedAdjustment = expectedAprilEntitlement - 11500;

    console.log(`Expected adjustment: ₹${expectedAdjustment.toFixed(4)}`);
    console.log(`Actual adjustment: ₹${reportDataAfter.projectAdjustment.toFixed(4)}`);

    const diff = Math.abs(expectedAdjustment - reportDataAfter.projectAdjustment);
    if (diff < 0.01) {
      console.log('✅ TEST PASSED: Project adjustment is mathematically correct!');
    } else {
      console.error('❌ TEST FAILED: Discrepancy in adjustment calculation!');
    }

  } catch (error) {
    console.error('Test threw an error:', error);
  } finally {
    // Cleanup
    console.log('Cleaning up database records...');
    await Worker.deleteMany({ email: 'test.ledger@example.com' });
    await SalaryProject.deleteMany({ projectName: 'Test Ledger Project' });
    await ProjectPaymentLedger.deleteMany({ subdomain: 'test-ledger-subdomain' });
    console.log('Cleanup complete.');
    mongoose.connection.close();
  }
};

runTest();
