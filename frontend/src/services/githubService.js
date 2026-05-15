import api from './api';

const githubService = {
    // Get Dashboard Data
    getDashboard: async (username) => {
        try {
            const response = await api.get(`/github/dashboard`);
            return response.data;
        } catch (error) {
            console.error('Error fetching GitHub dashboard:', error);
            throw error;
        }
    },

    // Get Live Leaderboard
    getLiveLeaderboard: async (username) => {
        try {
            const response = await api.get(`/github/live-leaderboard`);
            return response.data;
        } catch (error) {
            console.error('Error fetching live leaderboard:', error);
            throw error;
        }
    },

    // Get Live Repositories
    getLiveRepositories: async (username) => {
        try {
            const response = await api.get(`/github/live-repositories`);
            return response.data;
        } catch (error) {
            console.error('Error fetching live repositories:', error);
            throw error;
        }
    },

    // Get Contributors (DB)
    getContributors: async () => {
        const response = await api.get('/github/contributors');
        return response.data;
    },

    // Save Contributors
    saveContributors: async (contributors, username) => {
        const response = await api.post('/github/contributors/save', { contributors, github_username: username });
        return response.data;
    },

    // Clear Contributors
    clearContributors: async () => {
        const response = await api.delete('/github/contributors/clear');
        return response.data;
    },

    // Clear GitHub Cache
    clearGitHubCache: async (username) => {
        try {
            const response = await api.post('/github/clear-cache');
            return response.data;
        } catch (error) {
            console.error('Error clearing GitHub cache:', error);
            throw error;
        }
    },

    // Repo Chat - Send message
    sendRepoChatMessage: async (message, repoNames = [], conversationHistory = []) => {
        try {
            const response = await api.post('/github/repo-chat/chat', {
                message,
                repoNames,
                conversationHistory
            });
            return response.data;
        } catch (error) {
            console.error('Error sending repo chat message:', error);
            throw error;
        }
    },

    // Repo Chat - Get repo list for suggestions
    getRepoChatRepos: async () => {
        try {
            const response = await api.get('/github/repo-chat/repos');
            return response.data;
        } catch (error) {
            console.error('Error fetching repo chat repos:', error);
            throw error;
        }
    }
};

export default githubService;