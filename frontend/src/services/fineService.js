import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const addFine = async (workerId, fineData) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/fines/add-fine/${workerId}`, fineData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to add fine');
  }
};

export const removeFine = async (workerId, fineId) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/fines/remove-fine/${workerId}/${fineId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to remove fine');
  }
};

// ADD DELETE FINE FUNCTION
export const deleteFine = async (workerId, fineId) => {
  try {
    const token = getAuthToken();
    const response = await api.delete(`/fines/delete-fine/${workerId}/${fineId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to delete fine');
  }
};

export const getWorkerFines = async (workerId) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/fines/worker-fines/${workerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get worker fines');
  }
};

export const getAllFines = async (params = {}) => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams(params);
    const response = await api.get(`/fines/all-fines?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get all fines');
  }
};

export const getMyFines = async (filters = {}) => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams(filters).toString();
    const response = await api.get(`/fines/my-fines?${queryParams}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get my fines');
  }
};

// Update an existing fine
export const updateFine = async (workerId, fineId, fineData) => {
  try {
    const token = getAuthToken();
    const response = await api.put(`/fines/update-fine/${workerId}/${fineId}`, fineData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update fine');
  }
};