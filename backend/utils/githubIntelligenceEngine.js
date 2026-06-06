const GitHubCache = require('../models/GitHubCache');
const SecondBrainItem = require('../models/SecondBrainItem');
const Department = require('../models/Department');
const { analyzeCommitQuality, analyzePRQuality } = require('./github-quality-analyzer');

/**
 * Calculates health and stats of a repository
 */
function calculateHealthAndStats(repoData) {
    const commits = repoData.commits || [];
    const prs = repoData.pullRequests || [];
    const openIssues = repoData.open_issues_count || 0;
    
    let spamCommitsCount = 0;
    let validCommitsCount = 0;
    commits.forEach(c => {
        const quality = analyzeCommitQuality(c, repoData.name);
        if (quality.isSpam) {
            spamCommitsCount++;
        } else {
            validCommitsCount++;
        }
    });

    let spamPrsCount = 0;
    let validPrsCount = 0;
    prs.forEach(p => {
        const quality = analyzePRQuality(p, [], []);
        if (quality.isSpam) {
            spamPrsCount++;
        } else {
            validPrsCount++;
        }
    });

    let healthScore = 100;
    
    // Spam commits ratio deduction (max 20 points)
    if (commits.length > 0) {
        const spamCommitsRatio = spamCommitsCount / commits.length;
        healthScore -= Math.min(20, Math.round(spamCommitsRatio * 50));
    }
    
    // Spam PRs ratio deduction (max 20 points)
    if (prs.length > 0) {
        const spamPrsRatio = spamPrsCount / prs.length;
        healthScore -= Math.min(20, Math.round(spamPrsRatio * 50));
    }
    
    // Open issues deduction (1 point per open issue, max 20 points)
    healthScore -= Math.min(20, openIssues);
    
    // Commit freshness deduction (max 20 points)
    if (commits.length > 0) {
        const latestCommitDate = new Date(commits[0].commit?.author?.date || commits[0].created_at);
        const daysSinceLastCommit = (Date.now() - latestCommitDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastCommit > 14) {
            healthScore -= 20;
        } else if (daysSinceLastCommit > 7) {
            healthScore -= 10;
        }
    } else {
        healthScore -= 20;
    }
    
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    return {
        healthScore,
        stats: {
            totalCommits: commits.length,
            validCommits: validCommitsCount,
            spamCommits: spamCommitsCount,
            totalPRs: prs.length,
            validPRs: validPrsCount,
            spamPRs: spamPrsCount,
            openIssues
        }
    };
}

/**
 * Calculates primary maintainer and top 3 contributors
 */
function getContributorsMetrics(repoData) {
    const commits = repoData.commits || [];
    const prs = repoData.pullRequests || [];
    
    const userWeights = {};
    const userInfo = {};

    commits.forEach(c => {
        const author = c.author || c.commit?.author;
        if (!author || (!author.login && !author.name)) return;
        const login = author.login || author.name;
        
        if (!userWeights[login]) userWeights[login] = 0;
        userWeights[login] += 1.0;

        if (!userInfo[login]) {
            userInfo[login] = {
                login,
                name: c.commit?.author?.name || login,
                avatar_url: c.author?.avatar_url || ''
            };
        }
    });

    prs.forEach(p => {
        const user = p.user;
        if (!user || (!user.login && !user.name)) return;
        const login = user.login || user.name;
        
        if (!userWeights[login]) userWeights[login] = 0;
        userWeights[login] += 2.0;

        if (!userInfo[login]) {
            userInfo[login] = {
                login,
                name: user.name || login,
                avatar_url: user.avatar_url || ''
            };
        }
    });

    const contributors = Object.keys(userWeights).map(login => ({
        login,
        name: userInfo[login].name,
        avatar_url: userInfo[login].avatar_url,
        weight: userWeights[login]
    })).sort((a, b) => b.weight - a.weight);

    const topContributors = contributors.slice(0, 3).map(c => ({
        login: c.login,
        name: c.name,
        avatar_url: c.avatar_url
    }));

    const primaryMaintainer = contributors[0] ? {
        login: contributors[0].login,
        name: contributors[0].name,
        avatar_url: contributors[0].avatar_url
    } : null;

    return {
        primaryMaintainer,
        topContributors
    };
}

/**
 * Compiles and saves repository intelligence
 * @param {string} subdomain - Company subdomain
 * @param {object} repoData - Repository data
 * @param {string} username - GitHub username (for cache keys)
 */
const compileRepositoryIntelligence = async (subdomain, repoData, username) => {
    if (!subdomain || !repoData || !repoData.name) {
        throw new Error('Missing subdomain or repository name');
    }

    const repoName = repoData.name;
    const cacheKey = `repo_intel:${repoName}`;

    // 1. Calculate health score and metrics
    const { healthScore, stats } = calculateHealthAndStats(repoData);

    // 2. Fetch previous intelligence to update health history
    let healthHistory = [];
    try {
        const previousCache = await GitHubCache.findOne({
            subdomain,
            cache_key: cacheKey,
            data_type: 'repo_intelligence'
        });
        if (previousCache && previousCache.data && Array.isArray(previousCache.data.healthHistory)) {
            healthHistory = previousCache.data.healthHistory;
        }
    } catch (err) {
        console.warn('[Intelligence Engine] Failed to fetch previous health history:', err.message);
    }

    // Append today's health score to history
    const todayStr = new Date().toISOString().split('T')[0];
    const existingIndex = healthHistory.findIndex(h => {
        const dateStr = new Date(h.date).toISOString().split('T')[0];
        return dateStr === todayStr;
    });

    if (existingIndex !== -1) {
        healthHistory[existingIndex].score = healthScore;
    } else {
        healthHistory.push({
            date: new Date(),
            score: healthScore
        });
    }

    // Keep last 30 entries
    if (healthHistory.length > 30) {
        healthHistory = healthHistory.slice(healthHistory.length - 30);
    }

    // 3. Contributor metrics
    const { primaryMaintainer, topContributors } = getContributorsMetrics(repoData);

    // 4. Primary Stack (languages)
    const primaryStack = repoData.languages || [];

    // Assemble payload
    const intelPayload = {
        name: repoName,
        fullName: repoData.full_name || repoName,
        htmlUrl: repoData.html_url || '',
        description: repoData.description || '',
        primaryMaintainer,
        topContributors,
        primaryStack,
        healthScore,
        healthHistory,
        stats,
        pushedAt: repoData.pushed_at,
        updatedAt: repoData.updated_at,
        lastCompiled: new Date()
    };

    // 5. Save directly to GitHubCache (type 'repo_intelligence')
    const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years TTL (persistent cache)
    await GitHubCache.updateOne(
        { subdomain, cache_key: cacheKey },
        {
            subdomain,
            cache_key: cacheKey,
            username,
            data_type: 'repo_intelligence',
            data: intelPayload,
            expires_at: expiresAt,
            last_fetched: new Date()
        },
        { upsert: true }
    );

    // 6. Synchronize into Second Brain
    try {
        let project = await Department.findOne({
            subdomain,
            $or: [
                { primaryRepoUrl: { $regex: new RegExp(repoName, 'i') } },
                { moduleRepos: { $regex: new RegExp(repoName, 'i') } },
                { documentationRepoUrl: { $regex: new RegExp(repoName, 'i') } }
            ]
        });

        if (!project) {
            // Fallback 1: Find general or default project in subdomain
            project = await Department.findOne({ subdomain, name: /general|default|ciphergate/i });
            if (!project) {
                // Fallback 2: Find the first project in subdomain
                project = await Department.findOne({ subdomain });
            }
            if (project) {
                console.log(`[SecondBrain] Repo "${repoName}" is not linked to any project. Mapping to fallback project "${project.name}" in subdomain "${subdomain}".`);
            }
        }

        if (project) {
            const brainContent = [
                `Repository: ${intelPayload.name}`,
                `Project Link: ${project.name}`,
                `Primary Maintainer: ${primaryMaintainer ? primaryMaintainer.name : 'None'}`,
                `Primary Tech Stack: ${primaryStack.join(', ') || 'Unknown'}`,
                `Health Score: ${healthScore}/100`,
                `Total Commits: ${stats.totalCommits}`,
                `Total Pull Requests: ${stats.totalPRs}`,
                `Open Issues: ${stats.openIssues}`,
                `Description: ${intelPayload.description}`
            ].join('\n');

            const tags = [
                'repo',
                intelPayload.name.toLowerCase(),
                ...primaryStack.map(s => s.toLowerCase()),
                healthScore >= 90 ? 'healthy' : healthScore < 70 ? 'attention-required' : 'stable'
            ].filter(Boolean);

            await SecondBrainItem.findOneAndUpdate(
                { subdomain, type: 'github_repo_intelligence', 'metadata.repoName': intelPayload.name },
                {
                    title: `Repository Intelligence - ${intelPayload.name}`,
                    content: brainContent,
                    type: 'github_repo_intelligence',
                    refModel: 'Department',
                    itemRef: project._id,
                    tags,
                    metadata: {
                        repoName: intelPayload.name,
                        primaryMaintainer,
                        topContributors,
                        primaryStack,
                        healthScore,
                        healthHistory,
                        stats
                    },
                    subdomain
                },
                { upsert: true, new: true }
            );
            console.log(`[SecondBrain] Synchronized repo intelligence for ${repoName} onto Project ${project.name}`);
        } else {
            console.warn(`[SecondBrain] No matching Project/Department found for repo: ${repoName}. Skipping Second Brain index.`);
        }
    } catch (brainErr) {
        console.error(`[SecondBrain] Failed to index repo intelligence for ${repoName}:`, brainErr.message);
    }

    return intelPayload;
};

module.exports = {
    compileRepositoryIntelligence,
    calculateHealthAndStats,
    getContributorsMetrics
};
