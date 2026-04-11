import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const giveBonusAmount = async (salaryData) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/salary/give-bonus/${salaryData.id}`, {
      amount: salaryData.amount,
      fromDate: salaryData.fromDate,
      toDate: salaryData.toDate
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update leave status');
  }
};

export const removeBonusAmount = async (workerId) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/salary/remove-bonus/${workerId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to remove bonus');
  }
};

export const resetSalaryAmount = async (salaryData) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/salary/reset-salary`, {subdomain: salaryData.subdomain}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update leave status');
  }
};

export const getSalaryReport = async (workerId, fromDate, toDate) => { // ADD THIS
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/report/${workerId}`, {
      params: { fromDate, toDate },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get salary report');
  }
};

// Get compensation report for all workers
export const getCompensationReport = async (subdomain, filters = {}) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/salary/compensation-report`, 
      { subdomain }, 
      {
        params: filters,
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get compensation report');
  }
};

// Developer project functions
export const addDeveloperProject = async (projectData) => {
  try {
    const token = getAuthToken();
    const response = await api.post(`/salary/developer-project`, projectData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to add developer project');
  }
};

export const getDeveloperProjects = async (developerId, subdomain) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/developer-projects/${developerId}`, {
      params: { subdomain },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get developer projects');
  }
};

export const getDeveloperProjectsByMonth = async (developerId, subdomain, month, year) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/developer-projects/${developerId}`, {
      params: { subdomain, month, year },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get developer projects by month');
  }
};

export const deleteDeveloperProject = async (projectId) => {
  try {
    const token = getAuthToken();
    const response = await api.delete(`/salary/developer-project/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to delete developer project');
  }
};

export const getDeveloperProjectsSummary = async (subdomain, month, year) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/developer-projects-summary`, {
      params: { subdomain, month, year },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get developer projects summary');
  }
};