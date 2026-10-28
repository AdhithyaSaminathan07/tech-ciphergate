const DailyTopic = require('../models/DailyTopic');
const Worker = require('../models/Worker');
const mongoose = require('mongoose');

// Helper to resolve subdomain consistently from req.user
const resolveSubdomain = (subdomain, user) => {
  if (user?.subdomain && user.subdomain !== 'main') {
    return user.subdomain;
  }
  if ((!subdomain || subdomain === 'main') && user?.subdomain) {
    return user.subdomain;
  }
  return subdomain;
};

// @desc    Add a daily topic for a worker
// @route   POST /api/topics
// @access  Private/Worker
const addDailyTopic = async (req, res) => {
  try {
    let { workerId, date, topic, subdomain } = req.body;
    subdomain = resolveSubdomain(subdomain, req.user);

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

    // Validate that the date is within the global timezone window for "today" (UTC-12 to UTC+14)
    const serverNow = new Date();
    const minAllowed = new Date(serverNow.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const maxAllowed = new Date(serverNow.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    if (date < minAllowed || date > maxAllowed) {
      return res.status(400).json({
        message: 'You can only add a daily topic for today'
      });
    }

    // Check if worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker not found'
      });
    }

    // Check if worker is active
    const workerStatus = String(worker.status || 'Active').trim().toLowerCase();
    if (workerStatus === 'relieved' || workerStatus === 'deleted' || workerStatus === 'inactive' || workerStatus === 'resigned' || workerStatus === 'terminated' || Boolean(worker.relievedAt)) {
      return res.status(403).json({
        message: 'Relieved or inactive employees cannot submit daily topics.'
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
    let { startDate, endDate, subdomain } = req.query;
    subdomain = resolveSubdomain(subdomain, req.user);

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
    let { subdomain, limit = 30 } = req.query;
    subdomain = resolveSubdomain(subdomain, req.user);

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
    let { subdomain } = req.query;
    subdomain = resolveSubdomain(subdomain, req.user);

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
    let { startDate, endDate, subdomain } = req.query;
    subdomain = resolveSubdomain(subdomain, req.user);

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

    // Exclude relieved or inactive workers
    const statusStr = String(worker.status || 'Active').trim().toLowerCase();
    const isRelievedOrInactive = statusStr === 'relieved' || statusStr === 'deleted' || statusStr === 'inactive' || statusStr === 'resigned' || statusStr === 'terminated' || Boolean(worker.relievedAt);
    if (isRelievedOrInactive) {
      return res.status(403).json({
        message: 'Access denied: Cannot retrieve topics for inactive or relieved employee.'
      });
    }

    // Tenant check: tenant admin can only access workers in their own tenant
    if (req.user.subdomain && req.user.subdomain !== 'main') {
      if (worker.subdomain !== req.user.subdomain) {
        return res.status(403).json({
          message: 'Access denied: Worker belongs to a different tenant.'
        });
      }
    }

    const effectiveWorkerSubdomain = worker.subdomain || subdomain;

    // Fetch topics within date range
    const topics = await DailyTopic.find({
      workerId,
      subdomain: effectiveWorkerSubdomain,
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

// @desc    Get aggregated daily topics log for all workers (Admin only)
// @route   GET /api/daily-topics/admin/log
// @access  Private/Admin
const getDailyTopicsAdminLog = async (req, res) => {
  try {
    let { startDate, endDate, department, workerId, subdomain } = req.query;
    subdomain = resolveSubdomain(subdomain, req.user);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin privileges required.' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required.' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({ message: 'Dates must be in YYYY-MM-DD format.' });
    }

    // Build worker query with tenant isolation
    const workerQuery = {};
    if (subdomain && subdomain !== 'main') {
      workerQuery.subdomain = subdomain;
    }
    if (department && department !== 'all') {
      if (mongoose.Types.ObjectId.isValid(department)) {
        workerQuery.department = department;
      } else {
        try {
          const Department = require('../models/Department');
          const deptDoc = await Department.findOne({
            name: { $regex: new RegExp(`^${department}$`, 'i') },
            ...(subdomain && subdomain !== 'main' ? { subdomain } : {})
          }).select('_id').lean();
          if (deptDoc) {
            workerQuery.$or = [
              { department: deptDoc._id },
              { department: department }
            ];
          } else {
            workerQuery.department = department;
          }
        } catch (dErr) {
          workerQuery.department = department;
        }
      }
    }
    if (workerId && mongoose.Types.ObjectId.isValid(workerId)) {
      workerQuery._id = new mongoose.Types.ObjectId(workerId);
    }

    // Authoritative Active Developer Filter:
    // Only workers with active status ('Active' or 'active'), excluding Relieved, Deleted, Inactive, Resigned, Terminated
    // AND excluding any workers with relievedAt date set.
    workerQuery.status = { $in: ['Active', 'active'] };
    workerQuery.relievedAt = null;

    let queryObj = Worker.find(workerQuery)
      .select('name email department subdomain rfid username status relievedAt');
    if (typeof queryObj.populate === 'function') {
      queryObj = queryObj.populate('department', 'name');
    }
    if (typeof queryObj.sort === 'function') {
      queryObj = queryObj.sort({ name: 1 });
    }
    let rawWorkers = typeof queryObj.lean === 'function' ? await queryObj.lean() : await queryObj;

    // Additional in-memory guard to guarantee strict exclusion across all edge cases / lifecycle fields
    const workers = (rawWorkers || []).filter(w => {
      const s = String(w.status || (w.relievedAt ? 'Relieved' : 'Active')).trim().toLowerCase();
      const isExplicitlyActive = s === 'active';
      const isRelievedOrInactive = s === 'relieved' || s === 'deleted' || s === 'inactive' || s === 'resigned' || s === 'terminated';
      const hasRelievedAt = Boolean(w.relievedAt && !isNaN(new Date(w.relievedAt).getTime()));
      return isExplicitlyActive && !isRelievedOrInactive && !hasRelievedAt;
    });

    const workerIds = workers.map(w => w._id);

    // Build date array for range
    const dates = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    // Fetch all topics recorded in this window for these workers
    const topicQuery = {
      workerId: { $in: workerIds },
      date: { $gte: startDate, $lte: endDate }
    };
    if (subdomain && subdomain !== 'main') {
      topicQuery.subdomain = subdomain;
    }

    const topics = await DailyTopic.find(topicQuery).lean();

    // Index topics by `${workerId}_${date}`
    const topicMap = new Map();
    topics.forEach(t => {
      topicMap.set(`${t.workerId.toString()}_${t.date}`, t);
    });

    // 1. Worker-wise view
    const workerWise = workers.map(w => {
      const wId = w._id.toString();
      const dailyMap = {};
      let submittedCount = 0;
      const empIdBadge = w.rfid || w.username || `EMP-${wId.slice(-4).toUpperCase()}`;
      const deptName = (typeof w.department === 'object' && w.department?.name)
        ? w.department.name
        : (w.department ? String(w.department) : 'N/A');

      dates.forEach(d => {
        const item = topicMap.get(`${wId}_${d}`);
        if (item) {
          submittedCount++;
          dailyMap[d] = {
            _id: item._id,
            topic: item.topic,
            date: d,
            subdomain: item.subdomain || w.subdomain,
            status: 'submitted'
          };
        } else {
          dailyMap[d] = {
            _id: null,
            topic: null,
            date: d,
            subdomain: w.subdomain,
            status: 'missing'
          };
        }
      });

      return {
        worker: {
          _id: w._id,
          name: w.name,
          email: w.email,
          employeeId: empIdBadge,
          subdomain: w.subdomain,
          department: deptName
        },
        dates: dailyMap,
        submittedCount,
        missingCount: dates.length - submittedCount,
        submissionRate: dates.length > 0 ? Math.round((submittedCount / dates.length) * 100) : 0
      };
    });

    // 2. Date-wise view
    const dateWise = dates.map(d => {
      let dateSubmitted = 0;
      const workerSubmissions = workers.map(w => {
        const wId = w._id.toString();
        const item = topicMap.get(`${wId}_${d}`);
        const isSubmitted = !!item;
        if (isSubmitted) dateSubmitted++;
        const empIdBadge = w.rfid || w.username || `EMP-${wId.slice(-4).toUpperCase()}`;
        const deptName = (typeof w.department === 'object' && w.department?.name)
          ? w.department.name
          : (w.department ? String(w.department) : 'N/A');

        return {
          worker: {
            _id: w._id,
            name: w.name,
            email: w.email,
            employeeId: empIdBadge,
            subdomain: w.subdomain,
            department: deptName
          },
          status: isSubmitted ? 'submitted' : 'missing',
          topic: item ? item.topic : null,
          topicId: item ? item._id : null,
          subdomain: item ? item.subdomain : w.subdomain
        };
      });

      return {
        date: d,
        submittedCount: dateSubmitted,
        missingCount: workers.length - dateSubmitted,
        workers: workerSubmissions
      };
    });

    return res.status(200).json({
      startDate,
      endDate,
      totalWorkers: workers.length,
      totalDates: dates.length,
      dates,
      workerWise,
      dateWise
    });
  } catch (error) {
    console.error('Error fetching admin daily topics log:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching daily topics log.' });
  }
};

module.exports = {
  addDailyTopic,
  getWeeklyTopics,
  getWeeklyTopicsAdmin,
  getDailyTopicsAdminLog,
  getWorkerTopics,
  deleteDailyTopic
};