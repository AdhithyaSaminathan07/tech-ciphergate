/**
 * System Test Suite: Workspace Definition — Project Scope Only & PII Stripping
 * 
 * Verifies:
 * 1. Invoice with customer details & commercial line items generates developer description with SCOPE ONLY.
 * 2. No customer name, phone, address, GSTIN, amount, rate, or payment status in ticket description.
 * 3. Line item such as 'vasee grah-Website-Update' is displayed cleanly without invented requirements.
 * 4. When no scope or line items exist, provides 'Detailed project requirements have not been provided yet.'
 * 5. When customer notes are provided, they are preserved under '### Project Overview'.
 * 6. Different invoices for the same customer create separate jobs with independent scope descriptions.
 * 7. Editing description persists and does not clear checklist, subtasks, or assignments.
 * 
 * STRICT DATABASE SAFETY GUARANTEES:
 * 1. Executes ONLY on local loopback test database (127.0.0.1:27017).
 * 2. Fail-closed: Throws immediately if remote/production URI detected.
 * 3. Drops and cleans up the ephemeral test database after execution.
 * 4. Zero external network calls.
 */

const assert = require('assert');
const mongoose = require('mongoose');

const LOCAL_STAGING_URI = 'mongodb://127.0.0.1:27017/tech_ciphergate_scope_only_test';

function assertSafeEnvironment(uri) {
  if (!uri.startsWith('mongodb://127.0.0.1:27017/') && !uri.startsWith('mongodb://localhost:27017/')) {
    throw new Error(`CRITICAL SAFETY ABORT: Attempted to run tests against non-local host: ${uri}`);
  }
  if (uri.includes('mongodb.net') || uri.includes('cluster') || uri.includes('production') || uri.includes('live')) {
    throw new Error('CRITICAL SAFETY ABORT: Live or cluster database keyword detected in URI!');
  }
}
assertSafeEnvironment(LOCAL_STAGING_URI);

console.log('================================================================');
console.log(' Tech Ciphergate — Workspace Definition Scope Only Test Suite  ');
console.log(` Target DB: ${LOCAL_STAGING_URI}`);
console.log('================================================================\n');

let testCount = 0;
let passCount = 0;

const Worker = require('../models/Worker');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/Admin');
const Department = require('../models/Department');
const Invoice = require('../models/Invoice');
const JobIntake = require('../models/JobIntake');
const { processJobIntakeFromVerifiedInvoice } = require('../services/jobIntakeService');
const { updateTicket } = require('../controllers/ticketController');

async function runTest(testName, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✓ [PASS] Test ${testCount}: ${testName}`);
  } catch (err) {
    console.error(`✗ [FAIL] Test ${testCount}: ${testName}`);
    console.error(err);
    throw err;
  }
}

async function main() {
  await mongoose.connect(LOCAL_STAGING_URI);
  await mongoose.connection.dropDatabase();

  try {
    const admin = await Admin.create({
      name: 'Super Admin',
      username: 'admin_scope_test',
      email: 'admin_scope@test.com',
      password: 'AdminPassword123!',
      role: 'admin',
      subdomain: 'tenant-scope'
    });

    const webDept = await Department.create({
      name: 'Web Development',
      subdomain: 'tenant-scope',
      teamSize: 3,
      isSpecialized: true,
      serviceKeywords: ['website', 'web development', 'frontend', 'update']
    });

    const dev = await Worker.create({
      name: 'Dev Tester',
      username: 'dev_tester',
      rfid: 'RFID_TEST_101',
      subdomain: 'tenant-scope',
      password: 'Password123!',
      status: 'Active',
      role: 'developer',
      designation: 'Frontend Engineer',
      department: webDept._id
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Single line item 'vasee grah-Website-Update' produces clean scope only
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Invoice generates developer description with SCOPE ONLY (no customer PII or commercial data)', async () => {
      const invoice = await Invoice.create({
        invoiceNo: 'INV-2026-901',
        invoiceDate: '22/10/2026',
        customerName: 'vasee grah',
        customerContact: '9876543210',
        customerEmail: 'vasee@example.com',
        customerAddress: '123 Anna Salai, Chennai, TN',
        customerGst: '33AAAAA1234A1Z5',
        subdomain: 'tenant-scope',
        date: new Date(),
        dueDate: '29/10/2026',
        status: 'Payment Received',
        paymentStatus: 'Payment Received',
        paymentMethod: 'UPI',
        totalAmount: 25000,
        subTotal: 25000,
        taxAmount: 0,
        items: [
          {
            description: 'vasee grah-Website-Update',
            hsn: '998314',
            qty: 1,
            rate: 25000,
            gst: 0,
            total: 25000
          }
        ],
        createdBy: admin._id,
        createdByModel: 'Admin'
      });

      const result = await processJobIntakeFromVerifiedInvoice({
        invoice,
        subdomain: 'tenant-scope',
        adminUser: admin
      });

      assert.ok(result.ticketId);
      const ticket = await Ticket.findById(result.ticketId).lean();

      // Must contain actual scope
      assert.ok(ticket.description.includes('vasee grah-Website-Update'));
      assert.ok(ticket.description.includes('### Scope of Work'));

      // MUST NOT contain customer PII or commercial details
      assert.ok(!ticket.description.includes('### Customer Information'));
      assert.ok(!ticket.description.includes('### Commercial Details'));
      assert.ok(!ticket.description.includes('9876543210'));
      assert.ok(!ticket.description.includes('vasee@example.com'));
      assert.ok(!ticket.description.includes('Chennai'));
      assert.ok(!ticket.description.includes('33AAAAA1234A1Z5'));
      assert.ok(!ticket.description.includes('INR 25,000'));
      assert.ok(!ticket.description.includes('Qty: 1'));
      assert.ok(!ticket.description.includes('Rate: ₹25000'));
      assert.ok(!ticket.description.includes('Payment Received'));
      assert.ok(!ticket.description.includes('Classification:'));
      assert.ok(!ticket.description.includes('Classification Basis:'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Multiple line items & customer notes preserved cleanly
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Multiple line items and customer notes are formatted into Overview and Scope sections', async () => {
      const invoice = await Invoice.create({
        invoiceNo: 'INV-2026-902',
        invoiceDate: '22/10/2026',
        customerName: 'Global Retailers Ltd',
        customerContact: '9123456780',
        customerAddress: '45 MG Road, Bangalore',
        customerGst: '29BBBBB5678B1Z2',
        subdomain: 'tenant-scope',
        terms: 'Implement dark mode toggle and optimize page load speed under 1.5s',
        notes: 'Implement dark mode toggle and optimize page load speed under 1.5s',
        date: new Date(),
        dueDate: '05/11/2026',
        status: 'Payment Received',
        paymentStatus: 'Payment Received',
        paymentMethod: 'Bank Transfer',
        totalAmount: 75000,
        subTotal: 75000,
        taxAmount: 0,
        items: [
          { description: 'React Dashboard UI', qty: 1, rate: 45000, total: 45000 },
          { description: 'Stripe Subscription Integration', qty: 1, rate: 30000, total: 30000 }
        ],
        createdBy: admin._id,
        createdByModel: 'Admin'
      });

      const result = await processJobIntakeFromVerifiedInvoice({
        invoice,
        subdomain: 'tenant-scope',
        adminUser: admin
      });

      const ticket = await Ticket.findById(result.ticketId).lean();

      // Check overview from notes
      assert.ok(ticket.description.includes('### Project Overview'));
      assert.ok(ticket.description.includes('Implement dark mode toggle and optimize page load speed under 1.5s'));

      // Check line item scopes
      assert.ok(ticket.description.includes('### Scope of Work'));
      assert.ok(ticket.description.includes('- React Dashboard UI'));
      assert.ok(ticket.description.includes('- Stripe Subscription Integration'));

      // Confirm no commercial/customer leakage
      assert.ok(!ticket.description.includes('### Customer Information'));
      assert.ok(!ticket.description.includes('### Commercial Details'));
      assert.ok(!ticket.description.includes('45000'));
      assert.ok(!ticket.description.includes('75000'));
      assert.ok(!ticket.description.includes('Global Retailers Ltd'));
      assert.ok(!ticket.description.includes('9123456780'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Fallback when no specific requirements provided
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Invoice with no custom scope returns clear fallback without invented requirements', async () => {
      const invoice = await Invoice.create({
        invoiceNo: 'INV-2026-903',
        invoiceDate: '22/10/2026',
        customerName: 'Silent Client',
        customerContact: '9000000000',
        subdomain: 'tenant-scope',
        date: new Date(),
        status: 'Payment Received',
        paymentStatus: 'Payment Received',
        totalAmount: 10000,
        subTotal: 10000,
        taxAmount: 0,
        items: [],
        createdBy: admin._id,
        createdByModel: 'Admin'
      });

      const result = await processJobIntakeFromVerifiedInvoice({
        invoice,
        subdomain: 'tenant-scope',
        adminUser: admin
      });

      const ticket = await Ticket.findById(result.ticketId).lean();
      assert.strictEqual(ticket.description, 'Detailed project requirements have not been provided yet.');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Different invoices for the same customer still create separate jobs
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Same customer with a second invoice creates a distinct second job with its own scope', async () => {
      const secondInvoice = await Invoice.create({
        invoiceNo: 'INV-2026-904',
        invoiceDate: '22/10/2026',
        customerName: 'vasee grah',
        customerContact: '9876543210',
        customerAddress: '123 Anna Salai, Chennai, TN',
        subdomain: 'tenant-scope',
        date: new Date(),
        status: 'Payment Received',
        paymentStatus: 'Payment Received',
        totalAmount: 40000,
        subTotal: 40000,
        taxAmount: 0,
        items: [
          { description: 'vasee grah-Mobile-App-Phase-1', qty: 1, rate: 40000, total: 40000 }
        ],
        createdBy: admin._id,
        createdByModel: 'Admin'
      });

      const result2 = await processJobIntakeFromVerifiedInvoice({
        invoice: secondInvoice,
        subdomain: 'tenant-scope',
        adminUser: admin
      });

      assert.ok(result2.ticketId);
      const ticket2 = await Ticket.findById(result2.ticketId).lean();
      assert.ok(ticket2.description.includes('vasee grah-Mobile-App-Phase-1'));
      assert.ok(!ticket2.description.includes('vasee grah-Website-Update'));

      const allCustomerJobs = await JobIntake.find({ 'customer.name': 'vasee grah', subdomain: 'tenant-scope' }).lean();
      assert.strictEqual(allCustomerJobs.length, 2);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Description Edit & Save persists without clearing checklist/subtasks/assignee
    // ─────────────────────────────────────────────────────────────────────────
    await runTest('Editing description via updateTicket persists new requirements and preserves checklist & assignee', async () => {
      const ticket = await Ticket.create({
        title: 'Initial Task',
        description: '### Scope of Work\n- Initial feature',
        checklist: [
          { text: 'Subtask 1', completed: true },
          { text: 'Subtask 2', completed: false }
        ],
        assignee: dev._id,
        assignees: [dev._id],
        subdomain: 'tenant-scope',
        team: 'Web Development',
        priority: 'High'
      });

      const req = {
        body: {
          description: '### Scope of Work\n- Updated feature specification with webhook handler',
          subdomain: 'tenant-scope'
        },
        params: { id: ticket._id.toString() },
        user: { _id: admin._id, role: 'admin', subdomain: 'tenant-scope' }
      };

      const res = {
        statusCode: 200,
        data: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.data = payload; return this; }
      };

      await updateTicket(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.description, '### Scope of Work\n- Updated feature specification with webhook handler');

      const reloaded = await Ticket.findById(ticket._id).lean();
      assert.strictEqual(reloaded.description, '### Scope of Work\n- Updated feature specification with webhook handler');
      // Checklist preserved
      assert.strictEqual(reloaded.checklist.length, 2);
      assert.strictEqual(reloaded.checklist[0].text, 'Subtask 1');
      assert.strictEqual(reloaded.checklist[0].completed, true);
      // Assignee preserved
      assert.strictEqual(reloaded.assignee.toString(), dev._id.toString());
      assert.strictEqual(reloaded.team, 'Web Development');
    });

    console.log('\n================================================================');
    console.log(` Results: ${passCount} / ${testCount} Passed (0 Failed)`);
    console.log('================================================================\n');

  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
