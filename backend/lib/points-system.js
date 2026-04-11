// This file would contain the logic for the points system

/**
 * Default point values for different activities
 */
const DEFAULT_POINT_VALUES = {
    commit: 5,
    pullRequest: 15,
    pullRequestReview: 8,
    merge: 10,
    issue: 3,
    criticalRepoMultiplier: 1.5,
};

/**
 * List of repositories considered critical (with higher point values)
 */
const CRITICAL_REPOSITORIES = ["acme-org/api-service", "acme-org/payment-gateway", "acme-org/auth-service"];

/**
 * Calculate points for a GitHub activity
 * @param activity The activity data (commit, PR, etc.)
 * @returns The calculated points
 */
function calculatePoints(activity) {
    const { type, repository, files = [] } = activity;

    // Base points based on activity type
    let points = DEFAULT_POINT_VALUES[type] || 0;

    // Additional points based on the number of files changed
    points += Math.min(files.length, 10); // Cap at 10 files to prevent abuse

    // Apply multiplier for critical repositories
    if (CRITICAL_REPOSITORIES.includes(repository)) {
        points = Math.floor(points * DEFAULT_POINT_VALUES.criticalRepoMultiplier);
    }

    return points;
}

/**
 * Calculate achievement badges based on activity
 * @param stats The employee's activity statistics
 * @returns Array of earned achievements
 */
function calculateAchievements(stats) {
    const achievements = [];

    if (stats.commits >= 100) {
        achievements.push({
            id: "commit-master",
            name: "Commit Master",
            description: "Made 100+ commits",
            icon: "git-commit",
        });
    }

    if (stats.pullRequests >= 25) {
        achievements.push({
            id: "pr-pro",
            name: "PR Pro",
            description: "Created 25+ pull requests",
            icon: "git-pull-request",
        });
    }

    if (stats.merges >= 15) {
        achievements.push({
            id: "merge-master",
            name: "Merge Master",
            description: "Merged 15+ pull requests",
            icon: "git-merge",
        });
    }

    if (stats.points >= 1000) {
        achievements.push({
            id: "point-collector",
            name: "Point Collector",
            description: "Earned 1000+ points",
            icon: "award",
        });
    }

    return achievements;
}

module.exports = {
    DEFAULT_POINT_VALUES,
    CRITICAL_REPOSITORIES,
    calculatePoints,
    calculateAchievements,
};
