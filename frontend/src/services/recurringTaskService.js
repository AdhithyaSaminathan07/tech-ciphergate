import api from './api';

const BASE = '/recurring-tasks';

/** Create a new recurring task rule */
export const createRecurringTask = async (data) => {
    try {
        const res = await api.post(BASE, data);
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error creating recurring task';
    }
};

/** Get all recurring task rules (admin) */
export const getRecurringTasks = async (params = {}) => {
    try {
        const res = await api.get(BASE, { params });
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error fetching recurring tasks';
    }
};

/** Get a single rule by ID */
export const getRecurringTaskById = async (id) => {
    try {
        const res = await api.get(`${BASE}/${id}`);
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error fetching recurring task';
    }
};

/** Update a recurring task rule (future instances only) */
export const updateRecurringTask = async (id, data) => {
    try {
        const res = await api.put(`${BASE}/${id}`, data);
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error updating recurring task';
    }
};

/** Pause / Resume / Cancel a rule */
export const toggleRecurringTaskStatus = async (id, status) => {
    try {
        const res = await api.patch(`${BASE}/${id}/status`, { status });
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error updating recurring task status';
    }
};

/** Soft-delete a rule */
export const deleteRecurringTask = async (id) => {
    try {
        const res = await api.delete(`${BASE}/${id}`);
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error deleting recurring task';
    }
};

/** Get spawned ticket instances for a rule */
export const getRecurringInstances = async (id, params = {}) => {
    try {
        const res = await api.get(`${BASE}/${id}/instances`, { params });
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error fetching recurring task instances';
    }
};

/** Dev-only manual trigger */
export const triggerSchedulerManually = async () => {
    try {
        const res = await api.post(`${BASE}/trigger-scheduler`);
        return res.data;
    } catch (err) {
        throw err.response?.data?.message || 'Error triggering scheduler';
    }
};
