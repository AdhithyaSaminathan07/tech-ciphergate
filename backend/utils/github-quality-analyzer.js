const QUALITY_THRESHOLDS = {
    MIN_COMMIT_LINES: 5,           // Minimum lines changed for a commit to be meaningful
    MIN_COMMIT_FILES: 1,           // Minimum files changed for a commit to be meaningful
    MIN_PR_CHANGES: 10,            // Minimum lines changed in a PR to be meaningful
    MIN_PR_FILES: 1,               // Minimum files changed in a PR to be meaningful
    MIN_BRANCH_LIFETIME_DAYS: 1,   // Minimum lifetime for a branch to be meaningful
    MIN_BRANCH_COMMITS: 3,         // Minimum commits for a branch to be meaningful
    MAX_COMMIT_BURST_SIZE: 10,     // Max commits in a short timeframe before spam flagging
    MAX_COMMIT_BURST_MINUTES: 30,  // Time window for burst detection
};

/**
 * Analyze commit quality and determine if it's meaningful
 */
function analyzeCommitQuality(commit, repoName) {
    const commitDate = new Date(commit.commit.author.date);
    const message = commit.commit.message.toLowerCase();
    
    // Check for spam patterns in commit message
    const isSpamMessage = 
        message.includes('update') && message.length < 15 ||
        message.includes('fix typo') || 
        message.includes('minor') && message.length < 20 ||
        message.includes('cleanup') && message.length < 20 ||
        message.includes('wip') ||
        message.match(/^[a-z]{1,4}[\s\d]*$/) || // Very short cryptic messages
        message.includes('temp') || message.includes('tmp');
    
    // Check for revert commits
    const isRevert = message.includes('revert');
    
    // Check for meaningful changes
    const additions = commit.stats?.additions || 0;
    const deletions = commit.stats?.deletions || 0;
    const totalChanges = additions + deletions;
    const fileCount = commit.files?.length || 0;
    
    // Check if commit affects important files
    const importantFiles = commit.files?.some(file => 
        file.filename.includes('.test.') || 
        file.filename.includes('spec') || 
        file.filename.includes('test') ||
        file.filename.includes('bug') ||
        file.filename.includes('security') ||
        file.filename.includes('perf')
    ) || false;
    
    const meetsThresholds = 
        totalChanges >= QUALITY_THRESHOLDS.MIN_COMMIT_LINES &&
        fileCount >= QUALITY_THRESHOLDS.MIN_COMMIT_FILES;
    
    // Calculate quality score
    let qualityScore = 0;
    if (meetsThresholds) {
        qualityScore += 1;
        qualityScore += Math.min(2, totalChanges / 20); // Bonus for more substantial changes
        qualityScore += Math.min(1, fileCount / 3); // Bonus for affecting multiple files
        if (importantFiles) qualityScore += 1; // Bonus for important files
    }
    
    return {
        isValid: !isSpamMessage && !isRevert && meetsThresholds,
        qualityScore,
        isSpam: isSpamMessage,
        isRevert,
        additions,
        deletions,
        totalChanges,
        fileCount,
        importantFiles
    };
}

/**
 * Analyze PR quality and determine if it's meaningful
 */
function analyzePRQuality(pr, commits, reviews) {
    const message = (pr.title + ' ' + (pr.body || '')).toLowerCase();
    
    // Check for spam patterns in PR
    const isSpamPR = 
        message.includes('update') && message.length < 30 ||
        message.includes('minor') && message.length < 30 ||
        message.includes('cleanup') && message.length < 30 ||
        message.includes('wip') ||
        message.includes('temp') || message.includes('tmp');
    
    // Check PR metrics
    const additions = pr.additions || 0;
    const deletions = pr.deletions || 0;
    const totalChanges = additions + deletions;
    const fileCount = pr.changed_files || 0;
    
    // Check if PR was self-merged quickly
    const createdAt = new Date(pr.created_at);
    const mergedAt = pr.merged_at ? new Date(pr.merged_at) : null;
    const isSelfMerged = pr.user?.login === pr.merged_by?.login;
    const mergeTimeHours = mergedAt ? (mergedAt - createdAt) / (1000 * 60 * 60) : Infinity;
    const isInstantMerge = mergeTimeHours < 1; // Merged within an hour
    
    // Check for reviews
    const hasReviews = reviews && reviews.length > 0;
    const approvedReviews = reviews ? reviews.filter(r => r.state === 'APPROVED').length : 0;
    
    // Check if PR affects important files
    const importantFiles = pr.files?.some(file => 
        file.filename.includes('.test.') || 
        file.filename.includes('spec') || 
        file.filename.includes('test') ||
        file.filename.includes('bug') ||
        file.filename.includes('security') ||
        file.filename.includes('perf')
    ) || false;
    
    const meetsThresholds = 
        totalChanges >= QUALITY_THRESHOLDS.MIN_PR_CHANGES &&
        fileCount >= QUALITY_THRESHOLDS.MIN_PR_FILES;
    
    // Calculate quality score
    let qualityScore = 0;
    if (meetsThresholds) {
        qualityScore += 2; // Base score for meaningful PR
        qualityScore += Math.min(3, totalChanges / 50); // Bonus for substantial changes
        qualityScore += Math.min(2, fileCount / 5); // Bonus for affecting multiple files
        if (approvedReviews > 0) qualityScore += approvedReviews * 0.5; // Bonus for approvals
        if (importantFiles) qualityScore += 2; // Higher bonus for important files
    }
    
    // Penalty for instant self-merge
    if (isSelfMerged && isInstantMerge) {
        qualityScore *= 0.3; // Significant penalty
    }
    
    return {
        isValid: !isSpamPR && meetsThresholds && !isInstantMerge,
        qualityScore,
        isSpam: isSpamPR,
        isSelfMerged,
        isInstantMerge,
        hasReviews,
        approvedReviews,
        additions,
        deletions,
        totalChanges,
        fileCount,
        importantFiles
    };
}

/**
 * Analyze branch quality and determine if it's meaningful
 */
function analyzeBranchQuality(branch, commits, prs) {
    const createdAt = new Date(branch.last_commit_date);
    const now = new Date();
    const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
    
    const branchCommits = commits.filter(c => 
        c.commit.message.toLowerCase().includes(branch.name.toLowerCase()) ||
        // More sophisticated branch identification would go here
        true // Placeholder - in reality we'd need better branch mapping
    );
    
    const hasMergedPRs = prs.some(pr => 
        pr.merged_at && 
        (pr.head?.ref === branch.name || pr.base?.ref === branch.name)
    );
    
    const meetsLifetime = ageDays >= QUALITY_THRESHOLDS.MIN_BRANCH_LIFETIME_DAYS;
    const meetsCommitCount = branchCommits.length >= QUALITY_THRESHOLDS.MIN_BRANCH_COMMITS;
    
    const isValid = (meetsLifetime || hasMergedPRs) && meetsCommitCount;
    
    let qualityScore = 0;
    if (isValid) {
        qualityScore += 1; // Base score
        qualityScore += Math.min(2, branchCommits.length / 10); // Bonus for more commits
        if (hasMergedPRs) qualityScore += 2; // Bonus for merged work
    }
    
    return {
        isValid,
        qualityScore,
        ageDays,
        commitCount: branchCommits.length,
        hasMergedPRs
    };
}

/**
 * Detect spam patterns in commit sequences
 */
function detectSpamPatterns(commits) {
    // Group commits by time window
    const commitGroups = {};
    const timeWindowMs = QUALITY_THRESHOLDS.MAX_COMMIT_BURST_MINUTES * 60 * 1000;
    
    commits.forEach(commit => {
        const commitTime = new Date(commit.commit.author.date).getTime();
        const windowStart = Math.floor(commitTime / timeWindowMs) * timeWindowMs;
        
        if (!commitGroups[windowStart]) {
            commitGroups[windowStart] = [];
        }
        commitGroups[windowStart].push(commit);
    });
    
    // Check for burst patterns
    const spamBursts = Object.values(commitGroups)
        .filter(group => group.length > QUALITY_THRESHOLDS.MAX_COMMIT_BURST_SIZE);
    
    // Check for repetitive messages
    const messageCounts = {};
    commits.forEach(commit => {
        const msg = commit.commit.message.toLowerCase().trim();
        messageCounts[msg] = (messageCounts[msg] || 0) + 1;
    });
    
    const repetitiveCommits = commits.filter(commit => {
        const msg = commit.commit.message.toLowerCase().trim();
        return messageCounts[msg] > 3; // Same message more than 3 times
    });
    
    // Check for file toggling (same file being changed repeatedly)
    const fileChangeCounts = {};
    commits.forEach(commit => {
        if (commit.files) {
            commit.files.forEach(file => {
                fileChangeCounts[file.filename] = (fileChangeCounts[file.filename] || 0) + 1;
            });
        }
    });
    
    const toggleFiles = Object.entries(fileChangeCounts)
        .filter(([filename, count]) => count > 5)
        .map(([filename, count]) => ({ filename, count }));
    
    return {
        spamBursts: spamBursts.length,
        repetitiveCommits: repetitiveCommits.length,
        toggleFiles
    };
}

/**
 * Calculate time decay factor for contributions
 */
function calculateTimeDecayFactor(date) {
    const now = new Date();
    const ageDays = (now - new Date(date)) / (1000 * 60 * 60 * 24);
    
    // Contributions decay over time but don't disappear completely
    // After ~30 days, contribution value is halved
    return Math.max(0.1, 1 / (1 + ageDays / 30));
}

/**
 * Main function to analyze GitHub contribution quality
 */
function analyzeGitHubContributions(repositories, commits, pullRequests, branches) {
    const analyzedData = {
        validCommits: [],
        spamCommits: [],
        validPRs: [],
        spamPRs: [],
        validBranches: [],
        spamBranches: [],
        qualityMetrics: {}
    };
    
    // Analyze commits for quality and spam
    commits.forEach(commit => {
        const repo = repositories.find(r => r.name === commit.repository);
        const analysis = analyzeCommitQuality(commit, repo?.name);
        
        if (analysis.isValid) {
            analysis.decayFactor = calculateTimeDecayFactor(commit.commit.author.date);
            analyzedData.validCommits.push({ ...commit, qualityAnalysis: analysis });
        } else {
            analyzedData.spamCommits.push({ ...commit, qualityAnalysis: analysis });
        }
    });
    
    // Analyze PRs for quality and spam
    pullRequests.forEach(pr => {
        // Get commits and reviews for this PR (would need to fetch these separately in practice)
        const prCommits = commits.filter(c => 
            c.repository === pr.repository && 
            c.commit.message.includes(pr.number.toString())
        );
        
        const analysis = analyzePRQuality(pr, prCommits, []);
        
        if (analysis.isValid) {
            analysis.decayFactor = calculateTimeDecayFactor(pr.created_at);
            analyzedData.validPRs.push({ ...pr, qualityAnalysis: analysis });
        } else {
            analyzedData.spamPRs.push({ ...pr, qualityAnalysis: analysis });
        }
    });
    
    // Analyze branches for quality
    branches.forEach(branch => {
        const branchCommits = commits.filter(c => 
            c.repository === branch.repository // Simplified mapping
        );
        
        const branchPRs = pullRequests.filter(pr => 
            pr.repository === branch.repository // Simplified mapping
        );
        
        const analysis = analyzeBranchQuality(branch, branchCommits, branchPRs);
        
        if (analysis.isValid) {
            analyzedData.validBranches.push({ ...branch, qualityAnalysis: analysis });
        } else {
            analyzedData.spamBranches.push({ ...branch, qualityAnalysis: analysis });
        }
    });
    
    // Detect overall spam patterns
    const spamPatterns = detectSpamPatterns(commits);
    
    // Calculate aggregate metrics
    analyzedData.qualityMetrics = {
        totalCommits: commits.length,
        validCommits: analyzedData.validCommits.length,
        spamCommits: analyzedData.spamCommits.length,
        totalPRs: pullRequests.length,
        validPRs: analyzedData.validPRs.length,
        spamPRs: analyzedData.spamPRs.length,
        totalBranches: branches.length,
        validBranches: analyzedData.validBranches.length,
        spamBranches: analyzedData.spamBranches.length,
        spamPatterns
    };
    
    return analyzedData;
}

module.exports = {
    analyzeGitHubContributions,
    analyzeCommitQuality,
    analyzePRQuality,
    analyzeBranchQuality,
    detectSpamPatterns,
    QUALITY_THRESHOLDS
};