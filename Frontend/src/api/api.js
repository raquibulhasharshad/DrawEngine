import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config.url;
      // Exclude settings-related 401s (Incorrect Password) from global logout redirect
      if (url.includes('/user/password') || url.includes('/user/delete')) {
        return Promise.reject(error);
      }

      // Clear legacy storage if any
      localStorage.removeItem('draw_engine_token');
      localStorage.removeItem('draw_engine_user');
      
      // Prevent infinite redirect loops on public paths if necessary
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
