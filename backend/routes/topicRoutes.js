const express = require('express');
const router = express.Router();
const { 
  getTopics, 
  createTopic, 
  updateTopic,
  deleteTopic,
  addSubtopicToTopic, // Added for subtopics
  updateSubtopic,    // Added for subtopics
  deleteSubtopic
} = require('../controllers/topicController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.route('/').post(protect, adminOnly, createTopic);
router.route('/all').get(protect, getTopics);

router.route('/:id')
  .put(protect, adminOnly, updateTopic)
  .delete(protect, adminOnly, deleteTopic);

router.route('/:id/subtopic').put(protect, adminOnly, addSubtopicToTopic); // Add a subtopic to a main topic
router.route('/:topicId/subtopic/:subtopicId') // Use topicId and subtopicId for specific operations
  .put(protect, adminOnly, updateSubtopic)    // Update a specific subtopic
  .delete(protect, adminOnly, deleteSubtopic); // Delete a specific subtopic

module.exports = router;