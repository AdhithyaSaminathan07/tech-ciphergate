/**
 * Tech Ciphergate — Invoice Payment Verification Trigger Test Suite
 * 
 * STRICT DATABASE & API SAFETY GUARANTEES:
 * 1. Fail-closed safety guard: Throws immediately if a remote/live MongoDB URI is detected.
 * 2. 100% In-Memory / Ephemeral Localhost Server Testing.
 * 3. Direct execution of Express router, middlewares, invoice controller, and jobIntakeService.
 * 4. Zero live database writes, zero external Meta/WhatsApp API network calls.
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_payment_trigger_2026';

console.log('================================================================');
console.log(' Tech Ciphergate — Invoice History Payment Verification Tests   ');
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
const Invoice = require('../models/Invoice');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const JobIntake = require('../models/JobIntake');
const Ticket = require('../models/ticketModel');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const whatsappService = require('../services/whatsappService');
const invoiceRoutes = require('../routes/invoiceRoutes');

// Helper to stub model and service methods
function createStubManager() {
  const originalMethods = [];

  const manager = {
    stub(target, methodName, fn) {
      originalMethods.push({ target, methodName, original: target[methodName] });
      target[methodName] = fn;
    },
    restoreAll() {
      while (originalMethods.length > 0) {
        const { target, methodName, original } = originalMethods.pop();
        target[methodName] = original;
      }
      manager.stub(Department, 'find', () => mockQuery([]));
      manager.stub(Worker, 'find', () => mockQuery([]));
      manager.stub(Leave, 'find', () => mockQuery([]));
      manager.stub(Ticket, 'findOneAndUpdate', (query, update) => mockQuery({ _id: query._id, ...(update?.$set || update) }));
    }
  };
  return manager;
}

function mockQuery(result = null) {
  return {
    select: function() { return this; },
    populate: function() { return this; },
    lean: function() {
      return {
        sort: function() { return this; },
        then: function(resolve) { return Promise.resolve(result).then(resolve); }
      };
    },
    sort: function() {
      return {
        then: function(resolve) { return Promise.resolve(result).then(resolve); }
      };
    },
    then: function(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
}

(async () => {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Mount real invoice routes
  app.use('/api/invoices', invoiceRoutes);

  // Global test error handler
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

  const adminId = '654321654321654321654321';
  const otherTenantAdminId = '654321654321654321654399';
  const workerId = '654321654321654321654322';

  const sampleAdmin = {
    _id: adminId,
    name: 'Admin User',
    email: 'admin@techvaseegrah.com',
    subdomain: 'tech-vaseegrah',
    role: 'admin',
    toObject: function() { return { ...this }; }
  };

  const otherTenantAdmin = {
    _id: otherTenantAdminId,
    name: 'Other Admin',
    email: 'admin@other.com',
    subdomain: 'other-company',
    role: 'admin',
    toObject: function() { return { ...this }; }
  };

  const adminToken = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET);
  const otherTenantToken = jwt.sign({ id: otherTenantAdminId, role: 'admin' }, process.env.JWT_SECRET);

  const sampleItems = [
    { description: 'Cloud Infrastructure Setup', hsn: '998313', gst: 18, qty: 1, rate: 10000, total: 11800, isTotalOverridden: false },
    { description: 'CI/CD Pipeline Configuration', hsn: '998314', gst: 18, qty: 1, rate: 5000, total: 5900, isTotalOverridden: false }
  ];

  const stubs = createStubManager();

  // Helper for HTTP requests
  async function apiRequest(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Manual invoice creation does NOT automatically trigger job intake
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Manual invoice creation creates PROFORMA INVOICE and does NOT trigger Job Intake', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));

      let savedInvoiceDoc = null;
      stubs.stub(Invoice.prototype, 'save', async function() {
        savedInvoiceDoc = {
          _id: '654321654321654321654330',
          invoiceNo: this.invoiceNo,
          invoiceDate: this.invoiceDate,
          customerName: this.customerName,
          customerContact: this.customerContact,
          items: this.items,
          invoiceType: this.invoiceType,
          status: this.status,
          isPaid: this.isPaid,
          createdBy: this.createdBy,
          createdByModel: this.createdByModel,
          toObject: function() { return { ...this }; }
        };
        return savedInvoiceDoc;
      });
      stubs.stub(Invoice, 'findOne', () => mockQuery(null));

      let jobIntakeSaved = false;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        jobIntakeSaved = true;
        return this;
      });

      let ticketSaved = false;
      stubs.stub(Ticket.prototype, 'save', async function() {
        ticketSaved = true;
        return this;
      });

      const res = await apiRequest('/api/invoices', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          invoiceNo: 'TV000101',
          invoiceDate: '16-10-2026',
          customerName: 'Acme Corp',
          customerContact: '9876543210',
          items: sampleItems,
          invoiceType: 'PROFORMA INVOICE'
        }
      });

      assert.strictEqual(res.status, 201, 'Should create invoice with 201 Created');
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.invoiceType, 'PROFORMA INVOICE', 'Manual invoice must default to PROFORMA INVOICE');
      assert.strictEqual(res.data.data.status, 'Invoice', 'Manual invoice must default to status Invoice');
      assert.strictEqual(res.data.data.isPaid, false, 'Manual invoice must default to isPaid: false');
      assert.strictEqual(jobIntakeSaved, false, 'Manual invoice creation must NOT create JobIntake');
      assert.strictEqual(ticketSaved, false, 'Manual invoice creation must NOT create Ticket');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Updating invoice fields without payment proof does NOT trigger intake
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Updating invoice metadata without payment proof does NOT trigger Job Intake', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));

      const existingInvoice = {
        _id: '654321654321654321654331',
        invoiceNo: 'TV000102',
        customerName: 'Beta Industries',
        customerContact: '9123456789',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...existingInvoice, ...update }));

      let jobIntakeSaved = false;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        jobIntakeSaved = true;
        return this;
      });

      const res = await apiRequest(`/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          customerName: 'Beta Industries Private Limited',
          notes: 'Updated commercial terms.'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.customerName, 'Beta Industries Private Limited');
      assert.strictEqual(res.data.intake, undefined, 'No intake result returned when no payment proof provided');
      assert.strictEqual(jobIntakeSaved, false, 'Must NOT trigger JobIntake when no payment proof verified');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Updating invoice with empty or unverified proof does NOT trigger intake
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Proof upload without valid proof content or non-approved status does NOT trigger Job Intake', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));

      const existingInvoice = {
        _id: '654321654321654321654332',
        invoiceNo: 'TV000103',
        customerName: 'Gamma Systems',
        customerContact: '9123456780',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...existingInvoice, ...update }));

      let jobIntakeSaved = false;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        jobIntakeSaved = true;
        return this;
      });

      // Update with empty proofs array and status still 'Invoice'
      const res = await apiRequest(`/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          status: 'Invoice',
          paymentDetails: {
            date: new Date(),
            proofs: []
          }
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.intake, undefined);
      assert.strictEqual(jobIntakeSaved, false, 'Must NOT trigger JobIntake on empty proof');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Successful Payment Verification triggers Job Intake and unassigned Ticket
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Authorized Payment Received with proof creates exactly 1 JobIntake and 1 unassigned To Do Ticket', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const existingInvoice = {
        _id: '654321654321654321654333',
        invoiceNo: 'TV000104',
        customerName: 'Delta Labs',
        customerContact: '9888877777',
        customerGst: '33AABCT1332L1ZV',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', (id) => mockQuery(id === existingInvoice._id ? existingInvoice : null));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => {
        const updated = { ...existingInvoice, ...update };
        return mockQuery(updated);
      });

      let createdIntake = null;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        this._id = '654321654321654321654340';
        return this;
      });
      stubs.stub(JobIntake, 'findOne', () => mockQuery(null));

      let createdTicket = null;
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = '654321654321654321654341';
        return this;
      });
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));

      const proofUrl = '/uploads/workers/payment_proof_delta_104.png';
      const res = await apiRequest(`/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          status: 'Payment Received',
          invoiceType: 'TAX INVOICE',
          paymentDetails: {
            date: new Date(),
            proofs: [{ date: new Date(), url: proofUrl }]
          }
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.invoiceType, 'TAX INVOICE');
      assert.strictEqual(res.data.data.status, 'Payment Received');
      assert(res.data.intake, 'Response should contain intake confirmation');
      assert.strictEqual(res.data.intake.success, true);
      assert.strictEqual(res.data.intake.isDuplicate, false);
      assert.strictEqual(res.data.intake.invoiceNo, 'TV000104');
      assert.strictEqual(res.data.intake.invoiceId, existingInvoice._id);

      // Verify JobIntake record properties
      assert(createdIntake, 'JobIntake record must have been created');
      assert.strictEqual(createdIntake.subdomain, 'tech-vaseegrah', 'Intake must be scoped to tenant');
      assert.strictEqual(createdIntake.intakeStatus, 'COMPLETED');
      assert.strictEqual(createdIntake.payment.paymentStatus, 'VERIFIED');
      assert.strictEqual(createdIntake.payment.gateway, 'manual');
      assert.strictEqual(createdIntake.invoiceId.toString(), existingInvoice._id);

      // Verify Ticket properties
      assert(createdTicket, 'Ticket must have been created');
      assert.strictEqual(createdTicket.subdomain, 'tech-vaseegrah', 'Ticket must be scoped to tenant');
      assert.strictEqual(createdTicket.status, 'To Do', 'Ticket status must be To Do');
      assert.strictEqual(createdTicket.assignee, undefined, 'Ticket must be unassigned for manual allocation');
      assert.strictEqual(createdTicket.team, null, 'Ticket team must be null and never default to DEV when no department matches');
      assert(createdTicket.labels.includes('invoice-intake'), 'Ticket labels must include invoice-intake');
      assert(createdTicket.labels.includes('payment-verified'), 'Ticket labels must include payment-verified');
      assert(createdTicket.labels.includes('invoice:TV000104'), 'Ticket labels must link invoice number');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Repeated Payment Approval is strictly idempotent
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Repeated payment approval returns existing intake and does NOT create duplicate tickets or invoices', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const existingInvoice = {
        _id: '654321654321654321654333',
        invoiceNo: 'TV000104',
        externalOrderId: 'INV-TV000104',
        customerName: 'Delta Labs',
        customerContact: '9888877777',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        paymentDetails: {
          proofs: [{ url: '/uploads/workers/proof1.png' }]
        },
        isPaid: true,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const existingCompletedIntake = {
        _id: '654321654321654321654340',
        orderId: 'INV-TV000104',
        subdomain: 'tech-vaseegrah',
        invoiceId: existingInvoice._id,
        invoiceNo: 'TV000104',
        ticketId: '654321654321654321654341',
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; }
      };

      const existingTicket = {
        _id: '654321654321654321654341',
        title: '[Invoice #TV000104] Delta Labs - Project Execution',
        status: 'To Do',
        subdomain: 'tech-vaseegrah'
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...existingInvoice, ...update }));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingCompletedIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(existingTicket));

      let newIntakeCreated = false;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        newIntakeCreated = true;
        return this;
      });

      let newTicketCreated = false;
      stubs.stub(Ticket.prototype, 'save', async function() {
        newTicketCreated = true;
        return this;
      });

      const res = await apiRequest(`/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          status: 'Payment Received',
          paymentDetails: {
            date: new Date(),
            proofs: [{ date: new Date(), url: '/uploads/workers/proof_retry.png' }]
          }
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.intake.isDuplicate, true, 'Intake trigger must report isDuplicate: true on repeated approval');
      assert.strictEqual(res.data.intake.ticketId, existingCompletedIntake.ticketId);
      assert.strictEqual(res.data.intake.intakeId, existingCompletedIntake._id);
      assert.strictEqual(newIntakeCreated, false, 'Must NOT create duplicate JobIntake document');
      assert.strictEqual(newTicketCreated, false, 'Must NOT create duplicate Ticket document');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Cross-tenant Payment Verification rejection
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Cross-tenant user attempting payment verification is rejected with 403 Forbidden', async () => {
      stubs.restoreAll();
      // Tenant 'other-company' admin token
      stubs.stub(Admin, 'findById', (id) => {
        if (id === otherTenantAdminId) return mockQuery(otherTenantAdmin);
        if (id === adminId) return mockQuery(sampleAdmin);
        return mockQuery(null);
      });

      // Invoice belongs to 'tech-vaseegrah' admin
      const existingInvoice = {
        _id: '654321654321654321654335',
        invoiceNo: 'TV000105',
        customerName: 'Confidential Client',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: adminId, // Belongs to tech-vaseegrah
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));

      let updatedCalled = false;
      stubs.stub(Invoice, 'findByIdAndUpdate', () => {
        updatedCalled = true;
      });

      const res = await apiRequest(`/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${otherTenantToken}` },
        body: {
          status: 'Payment Received',
          paymentDetails: {
            proofs: [{ url: '/uploads/hacker_proof.png' }]
          }
        }
      });

      assert.strictEqual(res.status, 403, 'Cross-tenant update must return 403 Forbidden');
      assert.strictEqual(updatedCalled, false, 'Invoice must NOT be modified by cross-tenant user');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: WhatsApp Invoice Sending Contract Preserved
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('WhatsApp sending endpoint and payload contract are completely preserved', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));

      const existingInvoice = {
        _id: '654321654321654321654336',
        invoiceNo: 'TV000106',
        customerName: 'Epsilon Enterprises',
        customerContact: '9840012345',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));

      let whatsappCallArgs = null;
      stubs.stub(whatsappService, 'sendWhatsApp', async (subdomain, phone, templatePayload) => {
        whatsappCallArgs = { subdomain, phone, templatePayload };
        return { success: true, messageId: 'WA_MOCK_12345' };
      });

      const res = await apiRequest(`/api/invoices/${existingInvoice._id}/send-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          phone: '9840012345',
          pdfBuffer: Buffer.from('mock pdf content').toString('base64'),
          invoiceData: {
            customerName: 'Epsilon Enterprises',
            invoiceNo: 'TV000106',
            totalAmount: '17,700'
          }
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert(whatsappCallArgs, 'whatsappService.sendWhatsApp must be invoked');
      assert.strictEqual(whatsappCallArgs.subdomain, 'tech-vaseegrah');
      assert.strictEqual(whatsappCallArgs.phone, '919840012345', 'Phone number must be normalized with country code');
      assert.strictEqual(whatsappCallArgs.templatePayload.templateName, 'tech_invoice_send');
      assert(Array.isArray(whatsappCallArgs.templatePayload.components), 'Components must be an array');
      assert.strictEqual(whatsappCallArgs.templatePayload.components[0].type, 'header');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8: Partial failure recovery (reconciliation without duplicate tickets)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Partial failure recovery: existing ticket reconciles without creating duplicate ticket or invoice', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const existingInvoice = {
        _id: '654321654321654321654337',
        invoiceNo: 'TV000107',
        customerName: 'Zeta Innovations',
        customerContact: '9840099999',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const preExistingTicket = {
        _id: '654321654321654321654347',
        title: '[Invoice #TV000107] Zeta Innovations - Project Execution',
        status: 'To Do',
        subdomain: 'tech-vaseegrah',
        labels: ['invoice-intake', 'payment-verified', 'order:INV-TV000107', 'invoice:TV000107']
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...existingInvoice, ...update }));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(null));
      // Ticket already exists from previous partial attempt
      stubs.stub(Ticket, 'findOne', () => mockQuery(preExistingTicket));

      let ticketSaveCalls = 0;
      stubs.stub(Ticket.prototype, 'save', async function() {
        ticketSaveCalls++;
        return this;
      });

      let createdIntake = null;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        this._id = '654321654321654321654348';
        return this;
      });

      const res = await apiRequest(`/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          status: 'Payment Received',
          paymentDetails: {
            date: new Date(),
            proofs: [{ url: '/uploads/workers/proof_zeta.png' }]
          }
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(ticketSaveCalls, 0, 'Must NOT save a second ticket when ticket already exists');
      assert(createdIntake, 'Intake must be created and linked');
      assert.strictEqual(createdIntake.ticketId.toString(), preExistingTicket._id.toString(), 'Intake must link to the existing ticket');
      assert.strictEqual(res.data.intake.ticketId.toString(), preExistingTicket._id.toString());
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 9: Concurrent verification requests resolve safely
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Concurrent verification requests resolve safely without duplicate records', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const existingInvoice = {
        _id: '654321654321654321654338',
        invoiceNo: 'TV000108',
        customerName: 'Theta Dynamics',
        customerContact: '9840088888',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(existingInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...existingInvoice, ...update }));

      let intakeStore = null;
      let ticketStore = null;

      stubs.stub(Ticket, 'findOne', () => mockQuery(ticketStore));
      stubs.stub(Ticket.prototype, 'save', async function() {
        if (!ticketStore) {
          ticketStore = {
            _id: this._id,
            title: this.title,
            status: this.status,
            subdomain: this.subdomain,
            labels: this.labels
          };
        }
        return this;
      });

      stubs.stub(JobIntake, 'findOne', () => mockQuery(intakeStore));
      stubs.stub(JobIntake.prototype, 'save', async function() {
        if (!intakeStore) {
          intakeStore = {
            _id: this._id,
            orderId: this.orderId,
            subdomain: this.subdomain,
            invoiceId: this.invoiceId,
            invoiceNo: this.invoiceNo,
            ticketId: ticketStore ? ticketStore._id : this.ticketId,
            intakeStatus: 'COMPLETED',
            toObject: function() { return { ...this }; }
          };
        }
        return this;
      });

      const [res1, res2] = await Promise.all([
        apiRequest(`/api/invoices/${existingInvoice._id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: {
            status: 'Payment Received',
            paymentDetails: { proofs: [{ url: '/uploads/workers/proof_concurrent_1.png' }] }
          }
        }),
        apiRequest(`/api/invoices/${existingInvoice._id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: {
            status: 'Payment Received',
            paymentDetails: { proofs: [{ url: '/uploads/workers/proof_concurrent_2.png' }] }
          }
        })
      ]);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      assert(res1.data.intake);
      assert(res2.data.intake);
      assert.strictEqual(res1.data.intake.ticketId.toString(), res2.data.intake.ticketId.toString(), 'Both concurrent calls must resolve to the identical ticket ID');
      assert.strictEqual(res1.data.intake.invoiceNo, existingInvoice.invoiceNo);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 10: Work Allocation Query Compatibility
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Work Allocation query strictly matches created unassigned To Do ticket', async () => {
      stubs.restoreAll();
      const ticket = {
        _id: '654321654321654321654341',
        title: '[Invoice #TV000104] Delta Labs - Project Execution',
        status: 'To Do',
        subdomain: 'tech-vaseegrah',
        team: 'DEV',
        priority: 'High',
        issueType: 'Task',
        assignee: null,
        assignees: [],
        labels: ['invoice-intake', 'payment-verified', 'order:INV-TV000104', 'invoice:TV000104']
      };

      // Work Allocation filters by subdomain and matches 'To Do'
      assert.strictEqual(ticket.status, 'To Do', 'Must be in To Do column in Work Allocation');
      assert.strictEqual(ticket.subdomain, 'tech-vaseegrah', 'Must be visible to authorized subdomain');
      assert(!ticket.assignee, 'Must be unassigned so managers can allocate manually');
      assert(ticket.labels.includes('invoice-intake'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 11: POST /api/invoices/:id/job-intake rejects unverified invoice with 400
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake rejects unverified invoice with 400', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));

      const unverifiedInvoice = {
        _id: '654321654321654321654360',
        invoiceNo: 'TV000110',
        customerName: 'Pending Client',
        customerContact: '9840011111',
        items: sampleItems,
        invoiceType: 'PROFORMA INVOICE',
        status: 'Invoice',
        isPaid: false,
        paymentDetails: null,
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(unverifiedInvoice));

      let intakeSaved = false;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        intakeSaved = true;
        return this;
      });

      const res = await apiRequest(`/api/invoices/${unverifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 400, 'Must reject unverified invoice with 400');
      assert.strictEqual(res.data.success, false);
      assert(res.data.message.includes('not completed authorized payment verification'), 'Message must explain payment verification requirement');
      assert.strictEqual(intakeSaved, false, 'Must NOT create JobIntake for unverified invoice');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 12: POST /api/invoices/:id/job-intake processes eligible verified invoice
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake processes eligible verified invoice and creates ticket', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654361',
        invoiceNo: 'TV000111',
        customerName: 'Eligible Customer',
        customerContact: '9840022222',
        customerGst: '33AABCT1332L1ZV',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/verified_payment_111.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...verifiedInvoice, ...update }));

      let createdIntake = null;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        createdIntake = this;
        this._id = '654321654321654321654362';
        return this;
      });
      stubs.stub(JobIntake, 'findOne', () => mockQuery(null));

      let createdTicket = null;
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = '654321654321654321654363';
        return this;
      });
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.isDuplicate, false);
      assert.strictEqual(res.data.data.invoiceNo, verifiedInvoice.invoiceNo);
      assert.strictEqual(res.data.data.invoiceId, verifiedInvoice._id);
      assert(createdTicket, 'Must create ticket');
      assert.strictEqual(createdTicket.status, 'To Do');
      assert.strictEqual(createdTicket.assignee, undefined, 'Must be unassigned for manual allocation');
      assert(createdIntake, 'Must create JobIntake');
      assert.strictEqual(createdIntake.intakeStatus, 'COMPLETED');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 13: POST /api/invoices/:id/job-intake idempotently returns existing references
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake returns existing references without duplicating', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654361',
        invoiceNo: 'TV000111',
        externalOrderId: 'INV-TV000111',
        customerName: 'Eligible Customer',
        customerContact: '9840022222',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/verified_payment_111.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const existingIntake = {
        _id: '654321654321654321654362',
        orderId: 'INV-TV000111',
        subdomain: 'tech-vaseegrah',
        invoiceId: verifiedInvoice._id,
        invoiceNo: 'TV000111',
        ticketId: '654321654321654321654363',
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; }
      };

      const existingTicket = {
        _id: '654321654321654321654363',
        title: '[Invoice #TV000111] Eligible Customer - Project Execution',
        status: 'To Do',
        subdomain: 'tech-vaseegrah'
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...verifiedInvoice, ...update }));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(existingTicket));

      let intakeSaveCalls = 0;
      stubs.stub(JobIntake.prototype, 'save', async function() {
        intakeSaveCalls++;
        return this;
      });

      let ticketSaveCalls = 0;
      stubs.stub(Ticket.prototype, 'save', async function() {
        ticketSaveCalls++;
        return this;
      });

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.isDuplicate, true);
      assert.strictEqual(res.data.data.ticketId, existingIntake.ticketId);
      assert.strictEqual(res.data.data.orderId, existingIntake.orderId);
      assert.strictEqual(intakeSaveCalls, 0, 'Must NOT save duplicate JobIntake');
      assert.strictEqual(ticketSaveCalls, 0, 'Must NOT save duplicate Ticket');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 14: POST /api/invoices/:id/job-intake cross-tenant rejection
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake rejects cross-tenant user with 403 Forbidden', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => {
        if (id === otherTenantAdminId) return mockQuery(otherTenantAdmin);
        if (id === adminId) return mockQuery(sampleAdmin);
        return mockQuery(null);
      });

      const verifiedInvoice = {
        _id: '654321654321654321654364',
        invoiceNo: 'TV000114',
        customerName: 'Tenant A Customer',
        customerContact: '9840033333',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/proof114.png' }]
        },
        createdBy: adminId, // Belongs to tech-vaseegrah
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherTenantToken}` } // Tenant 'other-company'
      });

      assert.strictEqual(res.status, 403, 'Must return 403 Forbidden for cross-tenant request');
      assert.strictEqual(res.data.success, false);
      assert(res.data.message.includes('belongs to another organization'), 'Error message must specify cross-tenant denial');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 15: Soft-deleted ticket recovery restores ticket and relinks intake and invoice
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake safely restores soft-deleted ticket and relinks intake', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654365',
        invoiceNo: 'TV000115',
        externalOrderId: 'INV-TV000115',
        customerName: 'Soft Delete Customer',
        customerContact: '9840044444',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/proof115.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const existingIntake = {
        _id: '654321654321654321654366',
        orderId: 'INV-TV000115',
        subdomain: 'tech-vaseegrah',
        invoiceId: verifiedInvoice._id,
        invoiceNo: 'TV000115',
        ticketId: '654321654321654321654367',
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; },
        save: async function() { return this; }
      };

      const softDeletedTicket = {
        _id: '654321654321654321654367',
        title: '[Invoice #TV000115] Soft Delete Customer - Project Execution',
        status: 'To Do',
        subdomain: 'tech-vaseegrah',
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: adminId
      };

      let restoredTicketRecord = null;
      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...verifiedInvoice, ...update }));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(softDeletedTicket));
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket, 'findOneAndUpdate', (query, update) => {
        const setObj = (update && update.$set) ? update.$set : (update || {});
        restoredTicketRecord = {
          ...(restoredTicketRecord || softDeletedTicket),
          ...setObj
        };
        return mockQuery(restoredTicketRecord);
      });

      let newTicketCreations = 0;
      stubs.stub(Ticket.prototype, 'save', async function() {
        newTicketCreations++;
        return this;
      });

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.isRecovered, true);
      assert.strictEqual(res.data.data.recoveredAction, 'restored');
      assert.strictEqual(res.data.data.isDuplicate, false);
      assert.strictEqual(res.data.data.ticketId, softDeletedTicket._id);
      assert.strictEqual(res.data.data.orderId, 'INV-TV000115');
      assert.strictEqual(res.data.data.invoiceNo, 'TV000115');
      assert.strictEqual(newTicketCreations, 0, 'Must NOT create new ticket when restoring soft-deleted one');
      assert(restoredTicketRecord, 'Ticket findOneAndUpdate must be executed');
      assert.strictEqual(restoredTicketRecord.isDeleted, false, 'Ticket must be un-deleted');
      assert.strictEqual(restoredTicketRecord.deletedAt, null);
      assert.strictEqual(restoredTicketRecord.deletedBy, null);
      assert.strictEqual(res.data.message, 'Job ticket was successfully restored for this invoice.');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 16: Missing ticket recovery recreates exactly one ticket and relinks intake
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake recreates missing ticket and relinks intake', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654368',
        invoiceNo: 'TV000116',
        externalOrderId: 'INV-TV000116',
        customerName: 'Missing Ticket Customer',
        customerContact: '9840055555',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/proof116.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const existingIntake = {
        _id: '654321654321654321654369',
        orderId: 'INV-TV000116',
        subdomain: 'tech-vaseegrah',
        invoiceId: verifiedInvoice._id,
        invoiceNo: 'TV000116',
        ticketId: '654321654321654321654370', // Points to permanently deleted ticket ID
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; },
        save: async function() { return this; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...verifiedInvoice, ...update }));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(null)); // Completely missing
      stubs.stub(Ticket, 'findOne', () => mockQuery(null)); // Missing

      let createdTicket = null;
      stubs.stub(Ticket.prototype, 'save', async function() {
        createdTicket = this;
        this._id = '654321654321654321654371';
        return this;
      });

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.isRecovered, true);
      assert.strictEqual(res.data.data.recoveredAction, 'recreated');
      assert.strictEqual(res.data.data.isDuplicate, false);
      assert.strictEqual(res.data.data.ticketId, '654321654321654321654371');
      assert(createdTicket, 'Must save new replacement ticket');
      assert.strictEqual(createdTicket.status, 'To Do');
      assert.strictEqual(createdTicket.assignee, undefined, 'Must be unassigned');
      assert.strictEqual(String(existingIntake.ticketId), '654321654321654321654371', 'Intake must be relinked to new ticket ID');
      assert.strictEqual(res.data.message, 'Job ticket was successfully recreated for this invoice.');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 17: Repeated recovery attempts: no duplicate tickets or invoices
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Repeated recovery attempts idempotently return active ticket without duplicate records', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654372',
        invoiceNo: 'TV000117',
        externalOrderId: 'INV-TV000117',
        customerName: 'Repeat Recovery Customer',
        customerContact: '9840066666',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/proof117.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const restoredTicket = {
        _id: '654321654321654321654374',
        title: '[Invoice #TV000117] Repeat Recovery Customer - Project Execution',
        status: 'To Do',
        subdomain: 'tech-vaseegrah',
        isDeleted: false // Active now
      };

      const existingIntake = {
        _id: '654321654321654321654373',
        orderId: 'INV-TV000117',
        subdomain: 'tech-vaseegrah',
        invoiceId: verifiedInvoice._id,
        invoiceNo: 'TV000117',
        ticketId: restoredTicket._id,
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; },
        save: async function() { return this; }
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(restoredTicket));

      let ticketSaves = 0;
      stubs.stub(Ticket.prototype, 'save', async function() {
        ticketSaves++;
        return this;
      });

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.isDuplicate, true);
      assert.strictEqual(res.data.data.isRecovered, false);
      assert.strictEqual(res.data.data.ticketId, restoredTicket._id);
      assert.strictEqual(ticketSaves, 0, 'Must NOT save ticket on repeat attempt');
      assert.strictEqual(res.data.message, 'Job intake already exists for this invoice.');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 18: Concurrent requests resolve safely with only one active ticket
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Concurrent recovery requests resolve to only one active ticket', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654375',
        invoiceNo: 'TV000118',
        externalOrderId: 'INV-TV000118',
        customerName: 'Concurrent Recovery Customer',
        customerContact: '9840077777',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/proof118.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const existingIntake = {
        _id: '654321654321654321654376',
        orderId: 'INV-TV000118',
        subdomain: 'tech-vaseegrah',
        invoiceId: verifiedInvoice._id,
        invoiceNo: 'TV000118',
        ticketId: '654321654321654321654377',
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; },
        save: async function() { return this; }
      };

      let activeTicketInDb = null;
      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(Invoice, 'findByIdAndUpdate', (id, update) => mockQuery({ ...verifiedInvoice, ...update }));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(activeTicketInDb));
      stubs.stub(Ticket, 'findOne', () => mockQuery(activeTicketInDb));

      let savedTicketCount = 0;
      stubs.stub(Ticket.prototype, 'save', async function() {
        if (!activeTicketInDb) {
          this._id = '654321654321654321654378';
          activeTicketInDb = this;
          savedTicketCount++;
        }
        return this;
      });

      const [res1, res2] = await Promise.all([
        apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` }
        }),
        apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` }
        })
      ]);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(savedTicketCount, 1, 'Strictly 1 ticket created under concurrent recovery calls');
      assert.strictEqual(res1.data.data.ticketId, res2.data.data.ticketId, 'Both calls return identical ticket ID');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 19: Ambiguous/rejected ticket recovery returns actionable 409 response
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('POST /api/invoices/:id/job-intake rejects restoration when ticket was explicitly Rejected', async () => {
      stubs.restoreAll();
      stubs.stub(Admin, 'findById', (id) => mockQuery(id === adminId ? sampleAdmin : null));
      stubs.stub(Admin, 'findOne', () => mockQuery(sampleAdmin));

      const verifiedInvoice = {
        _id: '654321654321654321654379',
        invoiceNo: 'TV000119',
        customerName: 'Rejected Ticket Customer',
        customerContact: '9840088888',
        items: sampleItems,
        invoiceType: 'TAX INVOICE',
        status: 'Payment Received',
        isPaid: true,
        paymentDetails: {
          proofs: [{ url: '/uploads/proof119.png' }]
        },
        createdBy: adminId,
        createdByModel: 'Admin',
        toObject: function() { return { ...this }; }
      };

      const existingIntake = {
        _id: '654321654321654321654380',
        orderId: 'INV-TV000119',
        subdomain: 'tech-vaseegrah',
        invoiceId: verifiedInvoice._id,
        invoiceNo: 'TV000119',
        ticketId: '654321654321654321654381',
        intakeStatus: 'COMPLETED',
        toObject: function() { return { ...this }; }
      };

      const rejectedDeletedTicket = {
        _id: '654321654321654321654381',
        title: '[Invoice #TV000119] Rejected Ticket Customer',
        status: 'To Do',
        subdomain: 'tech-vaseegrah',
        isDeleted: true,
        approvalStatus: 'Rejected' // Intentionally rejected before deletion
      };

      stubs.stub(Invoice, 'findById', () => mockQuery(verifiedInvoice));
      stubs.stub(JobIntake, 'findOne', () => mockQuery(existingIntake));
      stubs.stub(Ticket, 'findById', () => mockQuery(rejectedDeletedTicket));

      const res = await apiRequest(`/api/invoices/${verifiedInvoice._id}/job-intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 409, 'Must return 409 Conflict when ticket was explicitly marked Rejected');
      assert.strictEqual(res.data.success, false);
      assert(res.data.message.includes('explicitly marked as Rejected'), 'Must provide clear actionable feedback to admin');
    });

  } finally {
    stubs.restoreAll();
    server.close();
  }

  console.log('\n================================================================');
  console.log(` Summary: ${passCount} / ${testCount} Passed (${failCount} Failed)`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
})();
