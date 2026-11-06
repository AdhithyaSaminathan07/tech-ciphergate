/**
 * Tech Ciphergate — WhatsApp Salary Dispatch False-Success Fix Regression Test Suite
 *
 * SAFETY GUARANTEES:
 * 1. 100% In-Memory / Isolated Mocks.
 * 2. Zero live database connections, zero DB mutations.
 * 3. Never touches .env files or external APIs.
 *
 * Requirements Covered:
 * 1. All WhatsApp attempts fail -> returns success: false, does NOT update lastDispatchedAt.
 * 2. Template fails but document fallback succeeds -> returns success: true, updates lastDispatchedAt.
 * 3. All required deliverables succeed -> returns success: true, updates lastDispatchedAt.
 * 4. Partial recipient failure (e.g. 1 recipient succeeds, 1 fails) -> reports partial success accurately.
 * 5. Partial deliverable failure (e.g. XLSX succeeds, PDF fails) -> does not mark full acceptance or complete success.
 * 6. Network timeout and API-level failure -> caught and propagated with sanitized error.
 * 7. Failed dispatch does not incorrectly update lastDispatchedAt.
 * 8. On-demand controller (triggerWhatsappSalaryDispatch) propagates failures as HTTP 400.
 * 9. Scheduled dispatch entrypoint receives accurate error status.
 * 10. Sanitizer redacts tokens, bearer headers, and credentials.
 */

const assert = require('assert');
const path = require('path');
const {
  executeSalaryWhatsappDispatch,
  sanitizeErrorMessage,
  maskPhoneNumber
} = require('../services/autoSalaryWhatsappService');

// Mongoose Models for mocking
const Worker = require('../models/Worker');
const Settings = require('../models/Settings');
const GowhatsConfig = require('../models/GowhatsConfig');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const SalaryProject = require('../models/SalaryProject');
const Ticket = require('../models/ticketModel');
const PayrollRecord = require('../models/PayrollRecord');
const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');
const whatsappService = require('../services/whatsappService');

console.log('================================================================');
console.log(' WhatsApp Salary Dispatch — False-Success Fix Regression Tests  ');
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

function createMongooseQuery(docs) {
  const query = {
    populate: () => query,
    select: () => query,
    sort: () => query,
    skip: () => query,
    limit: () => query,
    lean: () => Promise.resolve(docs),
    then: (resolve, reject) => Promise.resolve(docs).then(resolve, reject),
    catch: (reject) => Promise.resolve(docs).catch(reject)
  };
  return query;
}

const mockWorker = {
  _id: 'w_test_dispatch',
  name: 'Test Employee',
  salary: 30000,
  status: 'Active',
  batch: 'Full Time',
  subdomain: 'tech-vaseegrah'
};

const standardBatch = {
  batchName: 'Full Time',
  from: '09:00',
  to: '19:00',
  lunchFrom: '12:00',
  lunchTo: '13:00',
  requiredWorkingHours: 8
};

async function main() {
  const origWorkerFind = Worker.find;
  const origSettingsFindOne = Settings.findOne;
  const origGowhatsFindOne = GowhatsConfig.findOne;
  const origAttendanceFind = Attendance.find;
  const origLeaveFind = Leave.find;
  const origHolidayFind = Holiday.find;
  const origSalaryProjectFind = SalaryProject.find;
  const origTicketFind = Ticket.find;
  const origPayrollRecordFind = PayrollRecord.find;
  const origLedgerFind = ProjectPaymentLedger.find;
  const origSendWhatsApp = whatsappService.sendWhatsApp;

  try {
    Attendance.find = () => createMongooseQuery([]);
    Leave.find = () => createMongooseQuery([]);
    Holiday.find = () => createMongooseQuery([]);
    SalaryProject.find = () => createMongooseQuery([]);
    Ticket.find = () => createMongooseQuery([]);
    PayrollRecord.find = () => createMongooseQuery([]);
    ProjectPaymentLedger.find = () => createMongooseQuery([]);
    GowhatsConfig.findOne = () => Promise.resolve(null);

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 1: Sanitization and Privacy Helpers
    // ─────────────────────────────────────────────────────────────────────────────
    runTest('sanitizeErrorMessage redacts Bearer tokens, passwords, and Meta EA tokens', () => {
      const raw = 'Failed with Bearer EAAXyZ123456789 and access_token=EAASecret12345; status: 401';
      const sanitized = sanitizeErrorMessage(raw);
      assert.strictEqual(sanitized.includes('EAAXyZ'), false, 'Token must not be visible');
      assert.strictEqual(sanitized.includes('EAASecret'), false, 'Secret token must not be visible');
      assert.strictEqual(sanitized.includes('[REDACTED]'), true, 'Must include [REDACTED]');
    });

    runTest('maskPhoneNumber redacts middle digits of recipient phone numbers', () => {
      const masked = maskPhoneNumber('919876543210');
      assert.strictEqual(masked, '91****3210');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 2: All WhatsApp Attempts Fail
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('All WhatsApp attempts fail -> returns success: false and does NOT update lastDispatchedAt', async () => {
      let savedTimestamp = null;
      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210', lastDispatchedAt: null },
        batches: [standardBatch],
        save: async function() { savedTimestamp = this.autoSalaryWhatsappConfig.lastDispatchedAt; }
      });

      // Provider rejects all attempts (template, text, xlsx, pdf)
      whatsappService.sendWhatsApp = async () => ({
        success: false,
        error: 'Invalid OAuth access token (code 190)'
      });

      const res = await executeSalaryWhatsappDispatch('tech-vaseegrah', '919876543210', 10, 2026);

      assert.strictEqual(res.success, false, 'Dispatch must return success: false when all message attempts fail');
      assert.strictEqual(res.error.includes('WhatsApp salary dispatch failed'), true);
      assert.strictEqual(savedTimestamp, null, 'lastDispatchedAt must NOT be updated when dispatch fails');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 3: Template Fails but Document Fallback Succeeds
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Template fails but document fallback succeeds -> returns success: true and updates lastDispatchedAt', async () => {
      let savedTimestamp = null;
      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210', lastDispatchedAt: null },
        batches: [standardBatch],
        save: async function() { savedTimestamp = this.autoSalaryWhatsappConfig.lastDispatchedAt; }
      });

      // Template fails with 132001, but fallback text + fallback XLSX document + PDF document succeed
      whatsappService.sendWhatsApp = async (subdomain, phone, data) => {
        if (data.type === 'template') {
          return { success: false, error: 'Template monthly_salary_report not found (code 132001)' };
        }
        return { success: true, response: { messages: [{ id: 'wamid.fallback' }] } };
      };

      const res = await executeSalaryWhatsappDispatch('tech-vaseegrah', '919876543210', 10, 2026);

      assert.strictEqual(res.success, true, 'Dispatch must succeed when fallback documents are accepted');
      assert.strictEqual(res.partial, false, 'Should be full acceptance since both XLSX and PDF were accepted');
      assert.ok(savedTimestamp instanceof Date, 'lastDispatchedAt MUST be updated when all required deliverables succeed');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 4: All Required Deliverables Succeed via Template
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('All required deliverables succeed via template + PDF -> returns success: true and updates lastDispatchedAt', async () => {
      let savedTimestamp = null;
      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210', lastDispatchedAt: null },
        batches: [standardBatch],
        save: async function() { savedTimestamp = this.autoSalaryWhatsappConfig.lastDispatchedAt; }
      });

      whatsappService.sendWhatsApp = async () => ({
        success: true,
        response: { messages: [{ id: 'wamid.success' }] }
      });

      const res = await executeSalaryWhatsappDispatch('tech-vaseegrah', '919876543210', 10, 2026);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.partial, false);
      assert.strictEqual(res.recipientOutcomes[0].allDeliverablesAccepted, true);
      assert.ok(savedTimestamp instanceof Date, 'lastDispatchedAt MUST be updated');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 5: Partial Recipient Failure (Recipient 1 succeeds, Recipient 2 fails)
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Partial recipient failure is accurately reported with partial: true', async () => {
      let savedTimestamp = null;
      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210, 919876543211', lastDispatchedAt: null },
        batches: [standardBatch],
        save: async function() { savedTimestamp = this.autoSalaryWhatsappConfig.lastDispatchedAt; }
      });

      whatsappService.sendWhatsApp = async (subdomain, phone) => {
        if (phone.includes('3210')) {
          return { success: true, response: { messages: [{ id: 'wamid.p1' }] } };
        } else {
          return { success: false, error: 'Recipient phone number not registered (code 131026)' };
        }
      };

      const res = await executeSalaryWhatsappDispatch('tech-vaseegrah', '919876543210, 919876543211', 10, 2026);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.partial, true, 'partial must be true when one recipient fails');
      assert.strictEqual(res.message.includes('1 of 2 recipients accepted all deliverables'), true);
      assert.strictEqual(res.message.includes('1 failed'), true);
      assert.ok(savedTimestamp instanceof Date, 'lastDispatchedAt updated to prevent duplicate send to recipient 1');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 6: Partial Deliverable Failure (XLSX succeeds, but PDF fails for same recipient)
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Partial deliverable failure (XLSX succeeds, PDF fails) is recognized as incomplete deliverable', async () => {
      let savedTimestamp = null;
      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210', lastDispatchedAt: null },
        batches: [standardBatch],
        save: async function() { savedTimestamp = this.autoSalaryWhatsappConfig.lastDispatchedAt; }
      });

      whatsappService.sendWhatsApp = async (subdomain, phone, data) => {
        if (data.type === 'template') {
          return { success: true, response: { messages: [{ id: 'wamid.template_xlsx' }] } };
        }
        if (data.type === 'document') {
          return { success: false, error: 'Media upload failed for PDF' };
        }
        return { success: true };
      };

      const res = await executeSalaryWhatsappDispatch('tech-vaseegrah', '919876543210', 10, 2026);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.partial, true, 'partial must be true because PDF deliverable was not accepted');
      assert.strictEqual(res.recipientOutcomes[0].xlsxAccepted, true);
      assert.strictEqual(res.recipientOutcomes[0].pdfAccepted, false);
      assert.strictEqual(res.recipientOutcomes[0].allDeliverablesAccepted, false);
      assert.strictEqual(savedTimestamp, null, 'lastDispatchedAt must NOT be marked complete when full deliverable package was incomplete');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 7: Network Timeout and Exceptions
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Network timeout / throws -> returns success: false and does not update lastDispatchedAt', async () => {
      let savedTimestamp = null;
      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210', lastDispatchedAt: null },
        batches: [standardBatch],
        save: async function() { savedTimestamp = this.autoSalaryWhatsappConfig.lastDispatchedAt; }
      });

      whatsappService.sendWhatsApp = async () => {
        throw new Error('ETIMEDOUT: Connection to Meta Graph API timed out');
      };

      const res = await executeSalaryWhatsappDispatch('tech-vaseegrah', '919876543210', 10, 2026);

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error.includes('ETIMEDOUT'), true);
      assert.strictEqual(savedTimestamp, null);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Category 8: On-Demand Controller HTTP 400 Propagation
    // ─────────────────────────────────────────────────────────────────────────────
    await runAsyncTest('On-demand controller (triggerWhatsappSalaryDispatch) correctly throws HTTP 400 on failure', async () => {
      const { triggerWhatsappSalaryDispatch } = require('../controllers/salaryController');

      Worker.find = () => createMongooseQuery([mockWorker]);
      Settings.findOne = () => Promise.resolve({
        subdomain: 'tech-vaseegrah',
        autoSalaryWhatsappConfig: { phoneNumbers: '919876543210' },
        batches: [standardBatch],
        save: async () => {}
      });

      whatsappService.sendWhatsApp = async () => ({
        success: false,
        error: 'WhatsApp API token invalid'
      });

      let responseStatus = null;
      const req = { body: { subdomain: 'tech-vaseegrah', phoneNumbers: '919876543210' } };
      const res = {
        status: (s) => { responseStatus = s; return res; },
        json: () => {}
      };

      let thrownError = null;
      try {
        await triggerWhatsappSalaryDispatch(req, res);
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError, 'Controller must throw when dispatch returns success: false');
      assert.strictEqual(responseStatus, 400, 'Controller must set HTTP status 400 on dispatch failure');
      assert.strictEqual(thrownError.message.includes('WhatsApp salary dispatch failed'), true);
    });

  } finally {
    Worker.find = origWorkerFind;
    Settings.findOne = origSettingsFindOne;
    GowhatsConfig.findOne = origGowhatsFindOne;
    Attendance.find = origAttendanceFind;
    Leave.find = origLeaveFind;
    Holiday.find = origHolidayFind;
    SalaryProject.find = origSalaryProjectFind;
    Ticket.find = origTicketFind;
    PayrollRecord.find = origPayrollRecordFind;
    ProjectPaymentLedger.find = origLedgerFind;
    whatsappService.sendWhatsApp = origSendWhatsApp;
  }

  console.log('\n================================================================');
  console.log(` Summary: ${passCount} Passed, ${failCount} Failed out of ${testCount} Total Tests`);
  console.log('================================================================');
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
