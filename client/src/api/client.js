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

// Opens a protected file (patient document / lab report) in a new tab.
// A plain <a href> can't send the login token, so we download it with axios first.
export async function openFile(url) {
  const win = window.open('', '_blank'); // open immediately so popup blockers allow it
  try {
    const res = await api.get(url, { responseType: 'blob' });
    win.location.href = URL.createObjectURL(res.data);
  } catch (err) {
    win.close();
    alert(err.response?.status === 404 ? 'File not found. Please upload it again.' : 'Could not open the file');
  }
}

// Downloads a protected file (CSV export, backup) and saves it with the server's filename
export async function downloadFile(url, params, fallbackName = 'download') {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const match = cd.match(/filename="?([^";]+)"?/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(res.data);
  a.download = match ? decodeURIComponent(match[1]) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
