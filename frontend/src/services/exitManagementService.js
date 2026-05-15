import api from './api';

export const processRelieve = async (relieveData) => {
  try {
    const response = await api.post('/exit-management/relieve', relieveData);
    return response.data;
  } catch (error) {
    console.error('Relieve process error:', error.response?.data || error);
    throw error.response?.data || new Error('Failed to process relieve');
  }
};

export const getExitHistory = async (params) => {
  try {
    const response = await api.get('/exit-management/history', { params });
    return response.data || [];
  } catch (error) {
    console.error('Exit history fetch error:', error);
    return [];
  }
};
