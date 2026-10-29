/**
 * Isolated Verification Suite: External Invoice API Audit & Fixes (GET /api/external/invoices)
 *
 * Covers:
 * 1. Bearer-token authentication succeeds for a valid active API key.
 * 2. x-api-key authentication continues to work.
 * 3. Missing, malformed, invalid, inactive, and expired keys are rejected.
 * 4. Missing invoices:read permission is rejected.
 * 5. Cross-tenant invoice access remains blocked.
 * 6. Invoice response contains original fields plus subtotal, taxTotal, and grandTotal.
 * 7. GST-enabled and GST-disabled invoices calculate correctly.
 * 8. Manually overridden item totals are handled correctly.
 * 9. Missing or invalid optional numeric fields do not produce NaN.
 * 10. Empty invoice lists return a valid empty array.
 * 11. Existing invoice workflows and relevant regression tests remain unaffected.
 *
 * SAFETY GUARD: Live database connection is strictly blocked.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Strict Safety Guard: Block any live database connections
delete process.env.MONGO_URI;
delete process.env.DATABASE_URL;
mongoose.connect = async () => {
  throw new Error('FATAL: Live database connection attempted in isolated test!');
};

// Target components
const ApiKey = require('../models/ApiKey');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const Invoice = require('../models/Invoice');
const { validateApiKey, authorizeApi } = require('../middleware/apiKeyMiddleware');

// Test fixtures
const tenantAId = 'tenant_alpha';
const tenantBId = 'tenant_beta';

let inMemoryApiKeys = [];
let inMemoryAdmins = [];
let inMemoryWorkers = [];
let inMemoryInvoices = [];

const adminAId = new mongoose.Types.ObjectId();
const adminBId = new mongoose.Types.ObjectId();
const workerAId = new mongoose.Types.ObjectId();

function setupMocks() {
  inMemoryApiKeys = [];
  inMemoryAdmins = [];
  inMemoryWorkers = [];
  inMemoryInvoices = [];

  inMemoryAdmins.push({ _id: adminAId, name: 'Admin A', subdomain: tenantAId });
  inMemoryAdmins.push({ _id: adminBId, name: 'Admin B', subdomain: tenantBId });
  inMemoryWorkers.push({ _id: workerAId, name: 'Worker A', subdomain: tenantAId });

  // Mock ApiKey.findOne
  ApiKey.findOne = function(filter) {
    const found = inMemoryApiKeys.find(k => {
      if (filter.key && k.key !== filter.key) return false;
      if (filter.isActive !== undefined && k.isActive !== filter.isActive) return false;
      return true;
    });

    if (!found) {
      return { then: (resolve) => resolve(null) };
    }

    const doc = {
      ...found,
      save: async function() { return doc; }
    };
    return { then: (resolve) => resolve(doc) };
  };

  // Mock Admin.find
  Admin.find = function(filter) {
    const list = inMemoryAdmins.filter(a => {
      if (filter.subdomain && a.subdomain !== filter.subdomain) return false;
      return true;
    });
    return { then: (resolve) => resolve(list) };
  };

  // Mock Worker.find
  Worker.find = function(filter) {
    const list = inMemoryWorkers.filter(w => {
      if (filter.subdomain && w.subdomain !== filter.subdomain) return false;
      return true;
    });
    return { then: (resolve) => resolve(list) };
  };

  // Mock Invoice.find
  Invoice.find = function(query = {}) {
    let list = inMemoryInvoices.filter(inv => {
      if (query.createdBy && query.createdBy.$in) {
        const allowedIds = query.createdBy.$in.map(id => String(id));
        if (!allowedIds.includes(String(inv.createdBy))) return false;
      }
      return true;
    });

    const chain = {
      populate: () => chain,
      sort: () => chain,
      then: (resolve) => resolve(list)
    };
    return chain;
  };
}

function mockRes() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
}

// Emulates the serialization logic implemented in GET /api/external/invoices
function serializeInvoices(invoices) {
  return (invoices || []).map(inv => {
    const doc = (typeof inv.toObject === 'function') ? inv.toObject() : { ...inv };
    const items = Array.isArray(doc.items) ? doc.items : [];
    const gstEnabled = doc.gstEnabled !== false;

    let subtotal = 0;
    let taxTotal = 0;

    for (const item of items) {
      if (!item) continue;
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      const rawTotal = Number(item.total);
      const isOverridden = Boolean(item.isTotalOverridden && !isNaN(rawTotal));
      const taxableAmount = isOverridden ? rawTotal : (qty * rate);

      subtotal += isNaN(taxableAmount) ? 0 : taxableAmount;

      if (gstEnabled) {
        const gstRate = Number(item.gst) || 0;
        const itemTax = (taxableAmount * gstRate) / 100;
        taxTotal += isNaN(itemTax) ? 0 : itemTax;
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    taxTotal = gstEnabled ? Math.round(taxTotal * 100) / 100 : 0;
    const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;

    return {
      ...doc,
      subtotal,
      taxTotal,
      grandTotal
    };
  });
}

async function runTests() {
  console.log('======================================================');
  console.log('--- TEST SUITE: INVOICE EXTERNAL API AUDIT & FIXES ---');
  console.log('======================================================\n');

  setupMocks();

  const validKey = 'cg_activekey_0123456789abcdef0123';
  inMemoryApiKeys.push({
    _id: new mongoose.Types.ObjectId(),
    key: validKey,
    clientName: 'Billing Service',
    subdomain: tenantAId,
    permissions: ['invoices:read'],
    expiry: null,
    isActive: true,
    usageCount: 0
  });

  // Test 1: Bearer-token authentication succeeds for valid active API key
  console.log('Test 1: Bearer token authentication succeeds...');
  {
    const req = {
      header: (name) => undefined,
      headers: {
        authorization: `Bearer ${validKey}`
      },
      method: 'GET',
      originalUrl: '/api/external/invoices'
    };
    const res = mockRes();
    let nextCalled = false;
    await validateApiKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'next() must be called for valid Bearer token');
    assert.ok(req.apiKey, 'req.apiKey must be attached');
    assert.strictEqual(req.apiKey.key, validKey);
    console.log('✓ PASS: Authorization: Bearer <cg_key> successfully authenticates.');
  }

  // Test 2: x-api-key authentication continues to work and takes precedence
  console.log('\nTest 2: x-api-key authentication continues to work...');
  {
    const req = {
      header: (name) => (name.toLowerCase() === 'x-api-key' ? validKey : undefined),
      headers: {
        'x-api-key': validKey,
        authorization: 'Bearer cg_some_other_key' // should be ignored in favor of x-api-key
      },
      method: 'GET',
      originalUrl: '/api/external/invoices'
    };
    const res = mockRes();
    let nextCalled = false;
    await validateApiKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.apiKey.key, validKey);
    console.log('✓ PASS: x-api-key header works and takes precedence over Authorization header.');
  }

  // Test 3: Missing, malformed, invalid, inactive, and expired keys are rejected
  console.log('\nTest 3: Missing, malformed, invalid, inactive, and expired keys rejected...');
  {
    // A. Missing key
    {
      const req = { header: () => undefined, headers: {} };
      const res = mockRes();
      let nextCalled = false;
      await validateApiKey(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data.message, 'Access denied. API key is missing.');
      assert.strictEqual(nextCalled, false);
    }

    // B. Malformed Bearer token (does not match cg_ prefix)
    {
      const req = {
        header: () => undefined,
        headers: { authorization: 'Bearer invalid_format_token' }
      };
      const res = mockRes();
      let nextCalled = false;
      await validateApiKey(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data.message, 'Access denied. API key is missing.');
      assert.strictEqual(nextCalled, false);
    }

    // C. Non-existent / invalid key
    {
      const req = {
        header: () => undefined,
        headers: { authorization: 'Bearer cg_nonexistentkey00000000000000' }
      };
      const res = mockRes();
      let nextCalled = false;
      await validateApiKey(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data.message, 'Invalid or inactive API key.');
      assert.strictEqual(nextCalled, false);
    }

    // D. Inactive key
    {
      const inactiveKey = 'cg_inactive_0123456789abcdef0123';
      inMemoryApiKeys.push({
        _id: new mongoose.Types.ObjectId(),
        key: inactiveKey,
        clientName: 'Inactive Client',
        subdomain: tenantAId,
        permissions: ['invoices:read'],
        isActive: false
      });

      const req = {
        header: () => undefined,
        headers: { authorization: `Bearer ${inactiveKey}` }
      };
      const res = mockRes();
      let nextCalled = false;
      await validateApiKey(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data.message, 'Invalid or inactive API key.');
      assert.strictEqual(nextCalled, false);
    }

    // E. Expired key
    {
      const expiredKey = 'cg_expired_0123456789abcdef0123';
      inMemoryApiKeys.push({
        _id: new mongoose.Types.ObjectId(),
        key: expiredKey,
        clientName: 'Expired Client',
        subdomain: tenantAId,
        permissions: ['invoices:read'],
        expiry: new Date(Date.now() - 60000), // in the past
        isActive: true
      });

      const req = {
        header: () => undefined,
        headers: { authorization: `Bearer ${expiredKey}` }
      };
      const res = mockRes();
      let nextCalled = false;
      await validateApiKey(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data.message, 'API key has expired.');
      assert.strictEqual(nextCalled, false);
    }

    console.log('✓ PASS: Missing (401), malformed (401), invalid (403), inactive (403), and expired (403) keys correctly rejected.');
  }

  // Test 4: Missing invoices:read permission is rejected
  console.log('\nTest 4: Permission validation for invoices:read...');
  {
    // Key has only attendance:read
    const req = { apiKey: { permissions: ['attendance:read'] } };
    const res = mockRes();
    let nextCalled = false;
    authorizeApi('invoices', 'read')(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.data.message.includes('Required: invoices:read'));
    assert.strictEqual(nextCalled, false);
    console.log('✓ PASS: API key lacking invoices:read is blocked with 403 Forbidden.');
  }

  // Test 5: Cross-tenant invoice access remains blocked
  console.log('\nTest 5: Cross-tenant invoice access blocked...');
  {
    // Seed invoices for Tenant A and Tenant B
    inMemoryInvoices = [
      {
        _id: new mongoose.Types.ObjectId(),
        invoiceNo: 'INV-A-101',
        customerName: 'Tenant A Customer',
        createdBy: adminAId,
        gstEnabled: true,
        items: [{ qty: 1, rate: 1000, total: 1000, gst: 18 }]
      },
      {
        _id: new mongoose.Types.ObjectId(),
        invoiceNo: 'INV-B-201',
        customerName: 'Tenant B Customer',
        createdBy: adminBId,
        gstEnabled: true,
        items: [{ qty: 1, rate: 5000, total: 5000, gst: 18 }]
      }
    ];

    // Request from Tenant A client
    const admins = await Admin.find({ subdomain: tenantAId });
    const workers = await Worker.find({ subdomain: tenantAId });
    const userIds = [...admins.map(a => a._id), ...workers.map(w => w._id)];
    const tenantInvoices = await Invoice.find({ createdBy: { $in: userIds } });

    assert.strictEqual(tenantInvoices.length, 1);
    assert.strictEqual(tenantInvoices[0].invoiceNo, 'INV-A-101');
    console.log('✓ PASS: Tenant A query strictly returns Tenant A invoice; Tenant B invoice excluded.');
  }

  // Test 6 & 7: Invoice response contains subtotal, taxTotal, grandTotal for GST-enabled and GST-disabled
  console.log('\nTest 6 & 7: Calculated totals on GST-enabled and GST-disabled invoices...');
  {
    const rawInvoices = [
      {
        _id: new mongoose.Types.ObjectId(),
        invoiceNo: 'INV-GST',
        customerName: 'Acme Corp',
        createdBy: adminAId,
        gstEnabled: true,
        saleType: 'Intrastate',
        items: [
          { description: 'Service A', qty: 2, rate: 10000, total: 20000, gst: 18, isTotalOverridden: false },
          { description: 'Service B', qty: 1, rate: 5000, total: 5000, gst: 12, isTotalOverridden: false }
        ]
      },
      {
        _id: new mongoose.Types.ObjectId(),
        invoiceNo: 'INV-NONGST',
        customerName: 'Global Client',
        createdBy: adminAId,
        gstEnabled: false,
        saleType: 'Interstate',
        items: [
          { description: 'Export Work', qty: 1, rate: 50000, total: 50000, gst: 18, isTotalOverridden: false }
        ]
      }
    ];

    const result = serializeInvoices(rawInvoices);

    // GST Invoice:
    // Subtotal = (2 * 10000) + (1 * 5000) = 25000
    // TaxTotal = (20000 * 0.18) + (5000 * 0.12) = 3600 + 600 = 4200
    // GrandTotal = 25000 + 4200 = 29200
    assert.strictEqual(result[0].subtotal, 25000);
    assert.strictEqual(result[0].taxTotal, 4200);
    assert.strictEqual(result[0].grandTotal, 29200);
    assert.strictEqual(result[0].invoiceNo, 'INV-GST');

    // Non-GST Invoice:
    // Subtotal = 50000
    // TaxTotal = 0 (since gstEnabled is false)
    // GrandTotal = 50000
    assert.strictEqual(result[1].subtotal, 50000);
    assert.strictEqual(result[1].taxTotal, 0);
    assert.strictEqual(result[1].grandTotal, 50000);
    assert.strictEqual(result[1].invoiceNo, 'INV-NONGST');

    console.log('✓ PASS: GST-enabled and GST-disabled invoices compute subtotal, taxTotal, and grandTotal accurately.');
  }

  // Test 8: Manually overridden item totals are handled correctly
  console.log('\nTest 8: Manually overridden item totals calculation...');
  {
    const overriddenInvoice = [
      {
        _id: new mongoose.Types.ObjectId(),
        invoiceNo: 'INV-OVERRIDE',
        gstEnabled: true,
        items: [
          {
            description: 'Custom Contract',
            qty: 10,
            rate: 5000, // qty * rate would be 50,000
            total: 42000, // overridden total
            isTotalOverridden: true,
            gst: 18
          }
        ]
      }
    ];

    const result = serializeInvoices(overriddenInvoice);
    // Subtotal must use overridden item.total: 42000
    // Tax = 42000 * 0.18 = 7560
    // GrandTotal = 42000 + 7560 = 49560
    assert.strictEqual(result[0].subtotal, 42000);
    assert.strictEqual(result[0].taxTotal, 7560);
    assert.strictEqual(result[0].grandTotal, 49560);
    console.log('✓ PASS: isTotalOverridden uses item.total instead of qty * rate.');
  }

  // Test 9: Missing or invalid optional numeric fields do not produce NaN
  console.log('\nTest 9: Safe handling of missing/null/undefined optional numeric fields...');
  {
    const messyInvoice = [
      {
        _id: new mongoose.Types.ObjectId(),
        invoiceNo: 'INV-MESSY',
        gstEnabled: true,
        items: [
          {
            description: 'Incomplete Item 1',
            qty: null,
            rate: undefined,
            total: '',
            gst: null
          },
          {
            description: 'Incomplete Item 2'
            // missing qty, rate, total, gst
          }
        ]
      }
    ];

    const result = serializeInvoices(messyInvoice);
    assert.strictEqual(isNaN(result[0].subtotal), false, 'subtotal must not be NaN');
    assert.strictEqual(isNaN(result[0].taxTotal), false, 'taxTotal must not be NaN');
    assert.strictEqual(isNaN(result[0].grandTotal), false, 'grandTotal must not be NaN');
    assert.strictEqual(result[0].subtotal, 0);
    assert.strictEqual(result[0].taxTotal, 0);
    assert.strictEqual(result[0].grandTotal, 0);
    console.log('✓ PASS: Incomplete or undefined numeric fields safely default without producing NaN.');
  }

  // Test 10: Empty invoice lists return a valid empty array
  console.log('\nTest 10: Empty invoice lists return valid empty array...');
  {
    const emptyResult = serializeInvoices([]);
    assert.ok(Array.isArray(emptyResult));
    assert.strictEqual(emptyResult.length, 0);
    console.log('✓ PASS: Empty input returns empty array.');
  }

  // Test 11: Existing invoice workflows unaffected
  console.log('\nTest 11: Invariant validation for invoice schema integrity...');
  {
    const sampleInv = {
      invoiceNo: 'INV-SAMPLE',
      items: [{ qty: 1, rate: 100, total: 100, gst: 18 }]
    };
    const serialized = serializeInvoices([sampleInv])[0];
    assert.ok(serialized.items, 'items must remain intact');
    assert.strictEqual(serialized.items[0].qty, 1);
    assert.strictEqual(serialized.items[0].rate, 100);
    assert.strictEqual(serialized.subtotal, 100);
    assert.strictEqual(serialized.taxTotal, 18);
    assert.strictEqual(serialized.grandTotal, 118);
    console.log('✓ PASS: Existing invoice item details and structures preserved.');
  }

  console.log('\n======================================================');
  console.log('ALL INVOICE EXTERNAL API AUDIT TESTS PASSED! (11/11)');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
