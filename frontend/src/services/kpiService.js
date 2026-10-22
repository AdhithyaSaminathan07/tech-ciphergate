import api from './api';

/**
 * System 3 KPI Service
 * Provides client methods to fetch authoritative System 3 KPI summaries,
 * department rollups, and individual employee performance calculations.
 */

// Get tenant-wide or department-filtered KPI summary
export const getKpiSummary = async (params = {}) => {
  const { data } = await api.get('/kpi/summary', { params });
  return data;
};

// Get detailed KPI breakdown for a specific worker
export const getWorkerKpi = async (workerId, params = {}) => {
  const { data } = await api.get(`/kpi/worker/${workerId}`, { params });
  return data;
};

// Get department-level KPI rollup
export const getDepartmentKpi = async (departmentName, params = {}) => {
  const { data } = await api.get(`/kpi/department/${encodeURIComponent(departmentName)}`, { params });
  return data;
};

export default {
  getKpiSummary,
  getWorkerKpi,
  getDepartmentKpi
};
