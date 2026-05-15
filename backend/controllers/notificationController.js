const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const UserNotification = require('../models/UserNotification');
const Worker = require('../models/Worker');

// @desc    Create a new notification
// @route   POST /api/notifications
// @access  Private/Admin
const createNotification = asyncHandler(async (req, res) => {
  const { messageData, subdomain, updatedBy, targetType, targetUsers } = req.body;

  if (!messageData || !subdomain) {
    res.status(400);
    throw new Error('Missing required fields: messageData or subdomain');
  }

  // Create the master Notification record (for history)
  const notification = await Notification.create({
    messageData,
    subdomain,
    updatedBy,
    lastUpdated: Date.now()
  });

  let usersToNotify = [];

  if (targetType === 'all') {
    const workers = await Worker.find({ subdomain });
    usersToNotify = workers.map(w => w._id);
  } else if (targetType === 'specific' && Array.isArray(targetUsers)) {
    usersToNotify = targetUsers;
  } else {
    // Default to all if not specified
    const workers = await Worker.find({ subdomain });
    usersToNotify = workers.map(w => w._id);
  }

  // Create UserNotification for each user
  const userNotifications = usersToNotify.map(userId => ({
    userId,
    userModel: 'Worker',
    subdomain,
    title: 'Admin Announcement',
    message: messageData,
    type: 'system_alert',
    isRead: false,
    link: '#'
  }));

  if (userNotifications.length > 0) {
    await UserNotification.insertMany(userNotifications);
  }

  // Broadcast via WebSockets
  const { getIO } = require('../utils/socket');
  const io = getIO();
  
  if (targetType === 'all') {
    io.to(subdomain).emit('notification', {
        title: 'Admin Announcement',
        message: messageData,
        type: 'system_alert'
    });
  } else {
    usersToNotify.forEach(userId => {
        io.to(userId.toString()).emit('notification', {
            title: 'Admin Announcement',
            message: messageData,
            type: 'system_alert'
        });
    });
  }

  res.status(201).json(notification);
});

// @desc    Get all notifications by subdomain
// @route   GET /api/notifications
// @access  Public
const readNotification = asyncHandler(async (req, res) => {
  const { subdomain } = req.params;

  if (!subdomain) {
    res.status(400);
    throw new Error('Subdomain is required');
  }

  const notifications = await Notification.find({ subdomain }).sort({ createdAt: -1 });
  return res.status(200).json({notifications});
});

// @desc    Update a notification by ID
// @route   PUT /api/notifications/:id
// @access  Private/Admin
const updateNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findById(id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  const updatedNotification = await Notification.findByIdAndUpdate(
    id,
    {
      ...req.body,
      lastUpdated: Date.now()
    },
    { new: true }
  );

  res.json(updatedNotification);
});

// @desc    Delete a notification by ID
// @route   DELETE /api/notifications/:id
// @access  Private/Admin
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findById(id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  await notification.deleteOne();

  res.json({ message: 'Notification deleted successfully' });
});

module.exports = {
  createNotification,
  readNotification,
  updateNotification,
  deleteNotification
};
