//src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Crucial for sending cookies
});

// Flag to prevent multiple simultaneous refresh requests
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor: we no longer inject the token from localStorage
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor: handles 401 unauthorized and attempts refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 403 Rules Acceptance
    if (error.response && error.response.status === 403 && error.response.data.rulesAcceptanceRequired) {
      if (window.location.pathname !== '/worker/rules-acceptance') {
        window.location.href = '/worker/rules-acceptance';
      }
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      // Don't retry if the failed request was already a refresh attempt or login attempt
      if (originalRequest.url === '/auth/refresh' || originalRequest.url.includes('/auth/admin') || originalRequest.url.includes('/auth/worker')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Attempt to refresh the token
        await axios.post(`${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`, {}, { withCredentials: true });
        
        isRefreshing = false;
        processQueue(null);
        
        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        processQueue(refreshError, null);
        
        // Refresh failed, user is truly logged out
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith('/worker/login') && !currentPath.startsWith('/admin/login')) {
            if (currentPath.startsWith('/worker')) {
                window.location.href = '/worker/login';
            } else {
                window.location.href = '/admin/login';
            }
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;