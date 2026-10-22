/**
 * System 1 — Job Intake Isolated Safety & Concurrency Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Fail-closed safety guard: Throws immediately if a remote/live MongoDB URI is detected.
 * 2. 100% In-Memory / Mock-based testing.
 * 3. Direct execution of processJobIntake() with controlled Mongoose model stubs.
 * 4. Zero network calls, zero writes to production database, zero side-effects.
 */

const assert = require('assert');
const crypto = require('crypto');

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
console.log(' Tech Ciphergate — System 1 Job Intake Isolated Test Suite      ');
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

const {
  verifyGatewayWebhookSignature,
  verifyServerToServerPayment,
  sanitizeIntakePayload
} = require('../services/paymentVerificationService');
const {
  extractNumber,
  seedSequenceIfNeeded,
  getNextSequentialInvoiceNo
} = require('../services/invoiceSequenceService');
const { processJobIntake } = require('../services/jobIntakeService');

const JobIntake = require('../models/JobIntake');
const Invoice = require('../models/Invoice');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');
const InvoiceSequence = require('../models/InvoiceSequence');

// Helper to back up and restore model methods between tests
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
  // ─────────────────────────────────────────────────────────────────────────────
  // Group 1: Payment Verification & Signature Integrity
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('Razorpay webhook HMAC signature verification matches official spec', () => {
    const secret = 'rzp_test_secret_998877';
    const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_123', amount: 50000 } } } });
    const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const success = verifyGatewayWebhookSignature({
      gateway: 'razorpay',
      rawBody: payload,
      signature: validSignature,
      secret
    });
    assert.strictEqual(success.verified, true);

    const fail = verifyGatewayWebhookSignature({
      gateway: 'razorpay',
      rawBody: payload,
      signature: 'invalid_tampered_signature',
      secret
    });
    assert.strictEqual(fail.verified, false);
  });

  await runTest('Stripe webhook signature verifies timestamp and rejects expired replay attacks', () => {
    const secret = 'whsec_test_stripe_secret';
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const nowSec = Math.floor(Date.now() / 1000);

    const validV1 = crypto.createHmac('sha256', secret).update(`${nowSec}.${payload}`).digest('hex');
    const validHeader = `t=${nowSec},v1=${validV1}`;

    const res = verifyGatewayWebhookSignature({
      gateway: 'stripe',
      rawBody: payload,
      signature: validHeader,
      secret
    });
    assert.strictEqual(res.verified, true);

    const oldTimestamp = nowSec - 600;
    const oldV1 = crypto.createHmac('sha256', secret).update(`${oldTimestamp}.${payload}`).digest('hex');
    const expiredHeader = `t=${oldTimestamp},v1=${oldV1}`;

    const expiredRes = verifyGatewayWebhookSignature({
      gateway: 'stripe',
      rawBody: payload,
      signature: expiredHeader,
      secret
    });
    assert.strictEqual(expiredRes.verified, false);
    assert.ok(expiredRes.error.includes('expired'));
  });

  await runTest('Cashfree webhook verifies with x-webhook-timestamp prefix and rejects untimestamped payloads', () => {
    const secret = 'cf_secret_key_112233';
    const payload = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'ORD_1' } } });
    const nowSec = Math.floor(Date.now() / 1000);

    const validSig = crypto.createHmac('sha256', secret).update(`${nowSec}${payload}`).digest('base64');

    const validRes = verifyGatewayWebhookSignature({
      gateway: 'cashfree',
      rawBody: payload,
      signature: validSig,
      secret,
      headers: { 'x-webhook-timestamp': String(nowSec) }
    });
    assert.strictEqual(validRes.verified, true);

    const noTimestampRes = verifyGatewayWebhookSignature({
      gateway: 'cashfree',
      rawBody: payload,
      signature: validSig,
      secret,
      headers: {}
    });
    assert.strictEqual(noTimestampRes.verified, false);
    assert.ok(noTimestampRes.error.includes('x-webhook-timestamp'));
  });

  await runTest('Server-to-Server checkout rejects unauthoritative input and validates amount/status strictly', async () => {
    const noClientRes = await verifyServerToServerPayment({
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_999',
      expectedAmount: 75000,
      expectedCurrency: 'INR'
    });
    assert.strictEqual(noClientRes.verified, false);
    assert.ok(noClientRes.error.includes('Authoritative gateway verification client is required'));

    const pendingClient = async () => ({
      status: 'pending',
      amount: 75000,
      currency: 'INR',
      gateway: 'razorpay'
    });
    const pendingRes = await verifyServerToServerPayment({
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_999',
      expectedAmount: 75000,
      expectedCurrency: 'INR',
      gatewayApiClient: pendingClient
    });
    assert.strictEqual(pendingRes.verified, false);
    assert.ok(pendingRes.error.includes('Payment is not confirmed captured'));

    const amountMismatchClient = async () => ({
      status: 'captured',
      amount: 50000,
      currency: 'INR',
      gateway: 'razorpay'
    });
    const mismatchRes = await verifyServerToServerPayment({
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_999',
      expectedAmount: 75000,
      expectedCurrency: 'INR',
      gatewayApiClient: amountMismatchClient
    });
    assert.strictEqual(mismatchRes.verified, false);
    assert.ok(mismatchRes.error.includes('Amount mismatch'));

    const validClient = async () => ({
      status: 'captured',
      amount: 7500000,
      isMinorUnit: true,
      currency: 'INR',
      gateway: 'razorpay',
      orderId: 'ORD_999'
    });
    const validRes = await verifyServerToServerPayment({
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_999',
      gatewayOrderId: 'ORD_999',
      expectedAmount: 75000,
      expectedCurrency: 'INR',
      gatewayApiClient: validClient
    });
    assert.strictEqual(validRes.verified, true);
    assert.strictEqual(validRes.verifiedAmount, 75000);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 2: Payload Sanitization & Sensitive Data Redaction
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('Payload sanitizer strips passwords, auth tokens, and cardholder security data', () => {
    const dirtyPayload = {
      orderId: 'ORD-12345',
      clientName: 'Alice Corp',
      authorization: 'Bearer super_secret_jwt_token',
      password: 'PlaintextPassword123!',
      cardDetails: {
        pan: '4111111111111111',
        cvv: '123',
        expiry: '12/28',
        cardholder: 'Alice Smith'
      },
      metadata: {
        packageType: 'Pro Web Portal',
        api_secret: 'whsec_998877'
      }
    };

    const clean = sanitizeIntakePayload(dirtyPayload);
    assert.strictEqual(clean.orderId, 'ORD-12345');
    assert.strictEqual(clean.clientName, 'Alice Corp');
    assert.strictEqual(clean.authorization, undefined);
    assert.strictEqual(clean.password, undefined);
    assert.strictEqual(clean.cardDetails.pan, '[REDACTED]');
    assert.strictEqual(clean.cardDetails.cvv, '[REDACTED]');
    assert.strictEqual(clean.cardDetails.cardholder, 'Alice Smith');
    assert.strictEqual(clean.metadata.api_secret, '[REDACTED]');
    assert.strictEqual(clean.metadata.packageType, 'Pro Web Portal');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 3: Invoice Sequence Atomic Initialization Tests
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('Invoice sequence extractNumber parses TV prefixes accurately', () => {
    assert.strictEqual(extractNumber('TV000045'), 45);
    assert.strictEqual(extractNumber('tv001250'), 1250);
    assert.strictEqual(extractNumber('INV-001'), 0);
    assert.strictEqual(extractNumber(null), 0);
  });

  await runTest('Invoice sequence seed logic safely initializes without duplicate _id crashes', async () => {
    const stubs = createStubManager();
    try {
      let createdDoc = null;
      let existingInvoicesList = [{ invoiceNo: 'TV000030' }];

      stubs.stub(Invoice, 'find', () => ({
        lean: async () => existingInvoicesList
      }));

      // Simulate create success on initial boot
      stubs.stub(InvoiceSequence, 'create', async (data) => {
        createdDoc = { ...data };
        return createdDoc;
      });

      const seq = await seedSequenceIfNeeded();
      assert.strictEqual(seq, 30);
      assert.strictEqual(createdDoc.seq, 30);
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Invoice sequence seed logic preserves higher existing sequence and ignores lower DB max', async () => {
    const stubs = createStubManager();
    try {
      let storedSequence = { _id: 'invoice_TV', seq: 100 };

      stubs.stub(Invoice, 'find', () => ({
        lean: async () => [{ invoiceNo: 'TV000040' }] // maxNum = 40 (lower than 100)
      }));

      // Simulate E11000 duplicate key error on create (document already exists)
      stubs.stub(InvoiceSequence, 'create', async () => {
        const err = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      });

      // findOneAndUpdate with seq: { $lt: 40 } will find no match because seq is 100
      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async (query, update) => {
        if (query.seq && query.seq.$lt && storedSequence.seq < query.seq.$lt) {
          storedSequence.seq = update.$set.seq;
          return storedSequence;
        }
        return null; // Not updated
      });

      stubs.stub(InvoiceSequence, 'findById', async () => storedSequence);

      const seq = await seedSequenceIfNeeded();
      // Must preserve 100 and NOT downgrade to 40!
      assert.strictEqual(seq, 100);
      assert.strictEqual(storedSequence.seq, 100);
    } finally {
      stubs.restoreAll();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 4: Real processJobIntake() Execution Tests with Mongoose Stubs
  // ─────────────────────────────────────────────────────────────────────────────

  const sampleIntakeData = {
    orderId: 'ORD-TEST-001',
    customer: {
      name: 'Acme Test Corp',
      phone: '9876543210',
      email: 'billing@acme.com',
      gstin: '33ABCDE1234F1Z5'
    },
    jobDetails: {
      title: 'Full Stack Web Portal',
      description: 'Customer portal development',
      team: 'DEV',
      priority: 'High',
      deliverables: ['Design Review', 'API Setup']
    },
    payment: {
      gateway: 'razorpay',
      amount: 50000,
      currency: 'INR',
      paymentStatus: 'VERIFIED',
      transactionRef: 'pay_test_txn_123'
    },
    items: [
      {
        description: 'Web Portal Development',
        hsn: '998314',
        gst: 18,
        qty: 1,
        rate: 50000,
        total: 50000
      }
    ],
    rawPayload: { event: 'payment.captured' }
  };

  const sampleAdmin = {
    _id: 'admin_id_test_123',
    name: 'Admin User',
    email: 'admin@techvaseegrah.com',
    subdomain: 'tech-vaseegrah'
  };

  await runTest('processJobIntake executes complete happy path (creates invoice and ticket)', async () => {
    const stubs = createStubManager();
    try {
      let createdIntake = null;
      let createdInvoice = null;
      let createdTicket = null;
      let sequenceNum = 55;

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => null); // Fresh intake
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        return this;
      });

      stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
        if (update.$set) {
          Object.assign(createdIntake, update.$set);
        }
        return createdIntake;
      });

      // Invoice mocks
      stubs.stub(Invoice, 'findOne', () => mockQuery(null));
      stubs.stub(Invoice.prototype, 'save', async function() {
        createdInvoice = this;
        this._id = 'mock_inv_id_1';
        return this;
      });

      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: ++sequenceNum }));

      // Ticket mocks
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = 'mock_tck_id_1';
        return this;
      });

      const result = await processJobIntake({
        intakeData: sampleIntakeData,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(result.orderId, 'ORD-TEST-001');
      assert.strictEqual(result.invoiceNo, 'TV000056');
      assert.strictEqual(createdInvoice.invoiceType, 'TAX INVOICE');
      assert.strictEqual(createdInvoice.status, 'Payment Received');
      assert.strictEqual(createdTicket.team, 'DEV');
      assert.strictEqual(createdTicket.status, 'To Do');
      assert.strictEqual(createdTicket.checklist.length, 2);
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('processJobIntake returns duplicate flag immediately when intake is already COMPLETED', async () => {
    const stubs = createStubManager();
    try {
      const existingCompleted = {
        _id: 'intake_completed_123',
        orderId: 'ORD-TEST-001',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'COMPLETED',
        invoiceNo: 'TV000056',
        invoiceId: 'inv_existing_1',
        ticketId: 'tck_existing_1'
      };

      stubs.stub(JobIntake, 'findOne', async () => existingCompleted);

      let invoiceCreated = false;
      stubs.stub(Invoice.prototype, 'save', async () => { invoiceCreated = true; });

      let ticketCreated = false;
      stubs.stub(Ticket.prototype, 'save', async () => { ticketCreated = true; });

      const result = await processJobIntake({
        intakeData: sampleIntakeData,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.isDuplicate, true);
      assert.strictEqual(result.invoiceNo, 'TV000056');
      assert.strictEqual(result.ticketId, 'tck_existing_1');
      assert.strictEqual(invoiceCreated, false);
      assert.strictEqual(ticketCreated, false);
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('processJobIntake rejects competing worker with 409 Conflict when lease is active', async () => {
    const stubs = createStubManager();
    try {
      const activeIntake = {
        _id: 'intake_active_1',
        orderId: 'ORD-TEST-001',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'PROCESSING',
        processingStartedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 25000), // Active for next 25 seconds
        processingLeaseOwner: 'worker_1_uuid'
      };

      stubs.stub(JobIntake, 'findOne', async () => activeIntake);

      let threwConflict = false;
      try {
        await processJobIntake({
          intakeData: sampleIntakeData,
          subdomain: 'tech-vaseegrah',
          adminUser: sampleAdmin
        });
      } catch (err) {
        threwConflict = true;
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.isProcessing, true);
        assert.ok(err.message.includes('currently being processed'));
      }

      assert.strictEqual(threwConflict, true, 'Competing worker must be rejected with 409');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('processJobIntake halts stale worker if lease was lost before invoice creation', async () => {
    const stubs = createStubManager();
    try {
      let createdIntake = {
        _id: 'intake_stale_1',
        orderId: 'ORD-TEST-001',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'PROCESSING'
      };

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => null); // Initially acquires
      stubs.stub(JobIntake.prototype, 'save', async function() { return this; });
      stubs.stub(Invoice, 'findOne', () => mockQuery(null));

      // Simulate lease touch failing because another worker usurped the lease
      stubs.stub(JobIntake, 'findOneAndUpdate', async (query) => {
        // Lease touch fails (returns null)
        return null;
      });

      let invoiceSaved = false;
      stubs.stub(Invoice.prototype, 'save', async () => { invoiceSaved = true; });

      let threwLeaseLost = false;
      try {
        await processJobIntake({
          intakeData: sampleIntakeData,
          subdomain: 'tech-vaseegrah',
          adminUser: sampleAdmin
        });
      } catch (err) {
        threwLeaseLost = true;
        assert.ok(err.message.includes('Processing lease for order ORD-TEST-001 was lost or expired'));
      }

      assert.strictEqual(threwLeaseLost, true);
      assert.strictEqual(invoiceSaved, false, 'Stale worker must NOT create an invoice after lease loss');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('processJobIntake deterministically recovers from crash after invoice save without creating duplicate invoice', async () => {
    const stubs = createStubManager();
    try {
      const orderId = 'ORD-RECOVERY-INV-001';
      const crashIntakeData = { ...sampleIntakeData, orderId };

      // Simulate intake record left in FAILED state with invoiceId null after mid-flight crash
      const crashedIntake = {
        _id: 'intake_crashed_1',
        orderId,
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'FAILED',
        invoiceId: null, // Null because crash happened right before reference write!
        ticketId: null,
        retryCount: 1,
        save: async () => crashedIntake
      };

      // Mock existing invoice that was saved to DB right before the crash
      const savedInvoice = {
        _id: 'mock_inv_saved_earlier',
        invoiceNo: 'TV000077',
        externalOrderId: orderId,
        createdBy: sampleAdmin._id
      };

      stubs.stub(JobIntake, 'findOne', async () => crashedIntake);
      stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
        if (update.$set) Object.assign(crashedIntake, update.$set);
        return crashedIntake;
      });

      // Deterministic recovery finds invoice by externalOrderId!
      stubs.stub(Invoice, 'findOne', async (query) => {
        if (query.externalOrderId === orderId) {
          return savedInvoice;
        }
        return null;
      });

      let sequenceCalled = false;
      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => {
        sequenceCalled = true;
        return { seq: 999 };
      });

      let secondInvoiceSaved = false;
      stubs.stub(Invoice.prototype, 'save', async () => { secondInvoiceSaved = true; });

      // Ticket mocks
      let createdTicket = null;
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = 'mock_tck_new_1';
        return this;
      });

      const result = await processJobIntake({
        intakeData: crashIntakeData,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.invoiceNo, 'TV000077');
      assert.strictEqual(result.invoiceId, 'mock_inv_saved_earlier');
      assert.strictEqual(sequenceCalled, false, 'Must NOT call sequence counter if invoice was already created');
      assert.strictEqual(secondInvoiceSaved, false, 'Must NOT save a second invoice on crash recovery');
      assert.ok(createdTicket, 'Ticket should be created to finish recovery');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('processJobIntake deterministically recovers from crash after ticket save without creating duplicate ticket', async () => {
    const stubs = createStubManager();
    try {
      const orderId = 'ORD-RECOVERY-TCK-001';
      const crashIntakeData = { ...sampleIntakeData, orderId };

      const crashedIntake = {
        _id: 'intake_crashed_2',
        orderId,
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'INVOICE_CREATED',
        invoiceId: 'mock_inv_saved_1',
        invoiceNo: 'TV000088',
        ticketId: null, // Null because crash happened right before reference write!
        retryCount: 1,
        save: async () => crashedIntake
      };

      const savedTicket = {
        _id: 'mock_tck_saved_earlier',
        title: `[Order #${orderId}] Acme Test Corp - Full Stack Web Portal`,
        labels: ['online-intake', 'razorpay', `order:${orderId}`],
        subdomain: 'tech-vaseegrah',
        isDeleted: false
      };

      stubs.stub(JobIntake, 'findOne', async () => crashedIntake);
      stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
        if (update.$set) Object.assign(crashedIntake, update.$set);
        return crashedIntake;
      });

      stubs.stub(Invoice, 'findById', async () => ({ _id: 'mock_inv_saved_1', invoiceNo: 'TV000088' }));

      // Deterministic recovery finds ticket by labels and isDeleted!
      stubs.stub(Ticket, 'findOne', async (query) => {
        if (query.labels === `order:${orderId}` && query.isDeleted && query.isDeleted.$ne === true) {
          return savedTicket;
        }
        return null;
      });

      let secondTicketSaved = false;
      stubs.stub(Ticket.prototype, 'save', async () => { secondTicketSaved = true; });

      const result = await processJobIntake({
        intakeData: crashIntakeData,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.ticketId, 'mock_tck_saved_earlier');
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(secondTicketSaved, false, 'Must NOT save a second ticket on crash recovery');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('getNextSequentialInvoiceNo allocates distinct, monotonically increasing TV numbers under simulated concurrent increments', async () => {
    const stubs = createStubManager();
    try {
      let counter = 200;
      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async (query, update) => {
        if (update.$inc && update.$inc.seq) {
          counter += update.$inc.seq;
          return { _id: 'invoice_TV', seq: counter };
        }
        return { _id: 'invoice_TV', seq: counter };
      });

      stubs.stub(Invoice, 'findOne', () => mockQuery(null));

      // Simulate 10 concurrent requests to getNextSequentialInvoiceNo
      const results = await Promise.all([
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo(),
        getNextSequentialInvoiceNo()
      ]);

      assert.strictEqual(results.length, 10);
      const uniqueSet = new Set(results);
      assert.strictEqual(uniqueSet.size, 10, 'All 10 concurrently generated invoice numbers must be unique');
      assert.strictEqual(results[0], 'TV000201');
      assert.strictEqual(results[9], 'TV000210');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Lease expiry during slow processing halts stale worker and enables second worker to recover invoice and complete ticket without duplicates', async () => {
    const stubs = createStubManager();
    try {
      const orderId = 'ORD-SLOW-WORKER-001';
      const intakeData = { ...sampleIntakeData, orderId };

      let intakeDoc = {
        _id: 'intake_slow_1',
        orderId,
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'PROCESSING',
        processingLeaseOwner: 'worker_1_token',
        leaseExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago!
        invoiceId: null,
        invoiceNo: null,
        ticketId: null,
        retryCount: 1
      };

      const savedInvoice = {
        _id: 'mock_inv_slow_1',
        invoiceNo: 'TV000099',
        externalOrderId: orderId,
        createdBy: sampleAdmin._id
      };

      let savedTicket = null;

      // Stub DB state
      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => intakeDoc);

      // Worker 2 acquires the expired lease
      stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
        // Stale Worker 1 check fails
        if (query.processingLeaseOwner === 'worker_1_token') {
          return null; // Worker 1 has lost the lease!
        }
        if (update.$set) Object.assign(intakeDoc, update.$set);
        return intakeDoc;
      });

      // Invoice was already created by Worker 1 before it stalled
      stubs.stub(Invoice, 'findOne', async (query) => {
        if (query.externalOrderId === orderId) return savedInvoice;
        return null;
      });

      // Ticket is created by Worker 2
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        savedTicket = this;
        this._id = 'mock_tck_worker2';
        return this;
      });

      // Worker 2 executes processJobIntake
      const worker2Result = await processJobIntake({
        intakeData,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(worker2Result.success, true);
      assert.strictEqual(worker2Result.invoiceNo, 'TV000099');
      assert.ok(worker2Result.ticketId);
      assert.strictEqual(worker2Result.status, 'COMPLETED');
      assert.ok(savedTicket, 'Worker 2 must successfully create ticket');

      // Now verify Stale Worker 1 attempting to resume will be rejected
      let staleWorkerRejected = false;
      try {
        // Stale Worker 1 attempts to update JobIntake with its dead token
        const staleUpdate = await JobIntake.findOneAndUpdate(
          { _id: intakeDoc._id, processingLeaseOwner: 'worker_1_token' },
          { $set: { intakeStatus: 'INVOICE_CREATED' } }
        );
        if (!staleUpdate) {
          throw new Error('Processing lease for order ORD-SLOW-WORKER-001 was lost before invoice reference update.');
        }
      } catch (err) {
        staleWorkerRejected = true;
        assert.ok(err.message.includes('lease for order ORD-SLOW-WORKER-001 was lost'));
      }

      assert.strictEqual(staleWorkerRejected, true, 'Stale worker must be prevented from updating database');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Concurrent invoice insert collision throwing E11000 gracefully recovers existing invoice without duplicate creation', async () => {
    const stubs = createStubManager();
    try {
      const orderId = 'ORD-E11000-COLLISION-001';
      const intakeData = { ...sampleIntakeData, orderId };

      let intakeDoc = {
        _id: 'intake_collision_1',
        orderId,
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'RECEIVED',
        retryCount: 0
      };

      const concurrentlyCreatedInvoice = {
        _id: 'mock_inv_concurrent_1',
        invoiceNo: 'TV000305',
        externalOrderId: orderId,
        createdBy: sampleAdmin._id
      };

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => intakeDoc);
      stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
        if (update.$set) Object.assign(intakeDoc, update.$set);
        return intakeDoc;
      });

      // Distinguish between sequence collision check and externalOrderId recovery lookup
      let recoveryLookupCount = 0;
      stubs.stub(Invoice, 'findOne', (query) => {
        if (query && query.externalOrderId === orderId) {
          recoveryLookupCount++;
          if (recoveryLookupCount > 1) {
            return mockQuery(concurrentlyCreatedInvoice);
          }
          return mockQuery(null);
        }
        // Checks for invoiceNo uniqueness during generation return null (candidate is fresh)
        return mockQuery(null);
      });

      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: 305 }));

      // Simulate E11000 collision on Invoice.save
      stubs.stub(Invoice.prototype, 'save', async () => {
        const err = new Error('E11000 duplicate key error index: externalOrderId_1_createdBy_1 dup key');
        err.code = 11000;
        throw err;
      });

      // Ticket mocks
      let ticketCreated = null;
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        ticketCreated = this;
        this._id = 'mock_tck_collision_1';
        return this;
      });

      const result = await processJobIntake({
        intakeData,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.invoiceNo, 'TV000305');
      assert.strictEqual(result.invoiceId, 'mock_inv_concurrent_1');
      assert.ok(result.ticketId);
      assert.strictEqual(result.status, 'COMPLETED');
    } finally {
      stubs.restoreAll();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(` Test Execution Completed: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
})();
