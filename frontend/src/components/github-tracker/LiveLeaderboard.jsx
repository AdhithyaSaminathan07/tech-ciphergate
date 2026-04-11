"use client"

import { useState, useEffect } from "react"
import {
    Trophy,
    GitCommit,
    Users,
    RefreshCw,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Search,
    Calendar,
    Filter,
    X,
    Save,
    CheckCircle,
    Database
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import githubService from "@/services/githubService"

// Quality-based score calculation considering meaningful contributions
const calculateQualityScore = (validCommits, validPRs, merges, branchCount, spamCount) => {
    // Base points for different types of quality contributions
    const validCommitPoints = validCommits.reduce((sum, commit) => {
        const baseScore = 1.5;
        const qualityBonus = commit.qualityAnalysis.qualityScore || 0;
        const decayFactor = commit.qualityAnalysis.decayFactor || 1;
        return sum + (baseScore + qualityBonus) * decayFactor;
    }, 0);

    const validPRPoints = validPRs.reduce((sum, pr) => {
        const baseScore = 3;
        const qualityBonus = pr.qualityAnalysis.qualityScore || 0;
        const decayFactor = pr.qualityAnalysis.decayFactor || 1;
        return sum + (baseScore + qualityBonus) * decayFactor;
    }, 0);

    const mergePoints = merges * 5;
    const branchPoints = branchCount * 2;

    // Penalty for spam activity
    const spamPenalty = Math.min(spamCount * 2, validCommitPoints + validPRPoints);

    return Math.max(0, validCommitPoints + validPRPoints + mergePoints + branchPoints - spamPenalty);
}

const createContributorLeaderboard = (contributors, commits, pullRequests, analyzedData) => {
    const leaderboard = contributors.map(contributor => {
        // Get quality-analyzed data for this user
        const validUserCommits = analyzedData?.validCommits?.filter(c => c.author?.login === contributor.login) || [];
        const spamUserCommits = analyzedData?.spamCommits?.filter(c => c.author?.login === contributor.login) || [];
        const validUserPRs = analyzedData?.validPRs?.filter(pr => pr.user?.login === contributor.login) || [];
        const spamUserPRs = analyzedData?.spamPRs?.filter(pr => pr.user?.login === contributor.login) || [];

        const userValidCommits = validUserCommits;
        const userSpamCommits = spamUserCommits;
        const userValidPRs = validUserPRs;
        const userSpamPRs = spamUserPRs;

        const userMerges = userValidPRs.filter(pr => pr.merged_at).length;

        // Calculate branch count from valid branches
        const uniqueRepos = new Set(userValidCommits.map(c => c.repository)).size;
        const branchCount = uniqueRepos;

        // Calculate quality-based score
        let score = calculateQualityScore(
            userValidCommits,
            userValidPRs,
            userMerges,
            branchCount,
            userSpamCommits.length + userSpamPRs.length
        );

        // FALLBACK: If analyzed commits are fewer than total GitHub contributions (due to pagination limits),
        // add base points for the historical difference to ensure the leaderboard reflects all-time active users.
        const totalHistoricalCommits = contributor.contributions || 0;
        const analyzedCommitCount = userValidCommits.length + userSpamCommits.length;

        let displayValidCommits = userValidCommits.length;

        if (totalHistoricalCommits > analyzedCommitCount) {
            const missingCommits = totalHistoricalCommits - analyzedCommitCount;
            // Assign 1.5 points (base valid score) per missing historical commit
            score += missingCommits * 1.5;
            displayValidCommits += missingCommits;
        }

        return {
            login: contributor.login,
            name: contributor.user_details?.name || contributor.login,
            avatar_url: contributor.avatar_url,
            html_url: contributor.html_url,
            score: score,
            valid_commits: displayValidCommits,
            spam_commits: userSpamCommits.length,
            valid_prs: userValidPRs.length,
            spam_prs: userSpamPRs.length,
            merges: userMerges,
            branch_count: branchCount,
            repo_count: uniqueRepos,
            user_details: contributor.user_details,
            total_valid_contributions: displayValidCommits + userValidPRs.length
        }
    })

    // Sort by score descending
    return leaderboard.sort((a, b) => b.score - a.score)
}


export default function LiveLeaderboard() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [refreshing, setRefreshing] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [clearingCache, setClearingCache] = useState(false)

    // Database state
    const [savingToDb, setSavingToDb] = useState(false)
    const [dbSaveStatus, setDbSaveStatus] = useState('idle') // 'idle', 'saving', 'success', 'error'

    // Filters
    const [filters, setFilters] = useState({
        searchTerm: "",
        timeRange: "all",
        branch: "",
    })

    const handleManualSave = async () => {
        if (!data) return

        setSavingToDb(true)
        setDbSaveStatus('saving')

        try {
            const { contributors, commits, pullRequests } = data
            const leaderboard = createContributorLeaderboard(contributors, commits, pullRequests)

            // Call ApiService to save
            await githubService.saveContributors(leaderboard, '')
            setDbSaveStatus('success')
            setTimeout(() => setDbSaveStatus('idle'), 3000)
        } catch (err) {
            console.error("Manual save failed:", err)
            setDbSaveStatus('error')
        } finally {
            setSavingToDb(false)
        }
    }

    const saveContributorsToDatabase = async (leaderboardData) => {
        try {
            setDbSaveStatus('saving')
            await githubService.saveContributors(leaderboardData, '')
            setDbSaveStatus('success')
            setTimeout(() => setDbSaveStatus('idle'), 3000)
        } catch (err) {
            console.error("Auto save failed:", err)
            setDbSaveStatus('error')
        }
    }

    const loadData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)

        try {
            const result = await githubService.getLiveLeaderboard()

            if (result) {
                setData(result)
                setError(null)

                // Generate derived data for saving
                const leaderboard = createContributorLeaderboard(
                    result.contributors,
                    result.commits,
                    result.pullRequests,
                    result.analyzedData
                )
                // Save to MongoDB automatically
                await saveContributorsToDatabase(leaderboard);
            } else {
                setError("Failed to fetch GitHub data.")
            }
        } catch (err) {
            setError("Network error occurred. Please try again.")
            console.error("Load data error:", err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const clearGitHubCache = async () => {
        setClearingCache(true);
        try {
            await githubService.clearGitHubCache();
            // After clearing cache, refresh the data
            await loadData(true);
        } catch (err) {
            console.error('Error clearing GitHub cache:', err);
        } finally {
            setClearingCache(false);
        }
    };

    const handleRefresh = () => {
        loadData(true)
    }

    const handleFilterChange = (key, value) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value,
        }))
    }

    const resetFilters = () => {
        setFilters({
            searchTerm: "",
            timeRange: "all",
            branch: "",
        })
    }

    const getDateRange = (range) => {
        const now = new Date()
        switch (range) {
            case "today":
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return { start: today, end: now }
            case "week":
                const weekStart = new Date()
                weekStart.setDate(weekStart.getDate() - 7)
                return { start: weekStart, end: now }
            case "month":
                const monthStart = new Date()
                monthStart.setMonth(monthStart.getMonth() - 1)
                return { start: monthStart, end: now }
            default:
                return { start: null, end: null }
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    // Auto-refresh disabled to prevent rate limits, use manual refresh with caching
    // useEffect(() => {
    //     if (!username) return
    //     const interval = setInterval(() => {
    //         loadData(true)
    //     }, 120000)
    //     return () => clearInterval(interval)
    // }, [username])

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-300 border-t-transparent mx-auto mb-6"></div>
                    <p className="text-white text-lg font-medium">Loading Leaderboard Data...</p>
                    <p className="text-blue-300 text-sm mt-2">Fetching from authenticated user repositories...</p>
                    {savingToDb && (
                        <p className="text-green-300 text-sm mt-1 flex items-center justify-center gap-2">
                            <Database className="w-4 h-4 animate-pulse" />
                            Saving to database...
                        </p>
                    )}
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <p className="text-red-300 text-lg font-medium mb-4">{error}</p>
                    <Button onClick={() => loadData()} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg">
                        Try Again
                    </Button>
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-300 border-t-transparent mx-auto mb-6"></div>
                    <p className="text-white text-lg font-medium">Loading Leaderboard...</p>
                </div>
            </div>
        )
    }

    const { contributors, commits, pullRequests, stats } = data
    const leaderboard = createContributorLeaderboard(contributors, commits, pullRequests)

    // Apply time filter
    const { start: timeStart, end: timeEnd } = getDateRange(filters.timeRange)

    // Create activity map for filtering
    const userActivities = {}
    commits.forEach((commit) => {
        const login = commit.author?.login
        if (login) {
            const date = new Date(commit.commit.author.date)
            if (!userActivities[login]) userActivities[login] = []
            if (!timeStart || !timeEnd || (date >= timeStart && date <= timeEnd)) {
                userActivities[login].push(commit)
            }
        }
    })

    // Apply filters
    const filteredLeaderboard = leaderboard.filter((user) => {
        const matchesSearch =
            user.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
            user.login.toLowerCase().includes(filters.searchTerm.toLowerCase())

        const hasActivityInRange = !filters.timeRange || filters.timeRange === 'all' || (userActivities[user.login] && userActivities[user.login].length > 0)

        // Simple branch filter based on repo names if needed, but for now just search and time
        return matchesSearch && hasActivityInRange
    })

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 py-8 px-4 sm:px-6 rounded-xl">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full">
                        <Trophy className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                        Top Performers
                    </h1>
                </div>

                <div className="flex justify-center mt-6 gap-4 flex-wrap">
                    <Button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Refreshing..." : "Refresh"}
                    </Button>

                    <Button
                        onClick={clearGitHubCache}
                        disabled={clearingCache}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                    >
                        {clearingCache ? (
                            <>
                                <Database className="w-4 h-4 animate-pulse" />
                                Clearing...
                            </>
                        ) : (
                            <>
                                <Database className="w-4 h-4" />
                                Clear Cache
                            </>
                        )}
                    </Button>

                    <Button
                        onClick={handleManualSave}
                        disabled={savingToDb}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                    >
                        {savingToDb ? (
                            <>
                                <Database className="w-4 h-4 animate-pulse" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save to DB
                            </>
                        )}
                    </Button>

                    <Button
                        onClick={() => setShowFilters(!showFilters)}
                        variant={showFilters ? "default" : "outline"}
                        className="flex items-center gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </Button>
                </div>

                {dbSaveStatus !== 'idle' && (
                    <div className="mt-4 text-center">
                        <p className={`text-sm ${dbSaveStatus === 'success' ? 'text-green-400' : dbSaveStatus === 'error' ? 'text-red-400' : 'text-blue-300'}`}>
                            {dbSaveStatus === 'success' && "Saved to Database!"}
                            {dbSaveStatus === 'error' && "Save Failed"}
                            {dbSaveStatus === 'saving' && "Saving..."}
                        </p>
                    </div>
                )}
            </div>

            {showFilters && (
                <div className="mb-8 bg-blue-800/80 border border-blue-700/60 rounded-lg p-6 max-w-2xl mx-auto backdrop-blur-sm">
                    {/* Filter Inputs */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-blue-300 mb-2 flex items-center gap-1">
                                <Search className="w-4 h-4" />
                                Search
                            </label>
                            <Input
                                value={filters.searchTerm}
                                onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
                                placeholder="Search contributors..."
                                className="bg-blue-900/50 border-blue-600/50 text-white"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={filters.timeRange === 'all' ? 'default' : 'outline'}
                                onClick={() => handleFilterChange('timeRange', 'all')}
                                size="sm"
                            >
                                All Time
                            </Button>
                            <Button
                                variant={filters.timeRange === 'week' ? 'default' : 'outline'}
                                onClick={() => handleFilterChange('timeRange', 'week')}
                                size="sm"
                            >
                                This Week
                            </Button>
                            <Button
                                variant={filters.timeRange === 'month' ? 'default' : 'outline'}
                                onClick={() => handleFilterChange('timeRange', 'month')}
                                size="sm"
                            >
                                This Month
                            </Button>
                        </div>
                        <Button onClick={resetFilters} variant="ghost" size="sm" className="text-blue-300">
                            Reset
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-4 max-w-4xl mx-auto">
                {filteredLeaderboard.map((user, index) => (
                    <div key={user.login} className="bg-white/5 p-4 rounded-lg flex items-center justify-between hover:bg-white/10 transition-colors border border-white/10">
                        <div className="flex items-center gap-4">
                            <div className="flex-shrink-0 w-8 text-center font-bold text-white/50">
                                #{index + 1}
                            </div>
                            <img src={user.avatar_url} alt={user.login} className="w-12 h-12 rounded-full border-2 border-blue-500/50" />
                            <div>
                                <div className="text-white font-semibold text-lg">{user.name}</div>
                                <div className="text-blue-300 text-sm">@{user.login}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <div className="text-lg font-bold text-white">{user.valid_commits}</div>
                                <div className="text-xs text-white/50">Valid Commits</div>
                                {user.spam_commits > 0 && (
                                    <div className="text-xs text-red-400">{user.spam_commits} spam</div>
                                )}
                            </div>
                            <div className="text-center">
                                <div className="text-lg font-bold text-white">{user.valid_prs}</div>
                                <div className="text-xs text-white/50">Valid PRs</div>
                                {user.spam_prs > 0 && (
                                    <div className="text-xs text-red-400">{user.spam_prs} spam</div>
                                )}
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-yellow-500">{Math.round(user.score)}</div>
                                <div className="text-xs text-yellow-500/70">Quality Points</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}