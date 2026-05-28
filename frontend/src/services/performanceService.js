import api from './api';

// Get my performance summary
export const getMyPerformance = async () => {
    const { data } = await api.get('/performance/me');
    return data;
};

// Get my point transaction history
export const getMyPointHistory = async ({ limit = 20, page = 1 } = {}) => {
    const { data } = await api.get('/performance/history', { params: { limit, page } });
    return data;
};

// Get leaderboard (filter: 'all' | 'weekly' | 'monthly', optional department)
export const getLeaderboard = async ({ filter = 'all', department } = {}) => {
    const { data } = await api.get('/performance/leaderboard', { params: { filter, department } });
    return data;
};

// Admin: overview stats
export const getAdminPerformanceOverview = async () => {
    const { data } = await api.get('/performance/admin/overview');
    return data;
};

// Admin: full employee analytics table
export const getAdminEmployeeAnalytics = async () => {
    const { data } = await api.get('/performance/admin/analytics');
    return data;
};

// Admin: award manual bonus/deduction
export const awardManualBonus = async ({ workerId, points, reason, note }) => {
    const { data } = await api.post('/performance/admin/bonus', { workerId, points, reason, note });
    return data;
};

// Admin: get performance settings
export const getPerformanceSettings = async () => {
    const { data } = await api.get('/performance/settings');
    return data;
};

// Admin: update performance settings
export const updatePerformanceSettings = async (settings) => {
    const { data } = await api.put('/performance/settings', settings);
    return data;
};
