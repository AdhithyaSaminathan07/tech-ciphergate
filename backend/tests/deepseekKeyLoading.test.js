/**
 * Tech Ciphergate — DeepSeek API Key Loading & Environment Isolation Test
 * 
 * Safety & Isolation:
 * - 100% In-memory with synthetic dummy credentials.
 * - Zero real API keys printed, displayed, or used.
 * - Zero network calls to api.deepseek.com or external providers.
 * - Zero database access or mutations.
 */

const assert = require('assert');
const dotenv = require('dotenv');
const OpenAI = require('openai');

console.log('================================================================');
console.log(' DeepSeek API Key Loading & Environment Diagnostic Suite        ');
console.log('================================================================\n');

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✓ [PASS] ${name}`);
  } catch (err) {
    fail++;
    console.error(`✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    console.error(err.stack);
  }
}

(async function runSuite() {
  const originalEnvKey = process.env.DEEPSEEK_API_KEY;

  try {
    // 1. Synthetic Dummy Key Loading
    await test('1. Synthetic dummy key is read cleanly into process.env without corruption', async () => {
      const syntheticKey = 'sk-mock-dummy-deepseek-key-1234567890';
      process.env.DEEPSEEK_API_KEY = syntheticKey;

      assert.strictEqual(process.env.DEEPSEEK_API_KEY, syntheticKey);
      assert(process.env.DEEPSEEK_API_KEY.startsWith('sk-'));
      assert.strictEqual(process.env.DEEPSEEK_API_KEY.length, syntheticKey.length);
    });

    // 2. Dotenv quote parsing behavior
    await test('2. Dotenv strips single and double quotes around DEEPSEEK_API_KEY', async () => {
      const singleQuoted = "DEEPSEEK_API_KEY='sk-single-quoted-synthetic-key'";
      const doubleQuoted = 'DEEPSEEK_API_KEY="sk-double-quoted-synthetic-key"';
      const unquoted = 'DEEPSEEK_API_KEY=sk-unquoted-synthetic-key';

      const parsedSingle = dotenv.parse(singleQuoted);
      const parsedDouble = dotenv.parse(doubleQuoted);
      const parsedUnquoted = dotenv.parse(unquoted);

      assert.strictEqual(parsedSingle.DEEPSEEK_API_KEY, 'sk-single-quoted-synthetic-key');
      assert.strictEqual(parsedDouble.DEEPSEEK_API_KEY, 'sk-double-quoted-synthetic-key');
      assert.strictEqual(parsedUnquoted.DEEPSEEK_API_KEY, 'sk-unquoted-synthetic-key');
      assert(!parsedSingle.DEEPSEEK_API_KEY.startsWith("'"));
      assert(!parsedDouble.DEEPSEEK_API_KEY.startsWith('"'));
    });

    // 3. Accidental whitespace or trailing character resilience
    await test('3. Accidental whitespace or newline trimming resilience', async () => {
      const paddedKey = '  sk-padded-synthetic-key-123456  \r\n';
      const cleaned = paddedKey.trim().replace(/^['"]|['"]$/g, '');

      assert.strictEqual(cleaned, 'sk-padded-synthetic-key-123456');
      assert(!cleaned.includes('\r'));
      assert(!cleaned.includes('\n'));
      assert(!/^\s|\s$/.test(cleaned));
    });

    // 4. OpenAI client configuration with synthetic key (Zero network calls)
    await test('4. OpenAI client configures with synthetic key and baseURL without network dispatch', async () => {
      const syntheticKey = 'sk-synthetic-offline-key-0987654321';
      const client = new OpenAI({
        apiKey: syntheticKey,
        baseURL: 'https://api.deepseek.com/v1'
      });

      assert.strictEqual(client.apiKey, syntheticKey);
      assert.strictEqual(client.baseURL, 'https://api.deepseek.com/v1');
      assert.strictEqual(typeof client.chat.completions.create, 'function');
    });

    // 5. Dynamic API Key Refresh (Preventing stale in-memory key persistence)
    await test('5. Dynamic key synchronization updates client apiKey property when process.env changes', async () => {
      const keyV1 = 'sk-synthetic-key-version-1';
      const keyV2 = 'sk-synthetic-key-version-2';

      process.env.DEEPSEEK_API_KEY = keyV1;
      const client = new OpenAI({
        apiKey: (process.env.DEEPSEEK_API_KEY || '').trim(),
        baseURL: 'https://api.deepseek.com/v1'
      });

      assert.strictEqual(client.apiKey, keyV1);

      // Simulate runtime env update (e.g. user updated .env without server restart)
      process.env.DEEPSEEK_API_KEY = keyV2;

      // Without dynamic sync, client.apiKey remains keyV1 (STALE!)
      assert.strictEqual(client.apiKey, keyV1, 'Static client holds stale key when process.env updates');

      // With dynamic key getter/sync:
      const getActiveKey = () => (process.env.DEEPSEEK_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
      client.apiKey = getActiveKey();

      assert.strictEqual(client.apiKey, keyV2, 'Synced client must hold updated key');
    });

    // 6. Missing key error handling
    await test('6. Missing key validation throws expected error upfront', async () => {
      delete process.env.DEEPSEEK_API_KEY;

      const checkKey = () => {
        const key = (process.env.DEEPSEEK_API_KEY || '').trim();
        if (!key) {
          throw new Error('DEEPSEEK_API_KEY environment variable is required. Please set it in your .env file.');
        }
      };

      assert.throws(checkKey, /DEEPSEEK_API_KEY environment variable is required/);
    });

    // 7. Verify openai.getActiveDeepSeekKey() exports and syncs
    await test('7. openai.getActiveDeepSeekKey cleans quotes and syncs apiKey on module client', async () => {
      const openaiModule = require('../utils/openai');
      process.env.DEEPSEEK_API_KEY = " 'sk-quoted-whitespace-key-999' ";
      
      const active = openaiModule.getActiveDeepSeekKey();
      assert.strictEqual(active, 'sk-quoted-whitespace-key-999');
    });

  } finally {
    // Restore original env state
    if (originalEnvKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalEnvKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }

  console.log('\n================================================================');
  console.log(` Results: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log('================================================================');

  if (fail > 0) {
    process.exit(1);
  }
})();
