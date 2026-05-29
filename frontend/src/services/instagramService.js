// frontend/src/services/instagramService.js
import api from './api';

// Fetch the active Instagram account (available for both Admin & Employee)
export const getActiveInstagramAccount = async () => {
  const response = await api.get('/instaxbot/active-account');
  return response.data;
};

// Fetch all connected Instagram accounts (Admin only)
export const getInstagramAccounts = async () => {
  const response = await api.get('/instaxbot/accounts');
  return response.data;
};

// Connect a new Instagram account (Admin only)
export const connectInstagramAccount = async (accountData) => {
  const response = await api.post('/instaxbot/accounts', accountData);
  return response.data;
};

// Set an Instagram account as the active connection (Admin only)
export const activateInstagramAccount = async (id) => {
  const response = await api.put(`/instaxbot/accounts/${id}/activate`);
  return response.data;
};

// Disconnect/Remove an Instagram account (Admin only)
export const deleteInstagramAccount = async (id) => {
  const response = await api.delete(`/instaxbot/accounts/${id}`);
  return response.data;
};
