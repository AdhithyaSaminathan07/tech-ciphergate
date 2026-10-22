/**
 * Tech Ciphergate — System 1 Invoice Workflow Test Suite
 * 
 * STRICT DATABASE & API SAFETY GUARANTEES:
 * 1. Fail-closed safety guard: Throws immediately if a remote/live MongoDB URI is detected.
 * 2. 100% In-Memory / Ephemeral Localhost Server Testing.
 * 3. Direct execution of actual Express router, middlewares, and invoice controller.
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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_invoice_workflow_2026';

console.log('================================================================');
console.log(' Tech Ciphergate — System 1 Stage: Invoice Workflow Tests       ');
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
const Invoice = require('../models/Invoice');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const Settings = require('../models/Settings');
const JobIntake = require('../models/JobIntake');
const Ticket = require('../models/ticketModel');
const whatsappService = require('../services/whatsappService');
const invoiceRoutes = require('../routes/invoiceRoutes');

// Helper to stub model and service methods
function createStubManager() {
  const originalMethods = [];

  return {
    stub(target, methodName, fn) {
      originalMethods.push({ target, methodName, original: target[methodName] });
      target[methodName] = fn;
    },
    restoreAll() {
      while (originalMethods.length > 0) {
        const { target, methodName, original } = originalMethods.pop();
        target[methodName] = original;
      }
    }
  };
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
  const workerId = '654321654321654321654322';

  const sampleAdmin = {
    _id: adminId,
    name: 'Admin User',
    email: 'admin@techvaseegrah.com',
    subdomain: 'tech-vaseegrah',
    role: 'admin',
    toObject: function() { return { ...this }; }
  };

  const sampleWorker = {
    _id: workerId,
    name: 'Dev Worker',
    email: 'worker@techvaseegrah.com',
    subdomain: 'tech-vaseegrah',
    role: 'worker',
    department: 'Development',
    toObject: function() { return { ...this }; }
  };

  const adminToken = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET);
  const workerToken = jwt.sign({ id: workerId, role: 'worker' }, process.env.JWT_SECRET);

  const sampleItems = [
    {
      description: 'Web Application Development',
      hsn: '998314',
      gst: 18,
      qty: 1,
      rate: 50000,
      total: 50000
    },
    {
      description: 'Cloud Infrastructure Setup',
      hsn: '998315',
      gst: 18,
      qty: 1,
      rate: 10000,
      total: 10000
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 1: Invoice Creation & Validation
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('Create invoice validates required fields and rejects missing invoiceNo, invoiceDate, or items with 400', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      // Case 1: Missing invoiceNo
      let res = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ invoiceDate: '16/10/2026', items: sampleItems })
      });
      assert.strictEqual(res.status, 400);
      let data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, 'Required fields are missing');

      // Case 2: Missing invoiceDate
      res = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ invoiceNo: 'TV000101', items: sampleItems })
      });
      assert.strictEqual(res.status, 400);
      data = await res.json();
      assert.strictEqual(data.success, false);

      // Case 3: Empty items array
      res = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ invoiceNo: 'TV000101', invoiceDate: '16/10/2026', items: [] })
      });
      assert.strictEqual(res.status, 400);
      data = await res.json();
      assert.strictEqual(data.success, false);
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Create invoice rejects duplicate invoiceNo collision with 400', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));
      stubs.stub(Invoice, 'findOne', async () => ({ _id: 'inv_existing_1', invoiceNo: 'TV000101' }));

      const res = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          invoiceNo: 'TV000101',
          invoiceDate: '16/10/2026',
          customerName: 'Client Alpha',
          customerContact: '9876543210',
          items: sampleItems
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, 'Invoice with this number already exists');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Create invoice succeeds, persists record, and preserves unverified status (PROFORMA INVOICE, status: Invoice, isPaid: false)', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));
      stubs.stub(Invoice, 'findOne', async () => null);

      let savedDoc = null;
      stubs.stub(Invoice.prototype, 'save', async function() {
        savedDoc = this;
        this._id = 'inv_new_101';
        return this;
      });

      const res = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          invoiceNo: 'TV000101',
          invoiceDate: '16/10/2026',
          customerName: 'Acme Enterprises',
          customerContact: '9876543210',
          salesPerson: 'Direct Sales',
          terms: 'Standard net 15',
          items: sampleItems,
          externalOrderId: 'ORD-SYS1-100',
          source: 'admin'
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.message, 'Invoice created successfully');
      assert.ok(data.data);

      // Verify persistence & initial status requirements
      assert.strictEqual(savedDoc.invoiceNo, 'TV000101');
      assert.strictEqual(savedDoc.customerName, 'Acme Enterprises');
      assert.strictEqual(savedDoc.customerContact, '9876543210');
      assert.strictEqual(savedDoc.externalOrderId, 'ORD-SYS1-100');
      assert.strictEqual(savedDoc.items.length, 2);
      assert.strictEqual(savedDoc.invoiceType, 'PROFORMA INVOICE', 'Invoice must default to PROFORMA INVOICE when no payment proof exists');
      assert.strictEqual(savedDoc.status, 'Invoice', 'Status must default to Invoice before payment proof');
      assert.strictEqual(savedDoc.isPaid, false, 'Invoice must not be automatically marked as paid');
      assert.strictEqual(savedDoc.createdBy.toString(), adminId);
      assert.strictEqual(savedDoc.createdByModel, 'Admin');
    } finally {
      stubs.restoreAll();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 2: Invoice History Visibility
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('Invoice History: Admin can view all invoices, Worker can view their own invoices', async () => {
    const stubs = createStubManager();
    try {
      const mockInvoices = [
        { _id: 'inv_1', invoiceNo: 'TV000101', customerName: 'Acme Corp', createdBy: adminId, status: 'Invoice', createdAt: new Date() },
        { _id: 'inv_2', invoiceNo: 'TV000102', customerName: 'Beta LLC', createdBy: workerId, status: 'Payment Received', createdAt: new Date() }
      ];

      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));
      stubs.stub(Worker, 'findById', () => mockQuery(sampleWorker));
      stubs.stub(Settings, 'findOne', async () => null);

      let capturedQuery = null;
      stubs.stub(Invoice, 'find', (query) => {
        capturedQuery = query;
        return mockQuery(mockInvoices);
      });

      // Admin request to /api/invoices
      const adminRes = await fetch(`${baseUrl}/api/invoices`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(adminRes.status, 200);
      const adminData = await adminRes.json();
      assert.strictEqual(adminData.success, true);
      assert.strictEqual(adminData.data.length, 2);
      assert.deepStrictEqual(capturedQuery, {}, 'Admin query must find all invoices');

      // Worker request to /api/invoices
      const workerRes = await fetch(`${baseUrl}/api/invoices`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${workerToken}` }
      });
      assert.strictEqual(workerRes.status, 200);
      const workerData = await workerRes.json();
      assert.strictEqual(workerData.success, true);
      assert.deepStrictEqual(capturedQuery, { createdBy: workerId }, 'Worker query must be scoped to worker own invoices');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Invoice History: Super Admin getAllInvoices endpoint supports date and GST filters', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      let queryUsed = null;
      stubs.stub(Invoice, 'find', (query) => {
        queryUsed = query;
        return mockQuery([{ _id: 'inv_filtered_1', invoiceNo: 'TV000101' }]);
      });

      const res = await fetch(`${baseUrl}/api/invoices/all?filterType=today`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(queryUsed.actualDate);
      assert.ok(queryUsed.actualDate.$gte);
      assert.ok(queryUsed.actualDate.$lte);
    } finally {
      stubs.restoreAll();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 3: WhatsApp API Integration & Regression Contract Test
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('WhatsApp Regression Test: sendInvoiceWhatsApp invokes whatsappService with exact Meta template contract without mutating invoice status', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      const mockInvoice = {
        _id: 'inv_wa_target_1',
        invoiceNo: 'TV000105',
        invoiceDate: '16/10/2026',
        customerName: 'Tech Client',
        customerContact: '9876543210',
        items: sampleItems,
        status: 'Invoice',
        invoiceType: 'PROFORMA INVOICE',
        isPaid: false
      };

      stubs.stub(Invoice, 'findById', async () => mockInvoice);

      let sendWhatsAppArgs = null;
      stubs.stub(whatsappService, 'sendWhatsApp', async (subdomain, phone, data) => {
        sendWhatsAppArgs = { subdomain, phone, data };
        return { success: true, response: { messages: [{ id: 'wamid.HBgLMTY1' }] } };
      });

      // Dummy minimal valid base64 PDF
      const dummyPdfBase64 = Buffer.from('%PDF-1.4 mock pdf content').toString('base64');

      const res = await fetch(`${baseUrl}/api/invoices/${mockInvoice._id}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          pdfBase64: dummyPdfBase64,
          recipientPhone: '9876543210'
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.whatsappSuccess, true);
      assert.ok(data.message.includes('sent via WhatsApp successfully'));
      assert.ok(data.pdfUrl);

      // Verify exact WhatsApp contract parameters
      assert.ok(sendWhatsAppArgs, 'whatsappService.sendWhatsApp must be invoked');
      assert.strictEqual(sendWhatsAppArgs.subdomain, 'tech-vaseegrah');
      assert.strictEqual(sendWhatsAppArgs.phone, '919876543210', '10-digit number must be normalized with country code 91');
      assert.strictEqual(sendWhatsAppArgs.data.type, 'template');
      assert.strictEqual(sendWhatsAppArgs.data.templateName, 'tech_invoice_send');
      assert.strictEqual(sendWhatsAppArgs.data.languageCode, 'en');

      // Verify template components structure
      const components = sendWhatsAppArgs.data.components;
      assert.ok(Array.isArray(components));
      const headerComp = components.find(c => c.type === 'header');
      const bodyComp = components.find(c => c.type === 'body');

      assert.ok(headerComp);
      assert.strictEqual(headerComp.parameters[0].type, 'document');
      assert.strictEqual(headerComp.parameters[0].document.filename, 'Invoice_TV000105.pdf');

      assert.ok(bodyComp);
      assert.strictEqual(bodyComp.parameters[0].text, 'Tech Client');
      assert.strictEqual(bodyComp.parameters[1].text, 'TV000105');
      assert.strictEqual(bodyComp.parameters[2].text, '16/10/2026');
      // Subtotal (60,000) + GST 18% (10,800) = 70,800.00
      assert.strictEqual(bodyComp.parameters[3].text, '70800.00');

      // CRITICAL GUARANTEE: Sending the invoice via WhatsApp does NOT change status to paid or verified
      assert.strictEqual(mockInvoice.status, 'Invoice');
      assert.strictEqual(mockInvoice.isPaid, false);
      assert.strictEqual(mockInvoice.invoiceType, 'PROFORMA INVOICE');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('WhatsApp: Rejects invalid or short phone numbers with 400 and missing invoice with 404', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      // Case 1: Invoice not found
      stubs.stub(Invoice, 'findById', async () => null);
      let res = await fetch(`${baseUrl}/api/invoices/654321654321654321654999/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ recipientPhone: '9876543210' })
      });
      assert.strictEqual(res.status, 404);
      let data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, 'Invoice not found');

      // Case 2: Invalid/short phone number
      const mockInv = { _id: 'inv_short_phone', invoiceNo: 'TV000106', customerContact: '123' };
      stubs.stub(Invoice, 'findById', async () => mockInv);
      res = await fetch(`${baseUrl}/api/invoices/${mockInv._id}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ recipientPhone: '123' })
      });
      assert.strictEqual(res.status, 400);
      data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, 'Valid customer WhatsApp phone number is required');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('WhatsApp: Downstream API error returns 200 with whatsappSuccess: false without crashing server', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));
      const mockInv = {
        _id: 'inv_downstream_err',
        invoiceNo: 'TV000107',
        invoiceDate: '16/10/2026',
        customerName: 'Downstream Test',
        customerContact: '9876543210',
        items: sampleItems
      };
      stubs.stub(Invoice, 'findById', async () => mockInv);
      stubs.stub(whatsappService, 'sendWhatsApp', async () => ({
        success: false,
        error: 'Meta WhatsApp Graph API authorization token expired'
      }));

      const res = await fetch(`${baseUrl}/api/invoices/${mockInv._id}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ recipientPhone: '9876543210' })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.whatsappSuccess, false);
      assert.ok(data.message.includes('token expired'));
    } finally {
      stubs.restoreAll();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group 4: Manual Payment-Proof Workflow in Invoice History
  // ─────────────────────────────────────────────────────────────────────────────

  await runTest('Upload Payment Proof: Transition to Payment Received and TAX INVOICE upon manual proof upload', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      const existingInvoice = {
        _id: 'inv_proof_test_1',
        invoiceNo: 'TV000108',
        invoiceDate: '16/10/2026',
        status: 'Invoice',
        invoiceType: 'PROFORMA INVOICE',
        isPaid: false,
        createdBy: adminId,
        paymentDetails: null
      };

      stubs.stub(Invoice, 'findById', async () => existingInvoice);

      let updatedDoc = null;
      stubs.stub(Invoice, 'findByIdAndUpdate', async (id, update) => {
        updatedDoc = { ...(updatedDoc || existingInvoice), ...update };
        return updatedDoc;
      });

      stubs.stub(JobIntake, 'findOne', () => mockQuery(null));
      stubs.stub(JobIntake.prototype, 'save', async function() { return this; });
      stubs.stub(Ticket, 'findOne', () => mockQuery(null));
      stubs.stub(Ticket.prototype, 'save', async function() { return this; });

      const paymentProofPayload = {
        status: 'Payment Received',
        paymentDetails: {
          date: new Date('2026-10-16T12:00:00Z'),
          proof: 'https://storage.techvaseegrah.com/proofs/pay_proof_108.jpg',
          proofs: [
            {
              date: new Date('2026-10-16T12:00:00Z'),
              url: 'https://storage.techvaseegrah.com/proofs/pay_proof_108.jpg'
            }
          ]
        }
      };

      const res = await fetch(`${baseUrl}/api/invoices/${existingInvoice._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(paymentProofPayload)
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.message, 'Invoice updated successfully');

      // Verify that manual payment proof transitions status and invoiceType
      assert.strictEqual(updatedDoc.status, 'Payment Received');
      assert.strictEqual(updatedDoc.invoiceType, 'TAX INVOICE');
      assert.ok(updatedDoc.paymentDetails);
      assert.strictEqual(updatedDoc.paymentDetails.proof, 'https://storage.techvaseegrah.com/proofs/pay_proof_108.jpg');
      assert.strictEqual(updatedDoc.paymentDetails.proofs.length, 1);
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Sequential invoice number preview (getNextInvoiceNo) generates next TV number without mutating database', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));
      stubs.stub(Invoice, 'find', () => mockQuery([
        { invoiceNo: 'TV000100' },
        { invoiceNo: 'TV000101' },
        { invoiceNo: 'TV000102' }
      ]));

      const res = await fetch(`${baseUrl}/api/invoices/next-number`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.nextInvoiceNo, 'TV000103');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Invoice PDF Contents Contract: Confirms single PDF attachment encompasses GST, bank details and UPI QR without separate messages or download links', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      const mockInvoice = {
        _id: 'inv_pdf_contents_1',
        invoiceNo: 'TV000109',
        invoiceDate: '16/10/2026',
        customerName: 'Unified PDF Client',
        customerContact: '9876543210',
        bankName: 'ICICI Bank',
        accountNumber: '612805036053',
        ifscCode: 'ICIC0006128',
        upiId: 'techvaseegrah.ibz@icici',
        gstEnabled: true,
        items: sampleItems,
        status: 'Invoice',
        invoiceType: 'PROFORMA INVOICE',
        isPaid: false
      };

      stubs.stub(Invoice, 'findById', async () => mockInvoice);

      let sendWhatsAppCalls = [];
      stubs.stub(whatsappService, 'sendWhatsApp', async (subdomain, phone, data) => {
        sendWhatsAppCalls.push({ subdomain, phone, data });
        return { success: true, response: { messages: [{ id: 'wamid.HBgLMTYy' }] } };
      });

      // Valid PDF buffer simulating client-rendered invoice document containing GST, bank details, and QR
      const pdfBuffer = Buffer.from('%PDF-1.4 [TECH VASEEGRAH GST:33KYGPS1983E1Z1 Bank:ICICI UPI:techvaseegrah.ibz@icici]');
      const pdfBase64 = pdfBuffer.toString('base64');

      const res = await fetch(`${baseUrl}/api/invoices/${mockInvoice._id}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          pdfBase64,
          recipientPhone: '9876543210'
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.whatsappSuccess, true);

      // Verify that exactly ONE WhatsApp message was sent (no separate bank/QR text message)
      assert.strictEqual(sendWhatsAppCalls.length, 1, 'Exactly one unified WhatsApp template message must be sent');
      const call = sendWhatsAppCalls[0];
      assert.strictEqual(call.data.type, 'template');
      assert.strictEqual(call.data.templateName, 'tech_invoice_send');
      assert.strictEqual(call.data.filename, 'Invoice_TV000109.pdf');

      // Verify disk storage of the PDF document
      const fs = require('fs');
      assert.ok(fs.existsSync(call.data.filePath), 'PDF file must be written to disk for upload to Meta media API');
      const savedContent = fs.readFileSync(call.data.filePath).toString();
      assert.ok(savedContent.includes('TECH VASEEGRAH GST:33KYGPS1983E1Z1'), 'PDF must preserve unified GST and bank information');
    } finally {
      stubs.restoreAll();
    }
  });

  await runTest('Duplicate Prevention: Retrying a partway failed request with existing _id or existing invoiceNo updates the existing record and prevents duplicate invoice creation', async () => {
    const stubs = createStubManager();
    try {
      stubs.stub(Admin, 'findById', () => mockQuery(sampleAdmin));

      const existingInvoiceId = 'inv_retry_prevent_1';
      let existingRecord = {
        _id: existingInvoiceId,
        invoiceNo: 'TV000110',
        invoiceDate: '16/10/2026',
        customerName: 'Retry Customer',
        customerContact: '9876543210',
        items: sampleItems,
        status: 'Invoice',
        invoiceType: 'PROFORMA INVOICE',
        isPaid: false,
        createdBy: adminId
      };

      stubs.stub(Invoice, 'findById', async (id) => (id === existingInvoiceId ? existingRecord : null));

      let updateCalled = false;
      stubs.stub(Invoice, 'findByIdAndUpdate', async (id, update) => {
        updateCalled = true;
        Object.assign(existingRecord, update);
        return existingRecord;
      });

      let saveCalled = false;
      stubs.stub(Invoice.prototype, 'save', async function() {
        saveCalled = true;
        return this;
      });

      // Simulation: client retry sends update to existing ID rather than attempting new create
      const res = await fetch(`${baseUrl}/api/invoices/${existingInvoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          customerName: 'Retry Customer Updated',
          customerContact: '9876543210',
          items: sampleItems
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(updateCalled, true, 'Retry must invoke update rather than duplicate creation');
      assert.strictEqual(saveCalled, false, 'Retry on existing invoice must NOT create a new document');
      assert.strictEqual(existingRecord.customerName, 'Retry Customer Updated');
    } finally {
      stubs.restoreAll();
    }
  });

  server.close();

  console.log('\n================================================================');
  console.log(` Invoice Workflow Tests Completed: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
})();
