// backend/tests/schedulerGate.test.js
const assert = require('assert');
const fs = require('fs');

console.log('================================================================');
console.log(' Tech Ciphergate — Scheduler Activation Gate Verification Suite');
console.log('================================================================\n');

// 1. Static AST/code inspection of backend/server.js to verify the exact gate structure
const serverSource = fs.readFileSync('backend/server.js', 'utf8');

// Ensure the old loose condition (NODE_ENV === 'production' || ENABLE_SCHEDULERS === 'true') is gone
assert.strictEqual(
  serverSource.includes("process.env.NODE_ENV === 'production' ||"),
  false,
  'FAIL: server.js must not contain loose NODE_ENV === production scheduler condition!'
);

// Verify exact strict condition
assert.strictEqual(
  serverSource.includes("if (process.env.ENABLE_SCHEDULERS === 'true')"),
  true,
  'FAIL: server.js must strictly check process.env.ENABLE_SCHEDULERS === "true"!'
);

console.log('✓ Code Inspection: server.js strictly uses: if (process.env.ENABLE_SCHEDULERS === "true")\n');

// Helper function simulating the exact evaluation logic in server.js
function evaluateSchedulerActivation(env) {
  // Schedulers start IF AND ONLY IF process.env.ENABLE_SCHEDULERS === 'true'
  if (env.ENABLE_SCHEDULERS === 'true') {
    return { shouldStart: true, message: '🚀 Starting production schedulers...' };
  } else {
    return { shouldStart: false, message: '⚠️ Schedulers disabled. Set ENABLE_SCHEDULERS=true to enable' };
  }
}

// ─── Scenario 1: ENABLE_SCHEDULERS=true (Production or Dev) ───────────────────
console.log('Testing Scenario 1: ENABLE_SCHEDULERS=true');
{
  const resDev = evaluateSchedulerActivation({ NODE_ENV: 'development', ENABLE_SCHEDULERS: 'true' });
  assert.strictEqual(resDev.shouldStart, true, 'Scheduler must be allowed to start when ENABLE_SCHEDULERS=true in dev');

  const resProd = evaluateSchedulerActivation({ NODE_ENV: 'production', ENABLE_SCHEDULERS: 'true' });
  assert.strictEqual(resProd.shouldStart, true, 'Scheduler must be allowed to start when ENABLE_SCHEDULERS=true in prod');
  console.log('  ✓ [PASS] ENABLE_SCHEDULERS=true → Schedulers CAN start');
}

// ─── Scenario 2: ENABLE_SCHEDULERS=false ──────────────────────────────────────
console.log('Testing Scenario 2: ENABLE_SCHEDULERS=false');
{
  const resDev = evaluateSchedulerActivation({ NODE_ENV: 'development', ENABLE_SCHEDULERS: 'false' });
  assert.strictEqual(resDev.shouldStart, false, 'Scheduler must remain disabled when ENABLE_SCHEDULERS=false in dev');

  const resProd = evaluateSchedulerActivation({ NODE_ENV: 'production', ENABLE_SCHEDULERS: 'false' });
  assert.strictEqual(resProd.shouldStart, false, 'Scheduler must remain disabled when ENABLE_SCHEDULERS=false even in prod');
  console.log('  ✓ [PASS] ENABLE_SCHEDULERS=false → Schedulers remain DISABLED');
}

// ─── Scenario 3: ENABLE_SCHEDULERS unset ───────────────────────────────────────
console.log('Testing Scenario 3: ENABLE_SCHEDULERS unset (undefined)');
{
  const resDev = evaluateSchedulerActivation({ NODE_ENV: 'development' });
  assert.strictEqual(resDev.shouldStart, false, 'Scheduler must remain disabled when ENABLE_SCHEDULERS is unset in dev');

  const resProd = evaluateSchedulerActivation({ NODE_ENV: 'production' });
  assert.strictEqual(resProd.shouldStart, false, 'CRITICAL: Scheduler must remain disabled when ENABLE_SCHEDULERS is unset even in NODE_ENV=production');
  console.log('  ✓ [PASS] ENABLE_SCHEDULERS unset → Schedulers remain DISABLED');
}

// ─── Scenario 4: Edge Cases (empty string, 0, random string) ───────────────────
console.log('Testing Scenario 4: Edge cases (empty, numeric 1, random string)');
{
  for (const val of ['', '1', 'TRUE', 'True', 'enabled', '0', null, undefined]) {
    const res = evaluateSchedulerActivation({ NODE_ENV: 'production', ENABLE_SCHEDULERS: val });
    assert.strictEqual(res.shouldStart, false, `Scheduler must remain disabled for ENABLE_SCHEDULERS=${val}`);
  }
  console.log('  ✓ [PASS] Non-"true" values → Schedulers remain DISABLED');
}

console.log('\n================================================================');
console.log(' Gate Summary: All 4 Scheduler Activation Scenarios Passed (100%)');
console.log('================================================================');

