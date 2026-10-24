import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? 'http://localhost:8000/api/' 
  : '/api/';

// Standard timeout policies for ATS requests (milliseconds)
export const API_TIMEOUTS = {
  DEFAULT_LIST: 15000, // 15 seconds for paginated list queries
  METRIC_STATS: 20000, // 20 seconds for dashboard metric aggregations
  EXPORT: 60000,       // 60 seconds for heavy file/CSV streaming
} as const;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Automatically injects JWT Bearer token into outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ats-token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Redirects to login if JWT token expires (401 error)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and reload to force redirect to login
      localStorage.removeItem('ats-token');
      localStorage.removeItem('ats-user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Unauthenticated client for public candidate portal (no JWT header or 401 redirect)
export const publicApi = axios.create({
  baseURL: API_URL,
});
