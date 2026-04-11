const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { giveBonus, removeBonus, resetSalary, getWorkerSalaryReport, getCompensationReport, addDeveloperProject, getDeveloperProjects, deleteDeveloperProject, getAllDeveloperProjectsSummary } = require('../controllers/salaryController');
const router = express.Router();

router.route('/give-bonus/:id').post(protect, giveBonus);
router.route('/remove-bonus/:id').post(protect, removeBonus);
router.route('/reset-salary').post(protect, resetSalary);
router.route('/report/:id').get(protect, getWorkerSalaryReport);
router.route('/compensation-report').post(protect, getCompensationReport); // Add this route

// Developer project routes
router.route('/developer-project').post(protect, addDeveloperProject);
router.route('/developer-projects/:developerId').get(protect, getDeveloperProjects);
router.route('/developer-project/:id').delete(protect, deleteDeveloperProject);
router.route('/developer-projects-summary').get(protect, getAllDeveloperProjectsSummary);

module.exports = router;