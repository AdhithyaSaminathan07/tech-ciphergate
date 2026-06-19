const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const inspect = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('--- Database Inspection ---');

        const Worker = mongoose.model('Worker', new mongoose.Schema({}, { strict: false }));
        const Department = mongoose.model('Department', new mongoose.Schema({}, { strict: false }));
        const GitHubSyncJob = mongoose.model('GitHubSyncJob', new mongoose.Schema({}, { strict: false }));
        const GitHubCache = mongoose.model('GitHubCache', new mongoose.Schema({}, { strict: false }));

        const workerSubdomains = await Worker.distinct('subdomain');
        console.log('Distinct subdomains in Workers:', workerSubdomains);

        const deptSubdomains = await Department.distinct('subdomain');
        console.log('Distinct subdomains in Departments:', deptSubdomains);

        const cacheSubdomains = await GitHubCache.distinct('subdomain');
        console.log('Distinct subdomains in GitHubCache:', cacheSubdomains);

        const activeWorkersCount = await Worker.countDocuments({ status: 'Active' });
        console.log('Total Active Workers:', activeWorkersCount);

        const activeWorkersBySubdomain = {};
        for (const sub of workerSubdomains) {
            activeWorkersBySubdomain[sub] = await Worker.countDocuments({ subdomain: sub, status: 'Active' });
        }
        console.log('Active Workers by subdomain:', activeWorkersBySubdomain);

        const deptsBySubdomain = {};
        for (const sub of deptSubdomains) {
            deptsBySubdomain[sub] = await Department.countDocuments({ subdomain: sub });
        }
        console.log('Departments by subdomain:', deptsBySubdomain);

        console.log('\n--- Recent GitHub Sync Jobs ---');
        const recentJobs = await GitHubSyncJob.find().sort({ createdAt: -1 }).limit(10).lean();
        console.log(JSON.stringify(recentJobs, null, 2));

        console.log('\n--- GitHub Cache Counts by data_type and subdomain ---');
        const agg = await GitHubCache.aggregate([
            {
                $group: {
                    _id: { subdomain: "$subdomain", data_type: "$data_type" },
                    count: { $sum: 1 }
                }
            }
        ]);
        console.log(JSON.stringify(agg, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

inspect();
