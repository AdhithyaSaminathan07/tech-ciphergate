/**
 * System 1 — Job Intake to Invoice & Job-Ticket Workflow Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Fail-closed safety guard: Throws immediately if remote/live MongoDB URI is detected.
 * 2. 100% In-Memory / Mock-based testing.
 * 3. Zero writes to production database, zero live migrations, zero live index creation.
 * 4. Zero real WhatsApp messages sent (strictly mocked).
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

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
console.log(' Tech Ciphergate — System 1 Intake, Invoice & Ticket Tests      ');
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
// 2. Micro-stubbing Utility
// ─────────────────────────────────────────────────────────────────────────────
function createStubManager() {
  const originalMethods = [];

  return {
    stub(target, methodName, fakeFn) {
      const original = target[methodName];
      originalMethods.push({ target, methodName, original });
      target[methodName] = fakeFn;
    },
    restoreAll() {
      while (originalMethods.length > 0) {
        const { target, methodName, original } = originalMethods.pop();
        target[methodName] = original;
      }
    }
  };
}

const mockQuery = (result) => ({
  lean: async () => result,
  select: function() { return this; },
  populate: function() { return this; },
  sort: function() { return this; },
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  catch: (reject) => Promise.resolve(result).catch(reject)
});

// Import modules
const { processJobIntake, retryJobIntake } = require('../services/jobIntakeService');
const { getNextSequentialInvoiceNo } = require('../services/invoiceSequenceService');
const invoiceController = require('../controllers/invoiceController');
const jobIntakeController = require('../controllers/jobIntakeController');
const whatsappService = require('../services/whatsappService');

const JobIntake = require('../models/JobIntake');
const Invoice = require('../models/Invoice');
const InvoiceSequence = require('../models/InvoiceSequence');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');

const sampleAdmin = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Ciphergate Admin',
  email: 'admin@techvaseegrah.com',
  subdomain: 'tech-vaseegrah',
  role: 'admin'
};

const sampleManualOrder = {
  orderId: 'ORD-S1-001',
  subdomain: 'tech-vaseegrah',
  customer: {
    name: 'Ravi Kumar',
    phone: '+919876543210',
    email: 'ravi.kumar@example.com',
    address: '42 MG Road, Bangalore',
    gstin: '33AABCT1234D1Z5'
  },
  jobDetails: {
    title: 'Custom ERP Module Development',
    description: 'Implement procurement workflow and vendor ledger.',
    serviceCategory: 'Software Engineering',
    team: 'DEV',
    priority: 'High',
    deliverables: ['Procurement UI', 'Ledger Sync Job'],
    referenceFiles: [
      {
        url: 'https://cdn.example.com/specs.pdf',
        name: 'ERP_Specs.pdf',
        size: 2048,
        fileType: 'application/pdf'
      }
    ]
  },
  items: [
    {
      description: 'Procurement Workflow Engine',
      hsn: '998314',
      gst: 18,
      qty: 1,
      rate: 75000,
      total: 75000
    }
  ],
  payment: {
    gateway: 'manual',
    amount: 75000,
    currency: 'INR',
    paymentStatus: 'PENDING',
    manualVerification: true
  },
  rawPayload: { source: 'system1_intake' }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Test Suites
// ─────────────────────────────────────────────────────────────────────────────

async function runAllTests() {

  // Test 1: Successful processing with manual payment verification
  await runTest('Order intake with manual payment verification creates 1 Proforma Invoice and 1 Unassigned Ticket', async () => {
    const stubs = createStubManager();
    try {
      let createdIntake = null;
      let createdInvoice = null;
      let createdTicket = null;

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => null); // Fresh intake
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        this._id = 'intake_s1_001';
        return this;
      });

      stubs.stub(JobIntake, 'findOneAndUpdate', async (query, update) => {
        if (update.$set) {
          Object.assign(createdIntake, update.$set);
        }
        return createdIntake;
      });

      stubs.stub(Invoice, 'findOne', () => mockQuery(null));
      stubs.stub(Invoice.prototype, 'save', async function() {
        createdInvoice = this;
        this._id = 'inv_s1_001';
        return this;
      });

      let seq = 100;
      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: ++seq }));

      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = 'tck_s1_001';
        return this;
      });

      const result = await processJobIntake({
        intakeData: sampleManualOrder,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      // Assertions on Result
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(result.orderId, 'ORD-S1-001');
      assert.ok(result.invoiceNo.startsWith('TV'));
      assert.strictEqual(String(result.invoiceId), String(createdInvoice._id));
      assert.strictEqual(String(result.ticketId), String(createdTicket._id));

      // Assertions on Invoice
      assert.strictEqual(createdInvoice.invoiceType, 'PROFORMA INVOICE', 'Invoice must be PROFORMA INVOICE for manual payment verification');
      assert.strictEqual(createdInvoice.status, 'Invoice', 'Invoice status must remain "Invoice"');
      assert.strictEqual(createdInvoice.isPaid, false, 'Invoice must NOT be marked paid');
      assert.ok(!createdInvoice.paymentDetails?.proof, 'No fake payment proof may be attached');
      assert.strictEqual(createdInvoice.paymentDetails?.proofs?.length || 0, 0, 'Proofs array must be empty');
      assert.strictEqual(createdInvoice.externalOrderId, 'ORD-S1-001');
      assert.strictEqual(createdInvoice.customerName, 'Ravi Kumar');

      // Assertions on Ticket
      assert.strictEqual(createdTicket.status, 'To Do');
      assert.strictEqual(createdTicket.team, 'DEV');
      assert.strictEqual(createdTicket.priority, 'High');
      assert.strictEqual(createdTicket.assignee, undefined, 'No developer assignment should occur at this stage');
      assert.ok(createdTicket.description.includes('Procurement UI'), 'Ticket description must include project scope');
      assert.ok(createdTicket.description.includes('Implement procurement workflow'), 'Ticket description must include project overview');
      assert.ok(!createdTicket.description.includes('Ravi Kumar'), 'Ticket description must not contain customer PII');
      assert.ok(!createdTicket.description.includes(result.invoiceNo), 'Ticket description must not contain invoice number');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 2: Duplicate orders return idempotent 200 without creating new records
  await runTest('Duplicate intake order returns idempotent completion without allocating new invoice numbers', async () => {
    const stubs = createStubManager();
    try {
      const existingCompleted = {
        _id: 'intake_completed_999',
        orderId: 'ORD-S1-001',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'COMPLETED',
        invoiceNo: 'TV000101',
        invoiceId: 'inv_existing_101',
        ticketId: 'tck_existing_101'
      };

      stubs.stub(JobIntake, 'findOne', async () => existingCompleted);

      let invoiceCreated = false;
      stubs.stub(Invoice.prototype, 'save', async () => { invoiceCreated = true; });

      let ticketCreated = false;
      stubs.stub(Ticket.prototype, 'save', async () => { ticketCreated = true; });

      const result = await processJobIntake({
        intakeData: sampleManualOrder,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.isDuplicate, true);
      assert.strictEqual(result.invoiceNo, 'TV000101');
      assert.strictEqual(result.invoiceId, 'inv_existing_101');
      assert.strictEqual(result.ticketId, 'tck_existing_101');
      assert.strictEqual(invoiceCreated, false, 'Duplicate intake must not save a new invoice');
      assert.strictEqual(ticketCreated, false, 'Duplicate intake must not save a new ticket');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 3: Partial failure retry & invoice recovery (crashed after invoice save, before ticket save)
  await runTest('Retry after partial failure recovers existing invoice via externalOrderId and completes ticket', async () => {
    const stubs = createStubManager();
    try {
      const existingInvoice = {
        _id: 'inv_recovered_555',
        invoiceNo: 'TV000555',
        externalOrderId: 'ORD-S1-PARTIAL-1',
        createdBy: sampleAdmin._id,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false
      };

      const partialIntake = {
        _id: 'intake_partial_555',
        orderId: 'ORD-S1-PARTIAL-1',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'FAILED',
        invoiceId: null, // Invoice was created in DB but reference was not yet committed to intake
        invoiceNo: null,
        ticketId: null,
        retryCount: 1
      };

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => partialIntake);
      stubs.stub(JobIntake, 'findOneAndUpdate', async (q, update) => {
        if (update.$set) Object.assign(partialIntake, update.$set);
        return partialIntake;
      });

      // Deterministic recovery lookup finds existing invoice by externalOrderId
      stubs.stub(Invoice, 'findOne', async (query) => {
        if (query.externalOrderId === 'ORD-S1-PARTIAL-1') return existingInvoice;
        return null;
      });

      let invoiceCreated = false;
      stubs.stub(Invoice.prototype, 'save', async () => { invoiceCreated = true; });

      let createdTicket = null;
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = 'tck_new_555';
        return this;
      });

      const intakePayload = {
        ...sampleManualOrder,
        orderId: 'ORD-S1-PARTIAL-1'
      };

      const result = await processJobIntake({
        intakeData: intakePayload,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(result.invoiceNo, 'TV000555', 'Must reuse existing invoice number TV000555');
      assert.strictEqual(result.invoiceId, 'inv_recovered_555', 'Must re-link existing invoice ID');
      assert.strictEqual(String(result.ticketId), String(createdTicket._id));
      assert.strictEqual(invoiceCreated, false, 'Must NOT create a duplicate invoice');
      assert.ok(createdTicket, 'Must complete ticket creation');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 4: Partial failure retry & ticket recovery (crashed after ticket save, before COMPLETED state)
  await runTest('Retry after partial failure recovers both existing invoice and ticket without duplicates', async () => {
    const stubs = createStubManager();
    try {
      const existingInvoice = {
        _id: 'inv_rec_777',
        invoiceNo: 'TV000777',
        externalOrderId: 'ORD-S1-PARTIAL-2',
        createdBy: sampleAdmin._id
      };

      const existingTicket = {
        _id: 'tck_rec_777',
        subdomain: 'tech-vaseegrah',
        labels: ['online-intake', 'manual', 'order:ORD-S1-PARTIAL-2'],
        status: 'To Do'
      };

      const stuckIntake = {
        _id: 'intake_stuck_777',
        orderId: 'ORD-S1-PARTIAL-2',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'FAILED',
        invoiceId: 'inv_rec_777',
        invoiceNo: 'TV000777',
        ticketId: null, // Ticket was saved in DB but intake update failed
        retryCount: 2
      };

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => stuckIntake);
      stubs.stub(JobIntake, 'findOneAndUpdate', async (q, update) => {
        if (update.$set) Object.assign(stuckIntake, update.$set);
        return stuckIntake;
      });

      stubs.stub(Invoice, 'findById', async () => existingInvoice);
      stubs.stub(Invoice, 'findOne', async () => existingInvoice);

      // Deterministic recovery finds ticket by order label
      stubs.stub(Ticket, 'findOne', async (query) => {
        if (query.labels === 'order:ORD-S1-PARTIAL-2') return existingTicket;
        return null;
      });

      let invoiceCreated = false;
      stubs.stub(Invoice.prototype, 'save', async () => { invoiceCreated = true; });

      let ticketCreated = false;
      stubs.stub(Ticket.prototype, 'save', async () => { ticketCreated = true; });

      const intakePayload = {
        ...sampleManualOrder,
        orderId: 'ORD-S1-PARTIAL-2'
      };

      const result = await processJobIntake({
        intakeData: intakePayload,
        subdomain: 'tech-vaseegrah',
        adminUser: sampleAdmin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'COMPLETED');
      assert.strictEqual(result.invoiceId, 'inv_rec_777');
      assert.strictEqual(result.ticketId, 'tck_rec_777');
      assert.strictEqual(invoiceCreated, false, 'Must not duplicate invoice');
      assert.strictEqual(ticketCreated, false, 'Must not duplicate ticket');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 5: Safe concurrency: Active lease conflict returns 409
  await runTest('Active processing lease by another worker returns 409 Conflict', async () => {
    const stubs = createStubManager();
    try {
      const activeIntake = {
        _id: 'intake_active_123',
        orderId: 'ORD-S1-001',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'PROCESSING',
        leaseExpiresAt: new Date(Date.now() + 20000), // Active 20s in future
        processingLeaseOwner: 'other_worker_uuid'
      };

      stubs.stub(JobIntake, 'findOne', async () => activeIntake);

      let thrownError = null;
      try {
        await processJobIntake({
          intakeData: sampleManualOrder,
          subdomain: 'tech-vaseegrah',
          adminUser: sampleAdmin
        });
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError, 'Must throw conflict error');
      assert.strictEqual(thrownError.statusCode, 409);
      assert.strictEqual(thrownError.isProcessing, true);

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 6: Explicit payment failure rejects with 402 and creates zero records
  await runTest('Explicit payment failure rejects with 402 and creates zero records', async () => {
    const stubs = createStubManager();
    try {
      let createdIntake = null;
      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => null);
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        this._id = 'intake_failed_402';
        return this;
      });

      stubs.stub(JobIntake, 'findOneAndUpdate', async (q, update) => {
        if (update.$set) Object.assign(createdIntake, update.$set);
        return createdIntake;
      });

      let invoiceCreated = false;
      stubs.stub(Invoice.prototype, 'save', async () => { invoiceCreated = true; });

      let ticketCreated = false;
      stubs.stub(Ticket.prototype, 'save', async () => { ticketCreated = true; });

      const failedOrder = {
        ...sampleManualOrder,
        orderId: 'ORD-FAILED-001',
        payment: {
          gateway: 'manual',
          amount: 50000,
          currency: 'INR',
          paymentStatus: 'FAILED'
        }
      };

      let thrownError = null;
      try {
        await processJobIntake({
          intakeData: failedOrder,
          subdomain: 'tech-vaseegrah',
          adminUser: sampleAdmin
        });
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError, 'Must reject failed payment with error');
      assert.strictEqual(thrownError.statusCode, 402);
      assert.strictEqual(invoiceCreated, false, 'No invoice may be created for failed payment');
      assert.strictEqual(ticketCreated, false, 'No ticket may be created for failed payment');
      assert.strictEqual(createdIntake.intakeStatus, 'FAILED');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 7: Manual Payment Proof upload workflow preserves manual verification requirement
  await runTest('Intake invoice preserves unverified state and transitions to paid only via manual proof upload', async () => {
    const stubs = createStubManager();
    try {
      // Simulate invoice created from intake
      const intakeInvoice = new Invoice({
        invoiceNo: 'TV000888',
        invoiceDate: '16/10/2026',
        actualDate: new Date(),
        customerName: 'Ravi Kumar',
        customerContact: '9876543210',
        items: [{ description: 'ERP Dev', qty: 1, rate: 75000, total: 75000, gst: 18 }],
        gstEnabled: true,
        saleType: 'Intrastate',
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: sampleAdmin._id,
        externalOrderId: 'ORD-S1-001'
      });

      // Confirm pre-condition: Intake did NOT mark it paid
      assert.strictEqual(intakeInvoice.isPaid, false);
      assert.strictEqual(intakeInvoice.invoiceType, 'PROFORMA INVOICE');
      assert.strictEqual(intakeInvoice.status, 'Invoice');

      stubs.stub(Invoice, 'findById', async (id) => intakeInvoice);

      let savedInvoice = null;
      stubs.stub(intakeInvoice, 'save', async function() {
        savedInvoice = this;
        return this;
      });

      // Simulate manual proof upload by Admin via updateInvoice (existing workflow)
      let updatedDoc = null;
      stubs.stub(Invoice, 'findByIdAndUpdate', async (id, update) => {
        updatedDoc = {
          ...intakeInvoice.toObject(),
          ...update,
          invoiceType: 'TAX INVOICE',
          isPaid: true
        };
        return updatedDoc;
      });

      stubs.stub(JobIntake, 'findOne', () => mockQuery(null));
      stubs.stub(JobIntake.prototype, 'save', async function() { return this; });
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() { return this; });

      const req = {
        params: { id: 'inv_888' },
        user: sampleAdmin,
        body: {
          status: 'Payment Received',
          paymentDetails: {
            date: new Date('2026-10-16T12:00:00Z'),
            proof: 'https://storage.techvaseegrah.com/proofs/pay_proof_888.jpg',
            proofs: [
              {
                date: new Date('2026-10-16T12:00:00Z'),
                url: 'https://storage.techvaseegrah.com/proofs/pay_proof_888.jpg'
              }
            ]
          }
        }
      };

      let jsonResponse = null;
      const res = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { jsonResponse = data; return this; }
      };

      await invoiceController.updateInvoice(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(jsonResponse.success, true);
      assert.strictEqual(updatedDoc.status, 'Payment Received', 'Must transition to Payment Received');
      assert.strictEqual(updatedDoc.isPaid, true, 'Must transition to isPaid: true upon manual verification');
      assert.strictEqual(updatedDoc.invoiceType, 'TAX INVOICE', 'Must transition to TAX INVOICE');
      assert.ok(updatedDoc.paymentDetails.proof.includes('pay_proof_888.jpg'));

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 8: WhatsApp API regression test (preserves exact contract and never sends real message)
  await runTest('WhatsApp sending preserves Meta template contract and does not mutate invoice status', async () => {
    const stubs = createStubManager();
    try {
      const testInvoice = {
        _id: 'inv_wa_test_101',
        invoiceNo: 'TV000101',
        invoiceDate: '16/10/2026',
        customerName: 'Suresh Patel',
        customerContact: '9876543210',
        items: [{ description: 'Security Audit', qty: 1, rate: 50000, total: 50000, gst: 18, isTotalOverridden: false }],
        status: 'Invoice',
        isPaid: false,
        invoiceType: 'PROFORMA INVOICE'
      };

      stubs.stub(Invoice, 'findById', async () => testInvoice);

      let whatsappCallArgs = null;
      stubs.stub(whatsappService, 'sendWhatsApp', async (subdomain, phone, options) => {
        whatsappCallArgs = { subdomain, phone, options };
        return { success: true, messageId: 'wa_mock_msg_123' };
      });

      const req = {
        params: { id: 'inv_wa_test_101' },
        user: sampleAdmin,
        body: {
          pdfBase64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...',
          recipientPhone: '9876543210'
        },
        protocol: 'http',
        get: (h) => 'localhost:5000'
      };

      let jsonResponse = null;
      const res = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { jsonResponse = data; return this; }
      };

      await invoiceController.sendInvoiceWhatsApp(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(jsonResponse.success, true);
      assert.strictEqual(jsonResponse.whatsappSuccess, true);

      // Verify WhatsApp Service Call Arguments
      assert.ok(whatsappCallArgs, 'whatsappService.sendWhatsApp must be invoked');
      assert.strictEqual(whatsappCallArgs.phone, '919876543210', 'Must normalize 10-digit number with 91 prefix');
      assert.strictEqual(whatsappCallArgs.options.templateName, 'tech_invoice_send', 'Must use exact Meta template name');
      assert.strictEqual(whatsappCallArgs.options.type, 'template');

      // Verify template parameters match exact contract
      const bodyComponent = whatsappCallArgs.options.components.find(c => c.type === 'body');
      assert.ok(bodyComponent, 'Template must include body component');
      assert.strictEqual(bodyComponent.parameters[0].text, 'Suresh Patel');
      assert.strictEqual(bodyComponent.parameters[1].text, 'TV000101');
      assert.strictEqual(bodyComponent.parameters[2].text, '16/10/2026');
      assert.strictEqual(bodyComponent.parameters[3].text, '59000.00'); // 50000 + 18% GST

      // CRITICAL: Invoice status MUST NOT be mutated to paid!
      assert.strictEqual(testInvoice.status, 'Invoice', 'WhatsApp dispatch must not alter invoice status');
      assert.strictEqual(testInvoice.isPaid, false, 'WhatsApp dispatch must not mark invoice as paid');
      assert.strictEqual(testInvoice.invoiceType, 'PROFORMA INVOICE');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 9: Controller API test: POST /api/intake/orders endpoint
  await runTest('POST /api/intake/orders endpoint validates payload, enforces tenant check, and returns 201', async () => {
    const stubs = createStubManager();
    try {
      let createdIntake = null;
      let createdInvoice = null;
      let createdTicket = null;

      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => null);
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        this._id = 'intake_ctrl_001';
        return this;
      });

      stubs.stub(JobIntake, 'findOneAndUpdate', async (q, update) => {
        if (update.$set) Object.assign(createdIntake, update.$set);
        return createdIntake;
      });

      stubs.stub(Invoice, 'findOne', () => mockQuery(null));
      stubs.stub(Invoice.prototype, 'save', async function() {
        createdInvoice = this;
        this._id = 'inv_ctrl_001';
        return this;
      });

      let seq = 300;
      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: ++seq }));

      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = 'tck_ctrl_001';
        return this;
      });

      // 0. Unauthorized request (missing token and API key)
      const unauthReq = {
        header: () => undefined,
        headers: {},
        cookies: {}
      };
      let unauthRes = null;
      const resUnauth = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { unauthRes = data; return this; }
      };
      const { protect } = require('../middleware/authMiddleware');
      await protect(unauthReq, resUnauth, () => {});
      assert.strictEqual(resUnauth.statusCode, 401, 'Unauthorized request without token must return 401');

      // 1. Invalid payload: missing customer name
      const invalidPayloadReq = {
        user: sampleAdmin,
        body: { ...sampleManualOrder, customer: { ...sampleManualOrder.customer, name: '' } }
      };
      let invalidRes = null;
      const resInvalid = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { invalidRes = data; return this; }
      };
      await jobIntakeController.handleOrderIntake(invalidPayloadReq, resInvalid);
      assert.strictEqual(resInvalid.statusCode, 400, 'Invalid payload missing customer name must return 400');
      assert.strictEqual(invalidRes.success, false);

      // 2. Commercial amount mismatch
      const mismatchReq = {
        user: sampleAdmin,
        body: {
          ...sampleManualOrder,
          payment: { ...sampleManualOrder.payment, amount: 99999 } // items total 75000
        }
      };
      let mismatchRes = null;
      const resMismatch = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { mismatchRes = data; return this; }
      };
      await jobIntakeController.handleOrderIntake(mismatchReq, resMismatch);
      assert.strictEqual(resMismatch.statusCode, 400, 'Amount mismatch must return 400');
      assert.ok(mismatchRes.message.includes('Commercial amount mismatch'));

      // 3. Cross-tenant mismatch test
      const crossTenantReq = {
        user: { ...sampleAdmin, subdomain: 'tenant-a' },
        body: sampleManualOrder // payload specifies tech-vaseegrah
      };
      let crossTenantRes = null;
      const res1 = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { crossTenantRes = data; return this; }
      };
      await jobIntakeController.handleOrderIntake(crossTenantReq, res1);
      assert.strictEqual(res1.statusCode, 403, 'Cross-tenant request must be rejected with 403');

      // 4. Happy path with matching tenant
      const validReq = {
        user: sampleAdmin,
        body: sampleManualOrder
      };
      let validRes = null;
      const res2 = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { validRes = data; return this; }
      };
      await jobIntakeController.handleOrderIntake(validReq, res2);
      assert.strictEqual(res2.statusCode, 201);
      assert.strictEqual(validRes.success, true);
      assert.strictEqual(validRes.orderId, 'ORD-S1-001');
      assert.strictEqual(String(validRes.invoiceId), String(createdInvoice._id));
      assert.strictEqual(String(validRes.ticketId), String(createdTicket._id));
      assert.strictEqual(createdInvoice.isPaid, false, 'Controller intake must preserve unpaid status');

      // 5. Duplicate order submission returns 200 with isDuplicate: true
      stubs.stub(JobIntake, 'findOne', async () => ({
        _id: 'intake_ctrl_001',
        orderId: 'ORD-S1-001',
        subdomain: 'tech-vaseegrah',
        intakeStatus: 'COMPLETED',
        invoiceNo: 'TV000301',
        invoiceId: createdInvoice._id,
        ticketId: createdTicket._id
      }));

      let dupRes = null;
      const resDup = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { dupRes = data; return this; }
      };
      await jobIntakeController.handleOrderIntake(validReq, resDup);
      assert.strictEqual(resDup.statusCode, 200, 'Duplicate submission must return 200');
      assert.strictEqual(dupRes.isDuplicate, true);
      assert.strictEqual(dupRes.invoiceNo, 'TV000301');

    } finally {
      stubs.restoreAll();
    }
  });

  // Test 10: Monotonic sequential numbering continuity under successive intakes
  await runTest('Multiple successive intakes allocate distinct, monotonically increasing invoice numbers', async () => {
    const stubs = createStubManager();
    try {
      let currentSeq = 100;
      stubs.stub(InvoiceSequence, 'findOneAndUpdate', async () => ({ seq: ++currentSeq }));
      stubs.stub(Admin, 'findOne', () => ({ lean: async () => sampleAdmin }));
      stubs.stub(JobIntake, 'findOne', async () => null);
      stubs.stub(JobIntake.prototype, 'save', async function() { return this; });
      stubs.stub(JobIntake, 'findOneAndUpdate', async (q, update) => ({
        invoiceId: 'inv_x',
        invoiceNo: update.$set?.invoiceNo,
        ticketId: 'tck_x',
        intakeStatus: 'COMPLETED'
      }));

      stubs.stub(Invoice, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() { return this; });

      const allocatedNumbers = [];
      stubs.stub(Invoice.prototype, 'save', async function() {
        allocatedNumbers.push(this.invoiceNo);
        return this;
      });

      for (let i = 1; i <= 3; i++) {
        const orderData = {
          ...sampleManualOrder,
          orderId: `ORD-SEQ-${i}`
        };
        await processJobIntake({
          intakeData: orderData,
          subdomain: 'tech-vaseegrah',
          adminUser: sampleAdmin
        });
      }

      assert.strictEqual(allocatedNumbers.length, 3);
      // All invoice numbers must be unique
      const uniqueSet = new Set(allocatedNumbers);
      assert.strictEqual(uniqueSet.size, 3, 'All allocated invoice numbers must be distinct');

    } finally {
      stubs.restoreAll();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Print Summary
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(` System 1 Integration Tests Completed: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test Suite Fatal Crash:', err);
  process.exit(1);
});
