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

export const getMySalaryReport = async () => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/my-report`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get your salary report');
  }
};

export const getBulkSalaryReport = async (subdomain, fromDate, toDate) => {
  try {
    const token = getAuthToken();
    const response = await api.get('/salary/bulk-report', {
      params: { subdomain, fromDate, toDate },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get bulk salary report');
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

// ─── Hybrid Salary Project (SalaryProject) ───

export const getSalaryProjects = async (subdomain, month, year) => {
  try {
    const token = getAuthToken();
    const response = await api.get('/salary/salary-projects', {
      params: { subdomain, month, year },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get salary projects');
  }
};

export const createSalaryProject = async (projectData) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/salary/salary-projects', projectData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to create salary project');
  }
};

export const updateSalaryProject = async (projectId, projectData) => {
  try {
    const token = getAuthToken();
    const response = await api.put(`/salary/salary-projects/${projectId}`, projectData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update salary project');
  }
};

export const deleteSalaryProjectById = async (projectId) => {
  try {
    const token = getAuthToken();
    const response = await api.delete(`/salary/salary-projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to delete salary project');
  }
};

export const getSalaryProjectsForWorker = async (workerId, subdomain, fromDate, toDate) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/salary-projects-for-worker/${workerId}`, {
      params: { subdomain, fromDate, toDate },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get salary projects for worker');
  }
};

// ─── Project Payment Ledger (Dynamic Recalculation) ───

export const recordProjectPayment = async (data) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/salary/record-project-payment', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to record project payment');
  }
};

export const recordAllProjectPayments = async (data) => {
  try {
    const token = getAuthToken();
    const response = await api.post('/salary/record-all-project-payments', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to record project payments');
  }
};

export const getProjectAdjustmentLedger = async (workerId, subdomain) => {
  try {
    const token = getAuthToken();
    const response = await api.get(`/salary/project-adjustment-ledger/${workerId}`, {
      params: { subdomain },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to get project adjustment ledger');
  }
};


// ─── PAYROLL ADJUSTMENTS (ENTERPRISE MODULE) ───
export const getPayrollRecord = async (workerId, month, year, subdomain) => {
  const response = await api.get(`/salary/payroll-records/${workerId}?month=${month}&year=${year}&subdomain=${subdomain}`);
  return response.data;
};

export const addPayrollAdjustment = async (workerId, data) => {
  const response = await api.post(`/salary/payroll-records/${workerId}/adjustments`, data);
  return response.data;
};

export const updatePayrollAdjustment = async (workerId, adjustmentId, data) => {
  const response = await api.put(`/salary/payroll-records/${workerId}/adjustments/${adjustmentId}`, data);
  return response.data;
};

export const deletePayrollAdjustment = async (workerId, adjustmentId, month, year, subdomain) => {
  const response = await api.delete(`/salary/payroll-records/${workerId}/adjustments/${adjustmentId}?month=${month}&year=${year}&subdomain=${subdomain}`);
  return response.data;
};

export const restorePayrollAdjustment = async (workerId, adjustmentId, month, year, subdomain) => {
  const response = await api.post(`/salary/payroll-records/${workerId}/adjustments/${adjustmentId}/restore`, { month, year, subdomain });
  return response.data;
};

export const updatePayrollStatus = async (workerId, data) => {
  const response = await api.put(`/salary/payroll-records/${workerId}/status`, data);
  return response.data;
};
