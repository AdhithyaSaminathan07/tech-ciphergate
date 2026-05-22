const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGO_URI;

async function reset() {
  try {
    await mongoose.connect(uri);
    const adminSchema = new mongoose.Schema({}, { strict: false, collection: 'admins' });
    const Admin = mongoose.models.Admin || mongoose.model('AdminReset', adminSchema);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('100000', salt);

    const result = await Admin.updateOne(
      { username: 'admin21' },
      { 
        $set: { 
          password: hashedPassword,
          passwordChangedAt: new Date()
        } 
      }
    );

    console.log("Update result:", result);
    if (result.matchedCount > 0) {
      console.log("Successfully updated password of admin21 to '100000'");
    } else {
      console.log("Could not find admin21 to update.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

reset();
