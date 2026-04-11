import api from './api';

// Get all topics
export const getTopics = async (data) => {
  try {
    const response = await api.get(`/topics/all?subdomain=${data.subdomain}`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Topics Fetch Error:', error);
    throw error.response ? error.response.data : new Error('Failed to fetch topics')
  }
};

// Create new topic
export const createTopic = async (topicData) => {
  try {
    const response = await api.post('/topics', topicData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to create topic');
  }
};

// Update topic
export const updateTopic = async (id, topicData, subdomain) => { 
  try {
    const response = await api.put(`/topics/${id}`, { ...topicData, subdomain });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update topic');
  }
};

// Delete topic
export const deleteTopic = async (id, subdomain) => {
  try {
    const response = await api.delete(`/topics/${id}?subdomain=${subdomain}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to delete topic');
  }
};

export const addSubtopicToTopic = async (topicId, subtopicData, subdomain) => {
    try {
      const response = await api.put(`/topics/${topicId}/subtopic`, { 
              ...subtopicData, 
              subdomain 
            });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : new Error('Failed to add sub-topic');
    }
  };
  
  // New function: Update a sub-topic
  export const updateSubtopic = async (topicId, subtopicId, subtopicData, subdomain) => {
    try {
      const response = await api.put(`/topics/${topicId}/subtopic/${subtopicId}`, { ...subtopicData, subdomain });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : new Error('Failed to update sub-topic');
    }
  };
  
 // NEW FUNCTION: Delete a sub-topic from an existing topic
// MODIFIED: This function deletes a specific subtopic.
export const deleteSubtopic = async (topicId, subtopicId, subdomain) => {
    try {
      const response = await api.delete(`/topics/${topicId}/subtopic/${subtopicId}?subdomain=${subdomain}`);
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : new Error('Failed to delete sub-topic');
    }
  };
