import api from './api';

// Get all columns
export const getColumns = async (data) => {
  try {
    const response = await api.get(`/columns/all?subdomain=${data.subdomain}`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Columns Fetch Error:', error);
    throw error.response ? error.response.data : new Error('Failed to fetch columns');
  }
};

// Create new column
export const createColumn = async (columnData) => {
  try {
    const response = await api.post('/columns', columnData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to create column');
  }
};

// Update column
export const updateColumn = async (id, columnData) => {
  try {
    const response = await api.put(`/columns/${id}`, columnData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update column');
  }
};

// Delete column
export const deleteColumn = async (id) => {
  try {
    const response = await api.delete(`/columns/${id}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to delete column');
  }
};