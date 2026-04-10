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
      // If the server provided a specific error message (like 'Incorrect password'), 
      // it's a validation error, not a session expiry. Stay on the screen.
      if (error.response.data && error.response.data.error) {
        return Promise.reject(error);
      }

      // If no error message was provided, the session has truly expired.
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
