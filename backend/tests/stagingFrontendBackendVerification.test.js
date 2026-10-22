/**
 * System 1 — Isolated Staging Frontend-to-Backend Verification Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Dedicated loopback staging database ONLY (mongodb://127.0.0.1:27017/tech_ciphergate_staging_env).
 * 2. Fail-closed safety: Aborts immediately if ANY remote or cluster URI is detected.
 * 3. Never touches production data or the remote Atlas cluster.
 * 4. Synthetic test data only.
 * 5. Full teardown and cleanup: Drops the staging test database upon completion.
 * 6. Zero real WhatsApp messages, zero real payment gateway calls.
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Staging Environment Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
const stagingEnvPath = path.resolve(__dirname, '../.env.staging');
dotenv.config({ path: stagingEnvPath });

const STAGING_MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tech_ciphergate_staging_env';
const STAGING_JWT_SECRET = process.env.JWT_SECRET || 'staging_jwt_secret_isolated_key_0987654321_alpha_beta';

function assertIsolatedStagingDatabase(uri) {
  if (!uri) {
    throw new Error('CRITICAL SAFETY ABORT: MONGO_URI is missing from staging configuration!');
  }
  const isLoopback = uri.startsWith('mongodb://127.0.0.1:27017/') || uri.startsWith('mongodb://localhost:27017/');
  if (!isLoopback) {
    throw new Error(`CRITICAL SAFETY ABORT: Staging database MUST connect exclusively to local loopback (127.0.0.1:27017). Received: ${uri}`);
  }
  const forbiddenKeywords = ['mongodb.net', 'cluster', 'atlas', 'production', 'live', 'prod'];
  for (const kw of forbiddenKeywords) {
    if (uri.toLowerCase().includes(kw)) {
      throw new Error(`CRITICAL SAFETY ABORT: Forbidden keyword '${kw}' detected in staging URI: ${uri}`);
    }
  }
}

assertIsolatedStagingDatabase(STAGING_MONGO_URI);

console.log('================================================================');
console.log(' Tech Ciphergate — System 1 Staging Verification Suite          ');
console.log(` Target DB: ${STAGING_MONGO_URI}`);
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
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`    Stack: ${relevantStack}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Models & Routes
// ─────────────────────────────────────────────────────────────────────────────
const Admin = require('../models/Admin');
const JobIntake = require('../models/JobIntake');
const Invoice = require('../models/Invoice');
const Ticket = require('../models/ticketModel');
const InvoiceSequence = require('../models/InvoiceSequence');
const ApiKey = require('../models/ApiKey');
const jobIntakeRoutes = require('../routes/jobIntakeRoutes');

// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP Client Helper with Cookie Jar
// ─────────────────────────────────────────────────────────────────────────────
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────
async function executeStagingVerification() {
  let server = null;
  let stagingAdmin = null;
  let stagingApiKey = 'test_staging_api_key_valid_64_characters_long_for_intake_write_ok';
  let authCookie = null;

  try {
    // 1. Connect to isolated staging database
    await mongoose.connect(STAGING_MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      family: 4
    });

    // Clean any prior state in staging database
    await mongoose.connection.dropDatabase();

    // 2. Seed Staging Admin
    const hashedPassword = await bcrypt.hash('StagingPass123!', 10);
    stagingAdmin = await Admin.create({
      username: 'staging_admin',
      subdomain: 'tech-vaseegrah',
      email: 'admin@staging.com',
      password: hashedPassword,
      role: 'admin'
    });

    // 3. Seed Staging API Key
    await ApiKey.create({
      key: stagingApiKey,
      clientName: 'Staging Integration Client',
      subdomain: 'tech-vaseegrah',
      permissions: ['intake:write'],
      isActive: true
    });

    // 4. Create session token
    const token = jwt.sign(
      { id: stagingAdmin._id, role: 'admin', subdomain: 'tech-vaseegrah' },
      STAGING_JWT_SECRET,
      { expiresIn: '1d' }
    );
    authCookie = `token=${token}`;

    // 5. Mount Staging Express App
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Basic auth route for testing login pathway
    app.post('/api/auth/login', async (req, res) => {
      const { email, password } = req.body;
      const admin = await Admin.findOne({ email }).select('+password');
      if (!admin || !(await bcrypt.compare(password, admin.password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      res.cookie('token', token, { httpOnly: true });
      return res.status(200).json({
        success: true,
        user: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, subdomain: admin.subdomain }
      });
    });

    app.use('/api/intake', jobIntakeRoutes);

    // Global error handler
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Server error'
      });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    console.log(`Staging test server active on http://127.0.0.1:${port}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Fail-Closed Isolation Guard
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Staging Safety Guard rejects remote Atlas / cluster URIs', async () => {
      assert.throws(() => {
        assertIsolatedStagingDatabase('mongodb+srv://user:pass@cluster0.lmh25dh.mongodb.net/test');
      }, /CRITICAL SAFETY ABORT/);

      assert.throws(() => {
        assertIsolatedStagingDatabase('mongodb://192.168.1.100:27017/prod_db');
      }, /CRITICAL SAFETY ABORT/);

      // Confirms only local loopback passes
      assert.doesNotThrow(() => {
        assertIsolatedStagingDatabase('mongodb://127.0.0.1:27017/tech_ciphergate_staging_env');
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Frontend Authentication via Session Cookie
    // ─────────────────────────────────────────────────────────────────────────
    let retrievedSessionCookie = null;
    await runTest('Frontend can authenticate against staging backend and obtain session cookie', async () => {
      const loginRes = await makeRequest(server, {
        path: '/api/auth/login',
        method: 'POST'
      }, {
        email: 'admin@staging.com',
        password: 'StagingPass123!'
      });

      assert.strictEqual(loginRes.statusCode, 200);
      assert.strictEqual(loginRes.data.success, true);
      assert.strictEqual(loginRes.data.user.subdomain, 'tech-vaseegrah');

      const setCookie = loginRes.headers['set-cookie'];
      assert.ok(setCookie, 'Expected Set-Cookie header in login response');
      retrievedSessionCookie = setCookie[0].split(';')[0];
      assert.ok(retrievedSessionCookie.startsWith('token='), 'Expected token cookie');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Synthetic Order Intake Submission (HTTP 201 Created)
    // ─────────────────────────────────────────────────────────────────────────
    const syntheticOrderId = `ORD-STG-${Date.now()}`;
    const syntheticOrderPayload = {
      orderId: syntheticOrderId,
      subdomain: 'tech-vaseegrah',
      customer: {
        name: 'Staging Enterprise Client',
        phone: '+919876543210',
        email: 'billing@stagingclient.org',
        address: '404 Innovation Way, Tech Park',
        gstin: '33AABCT9999D1Z0'
      },
      jobDetails: {
        title: 'Cloud Infrastructure Audit & Performance Optimization',
        description: 'Synthetic test job for staging verification.',
        serviceCategory: 'Cloud',
        team: 'DEV',
        priority: 'High',
        deliverables: ['Performance Report', 'Architecture Review']
      },
      items: [
        {
          description: 'Cloud Infrastructure Audit',
          hsn: '998314',
          gst: 18,
          qty: 1,
          rate: 45000,
          total: 45000
        },
        {
          description: 'Performance Optimization Deliverable',
          hsn: '998314',
          gst: 18,
          qty: 1,
          rate: 15000,
          total: 15000
        }
      ],
      payment: {
        gateway: 'manual',
        amount: 60000,
        currency: 'INR',
        transactionRef: syntheticOrderId,
        paymentStatus: 'PENDING',
        manualVerification: true
      }
    };

    let createdInvoiceNo = null;
    let createdInvoiceId = null;
    let createdTicketId = null;

    await runTest('Frontend calls POST /api/intake/orders with session cookie -> 201 Created', async () => {
      const res = await makeRequest(server, {
        path: '/api/intake/orders',
        method: 'POST',
        headers: {
          'Cookie': retrievedSessionCookie || authCookie
        }
      }, syntheticOrderPayload);

      assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${JSON.stringify(res.data)}`);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.orderId, syntheticOrderId);
      assert.ok(res.data.invoiceNo, 'Expected invoiceNo in response');
      assert.ok(res.data.invoiceId, 'Expected invoiceId in response');
      assert.ok(res.data.ticketId, 'Expected ticketId in response');
      assert.strictEqual(res.data.status, 'COMPLETED');

      createdInvoiceNo = res.data.invoiceNo;
      createdInvoiceId = res.data.invoiceId;
      createdTicketId = res.data.ticketId;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Duplicate Submission (HTTP 200 OK with isDuplicate: true)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Resubmission with identical orderId returns HTTP 200 with isDuplicate: true without duplicate records', async () => {
      const res = await makeRequest(server, {
        path: '/api/intake/orders',
        method: 'POST',
        headers: {
          'Cookie': retrievedSessionCookie || authCookie
        }
      }, syntheticOrderPayload);

      assert.strictEqual(res.statusCode, 200, `Expected 200 for duplicate, got ${res.statusCode}`);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.isDuplicate, true);
      assert.strictEqual(res.data.orderId, syntheticOrderId);
      assert.strictEqual(res.data.invoiceNo, createdInvoiceNo);
      assert.strictEqual(res.data.ticketId, createdTicketId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Validation Failure (HTTP 400 Bad Request)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Validation failure: Missing items and invalid phone rejected with 400 and zero persistence', async () => {
      const invalidPayload = {
        orderId: 'ORD-INVALID-99',
        subdomain: 'tech-vaseegrah',
        customer: {
          name: 'X', // Too short (< 2)
          phone: '123' // Invalid phone (< 10)
        },
        jobDetails: {
          title: 'AB' // Too short (< 3)
        },
        items: [] // Empty items (< 1)
      };

      const res = await makeRequest(server, {
        path: '/api/intake/orders',
        method: 'POST',
        headers: {
          'Cookie': retrievedSessionCookie || authCookie
        }
      }, invalidPayload);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.success, false);
      assert.ok(Array.isArray(res.data.errors), 'Expected structured errors array');

      // Assert zero database records created for invalid order
      const failedIntake = await JobIntake.findOne({ orderId: 'ORD-INVALID-99' });
      assert.strictEqual(failedIntake, null);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Database Persistence Invariant Verification
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Confirm persisted records: Invoice is PROFORMA, unpaid, ticket is unassigned To Do', async () => {
      // 1. Verify JobIntake
      const intake = await JobIntake.findOne({ orderId: syntheticOrderId });
      assert.ok(intake, 'JobIntake record must exist in staging DB');
      assert.strictEqual(intake.intakeStatus, 'COMPLETED');
      assert.strictEqual(intake.payment.gateway, 'manual');
      assert.strictEqual(intake.payment.paymentStatus, 'PENDING');
      assert.strictEqual(intake.invoiceNo, createdInvoiceNo);
      assert.strictEqual(String(intake.ticketId), String(createdTicketId));

      // 2. Verify Invoice
      const invoice = await Invoice.findById(createdInvoiceId);
      assert.ok(invoice, 'Invoice record must exist in staging DB');
      assert.strictEqual(invoice.invoiceNo, createdInvoiceNo);
      assert.strictEqual(invoice.invoiceType, 'PROFORMA INVOICE', 'Must be PROFORMA INVOICE');
      assert.strictEqual(invoice.status, 'Invoice', 'Status must remain "Invoice"');
      assert.strictEqual(invoice.isPaid, false, 'Must NOT be marked paid');
      assert.strictEqual(invoice.source, 'intake');
      assert.strictEqual(invoice.externalOrderId, syntheticOrderId);
      const hasProof = !!(invoice.paymentDetails && ((invoice.paymentDetails.proofs && invoice.paymentDetails.proofs.length > 0) || invoice.paymentDetails.proof));
      assert.strictEqual(hasProof, false, 'Must not have automated payment proof');

      // 3. Verify Ticket
      const ticket = await Ticket.findById(createdTicketId);
      assert.ok(ticket, 'Ticket record must exist in staging DB');
      assert.strictEqual(ticket.status, 'To Do', 'Ticket status must be "To Do"');
      assert.strictEqual(ticket.assignedTo, undefined, 'Ticket must be unassigned');
      assert.ok(ticket.labels.includes(`order:${syntheticOrderId}`), 'Must have order label');
      assert.ok(ticket.labels.includes('online-intake'), 'Must have online-intake label');
      assert.strictEqual(ticket.checklist.length, 2, 'Deliverables mapped to checklist');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: Alternative Authentication Pathway via API Key
    // ─────────────────────────────────────────────────────────────────────────
    const apiKeyOrderId = `ORD-KEY-${Date.now()}`;
    await runTest('Alternative API key authentication (x-api-key) succeeds with 201 Created', async () => {
      const apiKeyPayload = {
        ...syntheticOrderPayload,
        orderId: apiKeyOrderId,
        payment: {
          ...syntheticOrderPayload.payment,
          transactionRef: apiKeyOrderId
        }
      };

      const res = await makeRequest(server, {
        path: '/api/intake/orders',
        method: 'POST',
        headers: {
          'x-api-key': stagingApiKey
        }
      }, apiKeyPayload);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.orderId, apiKeyOrderId);

      // Confirm persisted invoice sequence increment
      const count = await Invoice.countDocuments({ externalOrderId: { $in: [syntheticOrderId, apiKeyOrderId] } });
      assert.strictEqual(count, 2, 'Both accepted orders persisted cleanly');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8: Staging Database Teardown & Cleanup
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Staging database teardown and cleanup: Drops staging database completely', async () => {
      await mongoose.connection.dropDatabase();
      const collections = await mongoose.connection.db.listCollections().toArray();
      assert.strictEqual(collections.length, 0, 'Staging database must have 0 collections after drop');
    });

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  console.log('\n================================================================');
  console.log(` Staging Verification: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

executeStagingVerification().catch(err => {
  console.error('Fatal staging verification failure:', err);
  process.exit(1);
});
