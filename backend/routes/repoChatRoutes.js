const express = require('express');
const router = express.Router();
const { repoChat, getRepoList } = require('../controllers/repoChatController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Chat with AI about repositories
router.post('/chat', protect, adminOnly, repoChat);

// Get list of repos for autocomplete/suggestions
router.get('/repos', protect, adminOnly, getRepoList);

module.exports = router;
