const express = require('express');
const router = express.Router();
const {
    getDashboardData,
    getContributors,
    saveContributors,
    clearContributors,
    getEmployees,
    getLiveLeaderboard,
    getLiveRepositories,
    clearGitHubCache
} = require('../controllers/githubController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public or Protected routes? 
// User request said: "accessible only to Admin users, not Worker users"
// So strictly use 'protect' and 'adminOnly' middleware

router.get('/dashboard', protect, adminOnly, getDashboardData);
router.get('/contributors', protect, adminOnly, getContributors);
router.post('/contributors/save', protect, adminOnly, saveContributors);
router.delete('/contributors/clear', protect, adminOnly, clearContributors);
router.get('/employees', protect, adminOnly, getEmployees);
router.get('/live-leaderboard', protect, adminOnly, getLiveLeaderboard);
router.get('/live-repositories', protect, adminOnly, getLiveRepositories);
router.post('/clear-cache', protect, adminOnly, clearGitHubCache);

module.exports = router;
