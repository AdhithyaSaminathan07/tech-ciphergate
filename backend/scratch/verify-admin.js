const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGO_URI;

async function verify() {
  try {
    console.log("Connecting to default MongoDB database specified by URI...");
    const conn = await mongoose.connect(uri);
    console.log("Connected successfully to host:", conn.connection.host);
    console.log("Current Database Name:", conn.connection.name);

    // Let's load the Admin and Worker schemas manually to be safe
    const adminSchema = new mongoose.Schema({}, { strict: false, collection: 'admins' });
    const workerSchema = new mongoose.Schema({}, { strict: false, collection: 'workers' });

    const Admin = mongoose.models.Admin || mongoose.model('AdminVerify', adminSchema);
    const Worker = mongoose.models.Worker || mongoose.model('WorkerVerify', workerSchema);

    // Find admin21
    const adminDoc = await Admin.findOne({ username: 'admin21' });
    if (adminDoc) {
      console.log("\nFound admin21 in the current connection database:", conn.connection.name);
      console.log("Admin details:", {
        _id: adminDoc._id,
        username: adminDoc.username,
        subdomain: adminDoc.subdomain,
        email: adminDoc.email
      });

      // Verify password "100000"
      if (adminDoc.password) {
        const isMatch = await bcrypt.compare('100000', adminDoc.password);
        console.log(`Password '100000' match result:`, isMatch);
      } else {
        console.log("No password hash found on the admin document.");
      }

      // Check workers count for this subdomain
      const workerCount = await Worker.countDocuments({ subdomain: adminDoc.subdomain });
      console.log(`Number of workers for subdomain '${adminDoc.subdomain}':`, workerCount);

      const activeWorkers = await Worker.countDocuments({ subdomain: adminDoc.subdomain, status: 'Active' });
      const relievedWorkers = await Worker.countDocuments({ subdomain: adminDoc.subdomain, status: 'Relieved' });
      const deletedWorkers = await Worker.countDocuments({ subdomain: adminDoc.subdomain, status: 'Deleted' });
      console.log(` - Active: ${activeWorkers}`);
      console.log(` - Relieved: ${relievedWorkers}`);
      console.log(` - Deleted: ${deletedWorkers}`);

    } else {
      console.log("\nadmin21 NOT found in the current connection database:", conn.connection.name);
    }

    // Now let's try connecting to the 'test' database explicitly to compare
    console.log("\nExplicitly connecting to 'test' database...");
    await mongoose.disconnect();
    
    // Parse URI to inject /test database name if not present
    let testUri = uri;
    if (uri.includes('/?')) {
      testUri = uri.replace('/?', '/test?');
    } else if (uri.endsWith('/')) {
      testUri = uri + 'test';
    } else if (!uri.includes('?')) {
      testUri = uri + '/test';
    }
    
    const connTest = await mongoose.connect(testUri);
    console.log("Connected to database:", connTest.connection.name);

    const AdminTest = connTest.model('AdminTest', adminSchema);
    const WorkerTest = connTest.model('WorkerTest', workerSchema);

    const adminTestDoc = await AdminTest.findOne({ username: 'admin21' });
    if (adminTestDoc) {
      console.log("Found admin21 in 'test' database!");
      console.log("Admin details:", {
        _id: adminTestDoc._id,
        username: adminTestDoc.username,
        subdomain: adminTestDoc.subdomain,
        email: adminTestDoc.email
      });
      const isMatch = await bcrypt.compare('100000', adminTestDoc.password);
      console.log(`Password '100000' match result:`, isMatch);

      const workerCount = await WorkerTest.countDocuments({ subdomain: adminTestDoc.subdomain });
      console.log(`Number of workers for subdomain '${adminTestDoc.subdomain}' in 'test':`, workerCount);
      const activeWorkers = await WorkerTest.countDocuments({ subdomain: adminTestDoc.subdomain, status: 'Active' });
      console.log(` - Active: ${activeWorkers}`);
    } else {
      console.log("admin21 NOT found in 'test' database.");
    }

  } catch (err) {
    console.error("Error in verification:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected.");
  }
}

verify();
