import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle responses
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH ====================
export const authApi = {
  setupRequired: () => apiClient.get('/auth/setup-required'),
  setup: (data) => apiClient.post('/auth/setup', data),
  login: (email, password) => apiClient.post('/auth/login', { email, password }),
  verify: () => apiClient.get('/auth/verify'),
  logout: () => apiClient.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) => 
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email) => apiClient.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => 
    apiClient.post('/auth/reset-password', { token, newPassword })
};

// ==================== ADMIN ====================
export const adminApi = {
  // Users
  getUsers: () => apiClient.get('/admin/users'),
  createUser: (data) => apiClient.post('/admin/users', data),
  updateUser: (userId, data) => apiClient.put(`/admin/users/${userId}`, data),
  deleteUser: (userId) => apiClient.delete(`/admin/users/${userId}`),
  
  // Groups
  getGroups: () => apiClient.get('/admin/groups'),
  createGroup: (data) => apiClient.post('/admin/groups', data),
  deleteGroup: (groupId) => apiClient.delete(`/admin/groups/${groupId}`),
  addUserToGroup: (groupId, userId) => 
    apiClient.post(`/admin/groups/${groupId}/users/${userId}`),
  removeUserFromGroup: (groupId, userId) => 
    apiClient.delete(`/admin/groups/${groupId}/users/${userId}`),
  
  // Clusters
  getClusters: () => apiClient.get('/admin/clusters'),
  createCluster: (data) => apiClient.post('/admin/clusters', data),
  deleteCluster: (clusterId) => apiClient.delete(`/admin/clusters/${clusterId}`),
  getClusterContainers: (clusterId) => 
    apiClient.get(`/admin/clusters/${clusterId}/containers`),
  
  // Assignments
  getAssignments: () => apiClient.get('/admin/assignments'),
  createAssignment: (data) => apiClient.post('/admin/assignments', data),
  deleteAssignment: (assignmentId) => apiClient.delete(`/admin/assignments/${assignmentId}`),
  
  // Settings
  getSettings: () => apiClient.get('/admin/settings'),
  updateSettings: (data) => apiClient.put('/admin/settings', data),
  testSmtp: (data) => apiClient.post('/admin/settings/test-smtp', data),
  testProxmox: (data) => apiClient.post('/admin/settings/test-proxmox', data)
};

// ==================== USER ====================
export const userApi = {
  getProfile: () => apiClient.get('/user/profile'),
  updateProfile: (data) => apiClient.put('/user/profile', data),
  getContainers: () => apiClient.get('/user/containers'),
  getContainerDetails: (containerId) => apiClient.get(`/user/containers/${containerId}`)
};

export default apiClient;
