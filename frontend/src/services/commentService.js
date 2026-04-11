import api from './api';

// Get all comments (admin)
export const getAllComments = async (commentData) => {
  try {
    if (!commentData.subdomain || commentData.subdomain == 'main') {
      throw new Error ('Subdomain is missing, check the URL');
    }

    const response = await api.get(`/comments/${commentData.subdomain}`);
    console.log('Comments response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    throw error.response ? error.response.data : new Error('Failed to fetch comments');
  }
};

// Get my comments (worker)
export const getMyComments = async () => {
  try {
    const response = await api.get('/comments/me');
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch comments');
  }
};

// Get worker comments (admin)
export const getWorkerComments = async (workerId) => {
  try {
    const response = await api.get(`/comments/worker/${workerId}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch comments');
  }
};

// Create comment
export const createComment = async (commentData) => {
  try {
    const response = await api.post('/comments', commentData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to create comment');
  }
};

// Add reply to comment
export const addReply = async (commentId, replyData) => {
  try {
    const response = await api.post(`/comments/${commentId}/replies`, replyData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to add reply');
  }
};

// Mark comment as read
export const markCommentAsRead = async (commentId) => {
  try {
    const response = await api.put(`/comments/${commentId}/read`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to mark comment as read');
  }
};

export const getUnreadAdminReplies = async () => {
  try {
    const response = await api.get('/comments/unread-admin-replies');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch unread admin replies:', error);
    return [];
  }
};

export const markAdminRepliesAsRead = async () => {
  try {
    await api.put('/comments/mark-admin-replies-read');
  } catch (error) {
    console.error('Failed to mark admin replies as read:', error);
  }
};