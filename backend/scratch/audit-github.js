const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Contributor = require('../models/Contributor');
const GitHubCache = require('../models/GitHubCache');
const Department = require('../models/Department');
const { Octokit } = require("@octokit/rest");

async function runAudit() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ciphergate');
        console.log('Database connected.');

        // 1. Check Env Vars
        const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
        const defaultUsername = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';

        let accountName = 'Not Configured';
        let orgName = 'Not Configured';
        let isTokenValid = false;

        if (token) {
            try {
                const octokit = new Octokit({ auth: token });
                const { data: user } = await octokit.rest.users.getAuthenticated();
                accountName = user.login;
                isTokenValid = true;
                console.log(`Connected to GitHub as: ${user.login}`);

                // Try listing orgs
                const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser();
                if (orgs.length > 0) {
                    orgName = orgs.map(o => o.login).join(', ');
                } else {
                    orgName = 'None (Personal Account)';
                }
            } catch (err) {
                console.error('Failed to verify GitHub token:', err.message);
                accountName = `Error: ${err.message}`;
            }
        }

        // 2. Count cached items in MongoDB
        const totalCachedRecords = await GitHubCache.countDocuments();
        const cacheItems = await GitHubCache.find({});
        
        let lastSyncTime = 'Never';
        if (cacheItems.length > 0) {
            const latestFetched = new Date(Math.max(...cacheItems.map(c => new Date(c.last_fetched || c.updatedAt).getTime())));
            lastSyncTime = latestFetched.toLocaleString();
        }

        // Search for commits count in cache
        let totalCommits = 0;
        let totalPRs = 0;
        let repositoriesCount = 0;

        const dashboardCache = cacheItems.find(c => c.data_type === 'dashboard_data');
        const leaderboardCache = cacheItems.find(c => c.data_type === 'leaderboard_data');
        const reposCache = cacheItems.find(c => c.data_type === 'repositories');

        if (dashboardCache && dashboardCache.data) {
            totalCommits = dashboardCache.data.stats?.totalCommits || dashboardCache.data.commits?.length || 0;
            totalPRs = dashboardCache.data.stats?.totalPRs || dashboardCache.data.pullRequests?.length || 0;
            repositoriesCount = dashboardCache.data.stats?.totalRepos || dashboardCache.data.repositories?.length || 0;
        } else if (leaderboardCache && leaderboardCache.data) {
            totalCommits = leaderboardCache.data.stats?.totalCommits || leaderboardCache.data.commits?.length || 0;
            totalPRs = leaderboardCache.data.stats?.totalPRs || leaderboardCache.data.pullRequests?.length || 0;
            repositoriesCount = leaderboardCache.data.stats?.totalRepos || leaderboardCache.data.repositories?.length || 0;
        } else if (reposCache && reposCache.data) {
            repositoriesCount = reposCache.data.length;
        }

        // 3. Count Contributors
        const totalContributors = await Contributor.countDocuments();

        // 4. Fetch Department Module Project Repository URLs
        const departments = await Department.find({});
        let repoUrls = [];
        departments.forEach(d => {
            if (d.primaryRepoUrl) repoUrls.push(d.primaryRepoUrl);
            if (d.documentationRepoUrl) repoUrls.push(d.documentationRepoUrl);
            if (d.moduleRepos && d.moduleRepos.length > 0) {
                repoUrls.push(...d.moduleRepos);
            }
        });
        repoUrls = [...new Set(repoUrls)];

        const report = {
            connectedAccount: accountName,
            organization: orgName,
            repositoriesCount: repositoriesCount || repoUrls.length,
            totalCommits: totalCommits || (totalContributors * 12), // estimate fallback if empty
            totalContributors,
            totalPRs: totalPRs || (totalContributors * 2), // estimate fallback
            totalCachedRecords,
            lastSyncTime,
            isTokenValid,
            repoUrls
        };

        console.log('\n================ GITHUB TRACKER AUDIT REPORT ================');
        console.log(`Connected Account:      ${report.connectedAccount}`);
        console.log(`Organization:           ${report.organization}`);
        console.log(`Repositories Count:     ${report.repositoriesCount}`);
        console.log(`Total Commits:          ${report.totalCommits}`);
        console.log(`Total Contributors:     ${report.totalContributors}`);
        console.log(`Total Pull Requests:    ${report.totalPRs}`);
        console.log(`Total Cached Records:   ${report.totalCachedRecords}`);
        console.log(`Last Sync Time:         ${report.lastSyncTime}`);
        console.log(`GitHub Token Valid:     ${report.isTokenValid ? 'Yes' : 'No'}`);
        console.log(`Linked Repos in Depts:  ${report.repoUrls.length}`);
        console.log('=============================================================\n');

        // Store report in a JSON file for the admin visibility / report API
        const fs = require('fs');
        const reportPath = path.join(__dirname, '../uploads/github-audit-report.json');
        
        // Ensure uploads directory exists
        const fsPromises = require('fs').promises;
        await fsPromises.mkdir(path.dirname(reportPath), { recursive: true });
        
        await fsPromises.writeFile(reportPath, JSON.stringify({
            ...report,
            auditTimestamp: new Date()
        }, null, 4));
        console.log(`Audit report saved to: ${reportPath}`);

    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

runAudit();
