const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Admin = require('./models/Admin');

dotenv.config();

const listAdmins = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const admins = await Admin.find({});
    if (admins.length === 0) {
      console.log('No admins found in the database.');
    } else {
      console.log('Admins found:');
      admins.forEach(admin => {
        console.log(`Username: ${admin.username}, Subdomain: ${admin.subdomain}, Email: ${admin.email}`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

listAdmins();
