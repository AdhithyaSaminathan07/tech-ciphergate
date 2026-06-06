/**
 * Check department (project) GitHub URLs under each subdomain 
 * so we know how repos link to Second Brain.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const Department = mongoose.model('DeptCheck', new mongoose.Schema({}, { strict: false, collection: 'departments' }));

    const depts = await Department.find({ subdomain: 'arun-tv' })
        .select('name primaryRepoUrl documentationRepoUrl moduleRepos subdomain');
    console.log('\n=== Departments / Projects for arun-tv ===');
    depts.forEach(d => {
        console.log(`  [${d.name}]`);
        if (d.primaryRepoUrl) console.log(`    Primary: ${d.primaryRepoUrl}`);
        if (d.documentationRepoUrl) console.log(`    Docs: ${d.documentationRepoUrl}`);
        if (d.moduleRepos && d.moduleRepos.length) console.log(`    Modules: ${d.moduleRepos.join(', ')}`);
    });

    await mongoose.connection.close();
}

run().catch(err => { console.error(err); process.exit(1); });
