// controllers/learningTopicController.js
const LearningTopic = require('../models/LearningTopic');
const Worker = require('../models/Worker');
const mongoose = require('mongoose');

// @desc    Submit a daily learning topic
// @route   POST /api/test/topics
// @access  Private/Worker
const submitTopic = async (req, res) => {
    const { workerId, topic } = req.body;
    if (!workerId || !topic) {
        return res.status(400).json({ message: 'Worker ID and topic are required.' });
    }
    try {
        // Check if worker exists
        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({ message: 'Worker not found.' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const existingTopic = await LearningTopic.findOne({
            worker: workerId,
            createdAt: { $gte: today, $lt: tomorrow },
        });
        
        if (existingTopic) {
            return res.status(400).json({ message: 'You have already submitted a learning topic for today.' });
        }
        
        const newTopic = new LearningTopic({ worker: workerId, topic: topic });
        await newTopic.save();
        
        res.status(201).json({ message: 'Topic submitted successfully!' });
    } catch (error) {
        console.error("Error submitting topic:", error);
        res.status(500).json({ message: 'Server error while submitting topic.' });
    }
};

// @desc    Get unique topics for a specific worker within a date range
// @route   GET /api/test/topics/weekly/:workerId
// @access  Private/Admin
const getWeeklyTopicsForWorker = async (req, res) => {
    const { workerId } = req.params;
    const { startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
        return res.status(400).json({ message: 'Invalid employee ID.' });
    }
    try {
        const matchQuery = {
            worker: new mongoose.Types.ObjectId(workerId),
        };

        if (startDate && endDate) {
            matchQuery.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            };
        } else {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            matchQuery.createdAt = { $gte: sevenDaysAgo };
        }

        const topics = await LearningTopic.aggregate([
            { $match: matchQuery },
            { $group: { _id: '$topic' } },
            { $project: { _id: 0, topic: '$_id' } }
        ]);
        
        const topicList = topics.map(item => item.topic);
        res.status(200).json(topicList);
    } catch (error) {
        console.error("Error fetching weekly topics for worker:", error);
        res.status(500).json({ message: 'Server error while fetching weekly topics.' });
    }
};

// @desc    Check if a worker has submitted a topic for the current day
// @route   POST /api/test/topics/check
// @access  Private/Worker
const checkTopicForToday = async (req, res) => {
    const { workerId } = req.body;
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const existingTopic = await LearningTopic.findOne({
            worker: workerId,
            createdAt: { $gte: today, $lt: tomorrow },
        });
        
        if (existingTopic) {
            return res.status(200).json({ submitted: true });
        } else {
            return res.status(404).json({ submitted: false });
        }
    } catch (error) {
        console.error("Error checking topic for today:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all learning topics with filters
// @route   GET /api/test/topics
// @access  Private/Admin
const getAllTopics = async (req, res) => {
    const { workerId, startDate, endDate } = req.query;
    
    try {
        let matchQuery = {};
        
        if (workerId && mongoose.Types.ObjectId.isValid(workerId)) {
            matchQuery.worker = new mongoose.Types.ObjectId(workerId);
        }
        
        if (startDate && endDate) {
            matchQuery.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            };
        }
        
        const topics = await LearningTopic.find(matchQuery)
            .populate('worker', 'name email')
            .sort({ createdAt: -1 });
            
        res.status(200).json(topics);
    } catch (error) {
        console.error("Error fetching topics:", error);
        res.status(500).json({ message: 'Server error while fetching topics.' });
    }
};

// @desc    Assign topics to multiple workers
// @route   POST /api/test/topics/assign
// @access  Private/Admin
const assignTopicsToWorkers = async (req, res) => {
    const { workerIds, topics } = req.body;
    
    try {
        if (!workerIds || !Array.isArray(workerIds) || workerIds.length === 0) {
            return res.status(400).json({ message: 'Worker IDs are required.' });
        }
        
        if (!topics || !Array.isArray(topics) || topics.length === 0) {
            return res.status(400).json({ message: 'Topics are required.' });
        }
        
        const assignments = [];
        
        for (const workerId of workerIds) {
            // Check if worker exists
            const worker = await Worker.findById(workerId);
            if (!worker) {
                continue; // Skip invalid workers
            }
            
            for (const topic of topics) {
                // Check if topic already exists for this worker
                const existingTopic = await LearningTopic.findOne({
                    worker: workerId,
                    topic: topic
                });
                
                if (!existingTopic) {
                    assignments.push({
                        worker: workerId,
                        topic: topic,
                        isCommonTopic: true
                    });
                }
            }
        }
        
        if (assignments.length > 0) {
            await LearningTopic.insertMany(assignments);
        }
        
        res.status(201).json({
            message: `Assigned ${assignments.length} topics to workers`,
            assignmentsCount: assignments.length
        });
    } catch (error) {
        console.error("Error assigning topics:", error);
        res.status(500).json({ message: 'Server error while assigning topics.' });
    }
};

module.exports = {
    submitTopic,
    getWeeklyTopicsForWorker,
    checkTopicForToday,
    getAllTopics,
    assignTopicsToWorkers
};