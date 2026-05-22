const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGO_URI;

async function inspect() {
  try {
    await mongoose.connect(uri);
    const adminSchema = new mongoose.Schema({}, { strict: false, collection: 'admins' });
    const Admin = mongoose.models.Admin || mongoose.model('AdminInspect', adminSchema);

    const admins = await Admin.find({});
    console.log("\n--- Detailed Admin Listing ---");
    for (const admin of admins) {
      console.log({
        id: admin._id,
        username: admin.username,
        subdomain: admin.subdomain,
        email: admin.email,
        passwordHash: admin.password,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
        passwordChangedAt: admin.passwordChangedAt
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

inspect();
