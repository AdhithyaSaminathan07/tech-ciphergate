const DailyTopic = require('../models/DailyTopic');
const Worker = require('../models/Worker');
const mongoose = require('mongoose');

// @desc    Add a daily topic for a worker
// @route   POST /api/topics
// @access  Private/Worker
const addDailyTopic = async (req, res) => {
  try {
    const { workerId, date, topic, subdomain } = req.body;

    // Validation
    if (!workerId || !date || !topic || !subdomain) {
      return res.status(400).json({
        message: 'Worker ID, date, topic, and subdomain are required'
      });
    }

    // Authorization check: Workers can only add topics for themselves
    if (req.user.role === 'worker' && req.user._id.toString() !== workerId) {
      return res.status(403).json({
        message: 'Access denied: You can only add topics for yourself'
      });
    }

    // Validate worker ID format
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({
        message: 'Invalid worker ID format'
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        message: 'Date must be in YYYY-MM-DD format'
      });
    }

    // Validate that the date is not in the future
    const inputDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Set to end of today
    
    if (inputDate > today) {
      return res.status(400).json({
        message: 'Cannot add topics for future dates'
      });
    }

    // Check if worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker not found'
      });
    }

    // Sanitize topic input
    const sanitizedTopic = topic.trim();
    if (sanitizedTopic.length === 0) {
      return res.status(400).json({
        message: 'Topic cannot be empty'
      });
    }

    // Check for duplicate entry (same worker, date, subdomain)
    const existingTopic = await DailyTopic.findOne({
      workerId,
      date,
      subdomain
    });

    if (existingTopic) {
      // Update existing topic
      existingTopic.topic = sanitizedTopic;
      await existingTopic.save();
      
      return res.status(200).json({
        message: 'Daily topic updated successfully',
        topic: existingTopic
      });
    } else {
      // Create new daily topic
      const dailyTopic = new DailyTopic({
        workerId,
        date,
        topic: sanitizedTopic,
        subdomain
      });

      await dailyTopic.save();
      
      return res.status(201).json({
        message: 'Daily topic added successfully',
        topic: dailyTopic
      });
    }

  } catch (error) {
    console.error('Error adding daily topic:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'A topic for this date already exists. Use PUT to update.'
      });
    }
    
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get weekly topics for a worker
// @route   GET /api/topics/weekly/:workerId
// @access  Private/Admin and Worker
const getWeeklyTopics = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { startDate, endDate, subdomain } = req.query;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({
        message: 'Invalid worker ID format'
      });
    }

    // Authorization check: Workers can only access their own topics, admins can access any
    if (req.user.role === 'worker' && req.user._id.toString() !== workerId) {
      return res.status(403).json({
        message: 'Access denied: Workers can only access their own topics. Admin privileges required to access other employees\' topics.'
      });
    }

    if (!startDate || !endDate || !subdomain) {
      return res.status(400).json({
        message: 'Start date, end date, and subdomain are required'
      });
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Check if worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker not found'
      });
    }

    // Fetch topics within date range
    const topics = await DailyTopic.find({
      workerId,
      subdomain,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });

    // Create a complete week structure with empty days
    const dateRange = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split('T')[0]);
    }

    // Map topics to dates
    const topicsMap = {};
    topics.forEach(topic => {
      topicsMap[topic.date] = topic;
    });

    // Build response with all dates
    const weeklyTopics = dateRange.map(date => ({
      date,
      topic: topicsMap[date] || null
    }));

    res.status(200).json({
      workerId,
      workerName: worker.name,
      startDate,
      endDate,
      topics: weeklyTopics,
      totalTopics: topics.length
    });

  } catch (error) {
    console.error('Error fetching weekly topics:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get all topics for a worker (for editing purposes)
// @route   GET /api/topics/worker/:workerId
// @access  Private/Worker
const getWorkerTopics = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { subdomain, limit = 30 } = req.query;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({
        message: 'Invalid worker ID format'
      });
    }

    // Authorization check: Workers can only access their own topics
    if (req.user.role === 'worker' && req.user._id.toString() !== workerId) {
      return res.status(403).json({
        message: 'Access denied: You can only access your own topics'
      });
    }

    if (!subdomain) {
      return res.status(400).json({
        message: 'Subdomain is required'
      });
    }

    // Check if worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker not found'
      });
    }

    // Fetch recent topics for the worker
    const topics = await DailyTopic.find({
      workerId,
      subdomain
    })
    .sort({ date: -1 })
    .limit(parseInt(limit));

    res.status(200).json({
      workerId,
      workerName: worker.name,
      topics,
      totalTopics: topics.length
    });

  } catch (error) {
    console.error('Error fetching worker topics:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Delete a daily topic
// @route   DELETE /api/topics/:topicId
// @access  Private/Worker
const deleteDailyTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { subdomain } = req.query;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({
        message: 'Invalid topic ID format'
      });
    }

    if (!subdomain) {
      return res.status(400).json({
        message: 'Subdomain is required'
      });
    }

    // Find the topic first to check ownership
    const topic = await DailyTopic.findOne({
      _id: topicId,
      subdomain
    });

    if (!topic) {
      return res.status(404).json({
        message: 'Topic not found'
      });
    }

    // Authorization check: Workers can only delete their own topics
    if (req.user.role === 'worker' && req.user._id.toString() !== topic.workerId.toString()) {
      return res.status(403).json({
        message: 'Access denied: You can only delete your own topics'
      });
    }

    // Delete the topic
    await DailyTopic.findByIdAndDelete(topicId);

    res.status(200).json({
      message: 'Topic deleted successfully',
      deletedTopicId: topicId
    });

  } catch (error) {
    console.error('Error deleting daily topic:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get weekly topics for a worker (admin-only version for question generation)
// @route   GET /api/topics/admin/weekly/:workerId
// @access  Private/Admin Only
const getWeeklyTopicsAdmin = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { startDate, endDate, subdomain } = req.query;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({
        message: 'Invalid worker ID format'
      });
    }

    // Admin-only access - no worker restriction check
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Access denied: Admin privileges required'
      });
    }

    if (!startDate || !endDate || !subdomain) {
      return res.status(400).json({
        message: 'Start date, end date, and subdomain are required'
      });
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Check if worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker not found'
      });
    }

    // Fetch topics within date range
    const topics = await DailyTopic.find({
      workerId,
      subdomain,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });

    // Create a complete week structure with empty days
    const dateRange = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split('T')[0]);
    }

    // Map topics to dates
    const topicsMap = {};
    topics.forEach(topic => {
      topicsMap[topic.date] = topic;
    });

    // Build response with all dates
    const weeklyTopics = dateRange.map(date => ({
      date,
      topic: topicsMap[date] || null
    }));

    res.status(200).json({
      workerId,
      workerName: worker.name,
      startDate,
      endDate,
      topics: weeklyTopics,
      totalTopics: topics.length
    });

  } catch (error) {
    console.error('Error fetching weekly topics (admin):', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  addDailyTopic,
  getWeeklyTopics,
  getWeeklyTopicsAdmin,
  getWorkerTopics,
  deleteDailyTopic
};