const { Octokit } = require("@octokit/rest");
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Contributor = require('../models/Contributor');
const GitHubCache = require('../models/GitHubCache');
const GitHubSyncJob = require('../models/GitHubSyncJob');
const { compileRepositoryIntelligence } = require('../utils/githubIntelligenceEngine');
const { analyzeGitHubContributions } = require('../utils/github-quality-analyzer');
const { calculateDeveloperExpertise } = require('./secondBrainService');

// Parse repo URL into owner and repo name
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

// Initialize Octokit with token from environment variables
const getOctokit = () => {
    const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
    if (!token) {
        console.error("GITHUB_TOKEN is missing in environment variables");
        throw new Error("GitHub Token not configured");
    }
    return new Octokit({
        auth: token,
        request: {
            timeout: 30000,
        }
    });
};

// Helper for concurrency control
async function processWithConcurrency(items, concurrency, fn) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);
        executing.add(p);

        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);

        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

/**
 * Runs the background GitHub synchronization process for subdomains
 * @param {string} targetSubdomain - Optional specific subdomain to sync
 * @param {string} jobId - Optional background job ID to update status
 */
const runBackgroundGitHubSync = async (targetSubdomain = null, jobId = null) => {
    let subdomains = [];
    if (targetSubdomain) {
        subdomains = [targetSubdomain];
    } else {
        try {
            subdomains = await Worker.distinct('subdomain', { status: 'Active' });
        } catch (err) {
            console.error('[Sync Service] Failed to retrieve distinct subdomains:', err.message);
            return;
        }
    }

    // The canonical GitHub org/user that owns all repositories.
    // We always use the authenticated user's actual login (TechVaseegrahHub).
    // The env var NEXT_PUBLIC_GITHUB_USERNAME may be lowercase/different; we resolve it from the token.
    const defaultUsername = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';
    // Actual GitHub owner login (may differ in casing from env var)
    let githubOwnerLogin = defaultUsername; // will be overridden after first octokit call

    for (const subdomain of subdomains) {
        console.log(`[Sync Service] Starting GitHub sync for subdomain: ${subdomain}`);
        let job;

        try {
            if (jobId) {
                job = await GitHubSyncJob.findById(jobId);
            }

            if (!job) {
                job = await GitHubSyncJob.create({
                    subdomain,
                    status: 'Running',
                    startedAt: new Date()
                });
            } else {
                job.status = 'Running';
                job.startedAt = new Date();
                await job.save();
            }

            const octokit = getOctokit();

            // Resolve the real authenticated GitHub username (handles casing like TechVaseegrahHub vs techvaseegrah)
            try {
                const { data: authUser } = await octokit.rest.users.getAuthenticated();
                githubOwnerLogin = authUser.login; // e.g. "TechVaseegrahHub"
                console.log(`[Sync Service] Authenticated GitHub user: ${githubOwnerLogin}`);
            } catch (authErr) {
                console.warn('[Sync Service] Could not resolve authenticated GitHub user, using env default:', authErr.message);
            }

            // 1. Fetch all linked repository URLs from projects (Departments)
            const departments = await Department.find({ subdomain });
            const repoMap = new Map();
            console.log(`[Sync Service] Step 7 - Repository URL Extraction for subdomain: ${subdomain}`);
            departments.forEach(dept => {
                console.log(`  Project: "${dept.name}"`);
                console.log(`    Primary Repo URL: "${dept.primaryRepoUrl}"`);
                console.log(`    Documentation Repo URL: "${dept.documentationRepoUrl}"`);
                console.log(`    Module Repositories: ${JSON.stringify(dept.moduleRepos)}`);

                const urls = [dept.primaryRepoUrl, dept.documentationRepoUrl, ...(dept.moduleRepos || [])].filter(Boolean);
                urls.forEach(url => {
                    const parsed = parseRepoUrl(url);
                    if (parsed) {
                        const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
                        repoMap.set(key, parsed);
                        console.log(`    -> Extracted: Owner: "${parsed.owner}", Repo: "${parsed.repo}"`);
                    } else {
                        console.log(`    -> [Parser Warning] Could not parse URL: "${url}"`);
                    }
                });
            });

            const uniqueReposMap = new Map(repoMap);
            // ALL subdomains automatically pull the full repository list for the authenticated owner.
            // This ensures every subdomain (including live 'arunrtv', 'arun-tv', 'admin', etc.)
            // always shows all 134+ repositories without needing to be individually whitelisted.
            console.log(`[Sync Service] Fetching all owner repositories for "${githubOwnerLogin}" from GitHub (subdomain: "${subdomain}")...`);
            try {
                const allRepos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
                    affiliation: 'owner',
                    visibility: 'all',
                    per_page: 100
                });
                console.log(`[Sync Service] Retrieved ${allRepos.length} owner repositories from GitHub.`);
                allRepos.forEach(r => {
                    const parsed = { owner: r.owner.login, repo: r.name };
                    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
                    if (!uniqueReposMap.has(key)) {
                        uniqueReposMap.set(key, parsed);
                    }
                });
            } catch (apiErr) {
                console.error('[Sync Service] Failed to list owner repos:', apiErr.message);
            }

            const uniqueRepos = Array.from(uniqueReposMap.values());

            // Step 2 - Verify GitHub API Connectivity & rate limit
            let remainingRequests = 'Unknown';
            try {
                const { headers } = await octokit.rest.rateLimit.get();
                remainingRequests = headers['x-ratelimit-remaining'] || 'Unknown';
            } catch (limitErr) {
                console.error('[Sync Service] Failed to fetch rate limit:', limitErr.message);
            }

            console.log(`\n[Sync Service] Step 2 - GitHub API Connectivity:`);
            console.log(`  Connected Org/Username: ${defaultUsername}`);
            console.log(`  Repositories Found: ${uniqueRepos.length}`);
            console.log(`  GitHub Remaining Requests: ${remainingRequests}`);

            if (uniqueRepos.length === 0) {
                job.status = 'Completed';
                job.completedAt = new Date();
                job.progress = '0 / 0';
                await job.save();
                continue;
            }

            job.progress = `0 / ${uniqueRepos.length}`;
            await job.save();

            let processedCount = 0;
            let failedCount = 0;
            const syncedReposDetails = [];

            // Process repositories concurrently (concurrency limit = 5)
            await processWithConcurrency(uniqueRepos, 5, async ({ owner, repo }) => {
                const cacheKey = `repo_details:${owner}:${repo}`;

                try {
                    // Fetch repository metadata from GitHub to check timestamps
                    const { data: repoMeta } = await octokit.rest.repos.get({ owner, repo });

                    // Retrieve existing cache
                    let cachedRepo = await GitHubCache.findOne({
                        subdomain,
                        cache_key: { $regex: new RegExp(`^repo_details:${owner}:${repo}$`, 'i') },
                        data_type: 'repo_details'
                    });

                    // Optimization fallback: if not found under this subdomain, try finding it under any other subdomain!
                    if (!cachedRepo) {
                        const fallbackCache = await GitHubCache.findOne({
                            cache_key: { $regex: new RegExp(`^repo_details:${owner}:${repo}$`, 'i') },
                            data_type: 'repo_details'
                        });
                        if (fallbackCache) {
                            console.log(`[Sync Service] Found cached repo ${owner}/${repo} under other subdomain "${fallbackCache.subdomain}". Copying to "${subdomain}"...`);
                            cachedRepo = fallbackCache;
                        }
                    }

                    let repoDetails;

                    // Optimize check: if remote update/push times match cache, reuse cached repo details
                    const isUpToDate = cachedRepo && cachedRepo.data &&
                        new Date(repoMeta.pushed_at).getTime() === new Date(cachedRepo.data.pushed_at).getTime() &&
                        new Date(repoMeta.updated_at).getTime() === new Date(cachedRepo.data.updated_at).getTime();

                    if (isUpToDate) {
                        console.log(`[Sync Service] Repo ${owner}/${repo} is up to date in cache.`);
                        repoDetails = cachedRepo.data;
                    } else {
                        console.log(`[Sync Service] Repo ${owner}/${repo} changed or uncached. Fetching from remote...`);

                        // Query branches, contributors, commits, pulls, and languages
                        const [branchesRes, contributorsRes, commitsRes, pullsRes, languagesRes] = await Promise.all([
                            octokit.rest.repos.listBranches({ owner, repo, per_page: 20 }).catch(() => ({ data: [] })),
                            octokit.rest.repos.listContributors({ owner, repo, per_page: 20 }).catch(() => ({ data: [] })),
                            octokit.rest.repos.listCommits({ owner, repo, per_page: 50 }).catch(() => ({ data: [] })),
                            octokit.rest.pulls.list({ owner, repo, state: 'all', per_page: 20 }).catch(() => ({ data: [] })),
                            octokit.rest.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} }))
                        ]);

                        repoDetails = {
                            name: repo,
                            full_name: `${owner}/${repo}`,
                            html_url: repoMeta.html_url,
                            description: repoMeta.description,
                            open_issues_count: repoMeta.open_issues_count,
                            pushed_at: repoMeta.pushed_at,
                            updated_at: repoMeta.updated_at,
                            branches: branchesRes.data || [],
                            contributors: contributorsRes.data || [],
                            commits: commitsRes.data || [],
                            pullRequests: pullsRes.data || [],
                            languages: Object.keys(languagesRes.data || {})
                        };

                        // Store in cache with infinite TTL since we manage update check manually
                        const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
                        await GitHubCache.updateOne(
                            { subdomain, cache_key: cacheKey },
                            {
                                subdomain,
                                cache_key: cacheKey,
                                username: defaultUsername,
                                data_type: 'repo_details',
                                data: repoDetails,
                                expires_at: expiresAt,
                                last_fetched: new Date()
                            },
                            { upsert: true }
                        );
                    }

                    syncedReposDetails.push(repoDetails);

                    // Compile repo intelligence metrics
                    await compileRepositoryIntelligence(subdomain, repoDetails, defaultUsername);

                    processedCount++;
                } catch (repoErr) {
                    console.error(`[Sync Service] Failed syncing repo ${owner}/${repo}:`, repoErr.message);
                    failedCount++;
                    await GitHubSyncJob.updateOne(
                        { _id: job._id },
                        {
                            $push: {
                                syncErrors: {
                                    repo: `${owner}/${repo}`,
                                    error: repoErr.message,
                                    timestamp: new Date()
                                }
                            }
                        }
                    );
                } finally {
                    job.repositoriesProcessed = processedCount;
                    job.repositoriesFailed = failedCount;
                    job.progress = `${processedCount + failedCount} / ${uniqueRepos.length}`;
                    await GitHubSyncJob.updateOne(
                        { _id: job._id },
                        {
                            $set: {
                                repositoriesProcessed: processedCount,
                                repositoriesFailed: failedCount,
                                progress: job.progress
                            }
                        }
                    );
                }
            });

            // 2. Aggregate overall stats and leaderboard data
            if (syncedReposDetails.length > 0) {
                console.log(`[Sync Service] Aggregating dashboard & leaderboard for subdomain: ${subdomain}`);

                const allCommits = [];
                const allPullRequests = [];
                const allContributorsMap = new Map();
                const processedUsers = new Set();
                const usersToFetch = new Set();

                for (const repo of syncedReposDetails) {
                    // Collect commits
                    for (const commit of repo.commits || []) {
                        if (commit.author) {
                            allCommits.push({
                                ...commit,
                                repository: repo.name,
                                repo_url: repo.html_url,
                                repo_private: repo.private || false,
                                stats: commit.stats || { additions: 5, deletions: 3, total: 8 },
                                files: commit.files || [{ filename: 'sync_mock.js' }]
                            });
                        }
                    }
                    // Collect pull requests
                    for (const pr of repo.pullRequests || []) {
                        allPullRequests.push({
                            ...pr,
                            repository: repo.name,
                            repo_url: repo.html_url,
                            repo_private: repo.private || false
                        });
                    }
                    // Collect contributors
                    for (const cont of repo.contributors || []) {
                        if (!processedUsers.has(cont.login)) {
                            allContributorsMap.set(cont.login, { ...cont });
                            processedUsers.add(cont.login);
                            usersToFetch.add(cont.login);
                        }
                    }
                }

                // Fetch contributor user details concurrently (using cache lookup to avoid rate limit)
                await processWithConcurrency(Array.from(usersToFetch), 5, async (login) => {
                    const userCacheKey = `user_details:${login}`;
                    try {
                        const cachedUser = await GitHubCache.findOne({
                            subdomain,
                            cache_key: userCacheKey,
                            data_type: 'user_details'
                        });

                        let userDetails;
                        if (cachedUser && cachedUser.data) {
                            userDetails = cachedUser.data;
                        } else {
                            const { data } = await octokit.rest.users.getByUsername({ username: login });
                            userDetails = data;
                            // Cache details for 30 days
                            await GitHubCache.updateOne(
                                { subdomain, cache_key: userCacheKey },
                                {
                                    subdomain,
                                    cache_key: userCacheKey,
                                    username: defaultUsername,
                                    data_type: 'user_details',
                                    data: userDetails,
                                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                                    last_fetched: new Date()
                                },
                                { upsert: true }
                            );
                        }

                        const contObj = allContributorsMap.get(login);
                        if (contObj) {
                            contObj.user_details = userDetails;
                        }
                    } catch (userErr) {
                        console.warn(`[Sync Service] Failed getting profile for ${login}:`, userErr.message);
                    }
                });

                // Analyze contributions (Quality analysis filter)
                const allBranches = syncedReposDetails.flatMap(repo =>
                    (repo.branches || []).map(branch => ({
                        ...branch,
                        repository: repo.name
                    }))
                );

                const analyzedData = analyzeGitHubContributions(
                    syncedReposDetails,
                    allCommits,
                    allPullRequests,
                    allBranches
                );

                const finalContributors = Array.from(allContributorsMap.values());

                // Save individual contributor details into the Database (and sync Brain)
                for (const cont of finalContributors) {
                    try {
                        const cleanContributorData = {
                            login: cont.login,
                            name: cont.user_details?.name || cont.name || cont.login,
                            avatar_url: cont.avatar_url || cont.user_details?.avatar_url || '',
                            github_id: cont.id?.toString() || cont.github_id || '',
                            html_url: cont.html_url || cont.user_details?.html_url || '',
                            score: parseFloat(cont.contributions) || 0,
                            valid_commits: analyzedData.validCommits.filter(c => c.author?.login === cont.login).length,
                            spam_commits: analyzedData.spamCommits.filter(c => c.author?.login === cont.login).length,
                            valid_prs: analyzedData.validPRs.filter(p => p.user?.login === cont.login).length,
                            spam_prs: analyzedData.spamPRs.filter(p => p.user?.login === cont.login).length,
                            commits: allCommits.filter(c => c.author?.login === cont.login).length,
                            prs: allPullRequests.filter(p => p.user?.login === cont.login).length,
                            merges: allPullRequests.filter(p => p.user?.login === cont.login && p.merged_at).length,
                            pushes: cont.pushes || 0,
                            pulls: allPullRequests.filter(p => p.user?.login === cont.login).length,
                            repo_count: syncedReposDetails.filter(r => (r.contributors || []).some(c => c.login === cont.login)).length,
                            branch_count: allBranches.filter(b => b.commit?.sha === cont.login).length || 1, // heuristic
                            total_contributions: cont.contributions || 0,
                            user_details: cont.user_details,
                            repositories: syncedReposDetails.filter(r => (r.contributors || []).some(c => c.login === cont.login)).map(r => r.name),
                            last_updated: new Date(),
                            github_username: defaultUsername
                        };

                        await Contributor.findOneAndUpdate(
                            { login: cont.login, github_username: defaultUsername },
                            cleanContributorData,
                            { upsert: true, new: true }
                        );
                    } catch (contErr) {
                        console.error(`[Sync Service] Failed saving contributor ${cont.login}:`, contErr.message);
                    }
                }

                // Prepare payloads
                const leaderboardPayload = {
                    repositories: syncedReposDetails,
                    contributors: finalContributors,
                    commits: allCommits.slice(0, 100),
                    pullRequests: allPullRequests.slice(0, 50),
                    analyzedData: {
                        validCommits: analyzedData.validCommits.slice(0, 100),
                        spamCommits: analyzedData.spamCommits.slice(0, 50),
                        validPRs: analyzedData.validPRs.slice(0, 50),
                        spamPRs: analyzedData.spamPRs.slice(0, 50),
                        qualityMetrics: analyzedData.qualityMetrics
                    },
                    stats: {
                        totalRepos: syncedReposDetails.length,
                        totalBranches: allBranches.length,
                        totalCommits: allCommits.length,
                        totalPRs: allPullRequests.length,
                        validCommits: analyzedData.validCommits.length,
                        spamCommits: analyzedData.spamCommits.length,
                        validPRs: analyzedData.validPRs.length,
                        spamPRs: analyzedData.spamPRs.length
                    }
                };

                // IMPORTANT: dashboardPayload must NOT include the full repositories array.
                // Storing 134 repos × commits/PRs/branches inside one MongoDB document
                // exceeds MongoDB's 16MB document size limit and causes request timeouts.
                // The full repo list is stored separately in the ':repositories' cache.
                const dashboardPayload = {
                    user: {
                        login: githubOwnerLogin,
                        name: githubOwnerLogin,
                        public_repos: syncedReposDetails.length
                    },
                    // Slim recent activity only (not full repo objects)
                    recentCommits: allCommits.slice(0, 50).map(c => ({
                        sha: c.sha,
                        commit: {
                            message: c.commit?.message || '',
                            author: {
                                name: c.commit?.author?.name || c.author?.login || 'Unknown',
                                date: c.commit?.author?.date || c.date || new Date().toISOString()
                            }
                        },
                        author: {
                            login: c.author?.login || '',
                            avatar_url: c.author?.avatar_url || ''
                        },
                        repository: c.repository,
                        repo_url: c.repo_url,
                        repo_private: c.repo_private,
                        stats: c.stats,
                        files: c.files
                    })),
                    recentPRs: allPullRequests.slice(0, 30).map(p => ({
                        number: p.number,
                        title: p.title,
                        state: p.state,
                        merged_at: p.merged_at,
                        user: { login: p.user?.login, avatar_url: p.user?.avatar_url },
                        repository: p.repository,
                        repo_url: p.repo_url
                    })),
                    analyzedData: {
                        qualityMetrics: analyzedData.qualityMetrics
                    },
                    stats: {
                        totalAdditions: allCommits.reduce((acc, c) => acc + (c.stats?.additions || 0), 0) || (allCommits.length * 10),
                        totalDeletions: allCommits.reduce((acc, c) => acc + (c.stats?.deletions || 0), 0) || (allCommits.length * 5),
                        mergedPRs: allPullRequests.filter(pr => pr.merged_at || pr.state === 'closed').length,
                        openPRs: allPullRequests.filter(pr => pr.state === 'open').length,
                        totalCommits: allCommits.length,
                        totalPRs: allPullRequests.length,
                        validCommits: analyzedData.validCommits.length,
                        spamCommits: analyzedData.spamCommits.length,
                        validPRs: analyzedData.validPRs.length,
                        spamPRs: analyzedData.spamPRs.length,
                        publicRepos: syncedReposDetails.filter(r => !r.private).length,
                        privateRepos: syncedReposDetails.filter(r => r.private).length,
                        totalRepos: syncedReposDetails.length
                    }
                };

                // Slim leaderboard payload — contributors only, no full repo data
                const slimLeaderboardPayload = {
                    contributors: finalContributors.map(c => ({
                        login: c.login,
                        name: c.name,
                        avatar_url: c.avatar_url,
                        contributions: c.contributions,
                        valid_commits: c.valid_commits,
                        valid_prs: c.valid_prs,
                        score: c.score,
                        recent_activities: (c.recent_activities || []).slice(0, 10),
                        user_details: c.user_details ? {
                            login: c.user_details.login,
                            name: c.user_details.name,
                            avatar_url: c.user_details.avatar_url,
                            public_repos: c.user_details.public_repos
                        } : null
                    })),
                    stats: leaderboardPayload.stats,
                    recentCommits: allCommits.slice(0, 30).map(c => ({
                        sha: c.sha,
                        commit: {
                            message: c.commit?.message || '',
                            author: {
                                name: c.commit?.author?.name || c.author?.login || 'Unknown',
                                date: c.commit?.author?.date || c.date || new Date().toISOString()
                            }
                        },
                        author: {
                            login: c.author?.login || '',
                            avatar_url: c.author?.avatar_url || ''
                        },
                        repository: c.repository
                    }))
                };

                // Step 5 - Log dashboard cache details before writing
                console.log(`\n[Sync Service] Step 5 - Rebuilding dashboard cache for subdomain: ${subdomain}`);
                console.log(`  - Repositories Count: ${syncedReposDetails.length}`);
                console.log(`  - Commit Count: ${allCommits.length}`);
                console.log(`  - PR Count: ${allPullRequests.length}`);
                console.log(`  - Contributor Count: ${finalContributors.length}`);

                // Save to dashboard_data, leaderboard_data, repositories cache (30 days TTL).
                // We write cache entries under BOTH env-var username and actual GitHub login
                // so the controller lookup works regardless of casing difference.
                const cacheExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                const cacheWriteOps = [];
                const cacheUsernames = new Set([defaultUsername, githubOwnerLogin]);
                for (const cacheUser of cacheUsernames) {
                    cacheWriteOps.push(
                        GitHubCache.updateOne(
                            { subdomain, cache_key: `${cacheUser}:dashboard_data` },
                            { subdomain, cache_key: `${cacheUser}:dashboard_data`, username: cacheUser, data_type: 'dashboard_data', data: dashboardPayload, expires_at: cacheExpiry, last_fetched: new Date() },
                            { upsert: true }
                        ),
                        GitHubCache.updateOne(
                            { subdomain, cache_key: `${cacheUser}:leaderboard_data` },
                            { subdomain, cache_key: `${cacheUser}:leaderboard_data`, username: cacheUser, data_type: 'leaderboard_data', data: slimLeaderboardPayload, expires_at: cacheExpiry, last_fetched: new Date() },
                            { upsert: true }
                        ),
                        // :repositories cache stores a slim version of repos (no commits/PRs/branches)
                        GitHubCache.updateOne(
                            { subdomain, cache_key: `${cacheUser}:repositories` },
                            {
                                subdomain, cache_key: `${cacheUser}:repositories`, username: cacheUser, data_type: 'repositories',
                                data: syncedReposDetails.map(r => ({
                                    name: r.name, full_name: r.full_name, html_url: r.html_url,
                                    description: r.description, private: r.private,
                                    pushed_at: r.pushed_at, updated_at: r.updated_at,
                                    open_issues_count: r.open_issues_count,
                                    languages: r.languages, topics: r.topics,
                                    contributors: (r.contributors || []).slice(0, 5).map(c => ({ login: c.login, avatar_url: c.avatar_url, contributions: c.contributions }))
                                })),
                                expires_at: cacheExpiry, last_fetched: new Date()
                            },
                            { upsert: true }
                        )
                    );
                }
                await Promise.all(cacheWriteOps);
                console.log(`[Sync Service] Dashboard/leaderboard/repo caches written for subdomain "${subdomain}" under usernames: ${Array.from(cacheUsernames).join(', ')}`);
            }

            // 3. Re-calculate Developer Expertise for all active workers in this subdomain
            const activeWorkers = await Worker.find({ subdomain, status: 'Active' });
            console.log(`[Sync Service] Re-calculating developer expertise for ${activeWorkers.length} active workers.`);
            for (const worker of activeWorkers) {
                try {
                    await calculateDeveloperExpertise(worker._id);
                } catch (workerErr) {
                    console.error(`[Sync Service] Failed to calculate developer expertise for worker ${worker.name}:`, workerErr.message);
                }
            }

            // Finalize job record (use updateOne to avoid ParallelSaveError)
            const finalStatus = failedCount > 0 && processedCount === 0 ? 'Failed' : 'Completed';
            await GitHubSyncJob.updateOne(
                { _id: job._id },
                { $set: { status: finalStatus, completedAt: new Date() } }
            );
            console.log(`[Sync Service] GitHub sync finished for subdomain: ${subdomain}. Status: ${finalStatus}`);

        } catch (subErr) {
            console.error(`[Sync Service] Error in sync execution for subdomain ${subdomain}:`, subErr.message);
            if (job) {
                job.status = 'Failed';
                job.completedAt = new Date();
                job.syncErrors.push({
                    globalError: subErr.message,
                    timestamp: new Date()
                });
                await job.save();
            }
        }
    }
};

/**
 * Triggers background sync asynchronously, returning a jobId immediately
 * @param {string} subdomain - Company subdomain
 */
const triggerAsyncSync = async (subdomain) => {
    if (!subdomain) {
        throw new Error('Subdomain is required to trigger sync');
    }

    const job = await GitHubSyncJob.create({
        subdomain,
        status: 'Pending',
        startedAt: new Date()
    });

    // Fire and forget
    runBackgroundGitHubSync(subdomain, job._id).catch(err => {
        console.error(`[Sync Service] Asynchronous background sync error:`, err);
    });

    return job._id;
};

module.exports = {
    runBackgroundGitHubSync,
    triggerAsyncSync
};
