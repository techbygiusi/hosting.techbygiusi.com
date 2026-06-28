import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showUserModal, setShowUserModal] = useState(false);
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);

  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', role: 'user' });
  const [newCluster, setNewCluster] = useState({ name: '', url: '', apiToken: '' });
  const [newAssignment, setNewAssignment] = useState({ containerId: '', clusterId: '', assignedToType: 'user', assignedToId: '' });

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('site_theme') || 'light');

  const renderRole = (role) => role === 'admin' ? 'Administrator' : 'Benutzer';

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      if (activeTab === 'users' || activeTab === 'overview') {
        const res = await adminApi.getUsers();
        setUsers(res.data.users || []);
      }

      if (activeTab === 'clusters' || activeTab === 'overview') {
        const res = await adminApi.getClusters();
        setClusters(res.data.clusters || []);
      }

      if (activeTab === 'assignments') {
        const res = await adminApi.getAssignments();
        setAssignments(res.data.assignments || []);
      }

      if (activeTab === 'settings') {
        const res = await adminApi.getSettings();
        setSettings(res.data.settings || {});
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Daten konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      if (!newUser.email || !newUser.name || !newUser.password) {
        setError('Email, Name und Passwort erforderlich');
        return;
      }

      if (newUser.password.length < 6) {
        setError('Passwort muss mindestens 6 Zeichen lang sein');
        return;
      }

      setError('');
      await adminApi.createUser(newUser);
      setSuccessMsg('Benutzer erfolgreich erstellt.');
      setNewUser({ email: '', name: '', password: '', role: 'user' });
      setShowUserModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht erstellt werden.'));
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      setError('');
      await adminApi.updateUser(userId, { role: newRole });
      setSuccessMsg('Benutzerrolle aktualisiert.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Rolle konnte nicht aktualisiert werden.'));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Diesen Benutzer wirklich löschen?')) return;

    try {
      setError('');
      await adminApi.deleteUser(userId);
      setSuccessMsg('Benutzer erfolgreich gelöscht.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht gelöscht werden.'));
    }
  };

  const handleCreateCluster = async () => {
    try {
      if (!newCluster.name || !newCluster.url || !newCluster.apiToken) {
        setError('Alle Felder erforderlich');
        return;
      }

      setError('');
      await adminApi.createCluster(newCluster);
      setSuccessMsg('Proxmox-Cluster hinzugefügt.');
      setNewCluster({ name: '', url: '', apiToken: '' });
      setShowClusterModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht hinzugefügt werden.'));
    }
  };

  const handleDeleteCluster = async (clusterId) => {
    if (!window.confirm('Cluster wirklich löschen?')) return;

    try {
      setError('');
      await adminApi.deleteCluster(clusterId);
      setSuccessMsg('Cluster erfolgreich gelöscht.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht gelöscht werden.'));
    }
  };

  const handleCreateAssignment = async () => {
    try {
      if (!newAssignment.containerId || !newAssignment.clusterId || !newAssignment.assignedToId) {
        setError('Alle Felder erforderlich');
        return;
      }

      setError('');
      await adminApi.createAssignment(newAssignment);
      setSuccessMsg('Container zugewiesen.');
      setNewAssignment({ containerId: '', clusterId: '', assignedToType: 'user', assignedToId: '' });
      setShowAssignmentModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Zuweisung konnte nicht erstellt werden.'));
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Zuweisung wirklich löschen?')) return;

    try {
      setError('');
      await adminApi.deleteAssignment(assignmentId);
      setSuccessMsg('Zuweisung erfolgreich entfernt.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Zuweisung konnte nicht gelöscht werden.'));
    }
  };

  const handleUpdateSettings = async () => {
    try {
      if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_user || !settings.smtp_password) {
        setError('Alle SMTP-Felder erforderlich');
        return;
      }

      setError('');
      await adminApi.updateSettings({
        smtpHost: settings.smtp_host,
        smtpPort: settings.smtp_port,
        smtpUser: settings.smtp_user,
        smtpPassword: settings.smtp_password
      });
      setSuccessMsg('SMTP-Einstellungen aktualisiert.');
    } catch (err) {
      setError(getErrorMessage(err, 'Einstellungen konnten nicht aktualisiert werden.'));
    }
  };

  const handleTestSmtp = async () => {
    try {
      if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_user || !settings.smtp_password) {
        setError('Alle SMTP-Felder erforderlich');
        return;
      }

      setError('');
      const result = await adminApi.testSmtp({
        smtpHost: settings.smtp_host,
        smtpPort: settings.smtp_port,
        smtpUser: settings.smtp_user,
        smtpPassword: settings.smtp_password
      });

      if (result.data.success) {
        setSuccessMsg('SMTP-Verbindung erfolgreich!');
      } else {
        setError(result.data.message || 'SMTP-Test fehlgeschlagen');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP-Test fehlgeschlagen.'));
    }
  };

  const toggleTheme = (newTheme) => {
    setTheme(newTheme);
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${newTheme}`);
    localStorage.setItem('site_theme', newTheme);
    setShowThemeMenu(false);
  };

  return (
    <div className="admin-container">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-content">
          <h1>Verwaltung</h1>
          <div className="admin-header-actions">
            <span className="user-name">{user?.email}</span>
            <div className="dropdown-container">
              <button
                className="icon-btn theme-toggle-btn"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                aria-label="Theme umschalten"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              {showThemeMenu && (
                <div className="dropdown-menu">
                  <button
                    className={`dropdown-item ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => toggleTheme('light')}
                  >
                    Light Mode
                  </button>
                  <button
                    className={`dropdown-item ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => toggleTheme('dark')}
                  >
                    Dark Mode
                  </button>
                </div>
              )}
            </div>
            <button className="logout-btn" onClick={logout}>
              Abmelden
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Übersicht
        </button>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Benutzer
        </button>
        <button
          className={`tab-btn ${activeTab === 'clusters' ? 'active' : ''}`}
          onClick={() => setActiveTab('clusters')}
        >
          Cluster
        </button>
        <button
          className={`tab-btn ${activeTab === 'assignments' ? 'active' : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          Zuweisungen
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Einstellungen
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="alert-close" onClick={() => setError('')}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success">
          <span>{successMsg}</span>
          <button className="alert-close" onClick={() => setSuccessMsg('')}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className="admin-content">
        {loading ? (
          <div className="loader-container">
            <div className="spinner"></div>
            <p>Laden...</p>
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="overview-grid">
                <div className="stat-card">
                  <div className="stat-number">{users.length}</div>
                  <div className="stat-label">Benutzer gesamt</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{clusters.length}</div>
                  <div className="stat-label">Proxmox-Cluster</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{assignments.length}</div>
                  <div className="stat-label">Zuweisungen</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{users.filter(u => u.role === 'admin').length}</div>
                  <div className="stat-label">Administrator</div>
                </div>
              </div>
            )}

            {/* USERS TAB */}
            {activeTab === 'users' && (
              <div>
                <div className="tab-header">
                  <h2>Benutzerverwaltung</h2>
                  <button className="btn-primary" onClick={() => setShowUserModal(true)}>
                    + Benutzer hinzufügen
                  </button>
                </div>

                {showUserModal && (
                  <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-header">
                        <h3>Neuer Benutzer</h3>
                        <button className="modal-close" onClick={() => setShowUserModal(false)}>✕</button>
                      </div>
                      <div className="modal-body">
                        <div className="form-group">
                          <label>Email</label>
                          <input
                            type="email"
                            placeholder="benutzer@example.com"
                            value={newUser.email}
                            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            type="text"
                            placeholder="Max Mustermann"
                            value={newUser.name}
                            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Passwort</label>
                          <input
                            type="password"
                            placeholder="Mindestens 6 Zeichen"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Rolle</label>
                          <select
                            value={newUser.role}
                            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                          >
                            <option value="user">Benutzer</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn-secondary" onClick={() => setShowUserModal(false)}>
                          Abbrechen
                        </button>
                        <button className="btn-primary" onClick={handleCreateUser}>
                          Erstellen
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Rolle</th>
                        <th>Erstellt am</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.email}</td>
                          <td>{u.name}</td>
                          <td>
                            <select
                              value={u.role}
                              onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                              className="role-select"
                            >
                              <option value="user">Benutzer</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </td>
                          <td>{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
                          <td>
                            <button
                              className="btn-delete"
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              Löschen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CLUSTERS TAB */}
            {activeTab === 'clusters' && (
              <div>
                <div className="tab-header">
                  <h2>Proxmox-Cluster</h2>
                  <button className="btn-primary" onClick={() => setShowClusterModal(true)}>
                    + Cluster hinzufügen
                  </button>
                </div>

                {showClusterModal && (
                  <div className="modal-overlay" onClick={() => setShowClusterModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-header">
                        <h3>Neuer Proxmox-Cluster</h3>
                        <button className="modal-close" onClick={() => setShowClusterModal(false)}>✕</button>
                      </div>
                      <div className="modal-body">
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            type="text"
                            placeholder="z.B. Cluster 1"
                            value={newCluster.name}
                            onChange={(e) => setNewCluster({ ...newCluster, name: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>URL</label>
                          <input
                            type="text"
                            placeholder="https://proxmox.example.com:8006"
                            value={newCluster.url}
                            onChange={(e) => setNewCluster({ ...newCluster, url: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>API-Token</label>
                          <input
                            type="password"
                            placeholder="API-Token"
                            value={newCluster.apiToken}
                            onChange={(e) => setNewCluster({ ...newCluster, apiToken: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn-secondary" onClick={() => setShowClusterModal(false)}>
                          Abbrechen
                        </button>
                        <button className="btn-primary" onClick={handleCreateCluster}>
                          Hinzufügen
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="cluster-grid">
                  {clusters.map((cluster) => (
                    <div key={cluster.id} className="cluster-card">
                      <h4>{cluster.name}</h4>
                      <p className="cluster-url">{cluster.url}</p>
                      <p className="cluster-date">Erstellt: {new Date(cluster.created_at).toLocaleDateString('de-DE')}</p>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteCluster(cluster.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ASSIGNMENTS TAB */}
            {activeTab === 'assignments' && (
              <div>
                <div className="tab-header">
                  <h2>Container-Zuweisungen</h2>
                  <button className="btn-primary" onClick={() => setShowAssignmentModal(true)}>
                    + Zuweisung hinzufügen
                  </button>
                </div>

                {showAssignmentModal && (
                  <div className="modal-overlay" onClick={() => setShowAssignmentModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-header">
                        <h3>Neue Zuweisung</h3>
                        <button className="modal-close" onClick={() => setShowAssignmentModal(false)}>✕</button>
                      </div>
                      <div className="modal-body">
                        <div className="form-group">
                          <label>Cluster</label>
                          <select
                            value={newAssignment.clusterId}
                            onChange={(e) => setNewAssignment({ ...newAssignment, clusterId: e.target.value })}
                          >
                            <option value="">-- Wählen --</option>
                            {clusters.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Container-ID</label>
                          <input
                            type="text"
                            placeholder="z.B. 100"
                            value={newAssignment.containerId}
                            onChange={(e) => setNewAssignment({ ...newAssignment, containerId: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Zuweisen zu</label>
                          <select
                            value={newAssignment.assignedToType}
                            onChange={(e) => setNewAssignment({ ...newAssignment, assignedToType: e.target.value })}
                          >
                            <option value="user">Benutzer</option>
                            <option value="group">Gruppe</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>{newAssignment.assignedToType === 'user' ? 'Benutzer' : 'Gruppe'}</label>
                          <select
                            value={newAssignment.assignedToId}
                            onChange={(e) => setNewAssignment({ ...newAssignment, assignedToId: e.target.value })}
                          >
                            <option value="">-- Wählen --</option>
                            {newAssignment.assignedToType === 'user' ? (
                              users.map((u) => (
                                <option key={u.id} value={u.id}>{u.email}</option>
                              ))
                            ) : null}
                          </select>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn-secondary" onClick={() => setShowAssignmentModal(false)}>
                          Abbrechen
                        </button>
                        <button className="btn-primary" onClick={handleCreateAssignment}>
                          Zuweisen
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Container-ID</th>
                        <th>Cluster</th>
                        <th>Zugewiesen zu</th>
                        <th>Typ</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.id}>
                          <td>{a.container_id}</td>
                          <td>{a.cluster_name}</td>
                          <td>{a.assigned_to_name}</td>
                          <td>{a.assigned_to_type === 'user' ? 'Benutzer' : 'Gruppe'}</td>
                          <td>
                            <button
                              className="btn-delete"
                              onClick={() => handleDeleteAssignment(a.id)}
                            >
                              Löschen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div>
                <h2>SMTP-Einstellungen</h2>
                <div className="settings-form">
                  <div className="form-group">
                    <label>SMTP-Host</label>
                    <input
                      type="text"
                      placeholder="smtp.example.com"
                      value={settings.smtp_host || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>SMTP-Port</label>
                    <input
                      type="number"
                      placeholder="587"
                      value={settings.smtp_port || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>SMTP-Benutzer</label>
                    <input
                      type="text"
                      placeholder="benutzer@example.com"
                      value={settings.smtp_user || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>SMTP-Passwort</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={settings.smtp_password || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn-secondary" onClick={handleTestSmtp}>
                      Test
                    </button>
                    <button className="btn-primary" onClick={handleUpdateSettings}>
                      Speichern
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
