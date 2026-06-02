import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const getDocuments = async (subdomainObj) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainObj === 'object' ? subdomainObj.subdomain : subdomainObj;
    
    const response = await api.get('/documents', {
      headers: { Authorization: `Bearer ${token}` },
      params: { subdomain }
    });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to get wiki documents:', error);
    throw error.response?.data || new Error('Failed to get wiki documents');
  }
};

export const getDocumentById = async (id, subdomainObj) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainObj === 'object' ? subdomainObj.subdomain : subdomainObj;
    
    const response = await api.get(`/documents/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { subdomain }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to get wiki document:', error);
    throw error.response?.data || new Error('Failed to get wiki document');
  }
};

export const createDocument = async (documentData) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/documents', documentData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to create wiki document:', error);
    throw error.response?.data || new Error('Failed to create wiki document');
  }
};

export const updateDocument = async (id, documentData) => {
  try {
    const token = getAuthToken();
    const response = await api.put(`/documents/${id}`, documentData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to update wiki document:', error);
    throw error.response?.data || new Error('Failed to update wiki document');
  }
};

export const deleteDocument = async (id, subdomainObj) => {
  try {
    const token = getAuthToken();
    const subdomain = typeof subdomainObj === 'object' ? subdomainObj.subdomain : subdomainObj;
    
    const response = await api.delete(`/documents/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { subdomain }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to delete wiki document:', error);
    throw error.response?.data || new Error('Failed to delete wiki document');
  }
};
