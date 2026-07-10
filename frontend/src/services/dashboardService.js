import api from './api';

export const getAdminDashboardSummary = async (subdomain) => {
  try {
    const response = await api.get('/dashboard/admin', { params: { subdomain } });
    return response.data.data;
  } catch (error) {
    console.error('Error fetching admin dashboard summary:', error);
    throw error;
  }
};

export const getWorkerDashboardSummary = async (subdomain) => {
  try {
    const response = await api.get('/dashboard/worker', { params: { subdomain } });
    return response.data.data;
  } catch (error) {
    console.error('Error fetching worker dashboard summary:', error);
    throw error;
  }
};
