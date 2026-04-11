"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
    GitBranch,
    Users,
    ExternalLink,
    Star,
    Lock,
    Globe,
    Code,
    RefreshCw,
    AlertCircle,
    Filter,
    Search,
    SortAsc,
    SortDesc,
    GitFork,
    Calendar,
    Timer,
    Clock,
    Database
} from "lucide-react"
import githubService from "@/services/githubService"

export default function LiveRepositories() {
    const [repositories, setRepositories] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [refreshing, setRefreshing] = useState(false)
    const [expandedRepo, setExpandedRepo] = useState(null)
    const [showFilters, setShowFilters] = useState(false)
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false) // Disabled to prevent rate limits
    const [timeUntilRefresh, setTimeUntilRefresh] = useState(30)
    const [lastRefreshTime, setLastRefreshTime] = useState(null)
    const [clearingCache, setClearingCache] = useState(false)

    // Filter states
    const [filters, setFilters] = useState({
        search: '',
        sortBy: 'updated',
        sortOrder: 'desc',
        visibility: 'all',
        language: 'all-languages',
        hasContributors: false,
        minStars: 0,
        maxStars: 0,
        minForks: 0,
        maxForks: 0
    })

    const loadRepositories = useCallback(async (showRefreshIndicator = false) => {
        if (showRefreshIndicator) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        try {
            const result = await githubService.getLiveRepositories()
            setRepositories(result)
            setError(null)
            setLastRefreshTime(new Date())
            setTimeUntilRefresh(30) // Reset countdown
        } catch (err) {
            setError('Network error occurred. Please try again.')
            console.error('Load repositories error:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    const clearGitHubCache = async () => {
        setClearingCache(true);
        try {
            await githubService.clearGitHubCache();
            // After clearing cache, refresh the data
            await loadRepositories(true);
        } catch (err) {
            console.error('Error clearing GitHub cache:', err);
        } finally {
            setClearingCache(false);
        }
    };

    const handleRefresh = () => {
        loadRepositories(true)
    }

    const toggleAutoRefresh = () => {
        setAutoRefreshEnabled(!autoRefreshEnabled)
        if (!autoRefreshEnabled) {
            setTimeUntilRefresh(30)
        }
    }

    const clearFilters = () => {
        setFilters({
            search: '',
            sortBy: 'updated',
            sortOrder: 'desc',
            visibility: 'all',
            language: 'all-languages',
            hasContributors: false,
            minStars: 0,
            maxStars: 0,
            minForks: 0,
            maxForks: 0
        })
    }

    const applyFilters = (repos) => {
        let filtered = [...repos]

        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase()
            filtered = filtered.filter(repo =>
                repo.name.toLowerCase().includes(searchLower) ||
                repo.full_name?.toLowerCase().includes(searchLower) ||
                (repo.description && repo.description.toLowerCase().includes(searchLower)) ||
                (repo.language && repo.language.toLowerCase().includes(searchLower))
            )
        }

        // Visibility filter
        if (filters.visibility !== 'all') {
            filtered = filtered.filter(repo =>
                filters.visibility === 'private' ? repo.private : !repo.private
            )
        }

        // Language filter
        if (filters.language && filters.language !== 'all-languages') {
            filtered = filtered.filter(repo => repo.language === filters.language)
        }

        // Has contributors filter
        if (filters.hasContributors) {
            filtered = filtered.filter(repo => repo.contributor_count > 1)
        }

        // Stars range filter
        if (filters.minStars > 0) {
            filtered = filtered.filter(repo => repo.stargazers_count >= filters.minStars)
        }
        if (filters.maxStars > 0) {
            filtered = filtered.filter(repo => repo.stargazers_count <= filters.maxStars)
        }

        // Forks range filter
        if (filters.minForks > 0) {
            filtered = filtered.filter(repo => repo.forks_count >= filters.minForks)
        }
        if (filters.maxForks > 0) {
            filtered = filtered.filter(repo => repo.forks_count <= filters.maxForks)
        }

        // Sorting
        filtered.sort((a, b) => {
            let aVal, bVal

            switch (filters.sortBy) {
                case 'updated':
                    aVal = new Date(a.updated_at).getTime()
                    bVal = new Date(b.updated_at).getTime()
                    break
                case 'created':
                    aVal = new Date(a.created_at).getTime()
                    bVal = new Date(b.created_at).getTime()
                    break
                case 'name':
                    aVal = a.name.toLowerCase()
                    bVal = b.name.toLowerCase()
                    break
                case 'stars':
                    aVal = a.stargazers_count
                    bVal = b.stargazers_count
                    break
                case 'forks':
                    aVal = a.forks_count
                    bVal = b.forks_count
                    break
                case 'contributors':
                    aVal = a.contributor_count
                    bVal = b.contributor_count
                    break
                case 'size':
                    aVal = a.size
                    bVal = b.size
                    break
                default:
                    aVal = new Date(a.updated_at).getTime()
                    bVal = new Date(b.updated_at).getTime()
            }

            if (filters.sortOrder === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
            }
        })

        return filtered
    }

    // Auto-refresh effect
    useEffect(() => {
        if (!autoRefreshEnabled || loading || refreshing) return

        const interval = setInterval(() => {
            setTimeUntilRefresh((prev) => {
                if (prev <= 1) {
                    loadRepositories(true)
                    return 30
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [autoRefreshEnabled, loading, refreshing, loadRepositories])

    // Initial load
    useEffect(() => {
        loadRepositories()
    }, [loadRepositories])

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-300 border-t-transparent mx-auto mb-6"></div>
                    <p className="text-white text-lg font-medium">Loading Repositories...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <p className="text-red-300 text-lg font-medium mb-4">{error}</p>
                    <Button
                        onClick={() => loadRepositories()}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg"
                    >
                        Try Again
                    </Button>
                </div>
            </div>
        )
    }

    const filteredRepositories = applyFilters(repositories)
    const uniqueLanguages = Array.from(new Set(
        repositories.filter(repo => repo.language).map(repo => repo.language)
    )).sort()

    const totalStats = repositories.reduce((acc, repo) => ({
        totalStars: acc.totalStars + (repo.stargazers_count || 0),
        totalForks: acc.totalForks + (repo.forks_count || 0),
        totalContributors: acc.totalContributors + (repo.contributor_count || 0),
        publicRepos: acc.publicRepos + (!repo.private ? 1 : 0),
        privateRepos: acc.privateRepos + (repo.private ? 1 : 0),
        totalBranches: acc.totalBranches + (repo.branches?.length || 0)
    }), { totalStars: 0, totalForks: 0, totalContributors: 0, publicRepos: 0, privateRepos: 0, totalBranches: 0 })

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-4">
            {/* Header */}
            <div className="relative overflow-hidden mb-8 rounded-xl bg-blue-950/30 border border-blue-800/30 p-6">
                <div className="text-center">
                    <div className="inline-flex items-center gap-3 mb-4">
                        <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full">
                            <Code className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                            All Repositories
                        </h1>
                    </div>

                    {/* Controls */}
                    <div className="flex justify-center items-center gap-4 mt-6 flex-wrap">
                        <Button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh Now'}
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
                            onClick={toggleAutoRefresh}
                            variant={autoRefreshEnabled ? "default" : "outline"}
                            className={`px-6 py-2 rounded-lg flex items-center gap-2 ${autoRefreshEnabled
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "border-slate-600 text-slate-300 hover:bg-slate-700"
                                }`}
                        >
                            <Timer className="w-4 h-4" />
                            Auto Refresh {autoRefreshEnabled ? 'ON' : 'OFF'}
                        </Button>
                    </div>

                    {/* Auto-refresh status */}
                    {autoRefreshEnabled && !refreshing && (
                        <div className="mt-3 text-sm text-blue-300">
                            <div className="flex items-center justify-center gap-2">
                                <Clock className="w-4 h-4" />
                                Next refresh in {timeUntilRefresh} seconds
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="mb-8 bg-slate-800/50 border border-slate-700 rounded-xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-semibold text-white">Filters & Search</h3>
                        <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">
                            {filteredRepositories.length} of {repositories.length} repositories
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFilters(!showFilters)}
                            className="text-white border-slate-600 hover:bg-slate-700"
                        >
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={clearFilters}
                        >
                            Clear
                        </Button>
                    </div>
                </div>

                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                        placeholder="Search repositories..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
                    />
                </div>

                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div>
                            <label className="text-sm text-slate-300 mb-2 block">Sort By</label>
                            <Select value={filters.sortBy} onValueChange={(value) => setFilters({ ...filters, sortBy: value })}>
                                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-700 border-slate-600 text-white">
                                    <SelectItem value="updated">Last Updated</SelectItem>
                                    <SelectItem value="created">Created Date</SelectItem>
                                    <SelectItem value="name">Name</SelectItem>
                                    <SelectItem value="stars">Stars</SelectItem>
                                    <SelectItem value="forks">Forks</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm text-slate-300 mb-2 block">Language</label>
                            <Select value={filters.language} onValueChange={(value) => setFilters({ ...filters, language: value })}>
                                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                                    <SelectValue placeholder="All Languages" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-700 border-slate-600 text-white">
                                    <SelectItem value="all-languages">All Languages</SelectItem>
                                    {uniqueLanguages.map(lang => (
                                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm text-slate-300 mb-2 block">Visibility</label>
                            <Select value={filters.visibility} onValueChange={(value) => setFilters({ ...filters, visibility: value })}>
                                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-700 border-slate-600 text-white">
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="public">Public</SelectItem>
                                    <SelectItem value="private">Private</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </div>

            {/* List */}
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                {filteredRepositories.map((repo) => (
                    <div key={repo.id} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl hover:bg-slate-800/60 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-lg font-bold text-blue-300 hover:underline flex items-center gap-2">
                                    {repo.name}
                                    {repo.private ? <Lock className="w-3 h-3 text-orange-400" /> : <Globe className="w-3 h-3 text-green-400" />}
                                </a>
                                <p className="text-sm text-slate-400 line-clamp-1">{repo.description}</p>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="secondary">{repo.language || 'N/A'}</Badge>
                            </div>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-400 mt-4">
                            <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {repo.stargazers_count}</span>
                            <span className="flex items-center gap-1"><GitFork className="w-3 h-3" /> {repo.forks_count}</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {repo.contributor_count}</span>
                            <span className="ml-auto">Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}