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

export const logAiDecision = async (payload) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/ai/audit-log', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Log AI Decision error:', error);
    throw error.response?.data || new Error('Failed to log AI decision');
  }
};

export const getAiAuditLogs = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/ai/audit-logs', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Get AI Audit Logs error:', error);
    throw error.response?.data || new Error('Failed to get AI audit logs');
  }
};

// ─── Personal Brain Services ──────────────────────────────────────────────────

/**
 * Upload files from the manager's Second Brain folder.
 * Supports .txt, .md, .pdf, .json files up to 20MB each.
 * Duplicate filenames are automatically replaced (upserted).
 */
export const uploadPersonalBrainFiles = async (files, subdomainVal) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainVal === 'object' ? subdomainVal.subdomain : subdomainVal;

    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));
    formData.append('subdomain', subdomain);

    const response = await api.post('/ai/personal-brain/upload', formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Personal Brain upload error:', error);
    throw error.response?.data || new Error('File upload failed');
  }
};

/**
 * Get list of all personal brain files indexed for this subdomain.
 */
export const getPersonalBrainFiles = async (subdomainVal) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainVal === 'object' ? subdomainVal.subdomain : subdomainVal;

    const response = await api.get('/ai/personal-brain', {
      headers: { Authorization: `Bearer ${token}` },
      params: { subdomain }
    });
    return response.data;
  } catch (error) {
    console.error('Get Personal Brain Files error:', error);
    throw error.response?.data || new Error('Failed to get brain files');
  }
};

/**
 * Delete a personal brain file by ID. Removes from both PersonalNote and SecondBrainItem index.
 */
export const deletePersonalBrainFile = async (id) => {
  try {
    const token = getAuthToken();
    const response = await api.delete(`/ai/personal-brain/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Delete Personal Brain File error:', error);
    throw error.response?.data || new Error('Failed to delete brain file');
  }
};

export const getPersonalBrainFolderManifest = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get('/ai/personal-brain/folder-manifest', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Failed to load folder manifest');
  }
};

export const syncPersonalBrainFolderBatch = async (entries, syncId) => {
  try {
    const token = getAuthToken();
    const formData = new FormData();
    entries.forEach(entry => formData.append('files', entry.file, entry.file.name));
    formData.append('metadata', JSON.stringify(entries.map(entry => ({
      relativePath: entry.relativePath,
      lastModified: entry.file.lastModified
    }))));
    formData.append('syncId', syncId);
    const response = await api.post('/ai/personal-brain/folder-sync', formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Folder batch sync failed');
  }
};

export const finalizePersonalBrainFolderSync = async (relativePaths) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/ai/personal-brain/folder-sync/finalize', {
      relativePaths,
      confirmEmpty: relativePaths.length === 0
    }, { headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Folder sync could not be finalized');
  }
};
