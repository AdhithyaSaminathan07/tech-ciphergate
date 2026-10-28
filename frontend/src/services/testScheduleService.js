// services/testScheduleService.js
import api from './api';

export const getSchedules = async (params = {}) => {
  const response = await api.get('/test/schedules', { params });
  return response.data;
};

export const getScheduleById = async (id) => {
  const response = await api.get(`/test/schedules/${id}`);
  return response.data;
};

export const createSchedule = async (scheduleData) => {
  const response = await api.post('/test/schedules', scheduleData);
  return response.data;
};

export const updateSchedule = async (id, updateData) => {
  const response = await api.put(`/test/schedules/${id}`, updateData);
  return response.data;
};

export const cancelSchedule = async (id) => {
  const response = await api.post(`/test/schedules/${id}/cancel`);
  return response.data;
};

export const pauseSchedule = async (id) => {
  const response = await api.post(`/test/schedules/${id}/pause`);
  return response.data;
};

export const resumeSchedule = async (id) => {
  const response = await api.post(`/test/schedules/${id}/resume`);
  return response.data;
};

export const triggerScheduleNow = async (id) => {
  const response = await api.post(`/test/schedules/${id}/generate-now`);
  return response.data;
};

export const retrySchedule = async (id) => {
  const response = await api.post(`/test/schedules/${id}/retry`);
  return response.data;
};

export const deleteSchedule = async (id) => {
  const response = await api.delete(`/test/schedules/${id}`);
  return response.data;
};

export const getWorkerScheduledTests = async (workerId) => {
  const response = await api.get(`/test/schedules/worker/${workerId}`);
  return response.data;
};
