// client/src/services/foodRequestService.js
import api from './api';

export const submitFoodRequest = async (foodRequestData) => {
  console.log('🔍 DEBUG: submitFoodRequest called with:', foodRequestData);
  
  if (!foodRequestData.subdomain || foodRequestData.subdomain == 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }

  if (!foodRequestData.mealType || !['breakfast', 'lunch', 'dinner'].includes(foodRequestData.mealType)) {
    throw new Error('Valid meal type is required (breakfast, lunch, or dinner).');
  }

  try {
    const response = await api.post('/food-requests', foodRequestData);
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Failed to submit food request');
  }
};

export const submitRequestForWorkerByAdmin = async (foodRequestData) => {
  console.log('🔍 DEBUG: submitRequestForWorkerByAdmin called with:', foodRequestData);

  if (!foodRequestData.subdomain || foodRequestData.subdomain == 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }

  if (!foodRequestData.mealType || !['breakfast', 'lunch', 'dinner'].includes(foodRequestData.mealType)) {
    throw new Error('Valid meal type is required.');
  }

  if (!foodRequestData.workerId) {
    throw new Error('Worker ID is required.');
  }

  try {
    const response = await api.post('/food-requests/admin/request', foodRequestData);
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Failed to submit food request for worker');
  }
};

export const getTodayRequests = async (foodRequestData) => {
  console.log('🔍 DEBUG: getTodayRequests called with:', foodRequestData);
  
  if (!foodRequestData.subdomain || foodRequestData.subdomain == 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }
  
  try {
    const { mealType = 'all' } = foodRequestData;
    const response = await api.get(`/food-requests/${foodRequestData.subdomain}?mealType=${mealType}`);
    return response.data;
  } catch (error) {
    console.error('🚨 getTodayRequests error:', error);
    throw error.response?.data || new Error('Failed to fetch food requests');
  }
};

export const getMealsSummary = async (foodRequestData) => {
  console.log('🔍 DEBUG: getMealsSummary called with:', foodRequestData);
  
  if (!foodRequestData.subdomain || foodRequestData.subdomain == 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }
  
  try {
    const response = await api.get(`/food-requests/${foodRequestData.subdomain}/summary`);
    return response.data;
  } catch (error) {
    console.error('🚨 getMealsSummary error:', error);
    throw error.response?.data || new Error('Failed to fetch meals summary');
  }
};

export const toggleFoodRequests = async (foodRequestData) => {
  console.log('🔍 DEBUG: toggleFoodRequests called with:', foodRequestData);
  
  if (!foodRequestData.subdomain || foodRequestData.subdomain == 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }

  if (!foodRequestData.mealType || !['breakfast', 'lunch', 'dinner'].includes(foodRequestData.mealType)) {
    throw new Error('Valid meal type is required.');
  }

  try {
    const response = await api.put(`/food-requests/toggle/${foodRequestData.subdomain}`, {
      mealType: foodRequestData.mealType
    });
    return response.data;
  } catch (error) {
    console.error('🚨 toggleFoodRequests error:', error);
    throw error.response?.data || new Error('Failed to toggle food requests');
  }
};

export const getFoodRequestSettings = async (foodRequestData) => {
  console.log('🔍 DEBUG: getFoodRequestSettings called with:', foodRequestData);
  
  if (!foodRequestData.subdomain || foodRequestData.subdomain === 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }

  try {
    const response = await api.get(`/food-requests/settings/${foodRequestData.subdomain}`);
    return response.data;
  } catch (error) {
    console.error('🚨 getFoodRequestSettings error:', error);
    throw error.response?.data || new Error('Failed to fetch settings');
  }
};

export const updateMealSettings = async (data) => {
  console.log('🔍 DEBUG: updateMealSettings called with:', data);
  
  if (!data.subdomain || data.subdomain === 'main') {
    throw new Error('Subdomain was missing check the URL.');
  }

  if (!data.mealType || !['breakfast', 'lunch', 'dinner'].includes(data.mealType)) {
    throw new Error('Valid meal type is required.');
  }

  try {
    const response = await api.put(`/food-requests/settings/${data.subdomain}/${data.mealType}`, {
      openTime: data.openTime,
      closeTime: data.closeTime,
      autoSwitch: data.autoSwitch
    });
    return response.data;
  } catch (error) {
    console.error('🚨 updateMealSettings error:', error);
    throw error.response?.data || new Error('Failed to update meal settings');
  }
};