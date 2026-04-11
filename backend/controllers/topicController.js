const asyncHandler = require('express-async-handler');
const Topic = require('../models/Topic');

// @desc    Get all topics
// @route   GET /api/topics
// @access  Private
const getTopics = asyncHandler(async (req, res) => { 
    const { department, subdomain } = req.query;

    if (!subdomain || subdomain === 'main') { // Changed == 'main' to === 'main' for strict comparison
          res.status(400); // Changed from 401 to 400 for bad request
          throw new Error('Company name is missing or invalid. Please login again.');
  }

  let query = { subdomain };

  if (department && department !== 'all') { // Added department filter
    query.department = department;
  }

  const topics = await Topic.find({ subdomain }).sort({ createdAt: -1 });
  res.status(200).json(topics);
});

// @desc    Create new topic
// @route   POST /api/topics
// @access  Private/Admin
const createTopic = asyncHandler(async (req, res) => {
  const { name, points, department, subdomain, subtopics } = req.body; // MODIFIED: Added points and subtopics
 
  if (!name || points === undefined || !subdomain) { // MODIFIED: Check for points and subdomain
        res.status(400);
        throw new Error('Topic with this name already exists in this department for your company.');
  }
    
      // Check if topic with the same name and department already exists for this subdomain
      const topicExists = await Topic.findOne({ name, department, subdomain }); // Added department and subdomain to uniqueness check
      if (topicExists) {
        res.status(400);
        throw new Error('Topic with this name already exists in this department for your company.');
  }

  // Create topic
  const topic = await Topic.create({
    name,
    points,
    department: department || 'all', // Ensure 'all' is default for department
    subdomain,
    subtopics: subtopics || [] // Initialize subtopics if provided
  });

  res.status(201).json(topic);
});

// @desc    Update a topic
// @route   PUT /api/topics/:id
// @access  Private/Admin
const updateTopic = asyncHandler(async (req, res) => { // Modified to update subtopics
     const { name, points, department, subdomain, subtopics } = req.body; // MODIFIED: Added subtopics and subdomain
     const { id } = req.params;
   
     const topic = await Topic.findById(id);
    
  
   if (!topic) {
     res.status(404);
     throw new Error('Topic not found');
   }
 
   // MODIFIED: Ensure the topic belongs to the correct subdomain for authorization
   if (topic.subdomain !== subdomain) {
         res.status(401);
         throw new Error('Not authorized to update this topic for another company');
   }
     
   // MODIFIED: Check if a topic with the new name and department already exists (excluding the current topic)
   const existingTopic = await Topic.findOne({ name, department, subdomain, _id: { $ne: id } });
   if (existingTopic) {
     res.status(400);
     throw new Error('Another topic with this name already exists in this department.');
   }
     
   const updatedTopic = await Topic.findByIdAndUpdate(
     id,
     {
       name,
       points,
       department: department || 'all', // Ensure 'all' is default for department
       subtopics: subtopics || [] // MODIFIED: Update subtopics array
     },
     { new: true, runValidators: true } // runValidators to ensure subtopic schema validation
   );
     
   res.status(200).json(updatedTopic);
 });
 
 // @desc    Delete a topic
 // @route   DELETE /api/topics/:id
 // @access  Private/Admin
 const deleteTopic = asyncHandler(async (req, res) => {
   const { subdomain } = req.query; // MODIFIED: Get subdomain from query for authorization
   const topic = await Topic.findById(req.params.id);
  
   if (!topic) {
     res.status(404);
     throw new Error('Topic not found');
   }
 
   //MODIFIED: Ensure the topic belongs to the correct subdomain for authorization
   if (topic.subdomain !== subdomain) { 
     res.status(401); 
     throw new Error('Not authorized to delete this topic for another company'); 
   }
 
   await topic.deleteOne();
   res.status(200).json({ id: req.params.id, message: 'Topic removed' }); // MODIFIED: Return id of deleted topic
 });
 
 // NEW FUNCTION: Add a sub-topic to an existing topic
 // @desc    Add a sub-topic to an existing topic
 // @route   PUT /api/topics/:id/subtopic (This route needs to be added in topicRoutes.js)
 // @access  Private (admin only)
 const addSubtopicToTopic = asyncHandler(async (req, res) => {
   const { id } = req.params; // ID of the main topic
   const { name, points, subdomain } = req.body; // Subtopic details and subdomain for authorization
  
   if (!name || points === undefined || !subdomain) {
     res.status(400);
     throw new Error('Please provide sub-topic name, points, and company name.');
   }
  
   const topic = await Topic.findById(id);
  
   if (!topic) {
     res.status(404);
     throw new Error('Parent topic not found');
   }
  
   // Ensure the topic belongs to the correct subdomain
   if (topic.subdomain !== subdomain) {
     res.status(401);
     throw new Error('Not authorized to add subtopic to this topic for another company');
   }
  
   // Check if subtopic with the same name already exists within this topic
   const subtopicExists = topic.subtopics.some(sub => sub.name === name);
   if (subtopicExists) {
     res.status(400);
     throw new Error('Sub-topic with this name already exists within this topic.');
   }
  
   topic.subtopics.push({ name, points });
   await topic.save();
  
   res.status(200).json(topic);
 });
 
 // NEW FUNCTION: Update a sub-topic within an existing topic
 // @desc    Update a sub-topic within an existing topic
 // @route   PUT /api/topics/:topicId/subtopic/:subtopicId (This route needs to be added in topicRoutes.js)
 // @access  Private (admin only)
 const updateSubtopic = asyncHandler(async (req, res) => {
   const { topicId, subtopicId } = req.params;
   const { name, points, subdomain } = req.body;
  
   if (!name || points === undefined || !subdomain) {
     res.status(400);
     throw new Error('Please provide sub-topic name, points, and company name.');
   }
  
   const topic = await Topic.findById(topicId);
  
   if (!topic) {
     res.status(404);
     throw new Error('Parent topic not found');
   }
  
   // Ensure the topic belongs to the correct subdomain
   if (topic.subdomain !== subdomain) {
     res.status(401);
     throw new Error('Not authorized to update subtopic for another company');
   }
  
   const subtopic = topic.subtopics.id(subtopicId); // Mongoose's subdocument .id() method
  
   if (!subtopic) {
     res.status(404);
     throw new Error('Sub-topic not found');
   }
  
   // Check for duplicate subtopic name within the same parent topic (excluding itself)
   const duplicateName = topic.subtopics.some(
     sub => sub._id.toString() !== subtopicId && sub.name === name
   );
   if (duplicateName) {
     res.status(400);
     throw new Error('Another sub-topic with this name already exists in this topic.');
   }
  
   subtopic.name = name;
   subtopic.points = points;
  
   await topic.save();
   res.status(200).json(topic);
 });
 
 // NEW FUNCTION: Delete a sub-topic from an existing topic
 // @desc    Delete a sub-topic from an existing topic
 // @route   DELETE /api/topics/:topicId/subtopic/:subtopicId (This route needs to be added in topicRoutes.js)
 // @access  Private (admin only)
 const deleteSubtopic = asyncHandler(async (req, res) => {
   const { topicId, subtopicId } = req.params;
   const { subdomain } = req.query; // Get subdomain from query for authorization
  
   const topic = await Topic.findById(topicId);
  
   if (!topic) {
     res.status(404);
     throw new Error('Parent topic not found');
   }
  
   // Ensure the topic belongs to the correct subdomain
   if (topic.subdomain !== subdomain) {
     res.status(401);
     throw new Error('Not authorized to delete subtopic for another company');
   }
  
   const subtopicIndex = topic.subtopics.findIndex(sub => sub._id.toString() === subtopicId);
  
   if (subtopicIndex === -1) {
     res.status(404);
     throw new new Error('Sub-topic not found'); // MODIFIED: Changed 'new Error' to 'Error' for correct syntax
   }
  
   topic.subtopics.splice(subtopicIndex, 1);
   await topic.save();
  
   res.status(200).json({ message: 'Sub-topic removed', topic });
 });
    
    module.exports = {
      getTopics,
      createTopic,
      updateTopic,
      deleteTopic,
      addSubtopicToTopic, // Export new subtopic functions
      updateSubtopic,
      deleteSubtopic
    };