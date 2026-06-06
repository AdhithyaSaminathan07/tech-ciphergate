const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { Octokit } = require('@octokit/rest');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Department = require('../models/Department');
const GitHubCache = require('../models/GitHubCache');
const GitHubSyncJob = require('../models/GitHubSyncJob');
const Worker = require('../models/Worker');
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

async function verifyDataFlow() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const defaultUsername = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';

        // STEP 1 & 7 – Verify Repository Source & URL Extraction
        console.log('\n=== STEP 1 & 7: Repository Source & URL Extraction ===');
        const departments = await Department.find({});
        console.log(`Total projects (departments) found in DB: ${departments.length}`);
        
        let totalUrlsFound = 0;
        const subdomainsRepos = {};

        departments.forEach(dept => {
            const subdomain = dept.subdomain || 'undefined';
            if (!subdomainsRepos[subdomain]) {
                subdomainsRepos[subdomain] = {
                    projects: [],
                    urls: [],
                    unique: new Map()
                };
            }
            
            subdomainsRepos[subdomain].projects.push(dept.name);
            const urls = [dept.primaryRepoUrl, dept.documentationRepoUrl, ...(dept.moduleRepos || [])].filter(Boolean);
            totalUrlsFound += urls.length;

            urls.forEach(url => {
                subdomainsRepos[subdomain].urls.push(url);
                const parsed = parseRepoUrl(url);
                if (parsed) {
                    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
                    subdomainsRepos[subdomain].unique.set(key, parsed);
                } else {
                    console.log(`  [Parser Warning] Could not parse URL: "${url}" for project "${dept.name}" under subdomain "${subdomain}"`);
                }
            });
        });

        console.log(`Total repo URLs found across all departments: ${totalUrlsFound}`);

        for (const [subdomain, data] of Object.entries(subdomainsRepos)) {
            console.log(`\nSubdomain: "${subdomain}"`);
            console.log(`  - Projects: ${JSON.stringify(data.projects)}`);
            console.log(`  - URLs: ${JSON.stringify(data.urls)}`);
            console.log(`  - Unique repositories extracted: ${data.unique.size} (${Array.from(data.unique.keys()).join(', ') || 'None'})`);
        }

        // STEP 2 – Verify GitHub API Connectivity
        console.log('\n=== STEP 2: GitHub API Connectivity ===');
        const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
        console.log(`GitHub Token configured: ${token ? 'YES (Starts with ' + token.substring(0, 10) + ')' : 'NO'}`);
        
        if (token) {
            try {
                const octokit = new Octokit({ auth: token });
                const { headers } = await octokit.rest.rateLimit.get();
                console.log(`GitHub API rate limit remaining requests: ${headers['x-ratelimit-remaining']} / ${headers['x-ratelimit-limit']}`);
                console.log(`GitHub Rate Limit Reset time: ${new Date(headers['x-ratelimit-reset'] * 1000).toLocaleString()}`);
                
                // Let's test checking one of the orgs/repos
                const testRepo = { owner: 'TechVaseegrahHub', repo: 'Ciphergate-all-in-one' };
                console.log(`Testing connectivity by fetching test repository details: ${testRepo.owner}/${testRepo.repo}...`);
                const { data: repoMeta } = await octokit.rest.repos.get({ owner: testRepo.owner, repo: testRepo.repo });
                console.log(`Successfully connected. Repo name: "${repoMeta.full_name}", private: ${repoMeta.private}`);
            } catch (apiErr) {
                console.error(`GitHub API connection error:`, apiErr.message);
            }
        }

        // STEP 3 & 4 – Verify Cache Creation & Subdomain Isolation
        console.log('\n=== STEP 3 & 4: Cache Creation & Subdomain Isolation ===');
        const caches = await GitHubCache.find({});
        console.log(`Total cache records found: ${caches.length}`);
        
        const countsByType = {};
        caches.forEach(c => {
            const type = c.data_type || 'unknown';
            countsByType[type] = (countsByType[type] || 0) + 1;
            console.log(`  - ID: ${c._id}, Subdomain: "${c.subdomain}", Type: "${c.data_type}", Key: "${c.cache_key}", Expires: ${c.expires_at < new Date() ? 'EXPIRED' : 'VALID'}`);
        });
        
        console.log('\nCache counts by data_type:');
        console.log(countsByType);

        // Check if there are subdomains mismatch
        console.log('\nSubdomains found in Admin records:');
        const admins = await Admin.find({});
        admins.forEach(a => {
            console.log(`  - Username: "${a.username}", Subdomain: "${a.subdomain}"`);
        });

        // STEP 5, 6 – Verify Dashboard Cache Read/Write
        console.log('\n=== STEP 5 & 6: Dashboard Cache Read/Write ===');
        for (const admin of admins) {
            const sub = admin.subdomain;
            console.log(`\nChecking dashboard for subdomain "${sub}":`);
            const cacheKey = `${defaultUsername}:dashboard_data`;
            const cached = await GitHubCache.findOne({
                subdomain: sub,
                cache_key: cacheKey,
                data_type: 'dashboard_data'
            });

            if (cached) {
                console.log(`  - Cached record FOUND: ${cached._id}`);
                console.log(`  - Age: ${Math.round((new Date() - cached.updatedAt) / 1000 / 60)} minutes old`);
                console.log(`  - Stats metrics:`);
                console.log(`    * Repos: ${cached.data?.stats?.totalRepos}`);
                console.log(`    * Commits: ${cached.data?.stats?.totalCommits} (Valid: ${cached.data?.stats?.validCommits})`);
                console.log(`    * PRs: ${cached.data?.stats?.totalPRs} (Valid: ${cached.data?.stats?.validPRs})`);
                console.log(`    * Additions/Deletions: +${cached.data?.stats?.totalAdditions} -${cached.data?.stats?.totalDeletions}`);
            } else {
                console.log(`  - Cached record NOT FOUND for key "${cacheKey}"`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

verifyDataFlow();
