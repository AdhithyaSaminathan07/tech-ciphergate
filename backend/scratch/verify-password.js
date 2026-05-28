const bcrypt = require('bcryptjs');

const adminHash = '$2a$10$1uFOf9.5kab7GCDhHJxtvuijV3oZ4Urj4yMwJv9k3Rk5Iu8hA4Tk.';
const workerHash = '$2a$10$fPyHgcIr1AaFBw5/C.Tg4uyEvBO2PzXcdzKDs3aVkmcomDs7m9EtK';

const testPasswords = ['100000', 'admin21', 'admin', '123456', 'password'];

async function verify() {
  console.log('--- ADMIN HASH COMPARISON ---');
  for (const pw of testPasswords) {
    const match = await bcrypt.compare(pw, adminHash);
    console.log(`Password "${pw}": ${match ? '✅ MATCH!' : '❌ No match'}`);
  }

  console.log('\n--- WORKER HASH COMPARISON ---');
  for (const pw of testPasswords) {
    const match = await bcrypt.compare(pw, workerHash);
    console.log(`Password "${pw}": ${match ? '✅ MATCH!' : '❌ No match'}`);
  }
}

verify();
