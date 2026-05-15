const express = require('express');
const { protect, adminOnly, adminOrWorker, workerOnly } = require('../middleware/authMiddleware');
const { giveBonus, removeBonus, resetSalary, getWorkerSalaryReport, getMySalaryReport, getCompensationReport, getBulkSalaryReport, getTopTeamsEarnings, addDeveloperProject, getDeveloperProjects, deleteDeveloperProject, getAllDeveloperProjectsSummary, createSalaryProject, getSalaryProjects, getSalaryProjectsForWorker, updateSalaryProject, deleteSalaryProject } = require('../controllers/salaryController');
const router = express.Router();

router.route('/give-bonus/:id').post(protect, adminOnly, giveBonus);
router.route('/remove-bonus/:id').post(protect, adminOnly, removeBonus);
router.route('/reset-salary').post(protect, adminOnly, resetSalary);
router.route('/report/:id').get(protect, adminOnly, getWorkerSalaryReport);
router.route('/my-report').get(protect, adminOrWorker, getMySalaryReport);
router.route('/bulk-report').get(protect, adminOnly, getBulkSalaryReport);
router.route('/top-teams-earnings').get(protect, getTopTeamsEarnings);
router.route('/compensation-report').post(protect, getCompensationReport); // Add this route

// Developer project routes
router.route('/developer-project').post(protect, addDeveloperProject);
router.route('/developer-projects/:developerId').get(protect, getDeveloperProjects);
router.route('/developer-project/:id').delete(protect, deleteDeveloperProject);
router.route('/developer-projects-summary').get(protect, getAllDeveloperProjectsSummary);

// ─── Salary Project (Hybrid System) Routes ───
router.route('/salary-projects').get(protect, getSalaryProjects);
router.route('/salary-projects').post(protect, adminOnly, createSalaryProject);
router.route('/salary-projects/:id').put(protect, adminOnly, updateSalaryProject);
router.route('/salary-projects/:id').delete(protect, adminOnly, deleteSalaryProject);
router.route('/salary-projects-for-worker/:workerId').get(protect, getSalaryProjectsForWorker);

module.exports = router;
