import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import LiveGitHubStats from "./LiveGitHubStats"
import LiveLeaderboard from "./LiveLeaderboard"
import LiveRepositories from "./LiveRepositories"
import RepoChat from "./RepoChat"
import { Users, Trophy, Code } from "lucide-react"

export default function GitHubDashboard() {
    // No longer need to pass username as prop since backend uses authenticated user
    // const [githubUsername, setGithubUsername] = useState('');
    
    // useEffect(() => {
    //     // Get GitHub username from environment or configuration
    //     const username = import.meta.env.VITE_GITHUB_USERNAME || 'techvaseegrah';
    //     setGithubUsername(username);
    // }, []);

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-50">
            <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur shadow-sm">
                <div className="flex h-16 items-center px-4 max-w-7xl mx-auto w-full justify-between">
                    <h1 className="text-lg font-semibold tracking-tight text-gray-900">GitHub Activity Tracker</h1>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Admin View</span>
                    </div>
                </div>
            </header>
            <main className="flex-1 space-y-8 p-4 sm:p-8 pt-6 max-w-7xl mx-auto w-full">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h2>
                        <p className="text-gray-500 mt-2">
                            Monitor realtime GitHub activity, contributors, and repository health.
                        </p>
                    </div>
                </div>

                {/* AI Repo Chat */}
                <RepoChat />

                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList className="grid w-full md:w-auto grid-cols-3 bg-gray-100 rounded-lg p-1">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow font-medium flex gap-2 items-center">
                            <Users className="w-4 h-4" /> Overview
                        </TabsTrigger>
                        <TabsTrigger value="leaderboard" className="data-[state=active]:bg-white data-[state=active]:shadow font-medium flex gap-2 items-center">
                            <Trophy className="w-4 h-4" /> Leaderboard
                        </TabsTrigger>
                        <TabsTrigger value="repositories" className="data-[state=active]:bg-white data-[state=active]:shadow font-medium flex gap-2 items-center">
                            <Code className="w-4 h-4" /> Repositories
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-8 animate-in fade-in-50 duration-500">
                        <LiveGitHubStats />
                    </TabsContent>

                    <TabsContent value="leaderboard" className="space-y-8 animate-in fade-in-50 duration-500">
                        <LiveLeaderboard />
                    </TabsContent>

                    <TabsContent value="repositories" className="space-y-8 animate-in fade-in-50 duration-500">
                        <LiveRepositories />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}