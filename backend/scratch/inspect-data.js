const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGO_URI;

async function inspect() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");

    // 1. Inspect Admins
    const adminSchema = new mongoose.Schema({}, { strict: false, collection: 'admins' });
    const Admin = mongoose.models.Admin || mongoose.model('AdminInspectData', adminSchema);
    const admins = await Admin.find({});
    console.log("\n=== ADMINS ===");
    admins.forEach(a => {
      console.log(`- Username: "${a.username}", Subdomain: "${a.subdomain}", Email: "${a.email}", ID: ${a._id}`);
    });

    // 2. Inspect Departments (Projects)
    const deptSchema = new mongoose.Schema({}, { strict: false, collection: 'departments' });
    const Department = mongoose.models.Department || mongoose.model('DepartmentInspectData', deptSchema);
    const departments = await Department.find({});
    console.log("\n=== DEPARTMENTS ===");
    departments.forEach(d => {
      console.log(`- Dept Name: "${d.name}", Subdomain: "${d.subdomain}", primaryRepoUrl: "${d.primaryRepoUrl}", documentationRepoUrl: "${d.documentationRepoUrl}", moduleRepos: ${JSON.stringify(d.moduleRepos)}`);
    });

  } catch (err) {
    console.error("Error inspecting:", err);
  } finally {
    await mongoose.disconnect();
  }
}

inspect();
