import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import {
    GitCommit,
    GitBranch,
    Trophy,
    Activity,
    GitPullRequest,
    FileText,
    Plus,
    Minus,
    Clock,
    ExternalLink,
    Star,
    Lock,
    Globe,
    Database,
    AlertTriangle
} from "lucide-react"
import githubService from "@/services/githubService"

export default function LiveGitHubStats() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [refreshing, setRefreshing] = useState(false)
    const [clearingCache, setClearingCache] = useState(false)

    const loadData = async () => {
        try {
            const result = await githubService.getDashboard()
            if (result) {
                setData(result)
                setError(null)
            } else {
                setError('Failed to fetch GitHub data.')
            }
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.message || 'Failed to fetch GitHub data.')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        setLoading(true)
        loadData()
    }, [])

    const clearGitHubCache = async () => {
        setClearingCache(true);
        try {
            await githubService.clearGitHubCache();
            // After clearing cache, refresh the data
            await loadData();
        } catch (err) {
            console.error('Error clearing GitHub cache:', err);
        } finally {
            setClearingCache(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true)
        await loadData()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p>Loading detailed GitHub data...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-center text-red-600">
                    <p>{error}</p>
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-300 border-t-transparent mx-auto mb-6"></div>
                    <p className="text-white text-lg font-medium">Loading GitHub Stats...</p>
                </div>
            </div>
        )
    }

    const { user, repositories, commits, pullRequests, stats } = data

    // Derived stats
    const thisWeekCommits = commits.filter((commit) =>
        new Date(commit.commit.author.date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    )

    return (
        <div className="space-y-4">
            {/* Enhanced Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Valid Commits</CardTitle>
                        <GitCommit className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.validCommits || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.totalCommits || 0} total, {stats.spamCommits || 0} spam
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Valid PRs</CardTitle>
                        <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.validPRs || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.totalPRs || 0} total, {stats.spamPRs || 0} spam
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Code Changes</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">+{stats.totalAdditions}</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-red-600">-{stats.totalDeletions}</span> deletions
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">All Repositories</CardTitle>
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalRepos}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.publicRepos} public, {stats.privateRepos} private
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Anti-Cheat Metrics */}
            <Card>
                <CardHeader>
                    <CardTitle>Anti-Cheat Metrics</CardTitle>
                    <CardDescription>Quality analysis of your GitHub contributions</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="flex flex-col items-center p-4 bg-red-50 rounded-lg border border-red-200">
                            <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
                            <div className="text-2xl font-bold text-red-700">{stats.spamCommits || 0}</div>
                            <div className="text-sm text-red-600">Spam Commits</div>
                            <div className="text-xs text-muted-foreground mt-1 text-center">
                                Low-quality or repetitive commits
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center p-4 bg-red-50 rounded-lg border border-red-200">
                            <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
                            <div className="text-2xl font-bold text-red-700">{stats.spamPRs || 0}</div>
                            <div className="text-sm text-red-600">Spam PRs</div>
                            <div className="text-xs text-muted-foreground mt-1 text-center">
                                Low-quality or tiny PRs
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center p-4 bg-green-50 rounded-lg border border-green-200">
                            <GitCommit className="h-8 w-8 text-green-500 mb-2" />
                            <div className="text-2xl font-bold text-green-700">{stats.validCommits ? Math.round((stats.validCommits / (stats.totalCommits || 1)) * 100) : 0}%</div>
                            <div className="text-sm text-green-600">Quality Rate</div>
                            <div className="text-xs text-muted-foreground mt-1 text-center">
                                Valid commits ratio
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <GitPullRequest className="h-8 w-8 text-blue-500 mb-2" />
                            <div className="text-2xl font-bold text-blue-700">{stats.validPRs ? Math.round((stats.validPRs / (stats.totalPRs || 1)) * 100) : 0}%</div>
                            <div className="text-sm text-blue-600">PR Quality</div>
                            <div className="text-xs text-muted-foreground mt-1 text-center">
                                Valid PRs ratio
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Recent Activity */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 max-h-[600px] overflow-auto">
                    <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-white z-10">
                        <div>
                            <CardTitle>Recent Commits</CardTitle>
                            <CardDescription>Latest commits from all repositories</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefresh}
                                disabled={refreshing || clearingCache}
                            >
                                {refreshing ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
                                ) : (
                                    <Activity className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={clearGitHubCache}
                                disabled={refreshing || clearingCache}
                                className="bg-purple-100 border-purple-300 hover:bg-purple-200"
                            >
                                {clearingCache ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
                                ) : (
                                    <GitCommit className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {commits.slice(0, 15).map((commit) => (
                                <div key={commit.sha} className="flex items-start space-x-4 p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                                    <Avatar className="h-10 w-10 border-2">
                                        <AvatarImage src={commit.author?.avatar_url || commit.committer?.avatar_url} />
                                        <AvatarFallback className="text-xs">
                                            {String(commit.commit.author.name || 'U').substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <p className="text-sm font-medium leading-tight mb-1">
                                                    {commit.commit.message.split('\n')[0]}
                                                </p>
                                                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                                    <span className="font-medium">{commit.commit.author.name}</span>
                                                    <span>•</span>
                                                    <a
                                                        href={commit.repo_url}
                                                        className="hover:text-blue-600 flex items-center"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {commit.repo_private && <Lock className="h-3 w-3 mr-1" />}
                                                        {!commit.repo_private && <Globe className="h-3 w-3 mr-1" />}
                                                        {commit.repository}
                                                        <ExternalLink className="h-3 w-3 ml-1" />
                                                    </a>
                                                    <span>•</span>
                                                    <span className="flex items-center">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        {new Date(commit.commit.author.date).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2 ml-4">
                                                <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                                                    {String(commit.sha).substring(0, 7)}
                                                </Badge>
                                                {commit.repo_private ? (
                                                    <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 hidden sm:inline-flex">
                                                        Private
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 hidden sm:inline-flex">
                                                        Public
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Commit stats */}
                                        {commit.stats && (
                                            <div className="flex items-center space-x-4 text-xs">
                                                <span className="flex items-center text-green-600">
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    {commit.stats.additions}
                                                </span>
                                                <span className="flex items-center text-red-600">
                                                    <Minus className="h-3 w-3 mr-1" />
                                                    {commit.stats.deletions}
                                                </span>
                                                <span className="flex items-center text-muted-foreground">
                                                    <FileText className="h-3 w-3 mr-1" />
                                                    {commit.files?.length || 0} files
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Pull Requests</CardTitle>
                        <CardDescription>Recent pull request activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {pullRequests.slice(0, 10).map((pr) => (
                                <div key={pr.id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card/30">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={pr.user.avatar_url} />
                                        <AvatarFallback className="text-xs">
                                            {pr.user.login.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate" title={pr.title}>{pr.title}</p>
                                        <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
                                            <Badge
                                                variant={pr.state === 'open' ? 'default' : pr.merged_at ? 'default' : 'destructive'}
                                                className="h-5 text-xs"
                                            >
                                                {pr.merged_at ? 'Merged' : pr.state}
                                            </Badge>
                                            <div className="flex items-center">
                                                {pr.repo_private ? (
                                                    <Lock className="h-3 w-3 mr-1" />
                                                ) : (
                                                    <Globe className="h-3 w-3 mr-1" />
                                                )}
                                                <span className="truncate max-w-[100px]">{pr.repository}</span>
                                            </div>
                                            <span>•</span>
                                            <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* All Repositories with Enhanced Info */}
            <Card>
                <CardHeader>
                    <CardTitle>All Repository Overview</CardTitle>
                    <CardDescription>All your repositories sorted by activity</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {repositories
                            .sort((a, b) =>
                                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                            )
                            .slice(0, 12)
                            .map((repo) => (
                                <div key={repo.id} className="p-4 rounded-lg border bg-card/30 hover:bg-card/50 transition-colors">
                                    <div className="flex items-start justify-between mb-2">
                                        <a
                                            href={repo.html_url}
                                            className="font-medium text-sm hover:text-blue-600 flex items-center"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {repo.private ? (
                                                <Lock className="h-3 w-3 mr-1 text-orange-600" />
                                            ) : (
                                                <Globe className="h-3 w-3 mr-1 text-green-600" />
                                            )}
                                            {repo.name}
                                            <ExternalLink className="h-3 w-3 ml-1" />
                                        </a>
                                        <div className="flex items-center space-x-2">
                                            <span className="flex items-center text-xs text-muted-foreground">
                                                <Star className="h-3 w-3 mr-1" />
                                                {repo.stargazers_count}
                                            </span>
                                            <span className="flex items-center text-xs text-muted-foreground">
                                                <GitBranch className="h-3 w-3 mr-1" />
                                                {repo.forks_count}
                                            </span>
                                        </div>
                                    </div>

                                    {repo.description && (
                                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                                            {repo.description}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center space-x-2">
                                            {repo.private ? (
                                                <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                                                    Private
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                                    Public
                                                </Badge>
                                            )}
                                            {repo.language && (
                                                <Badge variant="outline" className="text-xs">
                                                    {repo.language}
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="text-muted-foreground">
                                            Updated {new Date(repo.updated_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}