/**
 * System 1 — Isolated Staging Database Integration Test Suite
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY against a dedicated local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed safety: Throws immediately if ANY non-local or remote URI is provided.
 * 3. Never touches production data or the remote Atlas cluster.
 * 4. Cleans up and drops the ephemeral test database upon test suite completion.
 * 5. Zero real WhatsApp messages sent (strictly mocked).
 */

const assert = require('assert');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fail-Closed Staging Database Safety Guard
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_staging_audit_test';

function assertSafeStagingEnvironment(uri) {
  if (!uri.startsWith('mongodb://127.0.0.1:27017/') && !uri.startsWith('mongodb://localhost:27017/')) {
    throw new Error(`CRITICAL SAFETY ABORT: Attempted to run staging database test against non-local host: ${uri}`);
  }
  if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('production') || uri.includes('live')) {
    throw new Error('CRITICAL SAFETY ABORT: Live or cluster database keyword detected in URI!');
  }
}

assertSafeStagingEnvironment(LOCAL_STAGING_URI);

console.log('================================================================');
console.log(' Tech Ciphergate — System 1 Staging Real DB Integration Tests  ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
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

// Models & Services
const JobIntake = require('../models/JobIntake');
const Invoice = require('../models/Invoice');
const Ticket = require('../models/ticketModel');
const InvoiceSequence = require('../models/InvoiceSequence');
const Admin = require('../models/Admin');

const { processJobIntake } = require('../services/jobIntakeService');
const { getNextSequentialInvoiceNo } = require('../services/invoiceSequenceService');
const jobIntakeController = require('../controllers/jobIntakeController');
const invoiceController = require('../controllers/invoiceController');
const whatsappService = require('../services/whatsappService');

let sampleAdminUser = null;

const createSampleOrder = (orderId, amount = 60000) => ({
  orderId,
  subdomain: 'tech-vaseegrah',
  customer: {
    name: 'Staging Test Client',
    phone: '+919876543210',
    email: 'staging@techvaseegrah.com',
    address: '100 Silicon Highway, Chennai',
    gstin: '33AABCT9999D1Z0'
  },
  jobDetails: {
    title: `Platform Feature Module - ${orderId}`,
    description: 'Build automated staging intake module.',
    serviceCategory: 'Engineering',
    team: 'DEV',
    priority: 'High',
    deliverables: ['API endpoint', 'Audit logger'],
    referenceFiles: [
      {
        url: 'https://cdn.example.com/spec.pdf',
        name: 'spec.pdf',
        size: 1024,
        fileType: 'application/pdf'
      }
    ]
  },
  items: [
    {
      description: 'Platform Feature Module',
      hsn: '998314',
      gst: 18,
      qty: 1,
      rate: amount,
      total: amount
    }
  ],
  payment: {
    gateway: 'manual',
    amount,
    currency: 'INR',
    paymentStatus: 'PENDING',
    manualVerification: true
  },
  rawPayload: { source: 'staging_audit_suite' }
});

async function runStagingAuditTests() {
  // Connect to isolated local database
  await mongoose.connect(LOCAL_STAGING_URI, {
    serverSelectionTimeoutMS: 5000
  });

  // Clean test database before test suite
  await mongoose.connection.db.dropDatabase();

  // Create staging tenant admin in database
  sampleAdminUser = await Admin.create({
    username: 'staging_admin',
    name: 'Staging Admin',
    email: 'staging-admin@techvaseegrah.com',
    password: 'StagingHashedPassword123!',
    subdomain: 'tech-vaseegrah',
    role: 'admin'
  });

  // Seed InvoiceSequence starting counter
  await InvoiceSequence.create({
    _id: 'invoice_TV',
    seq: 200
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 1: Valid Order Intake Persistence & Verification
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Valid order intake persists 1 Proforma Invoice and 1 unassigned To Do Ticket', async () => {
    const payload = createSampleOrder('ORD-REAL-001', 50000);

    const req = {
      user: sampleAdminUser.toObject(),
      body: payload
    };

    let responseData = null;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData = data; return this; }
    };

    await jobIntakeController.handleOrderIntake(req, res);

    assert.strictEqual(res.statusCode, 201, 'Must return HTTP 201 Created');
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.orderId, 'ORD-REAL-001');

    // Physically inspect persisted JobIntake record
    const persistedIntake = await JobIntake.findOne({ orderId: 'ORD-REAL-001', subdomain: 'tech-vaseegrah' });
    assert.ok(persistedIntake, 'JobIntake record must be persisted in MongoDB');
    assert.strictEqual(persistedIntake.intakeStatus, 'COMPLETED');
    assert.strictEqual(persistedIntake.invoiceNo, 'TV000201');
    assert.strictEqual(String(persistedIntake.invoiceId), String(responseData.invoiceId));
    assert.strictEqual(String(persistedIntake.ticketId), String(responseData.ticketId));

    // Physically inspect persisted Invoice record
    const persistedInvoice = await Invoice.findById(responseData.invoiceId);
    assert.ok(persistedInvoice, 'Invoice record must be persisted in MongoDB');
    assert.strictEqual(persistedInvoice.invoiceNo, 'TV000201');
    assert.strictEqual(persistedInvoice.invoiceType, 'PROFORMA INVOICE', 'Invoice must be PROFORMA INVOICE');
    assert.strictEqual(persistedInvoice.status, 'Invoice', 'Invoice status must be "Invoice"');
    assert.strictEqual(persistedInvoice.isPaid, false, 'isPaid must be false');
    assert.ok(!persistedInvoice.paymentDetails?.proof, 'Must have zero fake payment proof');
    assert.strictEqual(persistedInvoice.externalOrderId, 'ORD-REAL-001');
    assert.strictEqual(String(persistedInvoice.createdBy), String(sampleAdminUser._id));

    // Physically inspect persisted Ticket record
    const persistedTicket = await Ticket.findById(responseData.ticketId);
    assert.ok(persistedTicket, 'Ticket record must be persisted in MongoDB');
    assert.strictEqual(persistedTicket.status, 'To Do');
    assert.strictEqual(persistedTicket.team, 'DEV');
    assert.strictEqual(persistedTicket.assignee, undefined, 'Ticket must remain unassigned at this stage');
    assert.ok(persistedTicket.description.includes('API endpoint'), 'Description must include project scope');
    assert.ok(persistedTicket.description.includes('Build automated staging intake module'), 'Description must include project overview');
    assert.ok(!persistedTicket.description.includes('Staging Test Client'), 'Description must not contain customer PII');
    assert.ok(!persistedTicket.description.includes('Pending Manual Verification'), 'Description must not contain commercial status');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 2: Sequential Monotonic Numbering Continuity
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Successive order intake increments sequence atomically and avoids duplicates', async () => {
    const payload2 = createSampleOrder('ORD-REAL-002', 70000);

    const req2 = {
      user: sampleAdminUser.toObject(),
      body: payload2
    };

    let responseData2 = null;
    const res2 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseData2 = data; return this; }
    };

    await jobIntakeController.handleOrderIntake(req2, res2);

    assert.strictEqual(res2.statusCode, 201);
    assert.strictEqual(responseData2.invoiceNo, 'TV000202', 'Next sequence must be TV000202');

    // Confirm sequence counter persisted in DB
    const seqDoc = await InvoiceSequence.findById('invoice_TV');
    assert.strictEqual(seqDoc.seq, 202);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 3: Duplicate Order Idempotency Against Real Collections
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Duplicate order submission returns 200 with isDuplicate: true and zero extra records', async () => {
    const duplicatePayload = createSampleOrder('ORD-REAL-001', 50000);

    const reqDup = {
      user: sampleAdminUser.toObject(),
      body: duplicatePayload
    };

    let responseDup = null;
    const resDup = {
      status(code) { this.statusCode = code; return this; },
      json(data) { responseDup = data; return this; }
    };

    await jobIntakeController.handleOrderIntake(reqDup, resDup);

    assert.strictEqual(resDup.statusCode, 200, 'Duplicate submission must return HTTP 200');
    assert.strictEqual(responseDup.isDuplicate, true);
    assert.strictEqual(responseDup.invoiceNo, 'TV000201');

    // Verify database document counts
    const invoiceCount = await Invoice.countDocuments({ externalOrderId: 'ORD-REAL-001' });
    assert.strictEqual(invoiceCount, 1, 'Exactly one invoice must exist for order');

    const ticketCount = await Ticket.countDocuments({ labels: 'order:ORD-REAL-001' });
    assert.strictEqual(ticketCount, 1, 'Exactly one ticket must exist for order');

    const intakeCount = await JobIntake.countDocuments({ orderId: 'ORD-REAL-001' });
    assert.strictEqual(intakeCount, 1, 'Exactly one JobIntake document must exist');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 4: Partial Failure Recovery (Invoice in DB, Ticket crashed)
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Crash recovery after invoice save re-links existing invoice without new sequence number', async () => {
    // 1. Manually create pre-saved invoice simulating a worker crash right after invoice save
    const preSavedInvoice = await Invoice.create({
      invoiceNo: 'TV000203',
      invoiceDate: '16/10/2026',
      actualDate: new Date(),
      customerName: 'Staging Test Client',
      customerContact: '+919876543210',
      salesPerson: 'Job Intake',
      terms: 'Payment pending manual verification.',
      items: [{ description: 'Feature', qty: 1, rate: 80000, total: 80000, gst: 18 }],
      gstEnabled: true,
      invoiceType: 'PROFORMA INVOICE',
      status: 'Invoice',
      isPaid: false,
      createdBy: sampleAdminUser._id,
      createdByModel: 'Admin',
      source: 'intake',
      externalOrderId: 'ORD-REAL-PARTIAL-1'
    });

    // Also update sequence counter so next would be 204
    await InvoiceSequence.findByIdAndUpdate('invoice_TV', { seq: 203 });

    // 2. Retry the intake for ORD-REAL-PARTIAL-1
    const retryPayload = createSampleOrder('ORD-REAL-PARTIAL-1', 80000);
    const result = await processJobIntake({
      intakeData: retryPayload,
      subdomain: 'tech-vaseegrah',
      adminUser: sampleAdminUser
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.invoiceNo, 'TV000203', 'Must recover existing invoice number TV000203');
    assert.strictEqual(String(result.invoiceId), String(preSavedInvoice._id), 'Must re-link existing invoice ID');

    // Confirm only 1 invoice exists in DB for this order
    const count = await Invoice.countDocuments({ externalOrderId: 'ORD-REAL-PARTIAL-1' });
    assert.strictEqual(count, 1, 'Zero duplicate invoices created');

    // Confirm ticket was created and linked
    const createdTicket = await Ticket.findById(result.ticketId);
    assert.ok(createdTicket, 'Ticket must be created upon recovery');
    assert.strictEqual(createdTicket.status, 'To Do');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 5: Partial Failure Recovery (Invoice & Ticket in DB, Intake crashed)
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Crash recovery after ticket save re-links both existing records and completes intake', async () => {
    // 1. Manually create pre-saved invoice and pre-saved ticket
    const preSavedInvoice = await Invoice.create({
      invoiceNo: 'TV000204',
      invoiceDate: '16/10/2026',
      actualDate: new Date(),
      customerName: 'Staging Test Client',
      customerContact: '+919876543210',
      salesPerson: 'Job Intake',
      terms: 'Payment pending manual verification.',
      items: [{ description: 'Feature', qty: 1, rate: 85000, total: 85000, gst: 18 }],
      gstEnabled: true,
      invoiceType: 'PROFORMA INVOICE',
      status: 'Invoice',
      isPaid: false,
      createdBy: sampleAdminUser._id,
      createdByModel: 'Admin',
      source: 'intake',
      externalOrderId: 'ORD-REAL-PARTIAL-2'
    });

    const preSavedTicket = await Ticket.create({
      title: '[Order #ORD-REAL-PARTIAL-2] Pre-saved Ticket',
      description: 'Pre-saved ticket description.',
      subdomain: 'tech-vaseegrah',
      team: 'DEV',
      priority: 'High',
      status: 'To Do',
      issueType: 'Task',
      assignedBy: sampleAdminUser._id,
      assignedByModel: 'Admin',
      labels: ['online-intake', 'manual', 'order:ORD-REAL-PARTIAL-2']
    });

    await InvoiceSequence.findByIdAndUpdate('invoice_TV', { seq: 204 });

    // 2. Retry the intake for ORD-REAL-PARTIAL-2
    const retryPayload = createSampleOrder('ORD-REAL-PARTIAL-2', 85000);
    const result = await processJobIntake({
      intakeData: retryPayload,
      subdomain: 'tech-vaseegrah',
      adminUser: sampleAdminUser
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(String(result.invoiceId), String(preSavedInvoice._id));
    assert.strictEqual(String(result.ticketId), String(preSavedTicket._id));

    // Confirm no duplicates exist in DB
    const invCount = await Invoice.countDocuments({ externalOrderId: 'ORD-REAL-PARTIAL-2' });
    assert.strictEqual(invCount, 1);

    const tckCount = await Ticket.countDocuments({ labels: 'order:ORD-REAL-PARTIAL-2' });
    assert.strictEqual(tckCount, 1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 6: Manual Payment Proof Workflow Transition Against Real Doc
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Invoice remains unpaid until manual payment proof update transitions it to paid in DB', async () => {
    // Fetch the real invoice for ORD-REAL-001
    const invoiceBefore = await Invoice.findOne({ externalOrderId: 'ORD-REAL-001' });
    assert.strictEqual(invoiceBefore.isPaid, false);
    assert.strictEqual(invoiceBefore.status, 'Invoice');
    assert.strictEqual(invoiceBefore.invoiceType, 'PROFORMA INVOICE');

    // Simulate manual proof update via invoiceController.updateInvoice
    const updateReq = {
      params: { id: String(invoiceBefore._id) },
      user: sampleAdminUser.toObject(),
      body: {
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          date: new Date(),
          proof: 'https://staging-storage.techvaseegrah.com/proofs/pay_proof_real_001.jpg',
          proofs: [
            {
              date: new Date(),
              url: 'https://staging-storage.techvaseegrah.com/proofs/pay_proof_real_001.jpg'
            }
          ]
        }
      }
    };

    let updateResData = null;
    const updateRes = {
      status(code) { this.statusCode = code; return this; },
      json(data) { updateResData = data; return this; }
    };

    await invoiceController.updateInvoice(updateReq, updateRes);
    assert.strictEqual(updateRes.statusCode, 200);

    // Re-query the database directly to confirm persisted state
    const invoiceAfter = await Invoice.findById(invoiceBefore._id);
    assert.strictEqual(invoiceAfter.status, 'Payment Received');
    assert.strictEqual(invoiceAfter.isPaid, true);
    assert.strictEqual(invoiceAfter.invoiceType, 'TAX INVOICE');
    assert.strictEqual(invoiceAfter.paymentDetails.proof, 'https://staging-storage.techvaseegrah.com/proofs/pay_proof_real_001.jpg');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 7: WhatsApp Integration Contract Preservation (Mocked Send)
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: WhatsApp sending preserves exact contract without mutating invoice status in DB', async () => {
    // Look up persisted invoice for ORD-REAL-002 (unpaid)
    const unpaidInvoice = await Invoice.findOne({ externalOrderId: 'ORD-REAL-002' });
    assert.strictEqual(unpaidInvoice.isPaid, false);

    let whatsappCallRecord = null;
    const originalSend = whatsappService.sendWhatsApp;
    whatsappService.sendWhatsApp = async (subdomain, phone, options) => {
      whatsappCallRecord = { subdomain, phone, options };
      return { success: true, messageId: 'wa_staging_mock_002' };
    };

    try {
      const waReq = {
        params: { id: String(unpaidInvoice._id) },
        user: sampleAdminUser.toObject(),
        body: {
          pdfBase64: 'data:application/pdf;base64,JVBERi0xLjQK...',
          recipientPhone: '9876543210'
        },
        protocol: 'http',
        get: () => '127.0.0.1:5000'
      };

      let waResData = null;
      const waRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { waResData = data; return this; }
      };

      await invoiceController.sendInvoiceWhatsApp(waReq, waRes);

      assert.strictEqual(waRes.statusCode, 200);
      assert.strictEqual(waResData.whatsappSuccess, true);

      // Verify exact WhatsApp payload contract
      assert.strictEqual(whatsappCallRecord.phone, '919876543210');
      assert.strictEqual(whatsappCallRecord.options.templateName, 'tech_invoice_send');
      assert.strictEqual(whatsappCallRecord.options.components[1].parameters[1].text, 'TV000202');

      // Verify that invoice in database remains strictly unpaid
      const invoiceInDb = await Invoice.findById(unpaidInvoice._id);
      assert.strictEqual(invoiceInDb.status, 'Invoice');
      assert.strictEqual(invoiceInDb.isPaid, false);

    } finally {
      whatsappService.sendWhatsApp = originalSend;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 8: Cross-Tenant Request Rejection
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Cross-tenant request rejected with 403 without creating database records', async () => {
    const crossTenantReq = {
      user: { ...sampleAdminUser.toObject(), subdomain: 'tenant-intruder' },
      body: createSampleOrder('ORD-CROSS-001', 30000)
    };

    let crossResData = null;
    const crossRes = {
      status(code) { this.statusCode = code; return this; },
      json(data) { crossResData = data; return this; }
    };

    await jobIntakeController.handleOrderIntake(crossTenantReq, crossRes);

    assert.strictEqual(crossRes.statusCode, 403);
    const count = await JobIntake.countDocuments({ orderId: 'ORD-CROSS-001' });
    assert.strictEqual(count, 0, 'Zero database records may be created');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Real DB Test 9: Malformed Payload Rejection
  // ───────────────────────────────────────────────────────────────────────────
  await runTest('Real DB: Malformed payload rejected with 400 without creating database records', async () => {
    const malformedReq = {
      user: sampleAdminUser.toObject(),
      body: {
        orderId: 'ORD-BAD-001',
        subdomain: 'tech-vaseegrah',
        customer: { name: 'A' }, // min length 2 violation
        jobDetails: { title: 'T' },
        items: [] // min 1 item required
      }
    };

    let malformedResData = null;
    const malformedRes = {
      status(code) { this.statusCode = code; return this; },
      json(data) { malformedResData = data; return this; }
    };

    await jobIntakeController.handleOrderIntake(malformedReq, malformedRes);

    assert.strictEqual(malformedRes.statusCode, 400);
    const count = await JobIntake.countDocuments({ orderId: 'ORD-BAD-001' });
    assert.strictEqual(count, 0, 'Zero database records may be created');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup & Teardown
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nCleaning up and dropping isolated staging database...');
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log('================================================================');
  console.log(` Staging Real DB Tests Completed: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStagingAuditTests().catch(async (err) => {
  console.error('Fatal crash in staging real DB tests:', err);
  try {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  } catch (cleanErr) {}
  process.exit(1);
});
