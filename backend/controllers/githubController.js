const Contributor = require('../models/Contributor');
const GitHubCache = require('../models/GitHubCache');
const GitHubSyncJob = require('../models/GitHubSyncJob');

// @desc    Get GitHub Dashboard Data (Aggregated Stats from Cache)
// @route   GET /api/github/dashboard
// @access  Private (Admin)
const getDashboardData = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain || req.query.subdomain;
        if (!subdomain) {
            return res.status(400).json({ success: false, message: 'Subdomain is required' });
        }

        const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';
        // Try both the env-var username AND 'TechVaseegrahHub' (actual GitHub login)
        // so the cache key always resolves regardless of casing
        const cacheKeyVariants = [...new Set([`${username}:dashboard_data`, 'TechVaseegrahHub:dashboard_data'])];

        console.log(`[DEBUG ENDPOINT] getDashboardData called!`);
        console.log(`- subdomain resolved: "${subdomain}"`);
        console.log(`- cacheKey variants: ${cacheKeyVariants.join(', ')}`);

        // Try each cache key variant until one is found
        let cached = null;
        for (const cacheKey of cacheKeyVariants) {
            cached = await GitHubCache.findOne({
                subdomain,
                cache_key: cacheKey,
                data_type: 'dashboard_data'
            });
            if (cached) { console.log(`[GitHub Controller] Found dashboard cache with key: "${cacheKey}"`); break; }
        }

        if (cached && cached.data) {
            const data = cached.data;

            // Resolve repositories list from repositories cache
            let repos = [];
            for (const variant of cacheKeyVariants) {
                const reposCache = await GitHubCache.findOne({
                    subdomain,
                    cache_key: variant.replace('dashboard_data', 'repositories'),
                    data_type: 'repositories'
                });
                if (reposCache && reposCache.data) {
                    repos = reposCache.data;
                    break;
                }
            }

            return res.json({
                ...data,
                repositories: repos,
                // Aliases for frontend backward compatibility
                commits: data.recentCommits || data.commits || [],
                pullRequests: data.recentPRs || data.pullRequests || [],
                showingCached: true,
                lastSuccessfulSync: cached.last_fetched || cached.updatedAt
            });
        }

        // Fast lightweight fallback: use MongoDB $count aggregation on repo_details
        // DO NOT read repo_details documents (each is ~130KB, 134 docs = 17MB network transfer = timeout).
        // Just count them and return stats so the UI shows something instantly.
        const repoCount = await GitHubCache.countDocuments({ subdomain, data_type: 'repo_details' });
        const repoCaches = []; // intentionally empty — skip the slow fetch

        if (repoCaches && repoCaches.length > 0) {
            console.log(`[GitHub Controller] Rebuilding dashboard_data on-the-fly (lightweight) from ${repoCaches.length} repo_details caches.`);
            const syncedReposDetails = repoCaches.map(c => c.data).filter(Boolean);

            // Lightweight O(n) aggregation — no quality analysis pass
            let totalCommits = 0, totalPRs = 0, mergedPRs = 0, openPRs = 0;
            let publicRepos = 0, privateRepos = 0;
            const sampleCommits = [];
            const samplePRs = [];

            for (const repo of syncedReposDetails) {
                if (!repo.private) publicRepos++; else privateRepos++;
                totalCommits += (repo.commits || []).length;
                totalPRs += (repo.pullRequests || []).length;
                mergedPRs += (repo.pullRequests || []).filter(p => p.merged_at || p.state === 'closed').length;
                openPRs += (repo.pullRequests || []).filter(p => p.state === 'open').length;
                if (sampleCommits.length < 100) {
                    for (const c of (repo.commits || [])) {
                        if (c.author && sampleCommits.length < 100) {
                            sampleCommits.push({ ...c, repository: repo.name, repo_url: repo.html_url });
                        }
                    }
                }
                if (samplePRs.length < 50) {
                    for (const p of (repo.pullRequests || [])) {
                        if (samplePRs.length < 50) samplePRs.push({ ...p, repository: repo.name, repo_url: repo.html_url });
                    }
                }
            }

            const dashboardPayload = {
                user: { login: username, name: username, public_repos: syncedReposDetails.length },
                repositories: syncedReposDetails,
                commits: sampleCommits,
                pullRequests: samplePRs,
                analyzedData: {
                    validCommits: sampleCommits,
                    spamCommits: [],
                    validPRs: samplePRs,
                    spamPRs: [],
                    qualityMetrics: { totalCommits, totalPRs }
                },
                stats: {
                    totalAdditions: totalCommits * 10,
                    totalDeletions: totalCommits * 5,
                    mergedPRs,
                    openPRs,
                    totalCommits,
                    totalPRs,
                    validCommits: totalCommits,
                    spamCommits: 0,
                    validPRs: mergedPRs,
                    spamPRs: 0,
                    publicRepos,
                    privateRepos,
                    totalRepos: syncedReposDetails.length
                }
            };

            const latestTimestamp = repoCaches.reduce((latest, c) => {
                const fetched = new Date(c.last_fetched || c.updatedAt);
                return fetched > latest ? fetched : latest;
            }, new Date(0));

            return res.json({
                ...dashboardPayload,
                showingCached: true,
                lastSuccessfulSync: latestTimestamp.getTime() > 0 ? latestTimestamp : new Date()
            });
        }

        // repoCaches is always [] (we skip the slow fetch), so this block never runs.
        // We still have repoCount from countDocuments above for the fallback response.

        // Check if a sync job is currently running
        const activeJob = await GitHubSyncJob.findOne({
            subdomain,
            status: { $in: ['Pending', 'Running'] }
        }).sort({ createdAt: -1 });

        // Auto-trigger a background sync if no cache and no active sync
        if (!activeJob && repoCount > 0) {
            console.log(`[GitHub Controller] No dashboard cache but ${repoCount} repo_details exist. Auto-triggering background sync to build slim cache...`);
            try {
                const { triggerAsyncSync } = require('../services/githubSyncService');
                triggerAsyncSync(subdomain).catch(err => {
                    console.error('[GitHub Controller] Auto-sync trigger failed:', err.message);
                });
            } catch (syncErr) {
                console.error('[GitHub Controller] Could not load sync service:', syncErr.message);
            }
        }

        // Return a fast response immediately — the background sync will build the cache
        const emptyStats = {
            totalAdditions: 0, totalDeletions: 0, mergedPRs: 0, openPRs: 0,
            totalCommits: 0, totalPRs: 0, validCommits: 0, spamCommits: 0,
            validPRs: 0, spamPRs: 0, publicRepos: 0, privateRepos: 0,
            totalRepos: repoCount  // at least show how many repos we have cached
        };
        const message = activeJob
            ? 'Sync in progress — data will appear shortly'
            : (repoCount > 0
                ? `Building dashboard from ${repoCount} cached repositories. Refresh in 30 seconds.`
                : 'Synchronizing initial GitHub data. Please refresh in a moment.');

        console.warn(`[GitHub Controller] No dashboard_data cache for subdomain "${subdomain}" (repoCount=${repoCount}). Returning fast fallback.`);
        return res.json({
            user: { login: username, name: username },
            repositories: [], commits: [], pullRequests: [],
            analyzedData: { validCommits: [], spamCommits: [], validPRs: [], spamPRs: [], qualityMetrics: {} },
            stats: emptyStats,
            showingCached: false,
            syncInProgress: !!activeJob,
            message
        });
    } catch (error) {
        console.error("Error in getDashboardData:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Contributors (Leaderboard)
// @route   GET /api/github/contributors
// @access  Private (Admin)
const getContributors = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain || req.query.subdomain;
        const {
            github_username,
            page = 1,
            limit = 100,
            search = '',
            sortBy = 'score',
            sortOrder = 'desc'
        } = req.query;

        const query = {};
        if (github_username) {
            query.github_username = github_username;
        }
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { login: { $regex: search, $options: 'i' } }
            ];
        }

        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const contributors = await Contributor.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-recent_activities.files.patch')
            .exec();

        const total = await Contributor.countDocuments(query);

        res.json({
            success: true,
            data: contributors,
            pagination: {
                current_page: parseInt(page),
                total_pages: Math.ceil(total / parseInt(limit)),
                total_records: total,
                per_page: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching contributors:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch contributors',
            error: error.message
        });
    }
};

// @desc    Save Contributors (Sync/Upload)
// @route   POST /api/github/contributors/save
// @access  Private (Admin)
const saveContributors = async (req, res) => {
    try {
        const { contributors, github_username } = req.body;

        if (!contributors || !Array.isArray(contributors)) {
            return res.status(400).json({
                success: false,
                message: 'Contributors array is required'
            });
        }

        const savedContributors = [];
        const errors = [];

        const batchSize = 10;
        for (let i = 0; i < contributors.length; i += batchSize) {
            const batch = contributors.slice(i, i + batchSize);

            await Promise.all(batch.map(async (contributorData) => {
                try {
                    if (!contributorData.login) {
                        throw new Error(`Missing login field`);
                    }

                    const cleanContributorData = {
                        ...contributorData,
                        github_username,
                        last_updated: new Date(),
                        score: parseFloat(contributorData.score) || 0,
                        valid_commits: parseInt(contributorData.valid_commits) || 0,
                        spam_commits: parseInt(contributorData.spam_commits) || 0,
                        valid_prs: parseInt(contributorData.valid_prs) || 0,
                        spam_prs: parseInt(contributorData.spam_prs) || 0,
                        commits: parseInt(contributorData.valid_commits) || parseInt(contributorData.commits) || 0,
                        prs: parseInt(contributorData.valid_prs) || parseInt(contributorData.prs) || 0,
                        merges: parseInt(contributorData.merges) || 0,
                        pushes: parseInt(contributorData.pushes) || 0,
                        pulls: parseInt(contributorData.pulls) || 0,
                        repo_count: parseInt(contributorData.repo_count) || 0,
                        branch_count: parseInt(contributorData.branch_count) || 0,
                        total_contributions: parseInt(contributorData.total_valid_contributions) || parseInt(contributorData.total_contributions) || 0,
                        recent_activities: (contributorData.recent_activities || []).map(activity => ({
                            ...activity,
                            date: new Date(activity.date),
                            files: Array.isArray(activity.files) ? activity.files : []
                        }))
                    };

                    const contributor = await Contributor.findOneAndUpdate(
                        {
                            login: contributorData.login,
                            github_username: github_username
                        },
                        cleanContributorData,
                        {
                            upsert: true,
                            new: true,
                            runValidators: true
                        }
                    );

                    savedContributors.push(contributor);

                } catch (error) {
                    errors.push({
                        login: contributorData.login,
                        error: error.message
                    });
                }
            }));
        }

        res.json({
            success: true,
            message: `Saved ${savedContributors.length} contributors`,
            data: savedContributors,
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
            total_processed: contributors.length
        });

    } catch (error) {
        console.error('Error in save endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save contributors',
            error: error.message
        });
    }
};

// @desc    Clear Contributors
// @route   DELETE /api/github/contributors/clear
// @access  Private (Admin)
const clearContributors = async (req, res) => {
    try {
        const { github_username } = req.body;
        const query = github_username ? { github_username } : {};
        const result = await Contributor.deleteMany(query);
        res.json({
            success: true,
            message: `Deleted ${result.deletedCount} contributors`,
            deleted_count: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Employees from GitHub Org
// @route   GET /api/github/employees
// @access  Private (Admin)
const getEmployees = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain;
        const activeWorkers = await require('../models/Worker').find({ subdomain, status: 'Active' });
        const employees = activeWorkers.map(w => ({
            id: w._id,
            githubUsername: w.username,
            name: w.name,
            avatar: w.photo || '',
            email: w.email || null,
            points: w.totalPoints || 0
        }));
        res.json(employees);
    } catch (error) {
        res.json([]);
    }
};

// @desc    Get Live Leaderboard Data (Read from Cache)
// @route   GET /api/github/live-leaderboard
// @access  Private (Admin)
const getLiveLeaderboard = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain || req.query.subdomain;
        if (!subdomain) {
            return res.status(400).json({ success: false, message: 'Subdomain is required' });
        }

        const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';
        const cacheKey = `${username}:leaderboard_data`;

        const cached = await GitHubCache.findOne({
            subdomain,
            cache_key: cacheKey,
            data_type: 'leaderboard_data'
        });

        if (cached && cached.data) {
            const data = cached.data;
            return res.json({
                ...data,
                commits: data.recentCommits || data.commits || [],
                pullRequests: data.recentPRs || data.pullRequests || [],
                showingCached: true,
                lastSuccessfulSync: cached.last_fetched || cached.updatedAt
            });
        }

        // Try on-the-fly reconstruction from persistent repo_details caches.
        // Lightweight O(n) path — no analyzeGitHubContributions() to avoid event loop blocking.
        const repoCaches = await GitHubCache.find({
            subdomain,
            data_type: 'repo_details'
        }).select('data last_fetched updatedAt').lean();

        if (repoCaches && repoCaches.length > 0) {
            console.log(`[GitHub Controller] Rebuilding leaderboard_data on-the-fly (lightweight) from ${repoCaches.length} repo_details caches.`);
            const syncedReposDetails = repoCaches.map(c => c.data).filter(Boolean);

            const allContributorsMap = new Map();
            let totalCommits = 0, totalPRs = 0, totalBranches = 0;
            const sampleCommits = [], samplePRs = [];

            for (const repo of syncedReposDetails) {
                totalCommits += (repo.commits || []).length;
                totalPRs += (repo.pullRequests || []).length;
                totalBranches += (repo.branches || []).length;
                for (const cont of repo.contributors || []) {
                    if (cont.login && !allContributorsMap.has(cont.login)) {
                        allContributorsMap.set(cont.login, { ...cont });
                    }
                }
                if (sampleCommits.length < 100) {
                    for (const c of (repo.commits || [])) {
                        if (c.author && sampleCommits.length < 100) sampleCommits.push({ ...c, repository: repo.name });
                    }
                }
                if (samplePRs.length < 50) {
                    for (const p of (repo.pullRequests || [])) {
                        if (samplePRs.length < 50) samplePRs.push({ ...p, repository: repo.name });
                    }
                }
            }

            // Enrich contributors from DB
            const finalContributors = Array.from(allContributorsMap.values());
            const contributorsDb = await Contributor.find({ subdomain }).lean();
            const contributorsDbMap = new Map(contributorsDb.map(c => [c.login, c]));
            finalContributors.forEach(c => {
                const dbCont = contributorsDbMap.get(c.login);
                if (dbCont) c.user_details = dbCont.user_details;
            });

            const leaderboardPayload = {
                repositories: syncedReposDetails,
                contributors: finalContributors,
                commits: sampleCommits,
                pullRequests: samplePRs,
                analyzedData: {
                    validCommits: sampleCommits,
                    spamCommits: [],
                    validPRs: samplePRs,
                    spamPRs: [],
                    qualityMetrics: { totalCommits, totalPRs }
                },
                stats: {
                    totalRepos: syncedReposDetails.length,
                    totalBranches,
                    totalCommits,
                    totalPRs,
                    validCommits: totalCommits,
                    spamCommits: 0,
                    validPRs: totalPRs,
                    spamPRs: 0
                }
            };

            const latestTimestamp = repoCaches.reduce((latest, c) => {
                const fetched = new Date(c.last_fetched || c.updatedAt);
                return fetched > latest ? fetched : latest;
            }, new Date(0));

            return res.json({
                ...leaderboardPayload,
                showingCached: true,
                lastSuccessfulSync: latestTimestamp.getTime() > 0 ? latestTimestamp : new Date()
            });
        }

        console.warn(`[GitHub Controller] No cached leaderboard found for subdomain: ${subdomain}. Returning fallback.`);
        return res.json({
            repositories: [],
            contributors: [],
            commits: [],
            pullRequests: [],
            analyzedData: {
                validCommits: [],
                spamCommits: [],
                validPRs: [],
                spamPRs: [],
                qualityMetrics: {}
            },
            stats: {
                totalRepos: 0,
                totalBranches: 0,
                totalCommits: 0,
                totalPRs: 0,
                validCommits: 0,
                spamCommits: 0,
                validPRs: 0,
                spamPRs: 0
            },
            showingCached: false,
            message: 'Synchronizing initial GitHub data. Please refresh in a moment.'
        });
    } catch (error) {
        console.error("Error in getLiveLeaderboard:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Live Repositories (Read from Cache)
// @route   GET /api/github/live-repositories
// @access  Private (Admin)
const getLiveRepositories = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain || req.query.subdomain;
        if (!subdomain) {
            return res.status(400).json({ success: false, message: 'Subdomain is required' });
        }

        const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'techvaseegrah';
        const cacheKey = `${username}:repositories`;

        const cached = await GitHubCache.findOne({
            subdomain,
            cache_key: cacheKey,
            data_type: 'repositories'
        });

        if (cached && cached.data) {
            return res.json(cached.data);
        }

        // Try on-the-fly reconstruction from persistent repo_details caches
        const repoCaches = await GitHubCache.find({
            subdomain,
            data_type: 'repo_details'
        });

        if (repoCaches && repoCaches.length > 0) {
            console.log(`[GitHub Controller] Rebuilding repositories list on-the-fly from ${repoCaches.length} repo_details caches.`);
            const syncedReposDetails = repoCaches.map(c => c.data).filter(Boolean);
            return res.json(syncedReposDetails);
        }

        console.warn(`[GitHub Controller] No cached repositories found for subdomain: ${subdomain}. Returning fallback.`);
        return res.json([]);
    } catch (error) {
        console.error("Error in getLiveRepositories:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Clear GitHub cache for a user
// @route   POST /api/github/clear-cache
// @access  Private (Admin)
const clearGitHubCache = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain;
        if (!subdomain) {
            return res.status(400).json({ success: false, message: 'Subdomain required' });
        }

        await GitHubCache.deleteMany({ subdomain });

        res.json({
            success: true,
            message: `GitHub cache cleared successfully for subdomain: ${subdomain}`
        });
    } catch (error) {
        console.error('Error clearing GitHub cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear GitHub cache',
            error: error.message
        });
    }
};

// @desc    Trigger asynchronous background GitHub Sync
// @route   POST /api/github/sync
// @access  Private (Admin)
const triggerSync = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain;
        if (!subdomain) {
            return res.status(400).json({ success: false, message: 'Subdomain required to trigger sync' });
        }

        const { triggerAsyncSync } = require('../services/githubSyncService');
        const jobId = await triggerAsyncSync(subdomain);

        res.json({
            success: true,
            message: 'Background synchronization job started.',
            jobId
        });
    } catch (error) {
        console.error('[githubController] triggerSync error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get status of synchronization jobs
// @route   GET /api/github/sync-status
// @access  Private (Admin)
const getSyncStatus = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain;
        if (!subdomain) {
            return res.status(400).json({ success: false, message: 'Subdomain required' });
        }

        const { jobId } = req.query;
        let job;

        if (jobId) {
            job = await GitHubSyncJob.findOne({ _id: jobId, subdomain });
        } else {
            // Retrieve latest sync job for this subdomain
            job = await GitHubSyncJob.findOne({ subdomain }).sort({ createdAt: -1 });
        }

        if (!job) {
            return res.json({
                success: true,
                status: 'None',
                progress: '0 / 0',
                message: 'No sync jobs found for this subdomain.'
            });
        }

        res.json({
            success: true,
            jobId: job._id,
            status: job.status,
            progress: job.progress,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            repositoriesProcessed: job.repositoriesProcessed,
            repositoriesFailed: job.repositoriesFailed,
            syncErrors: job.syncErrors
        });
    } catch (error) {
        console.error('[githubController] getSyncStatus error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getDashboardData,
    getContributors,
    saveContributors,
    clearContributors,
    getEmployees,
    getLiveLeaderboard,
    getLiveRepositories,
    clearGitHubCache,
    triggerSync,
    getSyncStatus
};
