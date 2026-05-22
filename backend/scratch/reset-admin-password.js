const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

dotenv.config({ path: path = require('path').join(__dirname, '../.env') });

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.log('Usage: node reset-admin-password.js <username> <new_password>');
  console.log('Example: node reset-admin-password.js techvaseegrah 100000');
  process.exit(1);
}

const resetPassword = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not set in backend/.env');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const admin = await Admin.findOne({ username });
    if (!admin) {
      console.log(`Admin user with username "${username}" not found.`);
      const admins = await Admin.find({});
      console.log('Available admins are:');
      admins.forEach(a => console.log(`- ${a.username}`));
      return;
    }

    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(newPassword, salt);
    await admin.save();
    console.log(`Successfully updated password for admin "${username}" to "${newPassword}".`);
  } catch (error) {
    console.error('Error resetting password:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

resetPassword();
