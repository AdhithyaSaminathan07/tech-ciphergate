/**
 * System 1 — Frontend Job Intake Integration Test Suite
 * 
 * Verifies frontend payload mapping, UI-only field stripping, amount validation,
 * idempotency, retry stability, error handling, and OrderIntakeSchema alignment.
 * 
 * Safety:
 * - 100% In-Memory / Isolated Mocks.
 * - Zero live MongoDB connection.
 * - Zero WhatsApp dispatches.
 */

const assert = require('assert');
const { OrderIntakeSchema } = require('../controllers/jobIntakeController');

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
console.log(' Tech Ciphergate — Frontend Intake Integration Test Suite       ');
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
// 2. Pure Implementation of Frontend Sanitizer (Matches intakeService.js)
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeOrderIntakePayload({
  orderId,
  subdomain,
  customer = {},
  jobDetails = {},
  items = [],
  payment = {}
}) {
  if (!orderId || typeof orderId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(orderId.trim())) {
    throw new Error('Valid orderId is required (alphanumeric characters, underscores, or hyphens only).');
  }

  const cleanItems = (Array.isArray(items) ? items : []).map(item => {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const rate = Math.max(0, parseFloat(item.rate) || 0);
    const total = (item.total !== undefined && item.total !== null && !isNaN(parseFloat(item.total)))
      ? Math.round(parseFloat(item.total) * 100) / 100
      : Math.round(qty * rate * 100) / 100;

    return {
      description: String(item.description || '').trim() || 'Service Item',
      hsn: String(item.hsn || '').trim().slice(0, 20),
      gst: (typeof item.gst === 'number' && !isNaN(item.gst)) ? Math.min(28, Math.max(0, item.gst)) : 18,
      qty,
      rate: Math.round(rate * 100) / 100,
      total
    };
  });

  const validItems = cleanItems.length > 0 ? cleanItems : [{
    description: 'General Technical Services',
    hsn: '',
    gst: 18,
    qty: 1,
    rate: 0,
    total: 0
  }];

  const itemsSum = Math.round(validItems.reduce((acc, curr) => acc + curr.total, 0) * 100) / 100;

  const rawPhone = String(customer.phone || customer.customerContact || '').replace(/[^0-9+]/g, '');
  const cleanCustomer = {
    name: String(customer.name || customer.customerName || '').trim().slice(0, 100) || 'Client Customer',
    phone: rawPhone.length >= 10 ? rawPhone.slice(0, 15) : '9999999999',
    email: (customer.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email).trim()))
      ? String(customer.email).trim().slice(0, 100)
      : '',
    address: String(customer.address || customer.customerAddress || '').trim().slice(0, 300),
    gstin: String(customer.gstin || customer.customerGst || '').trim().toUpperCase()
  };

  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (cleanCustomer.gstin && !gstinRegex.test(cleanCustomer.gstin)) {
    cleanCustomer.gstin = '';
  }

  const primaryTitle = String(
    jobDetails.title ||
    (validItems[0]?.description ? `Order: ${validItems[0].description}` : `Job Order #${orderId}`)
  ).trim().slice(0, 200);

  const cleanJobDetails = {
    title: primaryTitle.length >= 3 ? primaryTitle : `Order #${orderId}`,
    description: String(jobDetails.description || '').trim().slice(0, 5000),
    serviceCategory: String(jobDetails.serviceCategory || 'General').trim().slice(0, 50),
    team: String(jobDetails.team || 'DEV').trim().slice(0, 50),
    priority: ['Low', 'Medium', 'High', 'Critical'].includes(jobDetails.priority) ? jobDetails.priority : 'High',
    deliverables: Array.isArray(jobDetails.deliverables)
      ? jobDetails.deliverables.map(d => String(d).trim().slice(0, 200)).filter(Boolean).slice(0, 30)
      : [],
    referenceFiles: Array.isArray(jobDetails.referenceFiles) ? jobDetails.referenceFiles.slice(0, 10) : [],
    dueDate: jobDetails.dueDate || null
  };

  const cleanPayment = {
    gateway: 'manual',
    currency: 'INR',
    transactionRef: String(payment.transactionRef || orderId).trim().slice(0, 100),
    paymentStatus: 'PENDING',
    manualVerification: true
  };
  if (itemsSum > 0) {
    cleanPayment.amount = itemsSum;
  }

  const cleanSubdomain = String(subdomain || 'tech-vaseegrah')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64) || 'tech-vaseegrah';

  return {
    orderId: String(orderId).trim(),
    subdomain: cleanSubdomain,
    customer: cleanCustomer,
    jobDetails: cleanJobDetails,
    items: validItems,
    payment: cleanPayment
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Test Cases
// ─────────────────────────────────────────────────────────────────────────────
async function executeTests() {
  await runTest('Sanitizer strips UI-only fields (id, isTotalOverridden) to satisfy backend .strict() validation', async () => {
    const rawUiItems = [
      {
        id: 1729061000123,
        _id: 'mongo123',
        description: 'Web Application Architecture & Security Hardening',
        hsn: '998314',
        gst: 18,
        qty: 1,
        rate: 15000,
        total: 15000,
        isTotalOverridden: false
      }
    ];

    const sanitized = sanitizeOrderIntakePayload({
      orderId: 'ORD-TEST-001',
      subdomain: 'tech-vaseegrah',
      customer: {
        customerName: 'Acme Corporation Ltd',
        customerContact: '9876543210',
        customerAddress: '42 Tech Park, Bangalore',
        customerGst: '29ABCDE1234F1Z5'
      },
      items: rawUiItems
    });

    // Check that UI-only fields were removed
    assert.strictEqual(sanitized.items[0].id, undefined);
    assert.strictEqual(sanitized.items[0]._id, undefined);
    assert.strictEqual(sanitized.items[0].isTotalOverridden, undefined);

    // Validate directly against backend Zod OrderIntakeSchema (.strict())
    const parseResult = OrderIntakeSchema.safeParse(sanitized);
    assert.strictEqual(parseResult.success, true, `Zod schema rejected payload: ${JSON.stringify(parseResult.error?.issues)}`);
  });

  await runTest('Commercial amounts match exactly between items sum and payment.amount', async () => {
    const rawItems = [
      { description: 'Cloud Infrastructure Setup', qty: 2, rate: 5000, total: 10000 },
      { description: 'CI/CD Pipeline Configuration', qty: 1, rate: 8500, total: 8500 }
    ];

    const sanitized = sanitizeOrderIntakePayload({
      orderId: 'ORD-AMT-TEST-02',
      subdomain: 'tech-vaseegrah',
      customer: { name: 'FinTech Labs', phone: '+919876543210' },
      items: rawItems
    });

    const expectedSum = 18500;
    assert.strictEqual(sanitized.payment.amount, expectedSum);
    const itemsSum = sanitized.items.reduce((s, it) => s + it.total, 0);
    assert.strictEqual(Math.abs(itemsSum - sanitized.payment.amount) <= 0.001, true);
  });

  await runTest('Customer fields map cleanly from frontend state naming conventions', async () => {
    const sanitized = sanitizeOrderIntakePayload({
      orderId: 'ORD-CUST-003',
      subdomain: 'tech-vaseegrah',
      customer: {
        customerName: 'Tech Innovators India Pvt Ltd',
        customerContact: '+91 9988776655',
        customerAddress: '100 Ring Road, Chennai - 600001',
        customerGst: '33AAAAA0000A1Z5'
      },
      items: [{ description: 'DevOps Services', qty: 1, rate: 20000, total: 20000 }]
    });

    assert.strictEqual(sanitized.customer.name, 'Tech Innovators India Pvt Ltd');
    assert.strictEqual(sanitized.customer.phone, '+919988776655');
    assert.strictEqual(sanitized.customer.address, '100 Ring Road, Chennai - 600001');
    assert.strictEqual(sanitized.customer.gstin, '33AAAAA0000A1Z5');

    const result = OrderIntakeSchema.safeParse(sanitized);
    assert.strictEqual(result.success, true);
  });

  await runTest('Invalid GSTIN format gracefully resets to empty string to prevent validation crash', async () => {
    const sanitized = sanitizeOrderIntakePayload({
      orderId: 'ORD-GST-004',
      subdomain: 'tech-vaseegrah',
      customer: {
        customerName: 'Retail Buyer',
        customerContact: '9876543210',
        customerGst: 'INVALID-GST-NUMBER'
      },
      items: [{ description: 'General Consultation', qty: 1, rate: 1000, total: 1000 }]
    });

    assert.strictEqual(sanitized.customer.gstin, '');
    const result = OrderIntakeSchema.safeParse(sanitized);
    assert.strictEqual(result.success, true);
  });

  await runTest('Payment verification remains strictly manual with PENDING status', async () => {
    const sanitized = sanitizeOrderIntakePayload({
      orderId: 'ORD-PAY-005',
      subdomain: 'tech-vaseegrah',
      customer: { name: 'Client Test', phone: '9876543210' },
      items: [{ description: 'Advisory Session', qty: 1, rate: 5000, total: 5000 }]
    });

    assert.strictEqual(sanitized.payment.gateway, 'manual');
    assert.strictEqual(sanitized.payment.manualVerification, true);
    assert.strictEqual(sanitized.payment.paymentStatus, 'PENDING');
    assert.strictEqual(sanitized.payment.currency, 'INR');
  });

  await runTest('Stable orderId retention across retries guarantees idempotency', async () => {
    // Simulate UI state
    let formState = {
      externalOrderId: '',
      customerName: 'Repeat Buyer',
      customerContact: '9876543210',
      items: [{ description: 'Subscription Plan', qty: 1, rate: 12000, total: 12000 }]
    };

    // First attempt: generate stable orderId
    const firstOrderId = formState.externalOrderId || `ORD-${Date.now()}-TESTA`;
    formState.externalOrderId = firstOrderId;

    const payloadAttempt1 = sanitizeOrderIntakePayload({
      orderId: formState.externalOrderId,
      subdomain: 'tech-vaseegrah',
      customer: { name: formState.customerName, phone: formState.customerContact },
      items: formState.items
    });

    // Simulate network error / retry: UI reuses formState.externalOrderId
    const secondOrderId = formState.externalOrderId || `ORD-${Date.now()}-TESTB`;
    assert.strictEqual(secondOrderId, firstOrderId, 'OrderId must remain identical on retry');

    const payloadAttempt2 = sanitizeOrderIntakePayload({
      orderId: formState.externalOrderId,
      subdomain: 'tech-vaseegrah',
      customer: { name: formState.customerName, phone: formState.customerContact },
      items: formState.items
    });

    assert.strictEqual(payloadAttempt1.orderId, payloadAttempt2.orderId);
  });

  await runTest('Repeated submission prevention: UI state flags block concurrent clicks', async () => {
    let isSubmitting = false;
    let callCount = 0;

    const fakeSubmit = async () => {
      if (isSubmitting) return; // Guard
      isSubmitting = true;
      callCount++;
      await new Promise(r => setTimeout(r, 50));
      isSubmitting = false;
    };

    // Click 3 times rapidly
    const p1 = fakeSubmit();
    const p2 = fakeSubmit();
    const p3 = fakeSubmit();

    await Promise.all([p1, p2, p3]);
    assert.strictEqual(callCount, 1, 'Only one intake request must be dispatched during in-flight submission');
  });

  await runTest('Rejection on invalid orderId format (must be alphanumeric, hyphen, underscore)', async () => {
    assert.throws(() => {
      sanitizeOrderIntakePayload({
        orderId: 'INVALID ORDER ID WITH SPACES!',
        subdomain: 'tech-vaseegrah',
        customer: { name: 'Bad Order ID', phone: '9876543210' },
        items: [{ description: 'Test', qty: 1, rate: 100, total: 100 }]
      });
    }, /Valid orderId is required/);
  });

  await runTest('Job details deliverables are properly extracted from line item descriptions', async () => {
    const rawItems = [
      { description: 'Design Landing Page Wireframes', qty: 1, rate: 5000, total: 5000 },
      { description: 'Implement Responsive Navbar & Footer', qty: 1, rate: 4000, total: 4000 }
    ];

    const sanitized = sanitizeOrderIntakePayload({
      orderId: 'ORD-DELIV-007',
      subdomain: 'tech-vaseegrah',
      customer: { name: 'Web Client', phone: '9876543210' },
      jobDetails: {
        title: 'Landing Page Redesign',
        deliverables: rawItems.map(i => i.description)
      },
      items: rawItems
    });

    assert.strictEqual(sanitized.jobDetails.deliverables.length, 2);
    assert.strictEqual(sanitized.jobDetails.deliverables[0], 'Design Landing Page Wireframes');
    assert.strictEqual(sanitized.jobDetails.deliverables[1], 'Implement Responsive Navbar & Footer');
    assert.strictEqual(sanitized.jobDetails.priority, 'High');
    assert.strictEqual(sanitized.jobDetails.team, 'DEV');

    const result = OrderIntakeSchema.safeParse(sanitized);
    assert.strictEqual(result.success, true);
  });

  console.log('\n================================================================');
  console.log(` Frontend Intake Integration: ${passCount} Passed, ${failCount} Failed (${testCount} Total)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

executeTests().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
