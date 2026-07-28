import api from './api';

export const subdomainAvailable = async (formData) => {
  try {
    const response = await api.post('/auth/admin/subdomain-available', formData);
    return response.data;
  } catch (error) {
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

export const updateMe = async (userData) => {
  try {
    const response = await api.put('/auth/me', userData);
    return response.data;
  } catch (error) {
    throw error.response?.data || new Error('Failed to update profile');
  }
};

export const login = async (credentials, userType) => {
  try {
    const response = await api.post(`/auth/${userType}`, credentials);
    const userData = response.data;
    
    // We NO LONGER store sensitive data in localStorage.
    // Cookies handle the JWT, and React state handles the user object.
    
    return userData;
  } catch (error) {
    if (error.response?.status === 401) {
      const backendMessage = error.response?.data?.message;
      if (backendMessage) {
        throw new Error(backendMessage);
      }
      if (userType === 'worker') {
        throw new Error('Invalid developer credentials. Please check your username and password.');
      } else {
        throw new Error('Invalid admin credentials. Please check your username and password.');
      }
    }
    throw error.response?.data || new Error('Login failed. Please try again.');
  }
};

export const logout = async () => {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Error retrieving user:', error);
    return null;
  }
};

export const checkAndInitAdmin = async () => {
  try {
    const response = await api.get('/auth/check-admin');
    return response.data;
  } catch (error) {
    console.error('Admin check failed:', error);
    throw error;
  }
};

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