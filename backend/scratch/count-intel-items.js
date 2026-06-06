const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const SecondBrainItem = mongoose.model('SecondBrainItem', new mongoose.Schema({}, { strict: false, collection: 'secondbrainitems' }));
    
    const count = await SecondBrainItem.countDocuments({ subdomain: 'arun-tv', type: 'github_repo_intelligence' });
    console.log(`Count of github_repo_intelligence items: ${count}`);

    const samples = await SecondBrainItem.find({ subdomain: 'arun-tv', type: 'github_repo_intelligence' })
        .select('title metadata.repoName')
        .limit(10);
    console.log('Sample items:');
    console.log(samples);

    await mongoose.connection.close();
}

run().catch(console.error);
