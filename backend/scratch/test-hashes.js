const bcrypt = require('bcryptjs');

const workerHash = '$2a$10$fPyHgcIr1AaFBw5/C.Tg4uyEvBO2PzXcdzKDs3aVkmcomDs7m9EtK';
const adminHash = '$2a$10$vO0CnERnCY9TO06J4OHXBewqadeQf29MFX.nyKgvkEWkxCLfyBzfq';

async function testHashes() {
  const matchWorker = await bcrypt.compare('100000', workerHash);
  const matchAdmin = await bcrypt.compare('100000', adminHash);
  console.log("Password '100000' matches worker hash:", matchWorker);
  console.log("Password '100000' matches admin hash:", matchAdmin);
}

testHashes();
