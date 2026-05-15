// attendance _31/server/controllers/taskController.js
const asyncHandler = require('express-async-handler');
const Task = require('../models/Task');
const Worker = require('../models/Worker');
const Topic = require('../models/Topic'); // Still needed for context or if you have other topic-related lookups elsewhere

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
const createTask = asyncHandler(async (req, res) => {
  // Destructure the new 'selectedSubtopics' and 'checklist' from the request body
  const { data, topics, subtopics, subdomain, checklist } = req.body; // 'subtopics' here is the selectedSubtopics object from frontend
  const workerId = req.user._id;

  // MODIFIED VALIDATION: Allow submission if either 'data' (columns) has entries
  // OR 'topics' (main topics) OR 'subtopics' (nested subtopics/actions) have selections.
  const hasColumnData = data && Object.keys(data).length > 0;
  const hasTopicData = (topics && topics.length > 0) || (subtopics && Object.keys(subtopics).length > 0);

  if (!hasColumnData && !hasTopicData) {
    res.status(400);
    throw new Error('Please provide task data or select at least one topic/subtopic.');
  }

  // Check if worker is relieved
  const worker_val = await Worker.findById(workerId);
  if (worker_val && worker_val.status === 'Relieved') {
    res.status(403);
    throw new Error('Relieved employees cannot submit tasks.');
  }

  // Calculate task points
  let taskPoints = 0;
  // Sum values from the data object (columns)
  if (hasColumnData) {
    Object.values(data).forEach(value => {
      taskPoints += parseInt(value) || 0;
    });
  }

  let selectedTopicIds = [];
  const workerTopicPointsUpdates = {};

  // Process main topics
  // Ensure that if a subtopic is selected, its parent topic is also counted in `topics` array for Task model
  if (topics && topics.length > 0) {
    const topicObjects = await Topic.find({ _id: { $in: topics }, subdomain });
    topicObjects.forEach(topic => {
      selectedTopicIds.push(topic._id);
      taskPoints += topic.points;
      workerTopicPointsUpdates[topic.name] = (workerTopicPointsUpdates[topic.name] || 0) + topic.points;
    });
  }

  // Process subtopics points and ensure their parent topics are selected
  if (subtopics && Object.keys(subtopics).length > 0) {
    for (const topicId in subtopics) {
      const subtopicIds = subtopics[topicId];
      if (subtopicIds && subtopicIds.length > 0) {
        const mainTopic = await Topic.findById(topicId);

        if (mainTopic) {
          // Ensure the main topic is also considered selected if its subtopics are
          if (!selectedTopicIds.includes(mainTopic._id)) {
            selectedTopicIds.push(mainTopic._id);
          }

          mainTopic.subtopics.forEach(sub => {
            if (subtopicIds.includes(sub._id.toString())) {
              taskPoints += sub.points;
              // Store points against a combined key like "MainTopicName - SubtopicName"
              const subtopicKey = `${mainTopic.name} - ${sub.name}`;
              workerTopicPointsUpdates[subtopicKey] = (workerTopicPointsUpdates[subtopicKey] || 0) + sub.points;
            }
          });
        }
      }
    }
  }

  // Create task
  const task = await Task.create({
    worker: workerId,
    data,
    subdomain,
    topics: selectedTopicIds, // Store IDs of main topics selected or implied by subtopics
    selectedSubtopics: subtopics, // NEW: Store the actual selected subtopics object
    points: taskPoints,
    checklist: checklist || []
  });

  // Update worker total points and last submission
  const worker = await Worker.findById(workerId);
  worker.totalPoints = (worker.totalPoints || 0) + taskPoints;
  Object.entries(workerTopicPointsUpdates).forEach(([key, pointsToAdd]) => {
    worker.topicPoints[key] = (worker.topicPoints[key] || 0) + pointsToAdd;
  });
  worker.lastSubmission = {
    timestamp: Date.now(),
    details: data
  };
  await worker.save();

  res.status(201).json(task);
});

// @desc    Get all tasks for admin
// @route   POST /api/tasks/all
// @access  Private/Admin
const getTasks = asyncHandler(async (req, res) => {
  const { department, subdomain } = req.body;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Company name is missing or invalid. Please login again.');
  }

  const tasks = await Task.find({ subdomain })
    .populate({
      path: 'worker',
      populate: {
        path: 'department',
        select: 'name'
      },
      select: 'name department'
    })
    // MODIFIED POPULATION: Include _id along with name, points, subtopics
    .populate('topics', '_id name points subtopics')
    .sort({ createdAt: -1 });

  res.json(tasks);
});

// @desc    Get my tasks
// @route   GET /api/tasks/me
// @access  Private
const getMyTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({ worker: req.user._id })
    // MODIFIED POPULATION: Include _id along with name, points, subtopics
    .populate('topics', '_id name points subtopics')
    .sort({ createdAt: -1 });

  res.json(tasks);
});

// @desc    Get tasks by date range
// @route   GET /api/tasks/range
// @access  Private/Admin
const getTasksByDateRange = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Please provide start and end dates');
  }

  const tasks = await Task.find({
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  })
    .populate('worker', 'name department')
    // MODIFIED POPULATION: Include _id along with name, points, subtopics
    .populate('topics', '_id name points subtopics')
    .sort({ createdAt: -1 });

  res.json(tasks);
});

// Remaining functions (resetAllTasks, createCustomTask, getCustomTasks, getMyCustomTasks, reviewCustomTask)
// do not directly interact with the 'topics' or 'selectedItems' field, so they remain unchanged.
// If reviewCustomTask needs to update totalPoints based on a new taskPoints field that came from
// selected hierarchical items, its current logic for adding points will still work as 'task.points' is updated.

const resetAllTasks = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;

  if (!subdomain || subdomain == 'main') {
    res.status(400);
    throw new Error('Company name is missing, login again.');
  }

  // Delete all tasks for the given subdomain
  const deletedTasks = await Task.deleteMany({ subdomain });

  // Reset all worker points for the given subdomain
  const updatedWorkers = await Worker.updateMany(
    { subdomain },
    {
      $set: {
        totalPoints: 0,
        topicPoints: {}, // MODIFIED: Reset to empty object, as it holds mapped key-value pairs
        lastSubmission: {}
      }
    }
  );

  res.json({
    message: `All tasks for subdomain '${subdomain}' reset successfully`,
    deletedTasksCount: deletedTasks.deletedCount,
    updatedWorkersCount: updatedWorkers.modifiedCount
  });
});

const createCustomTask = asyncHandler(async (req, res) => {
  const { description, subdomain, checklist } = req.body;
  const workerId = req.user._id;

  console.log('Creating custom task with workerId:', workerId);

  // Check if worker exists
  const workerExists = await Worker.findById(workerId);
  if (!workerExists) {
    console.log('Worker not found:', workerId);
    res.status(400);
    throw new Error('Worker not found');
  }

  if (workerExists.status === 'Relieved') {
    res.status(403);
    throw new Error('Relieved employees cannot create custom tasks.');
  }

  const task = await Task.create({
    worker: workerId,
    description,
    subdomain,
    isCustom: true,
    status: 'pending',
    points: 0,
    checklist: checklist || []
  });

  // Populate the worker information before returning
  const populatedTask = await Task.findById(task._id).populate({
    path: 'worker',
    select: 'name department',
    populate: {
      path: 'department',
      select: 'name'
    }
  });

  res.status(201).json(populatedTask);
});


const getCustomTasks = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;
  const tasks = await Task.find({ isCustom: true, subdomain })
    .populate({
      path: 'worker',
      select: 'name department',
      populate: {
        path: 'department',
        select: 'name'
      }
    })
    .sort({ createdAt: -1 });

  // For debugging
  console.log('Populated tasks:', JSON.stringify(tasks.map(t => ({
    id: t._id,
    worker: t.worker ? { id: t.worker._id, name: t.worker.name } : null,
    description: t.description
  })), null, 2));

  res.json(tasks);
});

const getMyCustomTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({
    worker: req.user._id,
    isCustom: true
  }).sort({ createdAt: -1 });

  res.json(tasks);
});

const reviewCustomTask = asyncHandler(async (req, res) => {
  const { status, points } = req.body;
  const taskId = req.params.id;

  // Validate input
  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400);
    throw new Error('Please provide a valid status (approved or rejected)');
  }

  if (status === 'approved' && (!points || points < 0)) {
    res.status(400);
    throw new Error('Please provide valid points for approved task');
  }

  // Find task
  const task = await Task.findById(taskId);
  if (!task) {
    res.status(404);
    throw new Error('Task not found');
  }

  if (!task.isCustom) {
    res.status(400);
    throw new Error('This is not a custom task');
  }

  // Update task
  task.status = status;

  if (status === 'approved') {
    task.points = points;

    // Update worker's total points
    const worker = await Worker.findById(task.worker);
    worker.totalPoints = (worker.totalPoints || 0) + points;
    await worker.save();
  }

  await task.save();

  // Populate worker information before sending response
  const populatedTask = await Task.findById(task._id).populate({
    path: 'worker',
    select: 'name department',
    populate: {
      path: 'department',
      select: 'name'
    }
  });

  res.json(populatedTask);
});

module.exports = {
  createTask,
  getTasks,
  getMyTasks,
  getTasksByDateRange,
  resetAllTasks,
  createCustomTask,
  getCustomTasks,
  getMyCustomTasks,
  reviewCustomTask
};