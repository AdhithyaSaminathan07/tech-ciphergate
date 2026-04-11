import api from './api';

// Add a daily topic for a worker
export const addDailyTopic = async ({ workerId, date, topic, subdomain }) => {
  try {
    console.log('Making API call to /daily-topics with:', {
      workerId,
      date,
      topic,
      subdomain
    });
    
    const response = await api.post('/daily-topics', {
      workerId,
      date,
      topic,
      subdomain
    });
    
    console.log('API response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error adding daily topic:', error);
    console.error('Error response:', error.response);
    
    // Enhanced error logging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    } else if (error.request) {
      console.error('Request made but no response:', error.request);
    } else {
      console.error('Error setting up request:', error.message);
    }
    
    throw error;
  }
};

// Get weekly topics for a worker (used by admin for question generation)
export const getWeeklyTopics = async ({ workerId, startDate, endDate, subdomain }) => {
  try {
    const response = await api.get(`/daily-topics/weekly/${workerId}`, {
      params: {
        startDate,
        endDate,
        subdomain
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching weekly topics:', error);
    throw error;
  }
};

// Get weekly topics for any worker (admin-only for question generation)
export const getWeeklyTopicsAdmin = async ({ workerId, startDate, endDate, subdomain }) => {
  try {
    const response = await api.get(`/daily-topics/admin/weekly/${workerId}`, {
      params: {
        startDate,
        endDate,
        subdomain
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching weekly topics (admin):', error);
    throw error;
  }
};

// Get all topics for a worker (for worker's own viewing/editing)
export const getWorkerTopics = async ({ workerId, subdomain, limit = 30 }) => {
  try {
    const response = await api.get(`/daily-topics/worker/${workerId}`, {
      params: {
        subdomain,
        limit
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching worker topics:', error);
    throw error;
  }
};

// Delete a daily topic
export const deleteDailyTopic = async ({ topicId, subdomain }) => {
  try {
    const response = await api.delete(`/daily-topics/${topicId}`, {
      params: {
        subdomain
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting daily topic:', error);
    throw error;
  }
};

// Utility function to get current week's date range (Monday to Friday)
export const getCurrentWeekRange = () => {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calculate Monday of current week
  const monday = new Date(today);
  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1; // If Sunday, go back 6 days
  monday.setDate(today.getDate() - daysFromMonday);
  
  // Calculate Friday of current week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  return {
    startDate: monday.toISOString().split('T')[0], // YYYY-MM-DD format
    endDate: friday.toISOString().split('T')[0]
  };
};

// Utility function to get previous week's date range
export const getPreviousWeekRange = () => {
  const today = new Date();
  const currentDay = today.getDay();
  
  // Calculate Monday of previous week
  const monday = new Date(today);
  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
  monday.setDate(today.getDate() - daysFromMonday - 7); // Go back one more week
  
  // Calculate Friday of previous week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  return {
    startDate: monday.toISOString().split('T')[0],
    endDate: friday.toISOString().split('T')[0]
  };
};

// Utility function to get date range for a specific week
export const getWeekRange = (weekOffset = 0) => {
  const today = new Date();
  const currentDay = today.getDay();
  
  // Calculate Monday of the target week
  const monday = new Date(today);
  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
  monday.setDate(today.getDate() - daysFromMonday + (weekOffset * 7));
  
  // Calculate Friday of the target week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  return {
    startDate: monday.toISOString().split('T')[0],
    endDate: friday.toISOString().split('T')[0]
  };
};

// Utility function to format date for display
export const formatDateForDisplay = (dateString) => {
  const date = new Date(dateString);
  const options = { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric'
  };
  return date.toLocaleDateString('en-US', options);
};

// Utility function to get weekday name from date
export const getWeekdayName = (dateString) => {
  const date = new Date(dateString);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return weekdays[date.getDay()];
};

// Utility function to validate date format
export const isValidDate = (dateString) => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

// Utility function to check if date is in the future
export const isFutureDate = (dateString) => {
  const inputDate = new Date(dateString);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return inputDate > today;
};