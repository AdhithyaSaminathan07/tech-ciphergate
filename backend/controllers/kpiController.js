const asyncHandler = require('express-async-handler');
const {
  computeWorkerKpi,
  computeDepartmentKpi,
  computeTenantKpiSummary
} = require('../services/kpiComputationService');

/**
 * @desc    Get tenant-level KPI summary across all departments and workers
 * @route   GET /api/kpi/summary
 * @access  Private/Admin
 */
const getTenantKpiSummary = asyncHandler(async (req, res) => {
  const subdomain = req.query.subdomain || (req.user && req.user.subdomain);
  if (!subdomain) {
    res.status(400);
    throw new Error('Tenant subdomain is required');
  }

  const { startDate, endDate, department, team } = req.query;
  const options = {
    startDate,
    endDate,
    department: department || team
  };

  const summary = await computeTenantKpiSummary(subdomain, options);
  res.json({
    success: true,
    data: summary
  });
});

/**
 * @desc    Get detailed KPI breakdown for a specific worker
 * @route   GET /api/kpi/worker/:id
 * @access  Private (Worker themselves or Admin)
 */
const getWorkerKpi = asyncHandler(async (req, res) => {
  const subdomain = req.query.subdomain || (req.user && req.user.subdomain);
  const workerId = req.params.id;

  if (!workerId) {
    res.status(400);
    throw new Error('Worker ID is required');
  }

  // Non-admins can only view their own KPI
  if (req.user && req.user.role !== 'admin' && req.user.role !== 'owner' && req.user.role !== 'manager') {
    if (String(req.user._id) !== String(workerId)) {
      res.status(403);
      throw new Error('Not authorized to view another employee\'s KPI metrics');
    }
  }

  const { startDate, endDate } = req.query;
  const options = { startDate, endDate };

  const workerKpi = await computeWorkerKpi(workerId, subdomain, options);
  res.json({
    success: true,
    data: workerKpi
  });
});

/**
 * @desc    Get department-level KPI metrics rollup
 * @route   GET /api/kpi/department/:name
 * @access  Private/Admin
 */
const getDepartmentKpi = asyncHandler(async (req, res) => {
  const subdomain = req.query.subdomain || (req.user && req.user.subdomain);
  const deptName = req.params.name;

  if (!deptName) {
    res.status(400);
    throw new Error('Department name is required');
  }

  const { startDate, endDate } = req.query;
  const options = { startDate, endDate };

  const deptKpi = await computeDepartmentKpi(deptName, subdomain, options);
  res.json({
    success: true,
    data: deptKpi
  });
});

module.exports = {
  getTenantKpiSummary,
  getWorkerKpi,
  getDepartmentKpi
};
