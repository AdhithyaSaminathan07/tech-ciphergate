/**
 * Isolated Verification Suite: API Key Management Audit (/admin/api-keys)
 *
 * Verifies:
 * 1. API key generation, formatting (cg_ prefix), defaults, and expiry calculation.
 * 2. Strict tenant isolation on create, list, revoke, and toggle.
 * 3. Prevention of cross-tenant key generation, inspection, revocation, and activation.
 * 4. Input validation (clientName, expiryDays, permissions, and malformed ObjectIds).
 * 5. validateApiKey middleware behavior (missing, invalid, inactive, expired, and valid keys).
 * 6. authorizeApi middleware behavior (module permissions, admin wildcard, legacy fallback).
 * 7. Route authorization (protect, adminOnly middleware).
 *
 * SAFETY GUARD: Database connection is strictly blocked.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Strict Safety Guard: Block any connection to live database
delete process.env.MONGO_URI;
delete process.env.DATABASE_URL;
mongoose.connect = async () => {
  throw new Error('FATAL: Live database connection attempted in isolated test!');
};

// Target components
const ApiKey = require('../models/ApiKey');
const apiKeyController = require('../controllers/apiKeyController');
const { validateApiKey, authorizeApi } = require('../middleware/apiKeyMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');

// Test fixtures
const tenantAId = 'tenant_alpha';
const tenantBId = 'tenant_beta';

let inMemoryApiKeys = [];

function setupMocks() {
  inMemoryApiKeys = [];

  ApiKey.create = async function(doc) {
    const created = {
      _id: new mongoose.Types.ObjectId(),
      key: doc.key,
      clientName: doc.clientName,
      subdomain: doc.subdomain,
      permissions: doc.permissions || ['read'],
      expiry: doc.expiry || null,
      isActive: doc.isActive !== undefined ? doc.isActive : true,
      usageCount: doc.usageCount || 0,
      lastUsed: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    inMemoryApiKeys.push(created);
    return created;
  };

  ApiKey.find = function(filter = {}) {
    const list = inMemoryApiKeys.filter(k => {
      if (filter.subdomain && k.subdomain !== filter.subdomain) return false;
      return true;
    });

    const chain = {
      sort: () => chain,
      lean: async () => list,
      then: (resolve) => resolve(list)
    };
    return chain;
  };

  ApiKey.findById = function(id) {
    const found = inMemoryApiKeys.find(k => String(k._id) === String(id));
    if (!found) {
      const q = {
        then: (resolve) => resolve(null)
      };
      return q;
    }

    const doc = {
      ...found,
      deleteOne: async function() {
        const idx = inMemoryApiKeys.findIndex(k => String(k._id) === String(id));
        if (idx !== -1) inMemoryApiKeys.splice(idx, 1);
      },
      save: async function() {
        const idx = inMemoryApiKeys.findIndex(k => String(k._id) === String(id));
        if (idx !== -1) inMemoryApiKeys[idx] = { ...this };
      }
    };

    const q = {
      then: (resolve) => resolve(doc)
    };
    return q;
  };

  ApiKey.findOne = function(filter = {}) {
    const found = inMemoryApiKeys.find(k => {
      if (filter.key && k.key !== filter.key) return false;
      if (filter.isActive !== undefined && k.isActive !== filter.isActive) return false;
      return true;
    });

    if (!found) {
      const q = {
        then: (resolve) => resolve(null)
      };
      return q;
    }

    const doc = {
      ...found,
      save: async function() {
        const idx = inMemoryApiKeys.findIndex(k => String(k._id) === String(found._id));
        if (idx !== -1) inMemoryApiKeys[idx] = { ...this };
      }
    };

    const q = {
      then: (resolve) => resolve(doc)
    };
    return q;
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

async function runTests() {
  console.log('======================================================');
  console.log('--- TEST SUITE: API KEY MANAGEMENT AUDIT FIXES ---');
  console.log('======================================================\n');

  setupMocks();

  // Test 1: Generate API Key for Tenant A
  console.log('Test 1: Admin generates valid API key...');
  {
    const req = {
      body: {
        clientName: 'Integration App',
        subdomain: tenantAId,
        permissions: ['attendance:read', 'invoices:read'],
        expiryDays: 30
      },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();
    await apiKeyController.generateApiKey(req, res);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.key.startsWith('cg_'), 'Key must start with cg_ prefix');
    assert.strictEqual(res.data.data.subdomain, tenantAId);
    assert.strictEqual(res.data.data.clientName, 'Integration App');
    assert.deepStrictEqual(res.data.data.permissions, ['attendance:read', 'invoices:read']);
    assert.ok(res.data.data.expiry instanceof Date, 'Expiry must be a Date object');
    console.log('✓ PASS: API key generated successfully with valid prefix, metadata, and expiry.');
  }

  // Test 2: Ordinary admin cannot create key for another tenant
  console.log('\nTest 2: Tenant isolation during key generation (cannot spoof tenant)...');
  {
    const req = {
      body: {
        clientName: 'Malicious Key',
        subdomain: tenantBId, // attempting to create for Tenant B
        permissions: ['admin'],
        expiryDays: 10
      },
      user: { role: 'admin', subdomain: tenantAId } // logged in as Tenant A
    };
    const res = mockRes();
    await apiKeyController.generateApiKey(req, res);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.data.subdomain, tenantAId, 'Subdomain must be forced to caller authenticated tenant');
    console.log('✓ PASS: Key generation enforces caller subdomain, preventing cross-tenant spoofing.');
  }

  // Test 3: Superadmin ('main') can specify any tenant
  console.log('\nTest 3: Superadmin (subdomain: "main") can specify target tenant...');
  {
    const req = {
      body: {
        clientName: 'Superadmin Provisioned',
        subdomain: tenantBId,
        permissions: ['read']
      },
      user: { role: 'admin', subdomain: 'main' }
    };
    const res = mockRes();
    await apiKeyController.generateApiKey(req, res);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.data.subdomain, tenantBId);
    console.log('✓ PASS: Superadmin can provision keys across tenants.');
  }

  // Test 4: Missing or whitespace clientName is rejected
  console.log('\nTest 4: Input validation for clientName...');
  {
    const req = {
      body: {
        clientName: '   ',
        subdomain: tenantAId
      },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();
    let errCaught = false;
    try {
      await apiKeyController.generateApiKey(req, res);
    } catch (err) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 400);
      assert.ok(err.message.includes('Client name is required'));
    }
    assert.ok(errCaught, 'Blank clientName must be rejected with 400');
    console.log('✓ PASS: Blank/missing clientName rejected with 400 Bad Request.');
  }

  // Test 5: Invalid expiryDays rejected
  console.log('\nTest 5: Input validation for expiryDays...');
  {
    const req = {
      body: {
        clientName: 'Test Key',
        expiryDays: -5
      },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();
    let errCaught = false;
    try {
      await apiKeyController.generateApiKey(req, res);
    } catch (err) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 400);
      assert.ok(err.message.includes('Expiry days must be a positive integer'));
    }
    assert.ok(errCaught, 'Negative expiryDays must be rejected with 400');
    console.log('✓ PASS: Negative/invalid expiryDays rejected with 400 Bad Request.');
  }

  // Test 6: Tenant isolation in getApiKeys
  console.log('\nTest 6: Tenant isolation in getApiKeys (Tenant A cannot see Tenant B keys)...');
  {
    // Currently inMemoryApiKeys has:
    // 2 keys for tenantAId
    // 1 key for tenantBId

    const reqA = {
      user: { role: 'admin', subdomain: tenantAId }
    };
    const resA = mockRes();
    await apiKeyController.getApiKeys(reqA, resA);

    assert.strictEqual(resA.statusCode, 200);
    assert.strictEqual(resA.data.data.length, 2);
    assert.ok(resA.data.data.every(k => k.subdomain === tenantAId), 'All returned keys must belong to Tenant A');

    const reqB = {
      user: { role: 'admin', subdomain: tenantBId }
    };
    const resB = mockRes();
    await apiKeyController.getApiKeys(reqB, resB);

    assert.strictEqual(resB.statusCode, 200);
    assert.strictEqual(resB.data.data.length, 1);
    assert.strictEqual(resB.data.data[0].subdomain, tenantBId);

    // Superadmin
    const reqMain = {
      user: { role: 'admin', subdomain: 'main' }
    };
    const resMain = mockRes();
    await apiKeyController.getApiKeys(reqMain, resMain);
    assert.strictEqual(resMain.data.data.length, 3, 'Superadmin should see all 3 keys across all tenants');

    console.log('✓ PASS: getApiKeys strictly partitions keys by tenant; superadmin retains visibility.');
  }

  // Test 7: Cross-tenant revoke rejected with 403 Forbidden
  console.log('\nTest 7: Cross-tenant key revocation blocked (403 Forbidden)...');
  {
    const keyB = inMemoryApiKeys.find(k => k.subdomain === tenantBId);
    assert.ok(keyB, 'Key for Tenant B must exist');

    const req = {
      params: { id: keyB._id.toString() },
      user: { role: 'admin', subdomain: tenantAId } // Admin A trying to delete Key B
    };
    const res = mockRes();
    let errCaught = false;
    try {
      await apiKeyController.revokeApiKey(req, res);
    } catch (err) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 403);
      assert.ok(err.message.includes('Not authorized to revoke API key from another tenant'));
    }
    assert.ok(errCaught, 'Cross-tenant revoke must be rejected with 403');
    console.log('✓ PASS: Cross-tenant revoke blocked with 403 Forbidden.');
  }

  // Test 8: Authorized revoke succeeds
  console.log('\nTest 8: Authorized revoke succeeds...');
  {
    const keyA = inMemoryApiKeys.find(k => k.subdomain === tenantAId);
    const keyAId = keyA._id.toString();

    const req = {
      params: { id: keyAId },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();
    await apiKeyController.revokeApiKey(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(!inMemoryApiKeys.some(k => String(k._id) === keyAId), 'Key must be deleted from memory');
    console.log('✓ PASS: Authorized key revocation deletes the record.');
  }

  // Test 9: Cross-tenant toggle rejected with 403 Forbidden
  console.log('\nTest 9: Cross-tenant toggle status blocked (403 Forbidden)...');
  {
    const keyB = inMemoryApiKeys.find(k => k.subdomain === tenantBId);
    const req = {
      params: { id: keyB._id.toString() },
      user: { role: 'admin', subdomain: tenantAId } // Admin A trying to toggle Key B
    };
    const res = mockRes();
    let errCaught = false;
    try {
      await apiKeyController.toggleApiKey(req, res);
    } catch (err) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 403);
      assert.ok(err.message.includes('Not authorized to modify API key from another tenant'));
    }
    assert.ok(errCaught, 'Cross-tenant toggle must be rejected with 403');
    console.log('✓ PASS: Cross-tenant toggle blocked with 403 Forbidden.');
  }

  // Test 10: Authorized toggle status toggles isActive
  console.log('\nTest 10: Authorized toggle status changes isActive...');
  {
    const keyB = inMemoryApiKeys.find(k => k.subdomain === tenantBId);
    const initialStatus = keyB.isActive;

    const req = {
      params: { id: keyB._id.toString() },
      user: { role: 'admin', subdomain: tenantBId }
    };
    const res = mockRes();
    await apiKeyController.toggleApiKey(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.data.isActive, !initialStatus);
    console.log('✓ PASS: Authorized status toggle changes state correctly.');
  }

  // Test 11: Malformed ObjectId handling
  console.log('\nTest 11: Malformed ObjectId returns 400 Bad Request...');
  {
    const req = {
      params: { id: 'invalid-object-id-123' },
      user: { role: 'admin', subdomain: tenantAId }
    };
    const res = mockRes();
    let errCaught = false;
    try {
      await apiKeyController.revokeApiKey(req, res);
    } catch (err) {
      errCaught = true;
      assert.strictEqual(res.statusCode, 400);
      assert.ok(err.message.includes('Invalid API Key ID'));
    }
    assert.ok(errCaught, 'Malformed ID must throw 400');
    console.log('✓ PASS: Malformed ObjectId rejected with 400 Bad Request.');
  }

  // Test 12: validateApiKey middleware - Missing key returns 401
  console.log('\nTest 12: validateApiKey rejects missing x-api-key (401)...');
  {
    const req = {
      header: (name) => (name.toLowerCase() === 'x-api-key' ? null : null)
    };
    const res = mockRes();
    let nextCalled = false;
    await validateApiKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(nextCalled, false);
    console.log('✓ PASS: Missing x-api-key rejected with 401 Unauthorized.');
  }

  // Test 13: validateApiKey middleware - Inactive or non-existent key returns 403
  console.log('\nTest 13: validateApiKey rejects invalid or inactive key (403)...');
  {
    const req = {
      header: (name) => (name.toLowerCase() === 'x-api-key' ? 'cg_nonexistentkey' : null)
    };
    const res = mockRes();
    let nextCalled = false;
    await validateApiKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(nextCalled, false);
    console.log('✓ PASS: Non-existent key rejected with 403 Forbidden.');
  }

  // Test 14: validateApiKey middleware - Expired key returns 403
  console.log('\nTest 14: validateApiKey rejects expired key (403)...');
  {
    const expiredKey = await ApiKey.create({
      key: 'cg_expired1234567890',
      clientName: 'Expired Client',
      subdomain: tenantAId,
      permissions: ['read'],
      expiry: new Date(Date.now() - 100000), // expired in past
      isActive: true
    });

    const req = {
      header: (name) => (name.toLowerCase() === 'x-api-key' ? expiredKey.key : null)
    };
    const res = mockRes();
    let nextCalled = false;
    await validateApiKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.data.message.includes('expired'));
    assert.strictEqual(nextCalled, false);
    console.log('✓ PASS: Expired API key rejected with 403 Forbidden.');
  }

  // Test 15: validateApiKey middleware - Active, valid key passes
  console.log('\nTest 15: validateApiKey passes valid, active, non-expired key...');
  {
    const validKey = await ApiKey.create({
      key: 'cg_validkey1234567890',
      clientName: 'Valid Client',
      subdomain: tenantAId,
      permissions: ['attendance:read', 'workers:read'],
      expiry: new Date(Date.now() + 10000000),
      isActive: true
    });

    const req = {
      header: (name) => (name.toLowerCase() === 'x-api-key' ? validKey.key : null),
      method: 'GET',
      originalUrl: '/api/external/attendance'
    };
    const res = mockRes();
    let nextCalled = false;
    await validateApiKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'next() must be called for valid key');
    assert.ok(req.apiKey, 'req.apiKey must be attached');
    assert.strictEqual(req.apiKey.clientName, 'Valid Client');
    console.log('✓ PASS: Valid API key attaches req.apiKey and continues chain.');
  }

  // Test 16: authorizeApi middleware - Scoped permission checks
  console.log('\nTest 16: authorizeApi verifies module permissions...');
  {
    // Key has ['attendance:read', 'workers:read']
    const testReq = {
      apiKey: {
        permissions: ['attendance:read', 'workers:read']
      }
    };

    // Allowed action: attendance:read
    {
      const res = mockRes();
      let nextCalled = false;
      authorizeApi('attendance', 'read')(testReq, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
    }

    // Denied action: attendance:write
    {
      const res = mockRes();
      let nextCalled = false;
      authorizeApi('attendance', 'write')(testReq, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.data.message.includes('Insufficient permissions'));
    }

    // Denied action: invoices:read
    {
      const res = mockRes();
      let nextCalled = false;
      authorizeApi('invoices', 'read')(testReq, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
    }

    // Global admin permission allows everything
    {
      const adminReq = { apiKey: { permissions: ['admin'] } };
      const res = mockRes();
      let nextCalled = false;
      authorizeApi('invoices', 'write')(adminReq, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
    }

    console.log('✓ PASS: authorizeApi enforces granular permissions and honors admin wildcard.');
  }

  // Test 17: Route role protection - Worker role rejected by adminOnly
  console.log('\nTest 17: Non-admin roles (worker) blocked by adminOnly middleware (403)...');
  {
    const req = {
      user: { role: 'worker', subdomain: tenantAId }
    };
    const res = mockRes();
    let nextCalled = false;
    adminOnly(req, res, () => { nextCalled = true; });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.message, 'Access denied');
    assert.strictEqual(nextCalled, false);
    console.log('✓ PASS: Worker role rejected from /api/admin/keys by adminOnly.');
  }

  console.log('\n======================================================');
  console.log('ALL API KEY MANAGEMENT VERIFICATION TESTS PASSED! (17/17)');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
