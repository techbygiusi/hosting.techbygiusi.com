import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 600000
});

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function uploadImages(files, onProgress) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));

  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!event.total || !onProgress) return;
      onProgress(Math.round((event.loaded * 100) / event.total));
    }
  });

  return response.data;
}

export async function adminLogin(username, password) {
  const response = await api.post('/admin/login', { username, password });
  return response.data;
}

export async function getImages() {
  const response = await api.get('/admin/images');
  return response.data.images || [];
}

export async function getAdminStats() {
  const response = await api.get('/admin/stats');
  return response.data;
}

export async function getImageBlob(id) {
  const response = await api.get(`/admin/images/${id}/view`, { responseType: 'blob' });
  return response.data;
}

export async function downloadImage(id) {
  const response = await api.get(`/admin/images/${id}/download`, { responseType: 'blob' });
  return response.data;
}

export async function downloadAll() {
  const response = await api.get('/admin/download-all', { responseType: 'blob' });
  return response.data;
}

export default api;
