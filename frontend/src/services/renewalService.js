import api from './api';

const getRenewals = async (filters) => {
  try {
    const params = new URLSearchParams(filters).toString();
    const response = await api.get(`/renewals?${params}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

const getRenewalById = async (id) => {
  try {
    const response = await api.get(`/renewals/${id}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

const createRenewal = async (data) => {
  try {
    const response = await api.post('/renewals', data);
    return response.data;
  } catch (error) {
    throw error;
  }
};

const updateRenewal = async (id, data) => {
  try {
    const response = await api.put(`/renewals/${id}`, data);
    return response.data;
  } catch (error) {
    throw error;
  }
};

const deleteRenewal = async (id) => {
  try {
    const response = await api.delete(`/renewals/${id}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

const sendWhatsAppManual = async (id, type) => {
  try {
    const response = await api.post(`/renewals/${id}/send-wa`, { type });
    return response.data;
  } catch (error) {
    throw error;
  }
};

const markAsRenewed = async (id, type, newExpiryDate) => {
  try {
    const response = await api.put(`/renewals/${id}/mark-renewed`, { type, newExpiryDate });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export default {
  getRenewals,
  getRenewalById,
  createRenewal,
  updateRenewal,
  deleteRenewal,
  sendWhatsAppManual,
  markAsRenewed
};
