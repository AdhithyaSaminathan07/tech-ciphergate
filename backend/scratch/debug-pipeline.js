const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { Octokit } = require("@octokit/rest");

dotenv.config({ path: path.join(__dirname, '../.env') });

const Worker = require('../models/Worker');
const Department = require('../models/Department');
const GitHubCache = require('../models/GitHubCache');
const GitHubSyncJob = require('../models/GitHubSyncJob');
const Contributor = require('../models/Contributor');
const Admin = require('../models/Admin');

function parseRepoUrl(url) {
    if (!url) return null;
    const cleanUrl = url.trim().replace(/\.git$/, '');
    const matchHttp = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (matchHttp) {
        return { owner: matchHttp[1], repo: matchHttp[2] };
    }
    const matchSsh = cleanUrl.match(/git@github\.com:([^\/]+)\/([^\/]+)/);
    if (matchSsh) {
        return { owner: matchSsh[1], repo: matchSsh[2] };
    }
    return null;
}

async function debugPipeline() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.\n');

        // STEP 1 & 7 – Verify Repository Source & URL Extraction
        console.log('=== STEP 1 & 7: Repository Source & URL Extraction ===');
        const departments = await Department.find({});
        console.log(`Total projects/departments found in DB: ${departments.length}`);
        
        const repoMap = new Map();
        departments.forEach(d => {
            console.log(`- Project Name: "${d.name}", Subdomain: "${d.subdomain}"`);
            console.log(`  Primary Repo URL: "${d.primaryRepoUrl}"`);
            console.log(`  Documentation URL: "${d.documentationRepoUrl}"`);
            console.log(`  Module Repositories: ${JSON.stringify(d.moduleRepos)}`);
            
            const urls = [d.primaryRepoUrl, d.documentationRepoUrl, ...(d.moduleRepos || [])].filter(Boolean);
            urls.forEach(url => {
                const parsed = parseRepoUrl(url);
                if (parsed) {
                    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
                    repoMap.set(key, { subdomain: d.subdomain, ...parsed });
                    console.log(`  -> Parsed Success: Owner="${parsed.owner}", Repo="${parsed.repo}"`);
                } else {
                    console.log(`  -> Parsed FAILED for URL: "${url}"`);
                }
            });
        });
        
        console.log(`Unique repositories extracted: ${repoMap.size}\n`);

        // STEP 2 – Verify GitHub API Connectivity
        console.log('=== STEP 2: GitHub API Connectivity ===');
        const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
        const defaultUsername = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';
        console.log(`GitHub Token: ${token ? 'Configured (Prefix: ' + token.substring(0, 10) + '...)' : 'MISSING'}`);
        console.log(`GitHub Username: ${defaultUsername}`);
        
        if (token) {
            try {
                const octokit = new Octokit({ auth: token });
                const { data: user } = await octokit.rest.users.getAuthenticated();
                console.log(`Connected Account/Org: ${user.login}`);
                
                const rateLimit = await octokit.rest.rateLimit.get();
                console.log(`Rate Limit Remaining: ${rateLimit.data.rate.remaining} / ${rateLimit.data.rate.limit}`);
                console.log(`Rate Limit Resets At: ${new Date(rateLimit.data.rate.reset * 1000).toLocaleString()}`);
                
                // Let's see if we can read one of the unique repos
                for (const [key, parsed] of repoMap.entries()) {
                    try {
                        const { data: repoMeta } = await octokit.rest.repos.get({ owner: parsed.owner, repo: parsed.repo });
                        console.log(`Successfully reached repo "${key}" on GitHub. Private: ${repoMeta.private}`);
                    } catch (repoErr) {
                        console.error(`Failed to reach repo "${key}" on GitHub: ${repoErr.message}`);
                    }
                }
            } catch (err) {
                console.error(`GitHub API connectivity check failed: ${err.message}`);
            }
        }
        console.log('');

        // STEP 3 – Verify Cache Creation
        console.log('=== STEP 3: Verify Cache Creation ===');
        const cacheCounts = await GitHubCache.aggregate([
            { $group: { _id: { subdomain: "$subdomain", data_type: "$data_type" }, count: { $sum: 1 } } }
        ]);
        console.log('GitHubCache entries count by Subdomain & Data Type:');
        if (cacheCounts.length === 0) {
            console.log('  No cache records found.');
        } else {
            cacheCounts.forEach(c => {
                console.log(`- Subdomain: "${c._id.subdomain}", Type: "${c._id.data_type}" -> Count: ${c.count}`);
            });
        }
        console.log('');

        // STEP 4 – Verify Subdomain Isolation
        console.log('=== STEP 4: Verify Subdomain Isolation ===');
        const activeWorkers = await Worker.find({ status: 'Active' });
        console.log(`Active Workers in DB: ${activeWorkers.length}`);
        activeWorkers.forEach(w => {
            console.log(`- Worker: "${w.name}", Username: "${w.username}", Subdomain: "${w.subdomain}"`);
        });
        
        const admins = await Admin.find({});
        console.log(`Admins in DB: ${admins.length}`);
        admins.forEach(a => {
            console.log(`- Admin: "${a.username}", Subdomain: "${a.subdomain}"`);
        });

        const latestJob = await GitHubSyncJob.findOne({}).sort({ createdAt: -1 });
        if (latestJob) {
            console.log(`Latest Sync Job: ID=${latestJob._id}, Subdomain="${latestJob.subdomain}", Status="${latestJob.status}", Progress="${latestJob.progress}"`);
            console.log(`Sync errors logged: ${JSON.stringify(latestJob.syncErrors)}`);
        } else {
            console.log('No sync jobs found.');
        }
        console.log('');

    } catch (err) {
        console.error('Debug pipeline failed:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

debugPipeline();
