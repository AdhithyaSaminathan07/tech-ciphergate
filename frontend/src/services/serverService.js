import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const getAccounts = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/accounts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching AWS accounts:', error);
    throw error.response?.data || new Error('Failed to fetch AWS accounts');
  }
};

export const createAccount = async (name, awsAccountId) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/server/accounts', { name, awsAccountId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating AWS account:', error);
    throw error.response?.data || new Error('Failed to create AWS account');
  }
};

export const verifyAccount = async (id, iamRoleArn) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/server/accounts/${id}/verify`, { iamRoleArn }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error verifying AWS account:', error);
    throw error.response?.data || new Error('Failed to verify AWS account');
  }
};

export const deleteAccount = async (id) => {
  try {
    const token = getAuthToken();
    const response = await api.delete(`/server/accounts/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting AWS account:', error);
    throw error.response?.data || new Error('Failed to delete AWS account');
  }
};

export const initializeOrganization = async (name, awsAccountId) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/server/organizations/initialize', { name, awsAccountId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error initializing AWS organization:', error);
    throw error.response?.data || new Error('Failed to initialize AWS organization');
  }
};

export const scanOrganization = async (masterAccountId) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/server/organizations/scan', { masterAccountId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error scanning AWS organization:', error);
    throw error.response?.data || new Error('Failed to scan AWS organization');
  }
};

export const getCostsSummary = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/costs/summary', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    throw error.response?.data || new Error('Failed to fetch cost summary');
  }
};

export const getCostsTrend = async (range = '30d') => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/costs/trend', {
      headers: { Authorization: `Bearer ${token}` },
      params: { range }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching cost trend:', error);
    throw error.response?.data || new Error('Failed to fetch cost trend');
  }
};

export const triggerSync = async () => {
  try {
    const token = getAuthToken();
    const response = await api.post('/server/sync', {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error triggering data sync:', error);
    throw error.response?.data || new Error('Failed to trigger data sync');
  }
};

export const getInventory = async (params = {}) => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/inventory', {
      headers: { Authorization: `Bearer ${token}` },
      params
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching resource inventory:', error);
    throw error.response?.data || new Error('Failed to fetch resource inventory');
  }
};

export const getRelationships = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/relationships', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching resource relationships:', error);
    throw error.response?.data || new Error('Failed to fetch resource relationships');
  }
};

export const getCostsAttribution = async (groupBy = 'Project') => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/costs/attribution', {
      headers: { Authorization: `Bearer ${token}` },
      params: { groupBy }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching cost attribution:', error);
    throw error.response?.data || new Error('Failed to fetch cost attribution');
  }
};

export const getTopResources = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/costs/top-resources', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching top resources:', error);
    throw error.response?.data || new Error('Failed to fetch top resources');
  }
};

export const getTagCompliance = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/costs/tag-compliance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching tag compliance:', error);
    throw error.response?.data || new Error('Failed to fetch tag compliance');
  }
};

export const getRecommendations = async (params = {}) => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/recommendations', {
      headers: { Authorization: `Bearer ${token}` },
      params
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    throw error.response?.data || new Error('Failed to fetch recommendations');
  }
};

export const getRecommendationById = async (id) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/server/recommendations/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching recommendation details:', error);
    throw error.response?.data || new Error('Failed to fetch recommendation details');
  }
};

export const approveRecommendation = async (id, notes = '') => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/server/recommendations/${id}/approve`, { notes }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error approving recommendation:', error);
    throw error.response?.data || new Error('Failed to approve recommendation');
  }
};

export const rejectRecommendation = async (id, notes = '') => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/server/recommendations/${id}/reject`, { notes }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error rejecting recommendation:', error);
    throw error.response?.data || new Error('Failed to reject recommendation');
  }
};

// ── Phase 6: Anomaly Detection ────────────────────────────────────────────────

export const getAnomalies = async (params = {}) => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/anomalies', {
      headers: { Authorization: `Bearer ${token}` },
      params
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    throw error.response?.data || new Error('Failed to fetch anomalies');
  }
};

export const resolveAnomaly = async (id, reason) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/server/anomalies/${id}/resolve`, { reason }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error resolving anomaly:', error);
    throw error.response?.data || new Error('Failed to resolve anomaly');
  }
};

// ── Phase 6: Forecasting ──────────────────────────────────────────────────────

export const getForecasts = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/forecasts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    throw error.response?.data || new Error('Failed to fetch forecasts');
  }
};

// ── Phase 7: AI FinOps Chat ───────────────────────────────────────────────────

export const chatWithAgent = async (message, conversationHistory = []) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/server/chat', { message, conversationHistory }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error.response?.data || new Error('Failed to send message to AI agent');
  }
};

// ── Phase 8: Audit Logs ───────────────────────────────────────────────────────

export const getAuditLogs = async (params = {}) => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/audit-logs', {
      headers: { Authorization: `Bearer ${token}` },
      params
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error.response?.data || new Error('Failed to fetch audit logs');
  }
};

// ── Phase 1/2: Cost Lake Status ──────────────────────────────────────────────
export const getCostLakeStatus = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/server/status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching cost lake status:', error);
    throw error.response?.data || new Error('Failed to fetch cost lake status');
  }
};


