import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // https://task-tracker-backend-1-r8os.onrender.com/api
  // 'http://localhost:5000/api',
  withCredentials: true, // If you need cookies for CORS, otherwise can remove
});

// Request interceptor: adds token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    console.log('Token being sent:', token); // Debug log
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.error('No token found for request');
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handles 401 unauthorized and 403 rules acceptance
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 403 && error.response.data.rulesAcceptanceRequired) {
      if (window.location.pathname !== '/worker/rules-acceptance') {
        console.warn('Rules acceptance required. Redirecting...');
        window.location.href = '/worker/rules-acceptance';
      } else {
        console.warn('Rules acceptance required, but already on the acceptance page. Suppressing redirect to prevent reload loop.');
      }
      return Promise.reject(error);
    }

    if (error.response && error.response.status === 401) {
      console.error('Unauthorized access');
      // Clear localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Check if user is on a worker page or admin page to redirect appropriately
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/worker')) {
        // For worker routes, we don't want to redirect to admin login
        // The component should handle the error display
        console.log('Worker authentication failed, staying on current page');
      } else {
        // For admin routes, redirect to admin login
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;