import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const analyzeTask = async (title, description, subdomainVal) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainVal === 'object' ? subdomainVal.subdomain : subdomainVal;
    
    const response = await api.post('/ai/analyze-task', { title, description, subdomain }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Task analysis error:', error);
    throw error.response?.data || new Error('Task analysis failed');
  }
};

export const searchSecondBrain = async (q, subdomainVal, ask = false) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainVal === 'object' ? subdomainVal.subdomain : subdomainVal;
    
    const response = await api.get('/ai/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, subdomain, ask }
    });
    return response.data;
  } catch (error) {
    console.error('Second brain search error:', error);
    throw error.response?.data || new Error('Second brain search failed');
  }
};

export const getBrainStats = async (subdomainVal) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainVal === 'object' ? subdomainVal.subdomain : subdomainVal;
    
    const response = await api.get('/ai/stats', {
      headers: { Authorization: `Bearer ${token}` },
      params: { subdomain }
    });
    return response.data;
  } catch (error) {
    console.error('Get brain stats error:', error);
    throw error.response?.data || new Error('Failed to get brain stats');
  }
};

export const reindexData = async (subdomainVal) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainVal === 'object' ? subdomainVal.subdomain : subdomainVal;
    
    const response = await api.post('/ai/reindex', { subdomain }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Reindex error:', error);
    throw error.response?.data || new Error('Reindexing failed');
  }
};
