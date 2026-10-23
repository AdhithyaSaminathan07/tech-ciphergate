/**
 * Tech Ciphergate — Leave Application Tenant Resolution Isolated Unit Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEE:
 * - 100% Isolated unit tests with complete in-memory mocking.
 * - Zero database writes, modifications, seeds, or deletes.
 * - Zero live database connection used.
 * - Notifications and emails are strictly stubbed/mocked.
 */

const assert = require('assert');
const { applyLeaveSchema } = require('../validations/leaveSchemas');
const notificationService = require('../services/notificationService');
// Stub notification service to prevent live network/buffering requests
notificationService.sendNewLeaveRequestNotification = async () => ({ success: true, summary: 'Mocked notification' });

const { createLeave, getLeaveApplyStats, getLeaves } = require('../controllers/leaveController');
const Leave = require('../models/Leave');
const Worker = require('../models/Worker');
const Settings = require('../models/Settings');

console.log('================================================================');
console.log(' Tech Ciphergate — Leave Application Tenant Resolution Tests   ');
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ [FAIL] Test ${testCount}: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// Hostname resolution simulator replicating frontend/src/utils/tenantUtils.js logic
function simulateExtractSubdomain(rawHost) {
  const RESERVED_SUBDOMAINS = new Set([
    'www', 'api', 'admin', 'app', 'main', 'dev', 'stage',
    'staging', 'test', 'ciphergate', 'mail', 'smtp', 'ftp', 'status', 'localhost'
  ]);
  if (!rawHost || typeof rawHost !== 'string') return null;
  const hostWithoutPort = rawHost.split(':')[0].trim().toLowerCase();
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort);
  if (isIPv4 || hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1') {
    return null;
  }
  if (hostWithoutPort.endsWith('.localhost')) {
    const parts = hostWithoutPort.split('.');
    if (parts.length >= 2 && parts[0] && !RESERVED_SUBDOMAINS.has(parts[0])) {
      return parts[0];
    }
    return null;
  }
  const parts = hostWithoutPort.split('.');
  if (parts.length >= 3) {
    const candidate = parts[0];
    if (candidate && !RESERVED_SUBDOMAINS.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function simulateResolveTenantSubdomain({ user, contextSubdomain, storedSubdomain, hostname }) {
  if (user?.subdomain && user.subdomain !== 'main' && user.subdomain !== 'undefined') {
    return user.subdomain.trim();
  }
  if (contextSubdomain && contextSubdomain !== 'main' && contextSubdomain !== 'undefined') {
    return contextSubdomain.trim();
  }
  if (storedSubdomain && storedSubdomain !== 'main' && storedSubdomain !== 'undefined') {
    return storedSubdomain.trim();
  }
  const fromHost = simulateExtractSubdomain(hostname);
  if (fromHost) {
    return fromHost;
  }
  return null;
}

// Mock Helper for Express Request & Response
function createMockReqRes({ user, body = {}, params = {}, query = {}, file = null }) {
  const req = {
    user,
    body,
    params,
    query,
    file,
    ip: '127.0.0.1'
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getResponseData() {
      return responseData;
    }
  };

  return { req, res };
}

async function runAllTests() {
  // Save original model methods
  const origLeaveCreate = Leave.create;
  const origLeaveCount = Leave.countDocuments;
  const origWorkerFindById = Worker.findById;
  const origSettingsFindOne = Settings.findOne;

  try {
    // -------------------------------------------------------------
    // Test Group 1: Hostname Subdomain Extraction Logic
    // -------------------------------------------------------------
    await runTest('Hostname Extraction: Localhost and IP addresses return null', async () => {
      assert.strictEqual(simulateExtractSubdomain('localhost'), null);
      assert.strictEqual(simulateExtractSubdomain('localhost:5173'), null);
      assert.strictEqual(simulateExtractSubdomain('127.0.0.1'), null);
      assert.strictEqual(simulateExtractSubdomain('127.0.0.1:5002'), null);
    });

    await runTest('Hostname Extraction: tenant.localhost returns the tenant', async () => {
      assert.strictEqual(simulateExtractSubdomain('techvaseegrah.localhost'), 'techvaseegrah');
      assert.strictEqual(simulateExtractSubdomain('techvaseegrah.localhost:5173'), 'techvaseegrah');
    });

    await runTest('Hostname Extraction: Production base domain ciphergate.techvaseegrah.com returns null', async () => {
      assert.strictEqual(simulateExtractSubdomain('ciphergate.techvaseegrah.com'), null);
      assert.strictEqual(simulateExtractSubdomain('www.ciphergate.techvaseegrah.com'), null);
    });

    await runTest('Hostname Extraction: Custom tenant subdomain returns tenant correctly', async () => {
      assert.strictEqual(simulateExtractSubdomain('acme.ciphergate.techvaseegrah.com'), 'acme');
      assert.strictEqual(simulateExtractSubdomain('acme.techvaseegrah.com'), 'acme');
      assert.strictEqual(simulateExtractSubdomain('acme-corp.ciphergate.com'), 'acme-corp');
    });

    // -------------------------------------------------------------
    // Test Group 2: Client-side Tenant Resolution Hierarchy
    // -------------------------------------------------------------
    await runTest('Tenant Resolution: Authenticated user.subdomain takes highest priority', async () => {
      const tenant = simulateResolveTenantSubdomain({
        user: { subdomain: 'real-tenant' },
        contextSubdomain: 'main',
        storedSubdomain: 'legacy-tenant',
        hostname: 'another-tenant.ciphergate.com'
      });
      assert.strictEqual(tenant, 'real-tenant');
    });

    await runTest('Tenant Resolution: Falls back to context / stored when user has not loaded', async () => {
      const tenantWithContext = simulateResolveTenantSubdomain({
        user: null,
        contextSubdomain: 'context-tenant',
        storedSubdomain: null,
        hostname: 'localhost:5173'
      });
      assert.strictEqual(tenantWithContext, 'context-tenant');

      const tenantWithStored = simulateResolveTenantSubdomain({
        user: null,
        contextSubdomain: 'main',
        storedSubdomain: 'stored-tenant',
        hostname: 'localhost:5173'
      });
      assert.strictEqual(tenantWithStored, 'stored-tenant');
    });

    await runTest('Tenant Resolution: Returns null when genuine failure (no tenant anywhere)', async () => {
      const tenant = simulateResolveTenantSubdomain({
        user: null,
        contextSubdomain: 'main',
        storedSubdomain: null,
        hostname: 'localhost:5173'
      });
      assert.strictEqual(tenant, null);
    });

    // -------------------------------------------------------------
    // Test Group 3: Zod Schema Validation (applyLeaveSchema)
    // -------------------------------------------------------------
    await runTest('Zod Schema: Validates leave application with explicit subdomain', async () => {
      const payload = {
        body: {
          leaveType: 'Annual Leave',
          startDate: '2026-11-01',
          endDate: '2026-11-02',
          reason: 'Family event',
          subdomain: 'tech-vaseegrah',
          totalDays: 2
        }
      };
      const parsed = await applyLeaveSchema.parseAsync(payload);
      assert.strictEqual(parsed.body.subdomain, 'tech-vaseegrah');
      assert.strictEqual(parsed.body.leaveType, 'Annual Leave');
    });

    await runTest('Zod Schema: Allows leave application without subdomain in body for backend resolution', async () => {
      const payload = {
        body: {
          leaveType: 'Sick Leave',
          startDate: '2026-11-05',
          endDate: '2026-11-06',
          reason: 'Fever',
          totalDays: 2
        }
      };
      const parsed = await applyLeaveSchema.parseAsync(payload);
      assert.strictEqual(parsed.body.leaveType, 'Sick Leave');
      assert.strictEqual(parsed.body.subdomain, undefined);
    });

    // -------------------------------------------------------------
    // Test Group 4: Backend Leave Creation & Tenant Context Safety
    // -------------------------------------------------------------
    await runTest('Backend createLeave: Successfully resolves tenant from req.user when body subdomain is missing', async () => {
      let createdDoc = null;
      Leave.create = async (doc) => {
        createdDoc = doc;
        return { _id: 'mock_leave_123', ...doc };
      };
      Worker.findById = async () => ({
        _id: 'mock_worker_1',
        status: 'Active',
        subdomain: 'tech-vaseegrah'
      });
      Settings.findOne = async () => ({
        subdomain: 'tech-vaseegrah',
        paidLeaveConfig: { enabled: true, leavesPerMonth: 2 }
      });

      const { req, res } = createMockReqRes({
        user: { _id: 'mock_worker_1', role: 'worker', subdomain: 'tech-vaseegrah' },
        body: {
          leaveType: 'Annual Leave',
          startDate: '2026-11-10',
          endDate: '2026-11-11',
          totalDays: 2,
          reason: 'Personal errands'
          // Notice: no subdomain in body (e.g. after refresh)
        }
      });

      await createLeave(req, res, () => {});

      assert.strictEqual(createdDoc !== null, true, 'Leave document must be created');
      assert.strictEqual(createdDoc.subdomain, 'tech-vaseegrah', 'Subdomain must be resolved from req.user');
      assert.strictEqual(createdDoc.worker, 'mock_worker_1');
    });

    await runTest('Backend createLeave: Uses req.user.subdomain when body has subdomain="main"', async () => {
      let createdDoc = null;
      Leave.create = async (doc) => {
        createdDoc = doc;
        return { _id: 'mock_leave_124', ...doc };
      };
      Worker.findById = async () => ({
        _id: 'mock_worker_1',
        status: 'Active',
        subdomain: 'tech-vaseegrah'
      });
      Settings.findOne = async () => ({
        subdomain: 'tech-vaseegrah',
        paidLeaveConfig: { enabled: true, leavesPerMonth: 2 }
      });

      const { req, res } = createMockReqRes({
        user: { _id: 'mock_worker_1', role: 'worker', subdomain: 'tech-vaseegrah' },
        body: {
          leaveType: 'Annual Leave',
          startDate: '2026-11-10',
          endDate: '2026-11-11',
          totalDays: 2,
          reason: 'Personal errands',
          subdomain: 'main' // Context was out-of-sync with 'main'
        }
      });

      await createLeave(req, res, () => {});

      assert.strictEqual(createdDoc !== null, true, 'Leave must be created');
      assert.strictEqual(createdDoc.subdomain, 'tech-vaseegrah', 'Must resolve to authenticated user tenant, not main');
    });

    await runTest('Backend createLeave: Prevents cross-tenant spoofing by enforcing req.user.subdomain', async () => {
      let createdDoc = null;
      Leave.create = async (doc) => {
        createdDoc = doc;
        return { _id: 'mock_leave_125', ...doc };
      };
      Worker.findById = async () => ({
        _id: 'mock_worker_1',
        status: 'Active',
        subdomain: 'worker-tenant'
      });
      Settings.findOne = async () => ({
        subdomain: 'worker-tenant',
        paidLeaveConfig: { enabled: true, leavesPerMonth: 2 }
      });

      const { req, res } = createMockReqRes({
        user: { _id: 'mock_worker_1', role: 'worker', subdomain: 'worker-tenant' },
        body: {
          leaveType: 'Annual Leave',
          startDate: '2026-11-10',
          endDate: '2026-11-11',
          totalDays: 2,
          reason: 'Personal errands',
          subdomain: 'attacker-target-tenant' // Malicious attempt to file under another tenant
        }
      });

      await createLeave(req, res, () => {});

      assert.strictEqual(createdDoc.subdomain, 'worker-tenant', 'Leave must remain isolated to worker authenticated tenant');
    });

    await runTest('Backend createLeave: Fails closed with 400 when tenant context is genuinely missing', async () => {
      let errorThrown = null;
      Leave.create = async () => {
        throw new Error('Should not be called');
      };

      const { req, res } = createMockReqRes({
        user: { _id: 'mock_worker_1', role: 'worker' }, // missing subdomain on user
        body: {
          leaveType: 'Annual Leave',
          startDate: '2026-11-10',
          endDate: '2026-11-11',
          totalDays: 2,
          reason: 'Personal errands',
          subdomain: 'main' // missing on body
        }
      });

      try {
        await createLeave(req, res, (err) => { if (err) throw err; });
      } catch (err) {
        errorThrown = err;
      }

      assert.strictEqual(res.getStatusCode(), 400, 'Must return HTTP 400 Bad Request');
      assert.strictEqual(errorThrown !== null, true, 'Must throw error when tenant resolution fails');
      assert(errorThrown.message.includes('required fields'), 'Error message must clearly state validation failure');
    });

    // -------------------------------------------------------------
    // Test Group 5: Repeated Submissions & Session Refresh Consistency
    // -------------------------------------------------------------
    await runTest('Consistency: Repeated leave submissions maintain exact same tenant context', async () => {
      const createdSubdomains = [];
      Leave.create = async (doc) => {
        createdSubdomains.push(doc.subdomain);
        return { _id: `mock_leave_${createdSubdomains.length}`, ...doc };
      };
      Worker.findById = async () => ({
        _id: 'mock_worker_1',
        status: 'Active',
        subdomain: 'tech-vaseegrah'
      });
      Settings.findOne = async () => ({
        subdomain: 'tech-vaseegrah',
        paidLeaveConfig: { enabled: true, leavesPerMonth: 2 }
      });

      for (let i = 1; i <= 5; i++) {
        const { req, res } = createMockReqRes({
          user: { _id: 'mock_worker_1', role: 'worker', subdomain: 'tech-vaseegrah' },
          body: {
            leaveType: 'Annual Leave',
            startDate: `2026-11-0${i}`,
            endDate: `2026-11-0${i}`,
            totalDays: 1,
            reason: `Repeated test ${i}`
          }
        });
        await createLeave(req, res, () => {});
      }

      assert.strictEqual(createdSubdomains.length, 5);
      createdSubdomains.forEach((sub, idx) => {
        assert.strictEqual(sub, 'tech-vaseegrah', `Submission ${idx + 1} must preserve tenant`);
      });
    });

    // -------------------------------------------------------------
    // Test Group 6: getLeaveApplyStats Tenant Fallback
    // -------------------------------------------------------------
    await runTest('Backend getLeaveApplyStats: Recovers when frontend passes subdomain="main"', async () => {
      let querySubdomain = null;
      Settings.findOne = async ({ subdomain }) => {
        querySubdomain = subdomain;
        return {
          subdomain,
          advancedLeaveDeduction: {},
          paidLeaveConfig: { enabled: true, leavesPerMonth: 2 }
        };
      };
      Worker.findById = async () => ({
        _id: 'mock_worker_1',
        department: 'Engineering',
        status: 'Active'
      });
      Worker.countDocuments = async () => 10;
      Attendance.distinct = async () => [];
      Leave.countDocuments = async () => 0;

      const { req, res } = createMockReqRes({
        user: { _id: 'mock_worker_1', role: 'worker', subdomain: 'tech-vaseegrah' },
        params: { subdomain: 'main' } // Frontend had 'main' before sync
      });

      await getLeaveApplyStats(req, res, () => {});

      assert.strictEqual(querySubdomain, 'tech-vaseegrah', 'getLeaveApplyStats must resolve from req.user.subdomain');
      assert.strictEqual(res.getStatusCode(), 200);
    });

  } finally {
    // Restore original methods
    Leave.create = origLeaveCreate;
    Leave.countDocuments = origLeaveCount;
    Worker.findById = origWorkerFindById;
    Settings.findOne = origSettingsFindOne;
  }

  console.log('\n================================================================');
  console.log(` Summary: ${passCount} passed, ${failCount} failed out of ${testCount} tests`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

// Attendance model stub for test 6
const Attendance = require('../models/Attendance');

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
