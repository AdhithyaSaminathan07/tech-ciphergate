import api from './api';
import { getAuthToken } from '../utils/authUtils';

// Get all holidays for a subdomain
export const readHolidays = async (subdomain) => {
  try {
    const response = await api.get(`/holidays/${subdomain}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch holidays", error);
    throw error.response?.data || new Error('Failed to fetch holidays');
  }
};

// Get holiday by ID
export const getHolidayById = async (subdomain, holidayId) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/${holidayId}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch holiday", error);
    throw error.response?.data || new Error('Failed to fetch holiday');
  }
};

// Create a new holiday
export const createHoliday = async (formData) => {
  try {
    const response = await api.post('/holidays', formData, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to create holiday", error);
    throw error.response?.data || new Error('Failed to create holiday');
  }
};

// Update an existing holiday
export const updateHoliday = async (holidayId, formData) => {
  try {
    const response = await api.put(`/holidays/${holidayId}`, formData, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to update holiday", error);
    throw error.response?.data || new Error('Failed to update holiday');
  }
};

// Delete a holiday
export const deleteHoliday = async (holidayId) => {
  try {
    const response = await api.delete(`/holidays/${holidayId}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to delete holiday", error);
    throw error.response?.data || new Error('Failed to delete holiday');
  }
};

// Get holidays by date range
export const getHolidaysByDateRange = async (subdomain, startDate, endDate) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/range`, {
      params: {
        startDate,
        endDate
      },
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch holidays by date range", error);
    throw error.response?.data || new Error('Failed to fetch holidays by date range');
  }
};

// Get upcoming holidays (next 30 days)
export const getUpcomingHolidays = async (subdomain) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/upcoming`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch upcoming holidays", error);
    throw error.response?.data || new Error('Failed to fetch upcoming holidays');
  }
};

// Get holidays for current year
export const getCurrentYearHolidays = async (subdomain) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/current-year`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch current year holidays", error);
    throw error.response?.data || new Error('Failed to fetch current year holidays');
  }
};

// Get holiday statistics
export const getHolidayStats = async (subdomain) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/stats`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch holiday statistics", error);
    throw error.response?.data || new Error('Failed to fetch holiday statistics');
  }
};

// Check if a specific date is a holiday
export const isHoliday = async (subdomain, date) => {
  try {
    const startDate = new Date(date);
    const endDate = new Date(date);
    
    const holidays = await getHolidaysByDateRange(subdomain, 
      startDate.toISOString().split('T')[0], 
      endDate.toISOString().split('T')[0]
    );
    
    return holidays.length > 0 ? holidays[0] : null;
  } catch (error) {
    console.error("Failed to check if date is holiday", error);
    throw error.response?.data || new Error('Failed to check holiday status');
  }
};

// Get holidays for a specific month
export const getHolidaysByMonth = async (subdomain, year, month) => {
  try {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    return await getHolidaysByDateRange(subdomain, startDate, endDate);
  } catch (error) {
    console.error("Failed to fetch holidays by month", error);
    throw error.response?.data || new Error('Failed to fetch holidays by month');
  }
};

// Get holidays for a specific worker
export const getHolidaysByWorker = async (subdomain, workerId) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/worker/${workerId}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch holidays for worker", error);
    throw error.response?.data || new Error('Failed to fetch holidays for worker');
  }
};

// Check if a specific date is a holiday for a worker
export const isHolidayForWorker = async (subdomain, workerId, date) => {
  try {
    const response = await api.get(`/holidays/${subdomain}/worker/${workerId}/date/${date}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to check if date is holiday for worker", error);
    throw error.response?.data || new Error('Failed to check holiday status for worker');
  }
};

// Get all holidays (not just by date range) - useful for productivity calculations
export const getAllHolidays = async (subdomain) => {
  try {
    const response = await api.get(`/holidays/${subdomain}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`
      }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch all holidays", error);
    throw error.response?.data || new Error('Failed to fetch all holidays');
  }
};