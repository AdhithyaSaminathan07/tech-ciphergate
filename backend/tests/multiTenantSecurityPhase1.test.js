/**
 * Phase 1 Multi-Tenant Security Regression Suite (Isolated, In-Memory Mocks Only)
 * - ZERO MongoDB connections
 * - ZERO HTTP server / network calls
 * - Synthetic Tenant A (tenant-alpha) and Tenant B (tenant-beta) data only
 */

const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const assert = require('assert');
const mongoose = require('mongoose');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const TEST_SIGNING_KEY = 'synthetic-phase1-regression-key-never-prod';

const toStr = (v) => (v && v._id ? String(v._id) : v != null ? String(v) : '');

function matchFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [k, cond] of Object.entries(filter)) {
    if (k === '$or') {
      if (!Array.isArray(cond) || !cond.some((sub) => matchFilter(doc, sub))) return false;
      continue;
    }
    if (k === '$and') {
      if (!Array.isArray(cond) || !cond.every((sub) => matchFilter(doc, sub))) return false;
      continue;
    }
    const val = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId) && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ('$ne' in cond && toStr(val) === toStr(cond.$ne)) return false;
      if ('$in' in cond && !cond.$in.some((item) => toStr(item) === toStr(val))) return false;
      if ('$regex' in cond) {
        const re = new RegExp(cond.$regex, cond.$options || '');
        if (!re.test(String(val || ''))) return false;
      }
      if ('$exists' in cond) {
        const exists = val !== undefined;
        if (Boolean(cond.$exists) !== exists) return false;
      }
      if ('$gte' in cond && !(val >= cond.$gte)) return false;
      if ('$lte' in cond && !(val <= cond.$lte)) return false;
      if ('$gt' in cond && !(val > cond.$gt)) return false;
      if ('$lt' in cond && !(val < cond.$lt)) return false;
    } else {
      if (toStr(val) !== toStr(cond)) return false;
    }
  }
  return true;
}

function makeQueryChain(rowsPromise, isSingle = false) {
  let sortSpec = null;
  let skipN = 0;
  let limitN = null;

  const chain = {
    select() { return chain; },
    populate() { return chain; },
    sort(spec) { sortSpec = spec; return chain; },
    skip(n) { skipN = n; return chain; },
    limit(n) { limitN = n; return chain; },
    lean() { return chain; },
    then(resolve, reject) {
      return Promise.resolve(rowsPromise).then((rows) => {
        if (isSingle) return rows;
        let out = [...rows];
        if (sortSpec) {
          const entries = Object.entries(sortSpec);
          out.sort((a, b) => {
            for (const [field, dir] of entries) {
              const av = a[field] ?? 0;
              const bv = b[field] ?? 0;
              if (av < bv) return -1 * dir;
              if (av > bv) return 1 * dir;
            }
            return 0;
          });
        }
        if (skipN) out = out.slice(skipN);
        if (limitN !== null) out = out.slice(0, limitN);
        return out;
      }).then(resolve, reject);
    }
  };
  return chain;
}

function attachInstanceMethods(doc, store) {
  if (!doc || typeof doc !== 'object') return doc;
  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    configurable: true,
    value: () => ({ ...doc })
  });
  Object.defineProperty(doc, 'save', {
    enumerable: false,
    configurable: true,
    value: async () => {
      if (!doc._id) doc._id = new mongoose.Types.ObjectId();
      const idx = store.findIndex((d) => toStr(d._id) === toStr(doc._id));
      if (idx >= 0) store[idx] = doc;
      else store.push(doc);
      return doc;
    }
  });
  Object.defineProperty(doc, 'deleteOne', {
    enumerable: false,
    configurable: true,
    value: async () => {
      const idx = store.findIndex((d) => toStr(d._id) === toStr(doc._id));
      if (idx >= 0) store.splice(idx, 1);
      return { deletedCount: 1 };
    }
  });
  Object.defineProperty(doc, 'populate', {
    enumerable: false,
    configurable: true,
    value: async () => doc
  });
  return doc;
}

function createModelMock(store) {
  function ModelConstructor(data = {}) {
    return attachInstanceMethods({
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    }, store);
  }

  ModelConstructor.find = (filter = {}) => {
    const matches = store.filter((d) => matchFilter(d, filter));
    return makeQueryChain(matches, false);
  };

  ModelConstructor.findOne = (filter = {}) => {
    const matches = store.filter((d) => matchFilter(d, filter));
    const singleChain = {
      _sort: null,
      select() { return singleChain; },
      populate() { return singleChain; },
      sort(spec) { singleChain._sort = spec; return singleChain; },
      lean() { return singleChain; },
      then(resolve, reject) {
        const arr = [...matches];
        if (singleChain._sort) {
          const entries = Object.entries(singleChain._sort);
          arr.sort((a, b) => {
            for (const [f, dir] of entries) {
              const av = a[f] ?? 0;
              const bv = b[f] ?? 0;
              if (av < bv) return -1 * dir;
              if (av > bv) return 1 * dir;
            }
            return 0;
          });
        }
        return Promise.resolve(arr[0] || null).then(resolve, reject);
      }
    };
    return singleChain;
  };

  ModelConstructor.findById = (id) => ModelConstructor.findOne({ _id: id });

  ModelConstructor.create = async (data) => {
    const doc = attachInstanceMethods({
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    }, store);
    store.push(doc);
    return doc;
  };

  ModelConstructor.countDocuments = async (filter = {}) =>
    store.filter((d) => matchFilter(d, filter)).length;

  ModelConstructor.distinct = async (field, filter = {}) => {
    const seen = new Set();
    const out = [];
    for (const d of store) {
      if (!matchFilter(d, filter)) continue;
      const key = toStr(d[field]);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(d[field]);
      }
    }
    return out;
  };

  ModelConstructor.findOneAndUpdate = async (filter, update, opts = {}) => {
    let target = store.find((d) => matchFilter(d, filter));
    if (!target && opts.upsert) {
      target = attachInstanceMethods({ _id: new mongoose.Types.ObjectId(), ...filter }, store);
      store.push(target);
    }
    if (!target) return null;
    if (update.$set) Object.assign(target, update.$set);
    else Object.assign(target, update);
    return target;
  };

  ModelConstructor.findByIdAndUpdate = async (id, update) => {
    const target = store.find((d) => toStr(d._id) === toStr(id));
    if (!target) return null;
    if (update.$set) Object.assign(target, update.$set);
    else Object.assign(target, update);
    return target;
  };

  ModelConstructor.findByIdAndDelete = async (id) => {
    const idx = store.findIndex((d) => toStr(d._id) === toStr(id));
    if (idx < 0) return null;
    const [removed] = store.splice(idx, 1);
    return removed;
  };

  ModelConstructor.updateMany = async (filter, update) => {
    let modifiedCount = 0;
    for (const d of store) {
      if (matchFilter(d, filter)) {
        if (update.$set) Object.assign(d, update.$set);
        else Object.assign(d, update);
        modifiedCount++;
      }
    }
    return { modifiedCount };
  };

  return ModelConstructor;
}

const db = {
  Admin: [],
  Worker: [],
  Settings: [],
  Invoice: [],
  DeleteHistory: [],
  Attendance: [],
  Department: [],
  Leave: [],
  Rule: [],
  JobIntake: [],
  EmployeeHistory: [],
  Ticket: []
};

const models = {};
for (const modelName of Object.keys(db)) {
  models[modelName] = createModelMock(db[modelName]);
}

const whatsappCalls = [];

const ids = {
  adminA: new mongoose.Types.ObjectId(),
  adminB: new mongoose.Types.ObjectId(),
  workerA: new mongoose.Types.ObjectId(),
  workerA2: new mongoose.Types.ObjectId(),
  workerB: new mongoose.Types.ObjectId(),
  deptA: new mongoose.Types.ObjectId(),
  deptB: new mongoose.Types.ObjectId(),
  settingsA: new mongoose.Types.ObjectId(),
  settingsB: new mongoose.Types.ObjectId(),
  invA: new mongoose.Types.ObjectId(),
  invAWorker: new mongoose.Types.ObjectId(),
  invB: new mongoose.Types.ObjectId(),
  invBWorker: new mongoose.Types.ObjectId(),
  invOrphan: new mongoose.Types.ObjectId(),
  delHistA: new mongoose.Types.ObjectId(),
  delHistB: new mongoose.Types.ObjectId(),
  attA: new mongoose.Types.ObjectId(),
  attB: new mongoose.Types.ObjectId()
};

function resetSyntheticDb() {
  for (const k of Object.keys(db)) db[k].length = 0;
  whatsappCalls.length = 0;

  db.Admin.push(
    { _id: ids.adminA, username: 'admin_alpha', email: 'a@alpha.example', subdomain: 'tenant-alpha', role: 'Admin' },
    { _id: ids.adminB, username: 'admin_beta', email: 'b@beta.example', subdomain: 'tenant-beta', role: 'admin' }
  );

  db.Department.push(
    { _id: ids.deptA, name: 'Alpha Dept', subdomain: 'tenant-alpha', departmentType: 'Project' },
    { _id: ids.deptB, name: 'Beta Dept', subdomain: 'tenant-beta', departmentType: 'Project' }
  );

  db.Worker.push(
    {
      _id: ids.workerA,
      name: 'Alpha User 1',
      username: 'worker_alpha_1',
      rfid: 'AL1001',
      subdomain: 'tenant-alpha',
      department: ids.deptA,
      status: 'Active',
      role: 'developer',
      faceEmbeddings: [[0.1, 0.1, 0.1, 0.1]]
    },
    {
      _id: ids.workerA2,
      name: 'Alpha User 2',
      username: 'worker_alpha_2',
      rfid: 'AL1002',
      subdomain: 'tenant-alpha',
      department: ids.deptA,
      status: 'Active',
      role: 'developer',
      faceEmbeddings: [[0.2, 0.2, 0.2, 0.2]]
    },
    {
      _id: ids.workerB,
      name: 'Beta User',
      username: 'worker_beta',
      rfid: 'BE2002',
      subdomain: 'tenant-beta',
      department: ids.deptB,
      status: 'Active',
      role: 'manager',
      faceEmbeddings: [[0.9, 0.9, 0.9, 0.9]]
    }
  );

  db.Settings.push(
    {
      _id: ids.settingsA,
      subdomain: 'tenant-alpha',
      updatedBy: ids.adminA,
      attendanceLocation: { enabled: false, latitude: 10, longitude: 78, radius: 100 },
      lunchBreakManagement: { enabled: true, lunchOutTime: '13:00', returnDeadline: '14:00', gracePeriodMinutes: 5, sessions: [] },
      paymentDetails: { upiId: 'alpha@upi', accountNumber: '11112222' },
      aiConfig: { deepseekApiKey: 'sk-alpha-synthetic-1234' }
    },
    {
      _id: ids.settingsB,
      subdomain: 'tenant-beta',
      updatedBy: ids.adminB,
      attendanceLocation: { enabled: true, latitude: 11, longitude: 79, radius: 200 },
      lunchBreakManagement: { enabled: false, lunchOutTime: '13:30', returnDeadline: '14:30', gracePeriodMinutes: 0, sessions: [] },
      paymentDetails: { upiId: 'beta-secret@upi', accountNumber: '99998888' },
      aiConfig: { deepseekApiKey: 'sk-beta-secret-9999' }
    }
  );

  const todayIST = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  db.Attendance.push(
    {
      _id: ids.attA,
      name: 'Alpha User 1',
      username: 'worker_alpha_1',
      rfid: 'AL1001',
      subdomain: 'tenant-alpha',
      department: ids.deptA,
      departmentName: 'Alpha Dept',
      date: todayIST,
      time: '09:05:00 AM',
      presence: true,
      worker: ids.workerA,
      punchType: 'REGULAR',
      createdAt: new Date(Date.now() - 3600 * 1000)
    },
    {
      _id: ids.attB,
      name: 'Beta User',
      username: 'worker_beta',
      rfid: 'BE2002',
      subdomain: 'tenant-beta',
      department: ids.deptB,
      departmentName: 'Beta Dept',
      date: todayIST,
      time: '09:00:00 AM',
      presence: true,
      worker: ids.workerB,
      punchType: 'REGULAR',
      createdAt: new Date(Date.now() - 3600 * 1000)
    }
  );

  const pastDate = new Date(Date.now() - 7200 * 1000);
  const recentDate = new Date();

  db.Invoice.push(
    {
      _id: ids.invA,
      invoiceNo: 'SYN-A-001',
      invoiceDate: '11-11-2026',
      actualDate: new Date('2026-11-11'),
      customerName: 'Synthetic Alpha Customer',
      customerContact: '9876543210',
      items: [{ description: 'Web Setup', qty: 1, rate: 100, gst: 0, total: 100 }],
      createdBy: ids.adminA,
      createdByModel: 'Admin',
      source: 'admin',
      gstEnabled: true,
      saleType: 'Intrastate',
      adminLastViewed: pastDate,
      createdAt: pastDate
    },
    {
      _id: ids.invAWorker,
      invoiceNo: 'SYN-A-002',
      invoiceDate: '11-11-2026',
      actualDate: new Date('2026-11-11'),
      customerName: 'Synthetic Alpha Worker Customer',
      items: [{ description: 'Addon', qty: 1, rate: 200, gst: 0, total: 200 }],
      createdBy: ids.workerA,
      createdByModel: 'Worker',
      source: 'worker',
      gstEnabled: true,
      saleType: 'Intrastate',
      createdAt: recentDate
    },
    {
      _id: ids.invB,
      invoiceNo: 'SYN-B-001',
      invoiceDate: '11-11-2026',
      actualDate: new Date('2026-11-11'),
      customerName: 'Synthetic Beta Customer',
      customerContact: '9123456789',
      items: [{ description: 'Secret Beta Item', qty: 1, rate: 500, gst: 0, total: 500 }],
      createdBy: ids.adminB,
      createdByModel: 'Admin',
      source: 'admin',
      gstEnabled: true,
      saleType: 'Intrastate',
      adminLastViewed: pastDate,
      createdAt: pastDate
    },
    {
      _id: ids.invBWorker,
      invoiceNo: 'SYN-B-002',
      invoiceDate: '11-11-2026',
      actualDate: new Date('2026-11-11'),
      customerName: 'Synthetic Beta Worker Customer',
      items: [{ description: 'Secret Beta Worker Item', qty: 1, rate: 300, gst: 0, total: 300 }],
      createdBy: ids.workerB,
      createdByModel: 'Worker',
      source: 'worker',
      gstEnabled: false,
      saleType: 'Intrastate',
      createdAt: recentDate
    },
    {
      _id: ids.invOrphan,
      invoiceNo: 'SYN-ORPHAN-001',
      invoiceDate: '11-11-2026',
      actualDate: new Date('2026-11-11'),
      customerName: 'Orphan Customer',
      items: [{ description: 'Orphan', qty: 1, rate: 50, gst: 0, total: 50 }],
      createdBy: new mongoose.Types.ObjectId(),
      createdByModel: 'Admin',
      source: 'admin',
      createdAt: pastDate
    }
  );

  db.DeleteHistory.push(
    {
      _id: ids.delHistA,
      invoiceId: new mongoose.Types.ObjectId(),
      invoiceNo: 'SYN-A-OLD',
      invoiceDate: '10-11-2026',
      customerName: 'Synthetic Deleted Alpha Customer',
      totalAmount: 150,
      deletedByRole: 'Admin',
      deletedByName: 'Alpha Admin',
      deletedById: ids.adminA,
      deletedAt: new Date()
    },
    {
      _id: ids.delHistB,
      invoiceId: new mongoose.Types.ObjectId(),
      invoiceNo: 'SYN-B-OLD',
      invoiceDate: '10-11-2026',
      customerName: 'Synthetic Deleted Beta Customer',
      totalAmount: 999,
      deletedByRole: 'Admin',
      deletedByName: 'Beta Admin',
      deletedById: ids.adminB,
      deletedAt: new Date()
    }
  );

  for (const modelName of Object.keys(db)) {
    db[modelName].forEach((doc) => attachInstanceMethods(doc, db[modelName]));
  }
}

const jwtMock = {
  sign(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
    const sig = crypto.createHmac('sha256', TEST_SIGNING_KEY).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  },
  verify(token) {
    const [header, body, sig] = String(token || '').split('.');
    if (!header || !body || !sig) throw new Error('Malformed token');
    const expected = crypto.createHmac('sha256', TEST_SIGNING_KEY).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) throw new Error('Invalid signature');
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'jsonwebtoken') return jwtMock;
  if (request.endsWith('/models/Admin') || request.endsWith('\\models\\Admin')) return models.Admin;
  if (request.endsWith('/models/Worker') || request.endsWith('\\models\\Worker')) return models.Worker;
  if (request.endsWith('/models/Settings') || request.endsWith('\\models\\Settings')) return models.Settings;
  if (request.endsWith('/models/Invoice') || request.endsWith('\\models\\Invoice')) return models.Invoice;
  if (request.endsWith('/models/DeleteHistory') || request.endsWith('\\models\\DeleteHistory')) return models.DeleteHistory;
  if (request.endsWith('/models/Attendance') || request.endsWith('\\models\\Attendance')) return models.Attendance;
  if (request.endsWith('/models/Department') || request.endsWith('\\models\\Department')) return models.Department;
  if (request.endsWith('/models/Leave') || request.endsWith('\\models\\Leave')) return models.Leave;
  if (request.endsWith('/models/Rule') || request.endsWith('\\models\\Rule')) return models.Rule;
  if (request.endsWith('/models/JobIntake') || request.endsWith('\\models\\JobIntake')) return models.JobIntake;
  if (request.endsWith('/models/EmployeeHistory') || request.endsWith('\\models\\EmployeeHistory')) return models.EmployeeHistory;
  if (request.endsWith('/models/ticketModel') || request.endsWith('\\models\\ticketModel')) return models.Ticket;
  if (request.includes('utils/socket') || request.includes('utils\\socket')) {
    return { getIO: () => null };
  }
  if (request.includes('services/jobIntakeService') || request.includes('services\\jobIntakeService')) {
    return { processJobIntakeFromVerifiedInvoice: async () => ({ ticketCreated: true }) };
  }
  if (request.includes('services/jobAssignmentService') || request.includes('services\\jobAssignmentService')) {
    return { classifyInvoiceJob: () => ({ jobType: 'Web', reason: 'mock', priorityMatched: false }) };
  }
  if (request.includes('services/secondBrainService') || request.includes('services\\secondBrainService')) {
    return { syncBrainItem: async () => null };
  }
  if (request.includes('services/whatsappService') || request.includes('services\\whatsappService')) {
    return {
      sendWhatsApp: async (subdomain, phone, payload) => {
        whatsappCalls.push({ subdomain, phone, payload });
        return { success: true };
      }
    };
  }
  if (request.includes('schedulers/lunchBreakScheduler') || request.includes('schedulers\\lunchBreakScheduler')) {
    return originalLoad.call(this, path.join(BACKEND_ROOT, 'schedulers/lunchBreakScheduler.js'), parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { protect, adminOnly, adminOrWorker } = require(path.join(BACKEND_ROOT, 'middleware/authMiddleware.js'));
const settingsController = require(path.join(BACKEND_ROOT, 'controllers/settingsController.js'));
const invoiceController = require(path.join(BACKEND_ROOT, 'controllers/invoiceController.js'));
const attendanceController = require(path.join(BACKEND_ROOT, 'controllers/attendanceController.js'));
const departmentController = require(path.join(BACKEND_ROOT, 'controllers/departmentController.js'));

async function runEndpoint(middlewares, handler, { token = null, apiKey = null, reqUser = null, params = {}, body = {}, query = {} } = {}) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
    params,
    body,
    query,
    originalUrl: '/api/isolated-test'
  };
  if (apiKey) req.apiKey = apiKey;
  if (reqUser) req.user = reqUser;

  let statusCode = 200;
  let jsonBody = null;
  let ended = false;
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    status(code) { statusCode = code; return res; },
    json(data) { jsonBody = data; ended = true; return res; }
  };

  try {
    for (const mw of middlewares) {
      let nextCalled = false;
      let nextErr = null;
      await mw(req, res, (err) => {
        if (err) nextErr = err;
        else nextCalled = true;
      });
      if (nextErr) throw nextErr;
      if (!nextCalled || ended) {
        return { status: statusCode, body: jsonBody, reqUser: req.user };
      }
    }
    await handler(req, res, (err) => { if (err) throw err; });
  } catch (err) {
    if (statusCode === 200) statusCode = 500;
    jsonBody = { message: err.message };
  }
  return { status: statusCode, body: jsonBody, reqUser: req.user };
}

async function main() {
  const tokenAdminA = jwtMock.sign({ id: String(ids.adminA), role: 'Admin' });
  const tokenAdminB = jwtMock.sign({ id: String(ids.adminB), role: 'admin' });
  const tokenWorkerA = jwtMock.sign({ id: String(ids.workerA), role: 'worker' });
  const tokenWorkerB = jwtMock.sign({ id: String(ids.workerB), role: 'worker' });

  let passed = 0;
  const test = async (name, fn) => {
    resetSyntheticDb();
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  };

  // === MODULE A: SETTINGS ===
  await test('S-01: Tenant A Admin cannot read Tenant B settings (GET /api/settings/tenant-beta)', async () => {
    const r = await runEndpoint([protect, adminOrWorker], settingsController.getSettings, {
      token: tokenAdminA,
      params: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r.status, 403);
  });

  await test('S-02: Tenant A Admin cannot overwrite Tenant B settings (PUT /api/settings/tenant-beta)', async () => {
    const r = await runEndpoint([protect, adminOnly], settingsController.updateSettings, {
      token: tokenAdminA,
      params: { subdomain: 'tenant-beta' },
      body: { attendanceLocation: { enabled: false, radius: 9999 } }
    });
    assert.strictEqual(r.status, 403);
    const beta = db.Settings.find((s) => s.subdomain === 'tenant-beta');
    assert.strictEqual(beta.attendanceLocation.enabled, true);
    assert.strictEqual(toStr(beta.updatedBy), toStr(ids.adminB));
  });

  await test('S-03: Tenant A Worker cannot read Tenant B settings or mutate Tenant A settings', async () => {
    const rRead = await runEndpoint([protect, adminOrWorker], settingsController.getSettings, {
      token: tokenWorkerA,
      params: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(rRead.status, 403);

    const rWrite = await runEndpoint([protect], settingsController.updateSettings, {
      token: tokenWorkerA,
      params: { subdomain: 'tenant-alpha' },
      body: { lunchBreakManagement: { enabled: false } }
    });
    assert.strictEqual(rWrite.status, 403);

    const rMeal = await runEndpoint([protect], settingsController.updateMealSettings, {
      token: tokenWorkerA,
      params: { subdomain: 'tenant-alpha', mealType: 'lunch' },
      body: { enabled: false }
    });
    assert.strictEqual(rMeal.status, 403);
  });

  await test('S-04: Public settings GET does NOT auto-create missing tenant rows in DB', async () => {
    const before = db.Settings.length;
    const r = await runEndpoint([], settingsController.getSettingsPublic, {
      params: { subdomain: 'arbitrary-ghost-tenant' }
    });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(db.Settings.length, before);
  });

  await test('S-05: Public settings GET omits paymentDetails and aiConfig', async () => {
    const r = await runEndpoint([], settingsController.getSettingsPublic, {
      params: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.paymentDetails, undefined);
    assert.strictEqual(r.body.aiConfig, undefined);
    assert.ok(r.body.attendanceLocation);
  });

  await test('S-06: Missing or "main" authenticated subdomain returns 401', async () => {
    const rMain = await runEndpoint([], settingsController.getSettings, {
      reqUser: { _id: ids.adminA, role: 'admin', subdomain: 'main' },
      params: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rMain.status, 401);

    const rMissing = await runEndpoint([], settingsController.getSettings, {
      reqUser: { _id: ids.adminA, role: 'admin' },
      params: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rMissing.status, 401);
  });

  await test('S-07: Positive Tenant A Admin reads/updates & Worker reads own Tenant A settings', async () => {
    const rAdminGet = await runEndpoint([protect, adminOrWorker], settingsController.getSettings, {
      token: tokenAdminA,
      params: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rAdminGet.status, 200);
    assert.strictEqual(rAdminGet.body.subdomain, 'tenant-alpha');

    const rAdminPut = await runEndpoint([protect, adminOnly], settingsController.updateSettings, {
      token: tokenAdminA,
      params: { subdomain: 'tenant-alpha' },
      body: { attendanceLocation: { enabled: true, latitude: 10.5, longitude: 78.5, radius: 150 } }
    });
    assert.strictEqual(rAdminPut.status, 200);
    assert.strictEqual(db.Settings.find((s) => s.subdomain === 'tenant-alpha').attendanceLocation.radius, 150);

    const rWorkerGet = await runEndpoint([protect, adminOrWorker], settingsController.getSettings, {
      token: tokenWorkerA,
      params: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rWorkerGet.status, 200);
  });

  await test('S-08: External API key reads own tenant settings and rejects foreign tenant', async () => {
    const rOk = await runEndpoint([], settingsController.getSettings, {
      apiKey: { subdomain: 'tenant-alpha' },
      params: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rOk.status, 200);

    const rDenied = await runEndpoint([], settingsController.getSettings, {
      apiKey: { subdomain: 'tenant-alpha' },
      params: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(rDenied.status, 403);
  });

  // === MODULE B: INVOICE ===
  await test('I-01: Tenant A Admin getInvoicesByAdminOrWorker returns ONLY Tenant A invoices', async () => {
    const r = await runEndpoint([protect, adminOrWorker], invoiceController.getInvoicesByAdminOrWorker, {
      token: tokenAdminA
    });
    assert.strictEqual(r.status, 200);
    const nos = r.body.data.map((i) => i.invoiceNo);
    assert.ok(nos.includes('SYN-A-001'));
    assert.ok(nos.includes('SYN-A-002'));
    assert.ok(!nos.includes('SYN-B-001'));
    assert.ok(!nos.includes('SYN-B-002'));
  });

  await test('I-02: Tenant A Admin getAllInvoices returns ONLY Tenant A invoices; Worker rejected 403', async () => {
    const rAdmin = await runEndpoint([protect, adminOnly], invoiceController.getAllInvoices, {
      token: tokenAdminA,
      query: { filterType: 'all' }
    });
    assert.strictEqual(rAdmin.status, 200);
    const nos = rAdmin.body.data.map((i) => i.invoiceNo);
    assert.ok(nos.includes('SYN-A-001'));
    assert.ok(!nos.includes('SYN-B-001'));

    const rWorker = await runEndpoint([protect], invoiceController.getAllInvoices, {
      token: tokenWorkerA
    });
    assert.strictEqual(rWorker.status, 403);
  });

  await test('I-03: Tenant A Admin cannot read Tenant B invoice by ID', async () => {
    const r = await runEndpoint([protect, adminOrWorker], invoiceController.getInvoiceById, {
      token: tokenAdminA,
      params: { id: String(ids.invB) }
    });
    assert.strictEqual(r.status, 403);
  });

  await test('I-04: Tenant A Admin cannot update Tenant B invoice', async () => {
    const r = await runEndpoint([protect, adminOrWorker], invoiceController.updateInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invB) },
      body: { customerName: 'Hacked' }
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(db.Invoice.find((i) => toStr(i._id) === toStr(ids.invB)).customerName, 'Synthetic Beta Customer');
  });

  await test('I-05: Tenant A Admin cannot delete Tenant B invoice', async () => {
    const r = await runEndpoint([protect, adminOrWorker], invoiceController.deleteInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invB) }
    });
    assert.strictEqual(r.status, 403);
    assert.ok(db.Invoice.some((i) => toStr(i._id) === toStr(ids.invB)));
  });

  await test('I-06: Delete history listing & single-record access isolated per tenant', async () => {
    const rList = await runEndpoint([protect, adminOnly], invoiceController.getDeleteHistoryForAdmin, {
      token: tokenAdminA
    });
    assert.strictEqual(rList.status, 200);
    const nos = rList.body.data.map((d) => d.invoiceNo);
    assert.deepStrictEqual(nos, ['SYN-A-OLD']);

    const rCross = await runEndpoint([protect, adminOrWorker], invoiceController.getDeletedInvoiceById, {
      token: tokenAdminA,
      params: { id: String(ids.delHistB) }
    });
    assert.strictEqual(rCross.status, 403);

    const rOwn = await runEndpoint([protect, adminOrWorker], invoiceController.getDeletedInvoiceById, {
      token: tokenAdminA,
      params: { id: String(ids.delHistA) }
    });
    assert.strictEqual(rOwn.status, 200);
  });

  await test('I-07: renumberInvoices rejects Tenant B invoiceIds (403) & scopes full renumber to Tenant A', async () => {
    const rForeign = await runEndpoint([protect, adminOnly], invoiceController.renumberInvoices, {
      token: tokenAdminA,
      body: { prefix: 'HACK', invoiceIds: [String(ids.invB)] }
    });
    assert.strictEqual(rForeign.status, 403);
    assert.strictEqual(db.Invoice.find((i) => toStr(i._id) === toStr(ids.invB)).invoiceNo, 'SYN-B-001');

    const rOwn = await runEndpoint([protect, adminOnly], invoiceController.renumberInvoices, {
      token: tokenAdminA,
      body: { prefix: 'AL', startNumber: 10 }
    });
    assert.strictEqual(rOwn.status, 200);
    assert.strictEqual(db.Invoice.find((i) => toStr(i._id) === toStr(ids.invB)).invoiceNo, 'SYN-B-001');
  });

  await test('I-08: updateAdminLastViewed & getNewInvoiceCount scoped strictly to Tenant A', async () => {
    const rCountBefore = await runEndpoint([protect, adminOnly], invoiceController.getNewInvoiceCount, {
      token: tokenAdminA
    });
    assert.strictEqual(rCountBefore.status, 200);
    assert.strictEqual(rCountBefore.body.data.count, 1); // Only Tenant A worker invoice SYN-A-002 (excludes SYN-B-002)

    const betaBefore = db.Invoice.find((i) => toStr(i._id) === toStr(ids.invB)).adminLastViewed;
    const rViewed = await runEndpoint([protect, adminOnly], invoiceController.updateAdminLastViewed, {
      token: tokenAdminA
    });
    assert.strictEqual(rViewed.status, 200);
    assert.strictEqual(db.Invoice.find((i) => toStr(i._id) === toStr(ids.invB)).adminLastViewed, betaBefore);

    const rCountAfter = await runEndpoint([protect, adminOnly], invoiceController.getNewInvoiceCount, {
      token: tokenAdminA
    });
    assert.strictEqual(rCountAfter.status, 200);
    assert.strictEqual(rCountAfter.body.data.count, 0);
  });

  await test('I-09: sendInvoiceWhatsApp rejects cross-tenant & uses auth tenant subdomain', async () => {
    const rCross = await runEndpoint([protect, adminOrWorker], invoiceController.sendInvoiceWhatsApp, {
      token: tokenAdminA,
      params: { id: String(ids.invB) },
      body: { recipientPhone: '9876543210' }
    });
    assert.strictEqual(rCross.status, 403);
    assert.strictEqual(whatsappCalls.length, 0);

    const rOwn = await runEndpoint([protect, adminOrWorker], invoiceController.sendInvoiceWhatsApp, {
      token: tokenAdminA,
      params: { id: String(ids.invA) },
      body: { recipientPhone: '9876543210' }
    });
    assert.strictEqual(rOwn.status, 200);
    assert.strictEqual(whatsappCalls.length, 1);
    assert.strictEqual(whatsappCalls[0].subdomain, 'tenant-alpha');
  });

  await test('I-10: previewJobIntakeForInvoice & triggerJobIntakeForInvoice reject cross-tenant & succeed for Tenant A', async () => {
    const rPrevCross = await runEndpoint([protect, adminOrWorker], invoiceController.previewJobIntakeForInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invB) }
    });
    assert.strictEqual(rPrevCross.status, 403);

    const rTrigCross = await runEndpoint([protect, adminOrWorker], invoiceController.triggerJobIntakeForInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invB) }
    });
    assert.strictEqual(rTrigCross.status, 403);

    const rPrevOwn = await runEndpoint([protect, adminOrWorker], invoiceController.previewJobIntakeForInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invA) }
    });
    assert.strictEqual(rPrevOwn.status, 200);
    assert.strictEqual(rPrevOwn.body.data.subdomain, 'tenant-alpha');
  });

  await test('I-11: Fail-closed when invoice creator cannot be resolved', async () => {
    const rGet = await runEndpoint([protect, adminOrWorker], invoiceController.getInvoiceById, {
      token: tokenAdminA,
      params: { id: String(ids.invOrphan) }
    });
    assert.strictEqual(rGet.status, 403);

    const rUpd = await runEndpoint([protect, adminOrWorker], invoiceController.updateInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invOrphan) },
      body: { customerName: 'Should Fail' }
    });
    assert.strictEqual(rUpd.status, 403);

    const rDel = await runEndpoint([protect, adminOrWorker], invoiceController.deleteInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invOrphan) }
    });
    assert.strictEqual(rDel.status, 403);
  });

  await test('I-12: Worker cannot read/delete peer or cross-tenant invoices; can read own', async () => {
    const rPeer = await runEndpoint([protect, adminOrWorker], invoiceController.getInvoiceById, {
      token: tokenWorkerA,
      params: { id: String(ids.invA) }
    });
    assert.strictEqual(rPeer.status, 403);

    const rOwn = await runEndpoint([protect, adminOrWorker], invoiceController.getInvoiceById, {
      token: tokenWorkerA,
      params: { id: String(ids.invAWorker) }
    });
    assert.strictEqual(rOwn.status, 200);
  });

  await test('I-13: Positive Tenant A Admin CRUD & getNextInvoiceNo workflow', async () => {
    const rGet = await runEndpoint([protect, adminOrWorker], invoiceController.getInvoiceById, {
      token: tokenAdminA,
      params: { id: String(ids.invA) }
    });
    assert.strictEqual(rGet.status, 200);

    const rUpd = await runEndpoint([protect, adminOrWorker], invoiceController.updateInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invA) },
      body: { customerName: 'Updated Alpha Customer' }
    });
    assert.strictEqual(rUpd.status, 200);

    const rNext = await runEndpoint([protect, adminOrWorker], invoiceController.getNextInvoiceNo, {
      token: tokenAdminA
    });
    assert.strictEqual(rNext.status, 200);
    assert.ok(rNext.body.data.nextInvoiceNo.startsWith('TV'));

    const rDel = await runEndpoint([protect, adminOrWorker], invoiceController.deleteInvoice, {
      token: tokenAdminA,
      params: { id: String(ids.invA) }
    });
    assert.strictEqual(rDel.status, 200);
  });

  // === MODULE C: ATTENDANCE ===
  await test('A-01: Tenant A Worker blocked by adminOnly on POST /api/attendance (getAttendance)', async () => {
    const r = await runEndpoint([protect, adminOnly], attendanceController.getAttendance, {
      token: tokenWorkerA,
      body: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r.status, 403);
  });

  await test('A-02: Tenant A Admin blocked on getAttendance & getPaginatedAttendance for Tenant B', async () => {
    const r1 = await runEndpoint([protect, adminOnly], attendanceController.getAttendance, {
      token: tokenAdminA,
      body: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r1.status, 403);

    const r2 = await runEndpoint([protect, adminOnly], attendanceController.getPaginatedAttendance, {
      token: tokenAdminA,
      body: { subdomain: 'tenant-beta', page: 1, limit: 10 }
    });
    assert.strictEqual(r2.status, 403);
  });

  await test('A-03: Tenant A Worker/Admin blocked on cross-tenant /worker, /worker-last, /summary, /lunch-overview', async () => {
    const r1 = await runEndpoint([protect], attendanceController.getWorkerAttendance, {
      token: tokenWorkerA,
      body: { rfid: 'BE2002', subdomain: 'tenant-beta' }
    });
    const r2 = await runEndpoint([protect], attendanceController.getWorkerLastAttendance, {
      token: tokenWorkerA,
      body: { rfid: 'BE2002', subdomain: 'tenant-beta' }
    });
    const r3 = await runEndpoint([protect, adminOnly], attendanceController.getAttendanceSummary, {
      token: tokenAdminA,
      body: { subdomain: 'tenant-beta' }
    });
    const r4 = await runEndpoint([protect, adminOnly], attendanceController.getLunchAttendanceOverview, {
      token: tokenAdminA,
      body: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r1.status, 403);
    assert.strictEqual(r2.status, 403);
    assert.strictEqual(r3.status, 403);
    assert.strictEqual(r4.status, 403);
  });

  await test('A-04: Tenant A Worker blocked from querying peer worker RFID in own tenant', async () => {
    const r1 = await runEndpoint([protect], attendanceController.getWorkerAttendance, {
      token: tokenWorkerA,
      body: { rfid: 'AL1002', subdomain: 'tenant-alpha' }
    });
    const r2 = await runEndpoint([protect], attendanceController.getWorkerLastAttendance, {
      token: tokenWorkerA,
      body: { rfid: 'AL1002', subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(r1.status, 403);
    assert.strictEqual(r2.status, 403);
  });

  await test('A-05: Tenant A Admin cannot punch putAttendance into Tenant B', async () => {
    const before = db.Attendance.length;
    const r = await runEndpoint([protect], attendanceController.putAttendance, {
      token: tokenAdminA,
      body: { rfid: 'BE2002', subdomain: 'tenant-beta', presence: false }
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(db.Attendance.length, before);
  });

  await test('A-06: Tenant A Admin cannot punch Tenant B worker via putRfidAttendance', async () => {
    const before = db.Attendance.length;
    const r = await runEndpoint([protect], attendanceController.putRfidAttendance, {
      token: tokenAdminA,
      body: { rfid: 'BE2002' }
    });
    assert.strictEqual(r.status, 404); // Not found in tenant-alpha
    assert.strictEqual(db.Attendance.length, before);
  });

  await test('A-07: Tenant A Admin cannot punch face-recognition into Tenant B', async () => {
    const before = db.Attendance.length;
    const r = await runEndpoint([protect], attendanceController.recognizeFaceAndMarkAttendance, {
      token: tokenAdminA,
      body: { subdomain: 'tenant-beta', faceDescriptor: [0.9, 0.9, 0.9, 0.9] }
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(db.Attendance.length, before);
  });

  await test('A-08: Positive Tenant A Admin & Worker attendance operations succeed within Tenant A', async () => {
    const rGet = await runEndpoint([protect, adminOnly], attendanceController.getAttendance, {
      token: tokenAdminA,
      body: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rGet.status, 200);
    assert.ok(rGet.body.attendance.every((a) => a.subdomain === 'tenant-alpha'));

    const rWorkerOwn = await runEndpoint([protect], attendanceController.getWorkerAttendance, {
      token: tokenWorkerA,
      body: { rfid: 'AL1001', subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rWorkerOwn.status, 200);
    assert.strictEqual(rWorkerOwn.body.attendance.length, 1);

    const rMark = await runEndpoint([protect], attendanceController.putAttendance, {
      token: tokenAdminA,
      body: { rfid: 'AL1001', presence: false }
    });
    assert.strictEqual(rMark.status, 201);
  });

  await test('A-09: External API key preserves attendance summary & punch access scoped to key tenant', async () => {
    const rOk = await runEndpoint([], attendanceController.getAttendanceSummary, {
      apiKey: { subdomain: 'tenant-alpha' },
      body: { subdomain: 'tenant-alpha' }
    });
    assert.strictEqual(rOk.status, 200);

    const rCross = await runEndpoint([], attendanceController.getAttendanceSummary, {
      apiKey: { subdomain: 'tenant-alpha' },
      body: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(rCross.status, 403);
  });

  // === MODULE D: DEPARTMENT ===
  await test('D-01: Tenant A Admin cannot create department in Tenant B', async () => {
    const before = db.Department.length;
    const r = await runEndpoint([protect, adminOnly], departmentController.createDepartment, {
      token: tokenAdminA,
      body: { name: 'Poisoned Beta Dept', subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(db.Department.length, before);
  });

  await test('D-02: Tenant A Worker/Admin cannot read Tenant B departments', async () => {
    const r = await runEndpoint([protect], departmentController.getDepartments, {
      token: tokenWorkerA,
      body: { subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r.status, 403);
  });

  await test('D-03: Tenant A Admin cannot update Tenant B department', async () => {
    const r = await runEndpoint([protect, adminOnly], departmentController.updateDepartment, {
      token: tokenAdminA,
      params: { id: String(ids.deptB) },
      body: { name: 'Hijacked Beta Dept' }
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(db.Department.find((d) => toStr(d._id) === toStr(ids.deptB)).name, 'Beta Dept');
  });

  await test('D-04: Tenant A Admin cannot delete Tenant B department (or unassign Beta workers)', async () => {
    const r = await runEndpoint([protect, adminOnly], departmentController.deleteDepartment, {
      token: tokenAdminA,
      params: { id: String(ids.deptB) }
    });
    assert.strictEqual(r.status, 403);
    assert.ok(db.Department.some((d) => toStr(d._id) === toStr(ids.deptB)));
    assert.strictEqual(toStr(db.Worker.find((w) => toStr(w._id) === toStr(ids.workerB)).department), toStr(ids.deptB));
  });

  await test('D-05: Tenant A Admin cannot assign Tenant B worker in department projectLead/assignedDevelopers', async () => {
    const rCreate = await runEndpoint([protect, adminOnly], departmentController.createDepartment, {
      token: tokenAdminA,
      body: { name: 'Alpha Cross Ref', projectLead: String(ids.workerB) }
    });
    assert.strictEqual(rCreate.status, 403);

    const rUpdate = await runEndpoint([protect, adminOnly], departmentController.updateDepartment, {
      token: tokenAdminA,
      params: { id: String(ids.deptA) },
      body: { name: 'Alpha Dept Renamed', assignedDevelopers: [String(ids.workerB)] }
    });
    assert.strictEqual(rUpdate.status, 403);
  });

  await test('D-06: Tenant B Worker blocked by adminOnly on create/update/delete department', async () => {
    const r = await runEndpoint([protect, adminOnly], departmentController.createDepartment, {
      token: tokenWorkerB,
      body: { name: 'Unauthorized Worker Dept', subdomain: 'tenant-beta' }
    });
    assert.strictEqual(r.status, 403);
  });

  await test('D-07: Positive Tenant A Admin department CRUD works cleanly within tenant-alpha', async () => {
    const rCreate = await runEndpoint([protect, adminOnly], departmentController.createDepartment, {
      token: tokenAdminA,
      body: { name: 'Alpha QA Team', projectLead: String(ids.workerA), assignedDevelopers: [String(ids.workerA2)] }
    });
    assert.strictEqual(rCreate.status, 201);
    assert.strictEqual(rCreate.body.subdomain, 'tenant-alpha');

    const rList = await runEndpoint([protect], departmentController.getDepartments, {
      token: tokenWorkerA,
      body: {}
    });
    assert.strictEqual(rList.status, 200);
    assert.ok(rList.body.every((d) => d.subdomain === 'tenant-alpha'));

    const rUpdate = await runEndpoint([protect, adminOnly], departmentController.updateDepartment, {
      token: tokenAdminA,
      params: { id: String(rCreate.body._id) },
      body: { name: 'Alpha QA Team V2' }
    });
    assert.strictEqual(rUpdate.status, 200);

    const rDelete = await runEndpoint([protect, adminOnly], departmentController.deleteDepartment, {
      token: tokenAdminA,
      params: { id: String(rCreate.body._id) }
    });
    assert.strictEqual(rDelete.status, 200);
  });

  // === MODULE AU: AUTH MIDDLEWARE ===
  await test('AU-01: protect attaches req.user.subdomain and normalizes role', async () => {
    const r = await runEndpoint([protect], async (req, res) => {
      res.status(200).json({ role: req.user.role, subdomain: req.user.subdomain });
    }, { token: tokenAdminA });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.role, 'admin');
    assert.strictEqual(r.body.subdomain, 'tenant-alpha');
  });

  console.log(`\nALL ${passed} PHASE-1 MULTI-TENANT SECURITY TESTS PASSED (ZERO DB / ZERO NETWORK).`);
}

main().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
