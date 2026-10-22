/**
 * Tech Ciphergate — Authentication & Protected Endpoints Regression Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEE:
 * - 100% Read-only operations.
 * - Zero database writes, modifications, seeds, or deletes.
 * - Does not expose tokens or credentials.
 */

require('dotenv').config();
const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

console.log('================================================================');
console.log(' Tech Ciphergate — Authentication & Protected Endpoints Tests  ');
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
  }
}

// -------------------------------------------------------------
// Suite 1: Middleware Auth Protection Tests (Isolated Unit Tests)
// -------------------------------------------------------------
const { protect, adminOnly, workerOnly } = require('../middleware/authMiddleware');

function runUnitMiddlewareTests() {
  runAsyncTest('protect: rejects request with no cookies and no headers with 401', async () => {
    const req = { cookies: {}, headers: {} };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; }
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseBody?.message, 'Not authorized, no token');
    assert.strictEqual(nextCalled, false);
  });

  runAsyncTest('protect: rejects request with cookie token="null" with 401', async () => {
    const req = { cookies: { token: 'null' }, headers: {} };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; }
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseBody?.message, 'Not authorized, no token');
    assert.strictEqual(nextCalled, false);
  });

  runAsyncTest('protect: rejects request with Authorization "Bearer null" with 401', async () => {
    const req = { cookies: {}, headers: { authorization: 'Bearer null' } };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; }
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseBody?.message, 'Not authorized, no token');
    assert.strictEqual(nextCalled, false);
  });

  runAsyncTest('protect: rejects request with Authorization "Bearer undefined" with 401', async () => {
    const req = { cookies: {}, headers: { authorization: 'Bearer undefined' } };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; }
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseBody?.message, 'Not authorized, no token');
    assert.strictEqual(nextCalled, false);
  });

  runAsyncTest('protect: rejects expired token with 401', async () => {
    const secret = process.env.JWT_SECRET || 'testsecret123456789012345678901234';
    const expiredToken = jwt.sign(
      { id: '507f1f77bcf86cd799439011', role: 'admin' },
      secret,
      { expiresIn: '-1s' }
    );

    const req = { cookies: {}, headers: { authorization: `Bearer ${expiredToken}` } };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; }
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseBody?.message, 'Not authorized, token failed');
    assert.strictEqual(nextCalled, false);
  });

  runAsyncTest('adminOnly: rejects non-admin user with 403 Access denied', async () => {
    const req = { user: { _id: '507f1f77bcf86cd799439011', role: 'worker' } };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; }
    };
    let nextCalled = false;
    adminOnly(req, res, () => { nextCalled = true; });

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(responseBody?.message, 'Access denied');
    assert.strictEqual(nextCalled, false);
  });

  runAsyncTest('adminOnly: allows admin user to proceed', async () => {
    const req = { user: { _id: '507f1f77bcf86cd799439011', role: 'admin' } };
    let nextCalled = false;
    adminOnly(req, {}, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
  });
}

// -------------------------------------------------------------
// Suite 2: Live HTTP Endpoint Authentication Tests (Safe Read-Only)
// -------------------------------------------------------------
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runLiveHttpTests() {
  // 1. Unauthenticated Requests (No credentials)
  await runAsyncTest('Live Server: GET /api/salary/bulk-report without credentials returns 401', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 5002,
      path: '/api/salary/bulk-report?subdomain=techvaseegrah&fromDate=2026-03-01&toDate=2026-03-31',
      method: 'GET'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.message, 'Not authorized, no token');
  });

  await runAsyncTest('Live Server: GET /api/leaves/techvaseegrah/0 without credentials returns 401', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 5002,
      path: '/api/leaves/techvaseegrah/0',
      method: 'GET'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.message, 'Not authorized, no token');
  });

  await runAsyncTest('Live Server: GET /api/comments/techvaseegrah without credentials returns 401', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 5002,
      path: '/api/comments/techvaseegrah',
      method: 'GET'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.message, 'Not authorized, no token');
  });

  // 2. Malformed / string literal 'null' Token
  await runAsyncTest('Live Server: GET /api/salary/bulk-report with "Bearer null" returns 401 (Not authorized, no token)', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 5002,
      path: '/api/salary/bulk-report?subdomain=techvaseegrah&fromDate=2026-03-01&toDate=2026-03-31',
      method: 'GET',
      headers: {
        Authorization: 'Bearer null'
      }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.message, 'Not authorized, no token');
  });

  // 3. Expired Token
  await runAsyncTest('Live Server: GET /api/salary/bulk-report with expired token returns 401 (token failed)', async () => {
    const secret = process.env.JWT_SECRET;
    const expiredToken = jwt.sign(
      { id: '507f1f77bcf86cd799439011', role: 'admin' },
      secret,
      { expiresIn: '-10s' }
    );
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 5002,
      path: '/api/salary/bulk-report?subdomain=techvaseegrah&fromDate=2026-03-01&toDate=2026-03-31',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${expiredToken}`
      }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.message, 'Not authorized, token failed');
  });

  // 4. Authenticated Admin Requests (Using actual admin ID from DB, READ-ONLY)
  await mongoose.connect(process.env.MONGO_URI);
  const Admin = require('../models/Admin');
  const admin = await Admin.findOne({ subdomain: 'techvaseegrah' }).select('_id subdomain');
  
  if (admin) {
    const adminToken = jwt.sign(
      { id: admin._id.toString(), role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // 4A: Valid Admin Token via Authorization Header
    await runAsyncTest('Live Server: GET /api/salary/bulk-report with valid Bearer token returns 200', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: 5002,
        path: '/api/salary/bulk-report?subdomain=techvaseegrah&fromDate=2026-03-01&toDate=2026-03-31',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body.reports) || Array.isArray(res.body), 'Expected reports array');
    });

    await runAsyncTest('Live Server: GET /api/leaves/techvaseegrah/0 with valid Bearer token returns 200', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: 5002,
        path: '/api/leaves/techvaseegrah/0',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body), 'Expected leaves array');
    });

    await runAsyncTest('Live Server: GET /api/comments/techvaseegrah with valid Bearer token returns 200', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: 5002,
        path: '/api/comments/techvaseegrah',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body), 'Expected comments array');
    });

    // 4B: Valid Admin Token via Cookie (Simulating browser with credentials)
    await runAsyncTest('Live Server: GET /api/salary/bulk-report with valid Cookie returns 200', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: 5002,
        path: '/api/salary/bulk-report?subdomain=techvaseegrah&fromDate=2026-03-01&toDate=2026-03-31',
        method: 'GET',
        headers: {
          Cookie: `token=${adminToken}`
        }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body.reports) || Array.isArray(res.body), 'Expected reports array');
    });

    await runAsyncTest('Live Server: GET /api/leaves/techvaseegrah/0 with valid Cookie returns 200', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: 5002,
        path: '/api/leaves/techvaseegrah/0',
        method: 'GET',
        headers: {
          Cookie: `token=${adminToken}`
        }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body), 'Expected leaves array');
    });

    await runAsyncTest('Live Server: GET /api/comments/techvaseegrah with valid Cookie returns 200', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: 5002,
        path: '/api/comments/techvaseegrah',
        method: 'GET',
        headers: {
          Cookie: `token=${adminToken}`
        }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body), 'Expected comments array');
    });
  }

  await mongoose.disconnect();
}

async function main() {
  runUnitMiddlewareTests();
  await runLiveHttpTests();

  console.log('\n================================================================');
  console.log(` Summary: ${passCount} passed, ${failCount} failed (Total: ${testCount})`);
  console.log('================================================================');
  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
