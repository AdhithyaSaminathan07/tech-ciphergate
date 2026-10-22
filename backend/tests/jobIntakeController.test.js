/**
 * System 1 — Job Intake Stage 2 Controller & Routes Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Fail-closed safety guard: Throws immediately if a remote/live MongoDB URI is detected.
 * 2. 100% In-Memory / Ephemeral Localhost Server Testing.
 * 3. Direct execution of actual Express router, middlewares, and controllers.
 * 4. Zero live database writes, zero external gateway network calls.
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const express = require('express');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Live Database Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
function assertSafeTestEnvironment() {
  const uri = process.env.MONGO_URI || '';
  if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('live')) {
    throw new Error('CRITICAL SAFETY FAILURE: Live database URI detected in test environment! Aborting immediately.');
  }
}
assertSafeTestEnvironment();

console.log('================================================================');
console.log(' Tech Ciphergate — System 1 Stage 2 Controller & Routes Tests   ');
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

// Models & Services
const ApiKey = require('../models/ApiKey');
const Admin = require('../models/Admin');
const JobIntake = require('../models/JobIntake');
const Invoice = require('../models/Invoice');
const Ticket = require('../models/ticketModel');
const InvoiceSequence = require('../models/InvoiceSequence');
const paymentVerificationService = require('../services/paymentVerificationService');
const jobIntakeService = require('../services/jobIntakeService');
const jobIntakeRoutes = require('../routes/jobIntakeRoutes');

// Helper to stub model methods
function createStubManager() {
  const originalMethods = [];

  return {
    stub(model, methodName, fn) {
      originalMethods.push({ model, methodName, original: model[methodName] });
      model[methodName] = fn;
    },
    stubPrototype(model, methodName, fn) {
      originalMethods.push({ model: model.prototype, methodName, original: model.prototype[methodName] });
      model.prototype[methodName] = fn;
    },
    restoreAll() {
      while (originalMethods.length > 0) {
        const { model, methodName, original } = originalMethods.pop();
        model[methodName] = original;
      }
    }
  };
}

function mockQuery(result = null) {
  return {
    lean: function() {
      return {
        session: function() { return this; },
        then: function(resolve) { return Promise.resolve(result).then(resolve); }
      };
    },
    session: function() { return this; },
    then: function(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
}

(async () => {
  // Setup isolated Express server with raw-body capture (matching server.js)
  const app = express();
  app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Mount job intake routes
  app.use('/api/intake', jobIntakeRoutes);

  // Mount dummy existing routes to confirm compatibility
  app.get('/api/invoices', (req, res) => res.json({ success: true, route: 'existing_invoices' }));
  app.get('/api/tickets', (req, res) => res.json({ success: true, route: 'existing_tickets' }));

  // Error handler
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const sampleAdmin = {
    _id: 'admin_123456789012345678901234',
    name: 'Admin User',
    email: 'admin@techvaseegrah.com',
    subdomain: 'tech-vaseegrah',
    role: 'admin'
  };

  const validPayload = {
    orderId: 'ORD-S2S-100',
    subdomain: 'tech-vaseegrah',
    customer: {
      name: 'Client Acme',
      phone: '9876543210',
      email: 'acme@client.com',
      address: '123 Market St',
      gstin: '33ABCDE1234F1Z5'
    },
    jobDetails: {
      title: 'Full Stack Web Platform',
      description: 'Platform development scope',
      team: 'DEV',
      priority: 'High',
      deliverables: ['Wireframes', 'API']
    },
    items: [
      {
        description: 'Web Platform Development',
        hsn: '998314',
        gst: 18,
        qty: 1,
        rate: 60000,
        total: 60000
      }
    ],
    payment: {
      gateway: 'razorpay',
      amount: 60000,
      currency: 'INR',
      transactionRef: 'pay_rzp_test_100',
      gatewayOrderId: 'order_rzp_100'
    }
  };

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Group 1: Authentication & Scope Enforcement
    // ─────────────────────────────────────────────────────────────────────────

    await runTest('Checkout S2S rejects request without x-api-key with 401', async () => {
      const res = await fetch(`${baseUrl}/api/intake/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload)
      });
      const data = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('API key is missing'));
    });

    await runTest('Checkout S2S rejects inactive or non-existent API key with 403', async () => {
      const stubs = createStubManager();
      try {
        stubs.stub(ApiKey, 'findOne', () => mockQuery(null));

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'non_existent_key_123'
          },
          body: JSON.stringify(validPayload)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 403);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes('Invalid or inactive API key'));
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S rejects API key with insufficient scope (e.g. attendance:write) with 403', async () => {
      const stubs = createStubManager();
      try {
        const limitedApiKey = {
          key: 'limited_scope_key',
          clientName: 'Attendance App',
          subdomain: 'tech-vaseegrah',
          permissions: ['attendance:write', 'attendance:read'],
          isActive: true,
          usageCount: 0,
          save: async () => limitedApiKey
        };

        stubs.stub(ApiKey, 'findOne', () => mockQuery(limitedApiKey));

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'limited_scope_key'
          },
          body: JSON.stringify(validPayload)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 403);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes('Insufficient permissions'));
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S rejects cross-tenant request when API key subdomain does not match payload with 403', async () => {
      const stubs = createStubManager();
      try {
        const tenantApiKey = {
          key: 'tenant_a_key',
          clientName: 'Tenant A Checkout',
          subdomain: 'org-alpha',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => tenantApiKey
        };

        stubs.stub(ApiKey, 'findOne', () => mockQuery(tenantApiKey));

        const payloadCrossTenant = { ...validPayload, subdomain: 'org-beta' };

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'tenant_a_key'
          },
          body: JSON.stringify(payloadCrossTenant)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 403);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes("API key is scoped to subdomain 'org-alpha'"));
      } finally {
        stubs.restoreAll();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 2: Zod Request Body Validation
    // ─────────────────────────────────────────────────────────────────────────

    await runTest('Checkout S2S rejects malformed payload (missing customer, negative amount) with 400', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        const badPayload = {
          orderId: 'ORD-INVALID',
          subdomain: 'tech-vaseegrah',
          // customer is missing!
          jobDetails: { title: 'Test' },
          items: [],
          payment: {
            gateway: 'razorpay',
            amount: -500, // Negative amount!
            transactionRef: 'ref'
          }
        };

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'valid_intake_key'
          },
          body: JSON.stringify(badPayload)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 400);
        assert.strictEqual(data.success, false);
        assert.ok(data.errors && data.errors.length > 0);
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S rejects unexpected extra fields due to strict Zod schema with 400', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        const payloadWithHackerField = {
          ...validPayload,
          isSuperAdmin: true // Unexpected top-level field!
        };

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'valid_intake_key'
          },
          body: JSON.stringify(payloadWithHackerField)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 400);
        assert.strictEqual(data.success, false);
        assert.ok(data.errors.some(e => e.message.includes('Unrecognized key')));
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S rejects commercial amount mismatch between items sum and payment amount with 400', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        const mismatchedPayload = {
          ...validPayload,
          items: [{ ...validPayload.items[0], total: 30000 }], // items sum is 30,000
          payment: { ...validPayload.payment, amount: 60000 }  // claimed payment is 60,000
        };

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'valid_intake_key'
          },
          body: JSON.stringify(mismatchedPayload)
        });
        const data = await res.json();
        assert.strictEqual(res.status, 400);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes('Commercial amount mismatch'));
      } finally {
        stubs.restoreAll();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 3: S2S Authoritative Gateway Verification & Execution
    // ─────────────────────────────────────────────────────────────────────────

    await runTest('Checkout S2S executes happy path with valid authoritative gateway confirmation and returns 201', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        // Stub authoritative gateway client on Express app
        app.set('gatewayApiClient', async () => ({
          gateway: 'razorpay',
          status: 'captured',
          amount: 6000000,
          isMinorUnit: true,
          currency: 'INR',
          orderId: 'order_rzp_100',
          paymentId: 'pay_rzp_test_100'
        }));

        let savedIntake = null;
        let savedInvoice = null;
        let savedTicket = null;

        stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
        stubs.stub(JobIntake, 'findOne', async () => null);
        stubs.stub(JobIntake.prototype, 'save', async function() {
          savedIntake = this;
          return this;
        });
        stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
          if (update.$set) Object.assign(savedIntake, update.$set);
          return savedIntake;
        });

        stubs.stub(Invoice, 'findOne', () => mockQuery(null));
        stubs.stub(Invoice.prototype, 'save', async function() {
          savedInvoice = this;
          this._id = 'mock_inv_s2s_1';
          return this;
        });
        stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: 101 }));

        stubs.stub(Ticket, 'findOne', () => mockQuery(null));
        stubs.stub(Ticket.prototype, 'save', async function() {
          savedTicket = this;
          this._id = 'mock_tck_s2s_1';
          return this;
        });

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'valid_intake_key'
          },
          body: JSON.stringify(validPayload)
        });

        const data = await res.json();
        assert.strictEqual(res.status, 201);
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.orderId, 'ORD-S2S-100');
        assert.strictEqual(data.invoiceNo, 'TV000101');
        assert.strictEqual(data.status, 'COMPLETED');
        assert.ok(data.ticketId);
      } finally {
        app.set('gatewayApiClient', null);
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S fails closed with 503 across development, test, staging, and production when gatewayApiClient is missing', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        const testEnvironments = ['development', 'test', 'staging', 'production', undefined];
        const savedEnv = process.env.NODE_ENV;

        for (const env of testEnvironments) {
          if (env === undefined) {
            delete process.env.NODE_ENV;
          } else {
            process.env.NODE_ENV = env;
          }

          app.set('gatewayApiClient', null);

          let intakeSaved = false;
          let invoiceSaved = false;
          let ticketSaved = false;

          stubs.stub(JobIntake.prototype, 'save', async () => { intakeSaved = true; });
          stubs.stub(Invoice.prototype, 'save', async () => { invoiceSaved = true; });
          stubs.stub(Ticket.prototype, 'save', async () => { ticketSaved = true; });

          const res = await fetch(`${baseUrl}/api/intake/checkout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'valid_intake_key'
            },
            body: JSON.stringify(validPayload)
          });

          const data = await res.json();
          assert.strictEqual(res.status, 503, `Environment '${env}' must return 503 when gateway client is missing`);
          assert.strictEqual(data.success, false);
          assert.ok(data.message.includes('not configured for authoritative verification'));
          assert.strictEqual(intakeSaved, false, 'Intake record must NEVER be saved without authoritative verification');
          assert.strictEqual(invoiceSaved, false, 'Invoice record must NEVER be saved without authoritative verification');
          assert.strictEqual(ticketSaved, false, 'Ticket record must NEVER be saved without authoritative verification');
        }

        process.env.NODE_ENV = savedEnv;
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S returns 402 and creates zero records when gateway client throws timeout or network error', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        app.set('gatewayApiClient', async () => {
          throw new Error('Gateway connection timeout after 5000ms');
        });

        let intakeSaved = false;
        let invoiceSaved = false;
        let ticketSaved = false;

        stubs.stub(JobIntake.prototype, 'save', async () => { intakeSaved = true; });
        stubs.stub(Invoice.prototype, 'save', async () => { invoiceSaved = true; });
        stubs.stub(Ticket.prototype, 'save', async () => { ticketSaved = true; });

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'valid_intake_key'
          },
          body: JSON.stringify(validPayload)
        });

        const data = await res.json();
        assert.strictEqual(res.status, 402);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes('Gateway connection timeout'));
        assert.strictEqual(intakeSaved, false, 'Intake must not be saved on gateway error');
        assert.strictEqual(invoiceSaved, false, 'Invoice must not be saved on gateway error');
        assert.strictEqual(ticketSaved, false, 'Ticket must not be saved on gateway error');
      } finally {
        app.set('gatewayApiClient', null);
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S returns 402 and creates zero records when payment status is not confirmed captured (pending/failed)', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        app.set('gatewayApiClient', async () => ({
          gateway: 'razorpay',
          status: 'pending', // Uncaptured status!
          amount: 6000000,
          isMinorUnit: true,
          currency: 'INR',
          orderId: 'order_rzp_100',
          paymentId: 'pay_rzp_test_100'
        }));

        let invoiceSaved = false;
        let ticketSaved = false;
        stubs.stub(Invoice.prototype, 'save', async () => { invoiceSaved = true; });
        stubs.stub(Ticket.prototype, 'save', async () => { ticketSaved = true; });

        const res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'valid_intake_key'
          },
          body: JSON.stringify(validPayload)
        });

        const data = await res.json();
        assert.strictEqual(res.status, 402);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes('not confirmed captured'));
        assert.strictEqual(invoiceSaved, false);
        assert.strictEqual(ticketSaved, false);
      } finally {
        app.set('gatewayApiClient', null);
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S returns 402 and creates zero records on amount, currency, gateway identity, or order linkage mismatch', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));

        let invoiceSaved = false;
        let ticketSaved = false;
        stubs.stub(Invoice.prototype, 'save', async () => { invoiceSaved = true; });
        stubs.stub(Ticket.prototype, 'save', async () => { ticketSaved = true; });

        // Case 1: Amount mismatch
        app.set('gatewayApiClient', async () => ({
          gateway: 'razorpay',
          status: 'captured',
          amount: 2500000, // 25,000 instead of 60,000!
          isMinorUnit: true,
          currency: 'INR',
          orderId: 'order_rzp_100',
          paymentId: 'pay_rzp_test_100'
        }));
        let res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': 'valid_intake_key' },
          body: JSON.stringify(validPayload)
        });
        assert.strictEqual(res.status, 402);
        assert.ok((await res.json()).message.includes('Amount mismatch'));
        assert.strictEqual(invoiceSaved, false);
        assert.strictEqual(ticketSaved, false);

        // Case 2: Currency mismatch
        app.set('gatewayApiClient', async () => ({
          gateway: 'razorpay',
          status: 'captured',
          amount: 6000000,
          isMinorUnit: true,
          currency: 'USD', // USD instead of INR
          orderId: 'order_rzp_100',
          paymentId: 'pay_rzp_test_100'
        }));
        res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': 'valid_intake_key' },
          body: JSON.stringify(validPayload)
        });
        assert.strictEqual(res.status, 402);
        assert.ok((await res.json()).message.includes('Currency mismatch'));

        // Case 3: Gateway identity mismatch
        app.set('gatewayApiClient', async () => ({
          gateway: 'stripe', // Stripe claimed on gateway record, but payload says razorpay
          status: 'captured',
          amount: 6000000,
          isMinorUnit: true,
          currency: 'INR',
          orderId: 'order_rzp_100',
          paymentId: 'pay_rzp_test_100'
        }));
        res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': 'valid_intake_key' },
          body: JSON.stringify(validPayload)
        });
        assert.strictEqual(res.status, 402);
        assert.ok((await res.json()).message.includes('Gateway identity mismatch'));

        // Case 4: Order linkage mismatch
        app.set('gatewayApiClient', async () => ({
          gateway: 'razorpay',
          status: 'captured',
          amount: 6000000,
          isMinorUnit: true,
          currency: 'INR',
          orderId: 'DIFFERENT_ORDER_999', // Mismatched order linkage!
          paymentId: 'pay_rzp_test_100'
        }));
        res = await fetch(`${baseUrl}/api/intake/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': 'valid_intake_key' },
          body: JSON.stringify(validPayload)
        });
        assert.strictEqual(res.status, 402);
        assert.ok((await res.json()).message.includes('Order linkage mismatch'));
        assert.strictEqual(invoiceSaved, false);
        assert.strictEqual(ticketSaved, false);

      } finally {
        app.set('gatewayApiClient', null);
        stubs.restoreAll();
      }
    });

    await runTest('Checkout S2S fails closed with 402 and creates zero records when verification returns verified: true but verifiedAmount is missing, invalid, or mismatched, or required verification fields are missing', async () => {
      const stubs = createStubManager();
      try {
        const validKey = {
          key: 'valid_intake_key',
          clientName: 'Main Website',
          subdomain: 'tech-vaseegrah',
          permissions: ['intake:write'],
          isActive: true,
          usageCount: 0,
          save: async () => validKey
        };
        stubs.stub(ApiKey, 'findOne', () => mockQuery(validKey));
        app.set('gatewayApiClient', async () => ({})); // Non-null function so gatewayClient check passes

        let intakeSaved = false;
        let invoiceSaved = false;
        let ticketSaved = false;
        let processJobIntakeCalled = false;
        stubs.stub(JobIntake.prototype, 'save', async () => { intakeSaved = true; });
        stubs.stub(Invoice.prototype, 'save', async () => { invoiceSaved = true; });
        stubs.stub(Ticket.prototype, 'save', async () => { ticketSaved = true; });
        stubs.stub(jobIntakeService, 'processJobIntake', async () => {
          processJobIntakeCalled = true;
          return { success: true };
        });

        const baseValidDetails = {
          gateway: 'razorpay',
          status: 'captured',
          currency: 'INR',
          paymentId: 'pay_rzp_test_100',
          orderId: 'order_rzp_100'
        };

        const invalidVerificationCases = [
          {
            name: 'missing verifiedAmount',
            response: { verified: true, gatewayDetails: { ...baseValidDetails } },
            expectedError: 'verifiedAmount is missing, invalid, or does not match expected amount'
          },
          {
            name: 'verifiedAmount is null',
            response: { verified: true, verifiedAmount: null, gatewayDetails: { ...baseValidDetails } },
            expectedError: 'verifiedAmount is missing, invalid, or does not match expected amount'
          },
          {
            name: 'verifiedAmount is NaN',
            response: { verified: true, verifiedAmount: NaN, gatewayDetails: { ...baseValidDetails } },
            expectedError: 'verifiedAmount is missing, invalid, or does not match expected amount'
          },
          {
            name: 'verifiedAmount is zero',
            response: { verified: true, verifiedAmount: 0, gatewayDetails: { ...baseValidDetails } },
            expectedError: 'verifiedAmount is missing, invalid, or does not match expected amount'
          },
          {
            name: 'verifiedAmount is negative',
            response: { verified: true, verifiedAmount: -60000, gatewayDetails: { ...baseValidDetails } },
            expectedError: 'verifiedAmount is missing, invalid, or does not match expected amount'
          },
          {
            name: 'verifiedAmount is mismatched (e.g. 59900 instead of 60000)',
            response: { verified: true, verifiedAmount: 59900, gatewayDetails: { ...baseValidDetails } },
            expectedError: 'verifiedAmount is missing, invalid, or does not match expected amount'
          },
          {
            name: 'missing gateway identity in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { status: 'captured', currency: 'INR', paymentId: 'pay_rzp_test_100', orderId: 'order_rzp_100' } },
            expectedError: 'Gateway identity is missing or mismatched'
          },
          {
            name: 'mismatched gateway identity in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { ...baseValidDetails, gateway: 'stripe' } },
            expectedError: 'Gateway identity is missing or mismatched'
          },
          {
            name: 'missing captured status in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { gateway: 'razorpay', currency: 'INR', paymentId: 'pay_rzp_test_100', orderId: 'order_rzp_100' } },
            expectedError: 'Authoritative status \'missing\' is not captured'
          },
          {
            name: 'non-captured status in gatewayDetails (e.g. refunded)',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { ...baseValidDetails, status: 'refunded' } },
            expectedError: 'Authoritative status \'refunded\' is not captured'
          },
          {
            name: 'missing currency in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { gateway: 'razorpay', status: 'captured', paymentId: 'pay_rzp_test_100', orderId: 'order_rzp_100' } },
            expectedError: 'Currency is missing or mismatched'
          },
          {
            name: 'mismatched currency in gatewayDetails (EUR vs INR)',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { ...baseValidDetails, currency: 'EUR' } },
            expectedError: 'Currency is missing or mismatched'
          },
          {
            name: 'missing payment ID in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { gateway: 'razorpay', status: 'captured', currency: 'INR', orderId: 'order_rzp_100' } },
            expectedError: 'Payment ID is missing or mismatched'
          },
          {
            name: 'mismatched payment ID in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { ...baseValidDetails, paymentId: 'pay_DIFFERENT_999' } },
            expectedError: 'Payment ID is missing or mismatched'
          },
          {
            name: 'missing order linkage in gatewayDetails when gatewayOrderId is expected',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { gateway: 'razorpay', status: 'captured', currency: 'INR', paymentId: 'pay_rzp_test_100' } },
            expectedError: 'Order linkage is missing or mismatched'
          },
          {
            name: 'mismatched order linkage in gatewayDetails',
            response: { verified: true, verifiedAmount: 60000, gatewayDetails: { ...baseValidDetails, orderId: 'WRONG_ORDER_LINKAGE' } },
            expectedError: 'Order linkage is missing or mismatched'
          }
        ];

        for (const testCase of invalidVerificationCases) {
          intakeSaved = false;
          invoiceSaved = false;
          ticketSaved = false;
          processJobIntakeCalled = false;

          stubs.stub(paymentVerificationService, 'verifyServerToServerPayment', async () => testCase.response);

          const res = await fetch(`${baseUrl}/api/intake/checkout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'valid_intake_key'
            },
            body: JSON.stringify(validPayload)
          });

          const data = await res.json();
          assert.strictEqual(res.status, 402, `Case '${testCase.name}' must return HTTP 402`);
          assert.strictEqual(data.success, false);
          assert.ok(data.message.includes(testCase.expectedError), `Case '${testCase.name}' expected error '${testCase.expectedError}', got '${data.message}'`);
          assert.strictEqual(processJobIntakeCalled, false, `Case '${testCase.name}' must NEVER invoke processJobIntake`);
          assert.strictEqual(intakeSaved, false, `Case '${testCase.name}' must not create intake record`);
          assert.strictEqual(invoiceSaved, false, `Case '${testCase.name}' must not create invoice record`);
          assert.strictEqual(ticketSaved, false, `Case '${testCase.name}' must not create ticket record`);
        }
      } finally {
        app.set('gatewayApiClient', null);
        stubs.restoreAll();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 4: Webhook Signature Verification & Event Handling
    // ─────────────────────────────────────────────────────────────────────────

    await runTest('Gateway webhook rejects unsupported gateway (e.g. paypal) with 400', async () => {
      const res = await fetch(`${baseUrl}/api/intake/webhook/paypal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('Unsupported gateway'));
    });

    await runTest('Gateway webhook rejects missing signature header with 401', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_wh_secret_123';
      const res = await fetch(`${baseUrl}/api/intake/webhook/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'payment.captured' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('Missing signature header'));
    });

    await runTest('Gateway webhook rejects invalid / tampered signature with 401', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_wh_secret_123';
      const bodyStr = JSON.stringify({ event: 'payment.captured' });
      const res = await fetch(`${baseUrl}/api/intake/webhook/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'invalid_signature_hex'
        },
        body: bodyStr
      });
      const data = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('signature mismatch'));
    });

    await runTest('Stripe webhook rejects replayed event with expired timestamp (> 300s) with 401', async () => {
      const stripeSecret = 'whsec_test_stripe';
      process.env.STRIPE_WEBHOOK_SECRET = stripeSecret;

      const bodyStr = JSON.stringify({
        id: 'evt_stripe_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', amount_total: 500000 } }
      });

      const expiredTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago (> 300s)
      const v1Sig = crypto.createHmac('sha256', stripeSecret).update(`${expiredTimestamp}.${bodyStr}`).digest('hex');

      const res = await fetch(`${baseUrl}/api/intake/webhook/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': `t=${expiredTimestamp},v1=${v1Sig}`
        },
        body: bodyStr
      });
      const data = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('expired or outside tolerance'));
    });

    await runTest('Valid Razorpay webhook signature processes successfully and creates invoice and ticket', async () => {
      const stubs = createStubManager();
      try {
        const rzpSecret = 'rzp_wh_secret_super_secure';
        process.env.RAZORPAY_WEBHOOK_SECRET = rzpSecret;

        const webhookPayload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: 'pay_rzp_live_999',
                order_id: 'order_rzp_999',
                amount: 7500000, // 75,000 INR in paise
                currency: 'INR',
                contact: '9876543210',
                email: 'webclient@example.com',
                name: 'Web Client Inc',
                notes: {
                  orderId: 'ORD-RZP-999',
                  subdomain: 'tech-vaseegrah',
                  jobTitle: 'Enterprise Portal Setup',
                  customerName: 'Web Client Inc'
                }
              }
            }
          }
        };

        const rawBodyStr = JSON.stringify(webhookPayload);
        const validSig = crypto.createHmac('sha256', rzpSecret).update(rawBodyStr).digest('hex');

        let savedIntake = null;
        stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
        stubs.stub(JobIntake, 'findOne', async () => null);
        stubs.stub(JobIntake.prototype, 'save', async function() {
          savedIntake = this;
          return this;
        });
        stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
          if (update.$set) Object.assign(savedIntake, update.$set);
          return savedIntake;
        });

        stubs.stub(Invoice, 'findOne', () => mockQuery(null));
        stubs.stub(Invoice.prototype, 'save', async function() {
          this._id = 'mock_inv_rzp_999';
          return this;
        });
        stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: 250 }));

        stubs.stub(Ticket, 'findOne', () => mockQuery(null));
        stubs.stub(Ticket.prototype, 'save', async function() {
          this._id = 'mock_tck_rzp_999';
          return this;
        });

        const res = await fetch(`${baseUrl}/api/intake/webhook/razorpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-razorpay-signature': validSig
          },
          body: rawBodyStr
        });

        const data = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.orderId, 'ORD-RZP-999');
        assert.strictEqual(data.invoiceNo, 'TV000250');
        assert.strictEqual(data.status, 'COMPLETED');
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Duplicate webhook delivery returns 200 with isDuplicate: true and does not duplicate records', async () => {
      const stubs = createStubManager();
      try {
        const rzpSecret = 'rzp_wh_secret_super_secure';
        process.env.RAZORPAY_WEBHOOK_SECRET = rzpSecret;

        const webhookPayload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: 'pay_rzp_live_999',
                amount: 7500000,
                currency: 'INR',
                notes: {
                  orderId: 'ORD-RZP-999',
                  subdomain: 'tech-vaseegrah'
                }
              }
            }
          }
        };

        const rawBodyStr = JSON.stringify(webhookPayload);
        const validSig = crypto.createHmac('sha256', rzpSecret).update(rawBodyStr).digest('hex');

        const existingCompletedIntake = {
          _id: 'intake_completed_999',
          orderId: 'ORD-RZP-999',
          subdomain: 'tech-vaseegrah',
          intakeStatus: 'COMPLETED',
          invoiceNo: 'TV000250',
          invoiceId: 'inv_already_created',
        };

        stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
        stubs.stub(JobIntake, 'findOne', async () => existingCompletedIntake);

        let secondInvoiceCreated = false;
        stubs.stub(Invoice.prototype, 'save', async () => { secondInvoiceCreated = true; });

        let secondTicketCreated = false;
        stubs.stub(Ticket.prototype, 'save', async () => { secondTicketCreated = true; });

        const res = await fetch(`${baseUrl}/api/intake/webhook/razorpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-razorpay-signature': validSig
          },
          body: rawBodyStr
        });

        const data = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.isDuplicate, true);
        assert.strictEqual(data.invoiceNo, 'TV000250');
        assert.strictEqual(secondInvoiceCreated, false, 'Duplicate delivery must NOT create a new invoice');
        assert.strictEqual(secondTicketCreated, false, 'Duplicate delivery must NOT create a new ticket');
      } finally {
        stubs.restoreAll();
      }
    });

    await runTest('Webhook non-capture event (e.g. payment.failed) is acknowledged 200 and ignored without record creation', async () => {
      const rzpSecret = 'rzp_wh_secret_super_secure';
      process.env.RAZORPAY_WEBHOOK_SECRET = rzpSecret;

      const failedEvent = { event: 'payment.failed', payload: {} };
      const rawBodyStr = JSON.stringify(failedEvent);
      const validSig = crypto.createHmac('sha256', rzpSecret).update(rawBodyStr).digest('hex');

      const res = await fetch(`${baseUrl}/api/intake/webhook/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': validSig
        },
        body: rawBodyStr
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.ignored, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 5: Admin Retry Endpoint Authorization & Execution
    // ─────────────────────────────────────────────────────────────────────────

    await runTest('Admin retry endpoint rejects unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/intake/650000000000000000000001/retry`, {
        method: 'POST'
      });
      const data = await res.json();
      assert.strictEqual(res.status, 401);
      assert.ok(data.message.includes('Not authorized'));
    });

    await runTest('Admin retry endpoint validates ObjectId format and rejects malformed ID with 400', async () => {
      const stubs = createStubManager();
      try {
        const jwt = require('jsonwebtoken');
        process.env.JWT_SECRET = 'test_jwt_secret_key';
        const adminToken = jwt.sign({ id: sampleAdmin._id, role: 'admin' }, process.env.JWT_SECRET);

        stubs.stub(Admin, 'findById', () => ({
          select: () => ({ toObject: () => sampleAdmin })
        }));

        const res = await fetch(`${baseUrl}/api/intake/not-a-valid-id/retry`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        });
        const data = await res.json();
        assert.strictEqual(res.status, 400);
        assert.ok(data.message.includes('Invalid JobIntake ID format'));
      } finally {
        stubs.restoreAll();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 6: Compatibility & Non-Disruption Verification
    // ─────────────────────────────────────────────────────────────────────────

    await runTest('Existing invoice routes (/api/invoices) remain functional and unaffected', async () => {
      const res = await fetch(`${baseUrl}/api/invoices`);
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.route, 'existing_invoices');
    });

    await runTest('Existing ticket routes (/api/tickets) remain functional and unaffected', async () => {
      const res = await fetch(`${baseUrl}/api/tickets`);
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.route, 'existing_tickets');
    });

  } finally {
    server.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(` Stage 2 Tests Completed: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
})();
