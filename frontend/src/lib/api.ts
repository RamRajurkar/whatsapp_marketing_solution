import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('wa_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('wa_token');
      localStorage.removeItem('wa_auth');
      document.cookie = `wa_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
