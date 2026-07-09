import axios from 'axios';

const configuredApiUrl = process.env.REACT_APP_API_URL || '';
const API_URL = configuredApiUrl.trim() || '/api';

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
  'Cluster deleted successfully': 'Cluster erfolgreich gelöscht.',
  'Assignment deleted successfully': 'Zuweisung erfolgreich gelöscht.',
  'Resource deleted successfully': 'Dienst erfolgreich entfernt.',
  'Resource, cluster, and user are required': 'Dienst, Cluster und Benutzer sind erforderlich.',
  'Resource not found': 'Dienst wurde nicht gefunden.',
  'Resource not accessible': 'Dieser Dienst ist nicht freigegeben.',
  'Selected Proxmox resource was not found': 'Der ausgewählte Proxmox-Dienst wurde nicht gefunden.',
  'Web link must start with http:// or https://': 'Der Weblink muss mit http:// oder https:// beginnen.',
  'Public link must start with http:// or https://': 'Die öffentliche Seite muss mit http:// oder https:// beginnen.',
  'Admin link must start with http:// or https://': 'Die Verwaltungsseite muss mit http:// oder https:// beginnen.',
  'Settings updated successfully': 'Einstellungen erfolgreich gespeichert.',
  'Email service not configured': 'Der E-Mail-Dienst ist noch nicht konfiguriert.',
  'Connection successful': 'Verbindung erfolgreich.',
  'Connection failed: unexpected Proxmox API response': 'Verbindung fehlgeschlagen: Unerwartete Antwort der Proxmox API.',
  'Setup is not complete yet. Please finish the initial configuration first.': 'Die Erstkonfiguration ist noch nicht abgeschlossen.',
  'Email and name are required': 'E-Mail-Adresse und Name sind erforderlich.',
  'Password must be at least 6 characters': 'Das Passwort muss mindestens 6 Zeichen lang sein.',
  'Invalid role': 'Ungültige Rolle.',
  'Cannot delete your own account': 'Du kannst dein eigenes Konto nicht löschen.',
  'Name, URL, and API token are required': 'Name, URL und API-Token sind erforderlich.',
  'Missing required fields': 'Pflichtfelder fehlen.',
  'Cluster not found': 'Cluster wurde nicht gefunden.',
  'Assignment not found': 'Zuweisung wurde nicht gefunden.',
  'SMTP host, port, user, and password are required': 'SMTP-Host, Port, Benutzer und Passwort sind erforderlich.',
  'SMTP port is invalid': 'Der SMTP-Port ist ungültig.',
  'Current and new password required': 'Aktuelles und neues Passwort sind erforderlich.',
  'Current password is incorrect': 'Das aktuelle Passwort ist falsch.',
  'New password must be at least 6 characters': 'Das neue Passwort muss mindestens 6 Zeichen lang sein.',
  'New password must be at least 8 characters': 'Das neue Passwort muss mindestens 8 Zeichen lang sein.',
  'Account temporarily locked. Try again later.': 'Konto vorübergehend gesperrt. Bitte später erneut versuchen.',
  'Too many login attempts. Please try again later.': 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.',
  'Rate limit exceeded.': 'Zu viele Anfragen. Bitte kurz warten.',
  'Invalid power action': 'Ungültige Power-Aktion.',
  'Power management is not permitted for this cluster token': 'Der API-Token dieses Clusters erlaubt keine Power-Aktionen.',
  'Console access is not permitted for this cluster token': 'Der API-Token dieses Clusters erlaubt keinen Konsolen-Zugriff.',
  'Provisioning is not permitted for this cluster token': 'Der API-Token dieses Clusters erlaubt kein Erstellen von Maschinen.',
  'Provisioning is not fully configured for this cluster': 'Self-Service ist für diesen Cluster nicht vollständig konfiguriert.',
  'Credential not found': 'Zugangsdaten wurden nicht gefunden.',
  'Credential saved': 'Zugangsdaten gespeichert.',
  'Credential deleted': 'Zugangsdaten gelöscht.',
  'Label is required': 'Bitte eine Bezeichnung eingeben.',
  'Group not found': 'Gruppe wurde nicht gefunden.',
  'Group name is required': 'Bitte einen Gruppennamen eingeben.',
  'Group deleted successfully': 'Gruppe erfolgreich gelöscht.',
  'VMID range is invalid': 'Der VMID-Bereich ist ungültig.',
  'IP range or gateway is invalid': 'IP-Bereich oder Gateway ist ungültig.',
  'Hostname is invalid': 'Der Hostname ist ungültig (nur Kleinbuchstaben, Zahlen, Bindestriche).',
  'Template is invalid': 'Das Template ist ungültig.',
  'Root password must be at least 8 characters': 'Das Root-Passwort muss mindestens 8 Zeichen lang sein.',
  'No free IP address available in the configured range': 'Keine freie IP-Adresse im konfigurierten Bereich verfügbar.',
  'No online node available': 'Kein Node ist gerade online.',
  'Machine creation started': 'Maschine wird erstellt.',
  'Machine deleted': 'Maschine wurde gelöscht.',
  'Only self-created machines can be deleted by the user': 'Nur selbst erstellte Maschinen können gelöscht werden.',
  'Machine deletion is not permitted for this cluster token': 'Der API-Token dieses Clusters erlaubt kein Löschen von Maschinen.',
  'Power action started': 'Aktion wurde gestartet.',
  'ISO is invalid': 'Das ISO-Image ist ungültig.',
  'Container are not allowed on this cluster': 'Auf diesem Cluster sind keine Container erlaubt.',
  'VMs are not allowed on this cluster': 'Auf diesem Cluster sind keine VMs erlaubt.',
  'Provisioning updated': 'Self-Service-Konfiguration gespeichert.',
  'Admin-provided credentials cannot be edited': 'Vom Admin hinterlegte Zugangsdaten können nicht bearbeitet werden.',
  'Management credential already exists': 'Für diese Verwaltungsseite sind bereits Zugangsdaten hinterlegt.',
  'Community script is not allowed': 'Dieses Community Script ist nicht freigegeben.',
  'Community script started': 'Community Script wurde gestartet.',
  'Provisioning is not permitted for this cluster token': 'Der Proxmox-Token erlaubt keine Container-Erstellung.',
  'Community script URL is not allowed': 'Diese Community-Script-URL ist nicht erlaubt.',
  'Community scripts must be started from the desktop terminal': 'Community Scripts müssen über das Desktop-Terminal gestartet werden.',
  'Maintenance title is required': 'Bitte einen Titel für die Wartung eingeben.',
  'Maintenance time window is invalid': 'Der Wartungszeitraum ist ungültig (Ende muss nach dem Beginn liegen).',
  'Maintenance severity is invalid': 'Die Wartungsstufe ist ungültig.',
  'Maintenance window not found': 'Das Wartungsfenster wurde nicht gefunden.',
  'Maintenance window created': 'Wartungsfenster wurde angelegt.',
  'Maintenance window updated': 'Wartungsfenster wurde aktualisiert.',
  'Maintenance window deleted': 'Wartungsfenster wurde gelöscht.',
  'Notification preferences updated': 'Benachrichtigungseinstellungen gespeichert.',
  'Test email sent': 'Test-E-Mail wurde versendet.',
  'Admin password must be at least 8 characters': 'Das Admin-Passwort muss mindestens 8 Zeichen lang sein.',
  'Password must be at least 8 characters': 'Das Passwort muss mindestens 8 Zeichen lang sein.',
  'Please select a valid location from the search results': 'Bitte einen gültigen Standort aus den Suchergebnissen auswählen.',
  'Location search failed': 'Standortsuche fehlgeschlagen.'
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
  if (message.startsWith('Failed to connect to Proxmox:')) {
    return message.replace('Failed to connect to Proxmox:', 'Proxmox-Verbindung fehlgeschlagen:');
  }
  if (message.startsWith('Proxmox test failed:')) {
    return message.replace('Proxmox test failed:', 'Proxmox-Test fehlgeschlagen:');
  }
  if (message.startsWith('SMTP test failed:')) {
    return message.replace('SMTP test failed:', 'SMTP-Test fehlgeschlagen:');
  }

  return message;
}

export function getErrorMessage(error, fallback = 'Ein Fehler ist aufgetreten.') {
  return translateMessage(error?.response?.data?.message || error?.message || fallback) || fallback;
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
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
  changePassword: (currentPassword, newPassword) => apiClient.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email) => apiClient.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => apiClient.post('/auth/reset-password', { token, newPassword })
};

export const adminApi = {
  getUsers: () => apiClient.get('/admin/users'),
  createUser: (data) => apiClient.post('/admin/users', data),
  updateUser: (userId, data) => apiClient.put(`/admin/users/${userId}`, data),
  deleteUser: (userId) => apiClient.delete(`/admin/users/${userId}`),
  getClusters: () => apiClient.get('/admin/clusters'),
  getClusterStats: () => apiClient.get('/admin/cluster-stats'),
  createCluster: (data) => apiClient.post('/admin/clusters', data),
  updateCluster: (clusterId, data) => apiClient.put(`/admin/clusters/${clusterId}`, data),
  deleteCluster: (clusterId) => apiClient.delete(`/admin/clusters/${clusterId}`),
  getClusterContainers: (clusterId) => apiClient.get(`/admin/clusters/${clusterId}/containers`),
  getAssignments: () => apiClient.get('/admin/assignments'),
  createAssignment: (data) => apiClient.post('/admin/assignments', data),
  deleteAssignment: (assignmentId) => apiClient.delete(`/admin/assignments/${assignmentId}`),
  getResources: () => apiClient.get('/admin/resources'),
  createResource: (data) => apiClient.post('/admin/resources', data),
  updateResource: (resourceId, data) => apiClient.put(`/admin/resources/${resourceId}`, data),
  deleteResource: (resourceId) => apiClient.delete(`/admin/resources/${resourceId}`),
  getSettings: () => apiClient.get('/admin/settings'),
  updateSettings: (data) => apiClient.put('/admin/settings', data),
  testSmtp: (data) => apiClient.post('/admin/settings/test-smtp', data),
  testProxmox: (data) => apiClient.post('/admin/settings/test-proxmox', data),
  // v2.0
  getGroups: () => apiClient.get('/admin/groups'),
  createGroup: (data) => apiClient.post('/admin/groups', data),
  updateGroup: (groupId, data) => apiClient.put(`/admin/groups/${groupId}`, data),
  deleteGroup: (groupId) => apiClient.delete(`/admin/groups/${groupId}`),
  getClusterCapabilities: (clusterId) => apiClient.get(`/admin/clusters/${clusterId}/capabilities`),
  getClusterTemplates: (clusterId, storage) => apiClient.get(`/admin/clusters/${clusterId}/templates${storage ? `?storage=${encodeURIComponent(storage)}` : ''}`),
  getClusterIsos: (clusterId, storage) => apiClient.get(`/admin/clusters/${clusterId}/isos${storage ? `?storage=${encodeURIComponent(storage)}` : ''}`),
  getClusterStorages: (clusterId, content) => apiClient.get(`/admin/clusters/${clusterId}/storages${content ? `?content=${encodeURIComponent(content)}` : ''}`),
  getClusterProvisioning: (clusterId) => apiClient.get(`/admin/clusters/${clusterId}/provisioning`),
  updateClusterProvisioning: (clusterId, data) => apiClient.put(`/admin/clusters/${clusterId}/provisioning`, data),
  getClusterNodeCredentials: (clusterId) => apiClient.get(`/admin/clusters/${clusterId}/node-credentials`),
  updateClusterNodeCredentials: (clusterId, data) => apiClient.put(`/admin/clusters/${clusterId}/node-credentials`, data),
  getAudit: ({ page = 1, search = '' } = {}) => apiClient.get(`/admin/audit?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  // Admin credential vault
  getAdminCredentials: () => apiClient.get('/admin/credentials'),
  revealAdminCredential: (credId) => apiClient.get(`/admin/credentials/${credId}/reveal`),
  createAdminCredential: (data) => apiClient.post('/admin/credentials', data),
  updateAdminCredential: (credId, data) => apiClient.put(`/admin/credentials/${credId}`, data),
  deleteAdminCredential: (credId) => apiClient.delete(`/admin/credentials/${credId}`),
  // Admin → credentials attached to a specific resource
  getResourceCredentials: (resourceId) => apiClient.get(`/admin/resources/${resourceId}/credentials`),
  revealResourceCredential: (resourceId, credId) => apiClient.get(`/admin/resources/${resourceId}/credentials/${credId}/reveal`),
  createResourceCredential: (resourceId, data) => apiClient.post(`/admin/resources/${resourceId}/credentials`, data),
  updateResourceCredential: (resourceId, credId, data) => apiClient.put(`/admin/resources/${resourceId}/credentials/${credId}`, data),
  deleteResourceCredential: (resourceId, credId) => apiClient.delete(`/admin/resources/${resourceId}/credentials/${credId}`),
  // v3.0: maintenance windows, status events, test mail
  getMaintenanceWindows: () => apiClient.get('/admin/maintenance'),
  createMaintenanceWindow: (data) => apiClient.post('/admin/maintenance', data),
  updateMaintenanceWindow: (windowId, data) => apiClient.put(`/admin/maintenance/${windowId}`, data),
  deleteMaintenanceWindow: (windowId) => apiClient.delete(`/admin/maintenance/${windowId}`),
  getStatusEvents: (limit = 25) => apiClient.get(`/admin/status-events?limit=${limit}`),
  sendTestMail: () => apiClient.post('/admin/settings/send-test-mail'),
  searchLocations: (query) => apiClient.get(`/admin/geocode?q=${encodeURIComponent(query)}`)
};

export const userApi = {
  getResources: () => apiClient.get('/user/resources'),
  getResourceDetails: (resourceId) => apiClient.get(`/user/resources/${resourceId}`),
  getContainers: () => apiClient.get('/user/containers'),
  getContainerDetails: (containerId) => apiClient.get(`/user/containers/${containerId}`),
  getProfile: () => apiClient.get('/user/profile'),
  updateProfile: (data) => apiClient.put('/user/profile', data),
  // v2.0
  powerAction: (resourceId, action) => apiClient.post(`/user/resources/${resourceId}/power`, { action }),
  getTasks: (resourceId) => apiClient.get(`/user/resources/${resourceId}/tasks`),
  getTaskLog: (resourceId, upid) => apiClient.get(`/user/resources/${resourceId}/tasks/${encodeURIComponent(upid)}/log`),
  openConsole: (resourceId) => apiClient.post(`/user/resources/${resourceId}/console`),
  getCredentials: (resourceId) => apiClient.get(`/user/resources/${resourceId}/credentials`),
  revealCredential: (resourceId, credId) => apiClient.get(`/user/resources/${resourceId}/credentials/${credId}/reveal`),
  createCredential: (resourceId, data) => apiClient.post(`/user/resources/${resourceId}/credentials`, data),
  updateCredential: (resourceId, credId, data) => apiClient.put(`/user/resources/${resourceId}/credentials/${credId}`, data),
  deleteCredential: (resourceId, credId) => apiClient.delete(`/user/resources/${resourceId}/credentials/${credId}`),
  getProvisioningOptions: () => apiClient.get('/user/provisioning/options'),
  getCommunityScripts: () => apiClient.get('/user/provisioning/community-scripts'),
  openCommunityScriptConsole: (data) => apiClient.post('/user/provisioning/community-console', data),
  createMachine: (data) => apiClient.post('/user/provisioning/create', data),
  deleteMachine: (resourceId) => apiClient.delete(`/user/resources/${resourceId}`),
  // v3.0: notification preferences
  getNotificationPreferences: () => apiClient.get('/user/notifications'),
  updateNotificationPreferences: (data) => apiClient.put('/user/notifications', data)
};

// v3.0: public - maintenance announcements for the banner (no auth required)
export const publicApi = {
  getAnnouncements: () => apiClient.get('/announcements')
};

export default apiClient;
