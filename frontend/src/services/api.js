import axios from 'axios';

const configuredApiUrl = process.env.REACT_APP_API_URL || '';
const isBrowser = typeof window !== 'undefined';
const browserHost = isBrowser ? window.location.hostname : 'localhost';
const browserProtocol = isBrowser ? window.location.protocol : 'http:';
const configuredUsesLocalhost = configuredApiUrl.includes('localhost') || configuredApiUrl.includes('127.0.0.1');
const browserIsLocalhost = browserHost === 'localhost' || browserHost === '127.0.0.1';

const API_URL = configuredApiUrl && !(configuredUsesLocalhost && !browserIsLocalhost)
  ? configuredApiUrl
  : `${browserProtocol}//${browserHost}:3001/api`;

const MESSAGE_TRANSLATIONS = {
  'Invalid email or password': 'E-Mail-Adresse oder Passwort ist falsch.',
  'User with this email already exists': 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.',
  'User not found': 'Benutzer wurde nicht gefunden.',
  'Unauthorized': 'Nicht angemeldet.',
  'Forbidden': 'Keine Berechtigung.',
  'Setup has already been completed': 'Die Erstkonfiguration wurde bereits abgeschlossen.',
  'Setup wizard is required': 'Die Erstkonfiguration ist erforderlich.',
  'Invalid or expired token': 'Die Sitzung ist ungültig oder abgelaufen.',
  'Internal server error': 'Interner Serverfehler.',
  'Setup completed successfully': 'Erstkonfiguration erfolgreich abgeschlossen.',
  'Password changed successfully': 'Passwort erfolgreich geändert.',
  'Password reset successfully': 'Passwort erfolgreich zurückgesetzt.',
  'Password reset link sent to your email': 'Der Link zum Zurücksetzen des Passworts wurde per E-Mail versendet.',
  'If email exists, password reset link has been sent': 'Falls die E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen versendet.',
  'Logged out successfully': 'Erfolgreich abgemeldet.',
  'User deleted successfully': 'Benutzer erfolgreich gelöscht.',
  'Group deleted successfully': 'Gruppe erfolgreich gelöscht.',
  'User added to group': 'Benutzer wurde zur Gruppe hinzugefügt.',
  'User removed from group': 'Benutzer wurde aus der Gruppe entfernt.',
  'Cluster deleted successfully': 'Cluster erfolgreich gelöscht.',
  'Assignment deleted successfully': 'Zuweisung erfolgreich gelöscht.',
  'Settings updated successfully': 'Einstellungen erfolgreich gespeichert.',
  'Email service not configured': 'Der E-Mail-Dienst ist noch nicht konfiguriert.',
  'Connection successful': 'Verbindung erfolgreich.',
  'Connection failed: unexpected Proxmox API response': 'Verbindung fehlgeschlagen: Unerwartete Antwort der Proxmox API.',
  'Setup is not complete yet. Please finish the initial configuration first.': 'Die Erstkonfiguration ist noch nicht abgeschlossen.',
  'Login failed': 'Anmeldung fehlgeschlagen.',
  'Setup failed': 'Erstkonfiguration fehlgeschlagen.',
  'Password change failed': 'Passwortänderung fehlgeschlagen.'
};

export function translateMessage(message) {
  if (!message) return '';
  if (MESSAGE_TRANSLATIONS[message]) return MESSAGE_TRANSLATIONS[message];

  if (message.startsWith('Connection failed with HTTP')) {
    return message.replace('Connection failed with HTTP', 'Verbindung fehlgeschlagen mit HTTP');
  }

  if (message.startsWith('Connection failed:')) {
    return message.replace('Connection failed:', 'Verbindung fehlgeschlagen:');
  }

  return message;
}

export function getErrorMessage(error, fallback = 'Ein Fehler ist aufgetreten.') {
  return translateMessage(error?.response?.data?.message || error?.message || fallback) || fallback;
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isSetupRoute = window.location.pathname.startsWith('/setup');
    const serverMessage = error.response?.data?.message;

    if (error.response?.status === 401 && !isSetupRoute) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    if (error.response?.status === 403 && serverMessage === 'Setup wizard is required') {
      window.location.href = '/setup';
    }

    if (error.response?.data?.message) {
      error.response.data.message = translateMessage(error.response.data.message);
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  setupRequired: () => apiClient.get('/auth/setup-required'),
  setup: (data) => apiClient.post('/auth/setup', data),
  setupTestSmtp: (data) => apiClient.post('/auth/setup/test-smtp', data),
  setupTestProxmox: (data) => apiClient.post('/auth/setup/test-proxmox', data),
  login: (email, password) => apiClient.post('/auth/login', { email, password }),
  verify: () => apiClient.get('/auth/verify'),
  logout: () => apiClient.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email) => apiClient.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) =>
    apiClient.post('/auth/reset-password', { token, newPassword })
};

export const adminApi = {
  getUsers: () => apiClient.get('/admin/users'),
  createUser: (data) => apiClient.post('/admin/users', data),
  updateUser: (userId, data) => apiClient.put(`/admin/users/${userId}`, data),
  deleteUser: (userId) => apiClient.delete(`/admin/users/${userId}`),
  getGroups: () => apiClient.get('/admin/groups'),
  createGroup: (data) => apiClient.post('/admin/groups', data),
  deleteGroup: (groupId) => apiClient.delete(`/admin/groups/${groupId}`),
  addUserToGroup: (groupId, userId) =>
    apiClient.post(`/admin/groups/${groupId}/users/${userId}`),
  removeUserFromGroup: (groupId, userId) =>
    apiClient.delete(`/admin/groups/${groupId}/users/${userId}`),
  getClusters: () => apiClient.get('/admin/clusters'),
  createCluster: (data) => apiClient.post('/admin/clusters', data),
  deleteCluster: (clusterId) => apiClient.delete(`/admin/clusters/${clusterId}`),
  getClusterContainers: (clusterId) =>
    apiClient.get(`/admin/clusters/${clusterId}/containers`),
  getAssignments: () => apiClient.get('/admin/assignments'),
  createAssignment: (data) => apiClient.post('/admin/assignments', data),
  deleteAssignment: (assignmentId) => apiClient.delete(`/admin/assignments/${assignmentId}`),
  getSettings: () => apiClient.get('/admin/settings'),
  updateSettings: (data) => apiClient.put('/admin/settings', data),
  testSmtp: (data) => apiClient.post('/admin/settings/test-smtp', data),
  testProxmox: (data) => apiClient.post('/admin/settings/test-proxmox', data)
};

export const userApi = {
  getContainers: () => apiClient.get('/user/containers'),
  getContainerDetails: (assignmentId) => apiClient.get(`/user/containers/${assignmentId}`),
  getProfile: () => apiClient.get('/user/profile'),
  updateProfile: (data) => apiClient.put('/user/profile', data)
};

export default apiClient;
