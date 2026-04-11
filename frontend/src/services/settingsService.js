// frontend/src/services/settingsService.js
import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const getSettings = async ({ subdomain }) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/settings/${subdomain}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch settings');
  }
};