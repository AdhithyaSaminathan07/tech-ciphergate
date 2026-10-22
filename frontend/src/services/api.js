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

// Request interceptor: clean invalid Authorization headers and inject token from localStorage as fallback
api.interceptors.request.use(
  (config) => {
    if (config.headers) {
      const auth = config.headers.Authorization || config.headers.authorization;
      if (auth === 'Bearer null' || auth === 'Bearer undefined') {
        delete config.headers.Authorization;
        delete config.headers.authorization;
      }
    }
    const token = localStorage.getItem('token');
    if (token && token !== 'null' && token !== 'undefined' && !config.headers?.Authorization && !config.headers?.authorization) {
      if (!config.headers) config.headers = {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
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
        const refreshResponse = await axios.post(`${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`, {}, { withCredentials: true });
        if (refreshResponse.data?.token) {
          localStorage.setItem('token', refreshResponse.data.token);
        }
        
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