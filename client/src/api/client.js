// One axios instance for the whole app.
// - Adds the JWT token to every request
// - If the server says 401 (token expired / invalid), logs the user out
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem('token');
      window.location.href = '/login?expired=1';
    }
    return Promise.reject(err);
  }
);

// Turns any API error into a readable message
export const errMsg = (err) => err.response?.data?.message || err.message || 'Something went wrong';

export default api;
