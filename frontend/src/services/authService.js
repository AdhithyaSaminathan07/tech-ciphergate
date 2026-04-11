import api from './api';
import { getAuthToken } from '../utils/authUtils';

export const subdomainAvailable = async (formData) => {
  try {
    const response = await api.post('/auth/admin/subdomain-available', formData);
    return response.data;
  } catch (error) {
    console.error("Subdomain not available", error);
    throw error.response?.data || new Error('Failed to check subdomain availability');
  }
};

export const registerAdmin = async (userData) => {
  try {
    const response = await api.post('/auth/admin/register', userData);
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Failed to register admin');
  }
};

export const login = async (credentials, userType) => {
  try {
    const response = await api.post(`/auth/${userType}`, credentials);
    const userData = response.data;
    
    // Include department and salary information when saving to localStorage
    localStorage.setItem('token', userData.token);
    localStorage.setItem('tasktracker-subdomain', userData.subdomain);
    localStorage.setItem('user', JSON.stringify({
      _id: userData._id,
      username: userData.username,
      subdomain: userData.subdomain,
      rfid: userData.rfid,
      email: userData.email,
      role: userData.role,
      name: userData.name,
      department: userData.department,
      // Add these two lines to save salary information
      salary: userData.salary,
      finalSalary: userData.finalSalary
    }));

    return userData;
  } catch (error) {
    // Provide more specific error messages based on the error response
    if (error.response?.status === 401) {
      if (userType === 'worker') {
        throw new Error('Invalid employee credentials. Please check your username and password.');
      } else {
        throw new Error('Invalid admin credentials. Please check your username and password.');
      }
    }
    throw error.response?.data || new Error('Login failed. Please try again.');
  }
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getCurrentUser = () => {
  try {
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');
    
    if (token && userJson) {
      const user = JSON.parse(userJson);
      return {
        ...user,
        token
      };
    }
    return null;
  } catch (error) {
    console.error('Error retrieving user:', error);
    return null;
  }
};

// Corrected initialization check
export const checkAndInitAdmin = async () => {
  try {
    const response = await api.get('/auth/check-admin');
    return response.data;
  } catch (error) {
    console.error('Admin check failed:', error);
    throw error;
  }
};

// New functions for password reset functionality with OTP
export const requestPasswordResetOtp = async (data) => {
    try {
        const response = await api.post('/auth/request-reset-otp', data);
        return response.data;
    } catch (error) {
        throw error.response?.data || new Error('Failed to request password reset OTP.');
    }
};

export const resetPasswordWithOtp = async (data) => {
    try {
        const response = await api.put('/auth/reset-password-with-otp', data);
        return response.data;
    } catch (error) {
        throw error.response?.data || new Error('Failed to reset password.');
    }
};

export default {
  registerAdmin,
  login,
  logout,
  getCurrentUser,
  checkAndInitAdmin,
  subdomainAvailable,
  requestPasswordResetOtp,
  resetPasswordWithOtp
};