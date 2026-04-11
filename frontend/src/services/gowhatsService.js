// services/gowhatsService.js
import api from './api'; // Assuming you have an axios instance configured

export const getGowhatsConfig = async () => {
  const response = await api.get('/gowhats/config');
  return response.data;
};

export const saveGowhatsConfig = async (config) => {
  const response = await api.post('/gowhats/config', config);
  return response.data;
};