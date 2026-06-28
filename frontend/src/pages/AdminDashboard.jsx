import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showUserModal, setShowUserModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);

  const [newUser, setNewUser] = useState({ email: '', name: '' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [newCluster, setNewCluster] = useState({ name: '', url: '', apiToken: '' });
  const [newAssignment, setNewAssignment] = useState({ containerId: '', clusterId: '', assignedToType: 'user', assignedToId: '' });

  const renderRole = (role) => role === 'admin' ? 'Administrator' : 'Benutzer';
  const renderAssignmentType = (type) => type === 'group' ? 'Gruppe' : 'Benutzer';

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      if (activeTab === 'users' || activeTab === 'overview') {
        const res = await adminApi.getUsers();
        setUsers(res.data.users || []);
      }

      if (activeTab === 'groups' || activeTab === 'overview') {
        const res = await adminApi.getGroups();
        setGroups(res.data.groups || []);
      }

      if (activeTab === 'clusters' || activeTab === 'overview') {
        const res = await adminApi.getClusters();
        setClusters(res.data.clusters || []);
      }

      if (activeTab === 'assignments') {
        const res = await adminApi.getAssignments();
        setAssignments(res.data.assignments || []);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Daten konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      setError('');
      await adminApi.createUser(newUser);
      setSuccessMsg('Benutzer erfolgreich angelegt.');
      setNewUser({ email: '', name: '' });
      setShowUserModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht angelegt werden.'));
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

  const handleCreateGroup = async () => {
    try {
      setError('');
      await adminApi.createGroup(newGroup);
      setSuccessMsg('Gruppe erfolgreich angelegt.');
      setNewGroup({ name: '' });
      setShowGroupModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Gruppe konnte nicht angelegt werden.'));
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Diese Gruppe wirklich löschen?')) return;

    try {
      setError('');
      await adminApi.deleteGroup(groupId);
      setSuccessMsg('Gruppe erfolgreich gelöscht.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Gruppe konnte nicht gelöscht werden.'));
    }
  };

  const handleCreateCluster = async () => {
    try {
      setError('');
      await adminApi.createCluster(newCluster);
      setSuccessMsg('Cluster erfolgreich hinzugefügt.');
      setNewCluster({ name: '', url: '', apiToken: '' });
      setShowClusterModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht hinzugefügt werden.'));
    }
  };

  const handleDeleteCluster = async (clusterId) => {
    if (!window.confirm('Diesen Cluster wirklich löschen?')) return;

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
      setError('');
      await adminApi.createAssignment(newAssignment);
      setSuccessMsg('Zuweisung erfolgreich angelegt.');
      setNewAssignment({ containerId: '', clusterId: '', assignedToType: 'user', assignedToId: '' });
      setShowAssignmentModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Zuweisung konnte nicht angelegt werden.'));
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Diese Zuweisung wirklich löschen?')) return;

    try {
      setError('');
      await adminApi.deleteAssignment(assignmentId);
      setSuccessMsg('Zuweisung erfolgreich gelöscht.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Zuweisung konnte nicht gelöscht werden.'));
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-alt)' }}>
      <style>{`
        .admin-header {
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          padding: var(--spacing-lg);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--spacing-md);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .admin-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .admin-title h1 {
          margin: 0;
          font-size: var(--font-size-xl);
          color: var(--color-primary);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .logout-btn {
          background: var(--color-danger);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: var(--radius-md);
          cursor: pointer;
          min-height: auto;
        }

        .admin-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--spacing-lg);
        }

        .admin-tabs {
          display: flex;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
          border-bottom: 2px solid var(--color-border);
          overflow-x: auto;
          padding-bottom: 0;
        }

        .admin-tab {
          padding: var(--spacing-md) var(--spacing-lg);
          border: none;
          background: none;
          cursor: pointer;
          font-weight: 500;
          color: var(--color-text-light);
          border-bottom: 3px solid transparent;
          transition: var(--transition);
          white-space: nowrap;
          margin-bottom: -2px;
        }

        .admin-tab.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
        }

        .admin-tab:hover {
          color: var(--color-text);
        }

        .alert {
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-lg);
        }

        .alert-success {
          background: rgba(40, 167, 69, 0.1);
          color: #155724;
          border: 1px solid #28a745;
        }

        .alert-danger {
          background: rgba(220, 53, 69, 0.1);
          color: #721c24;
          border: 1px solid #dc3545;
        }

        .admin-actions {
          display: flex;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
          flex-wrap: wrap;
        }

        .btn-primary {
          background: var(--color-primary);
          color: var(--button-primary-text);
          border: none;
          padding: var(--spacing-sm) var(--spacing-md);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-weight: 500;
          transition: var(--transition);
          min-height: 40px;
        }

        .btn-primary:hover {
          background: var(--color-primary-dark);
          box-shadow: var(--shadow-md);
        }

        .btn-danger {
          background: var(--color-danger);
          color: white;
          border: none;
          padding: 4px 12px;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--font-size-sm);
          min-height: auto;
        }

        .btn-danger:hover {
          background: #c82333;
        }

        .table-responsive {
          overflow-x: auto;
          background: var(--color-surface);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          background: var(--color-bg-alt);
          padding: var(--spacing-md);
          text-align: left;
          font-weight: 600;
          border-bottom: 2px solid var(--color-border);
        }

        td {
          padding: var(--spacing-md);
          border-bottom: 1px solid var(--color-border);
        }

        tr:hover {
          background: var(--color-bg-alt);
        }

        .modal-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-md);
        }

        .modal-overlay.show {
          display: flex;
        }

        .modal-content {
          background: var(--color-surface);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
          max-width: 500px;
          width: 100%;
          box-shadow: var(--shadow-lg);
          animation: slideUp 0.3s ease-in-out;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-lg);
        }

        .modal-header h2 {
          margin: 0;
          font-size: var(--font-size-lg);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: var(--font-size-xl);
          cursor: pointer;
          padding: 0;
        }

        .form-group {
          margin-bottom: var(--spacing-md);
        }

        .form-group label {
          display: block;
          margin-bottom: var(--spacing-sm);
          font-weight: 500;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: var(--spacing-sm) var(--spacing-md);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--font-size-base);
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(122, 135, 111, 0.16);
        }

        .modal-actions {
          display: flex;
          gap: var(--spacing-md);
          justify-content: flex-end;
          margin-top: var(--spacing-lg);
        }

        .btn-secondary {
          background: var(--color-border);
          color: var(--color-text);
          border: none;
          padding: var(--spacing-sm) var(--spacing-md);
          border-radius: var(--radius-md);
          cursor: pointer;
          min-height: 40px;
        }

        .empty-state {
          text-align: center;
          padding: var(--spacing-xl);
          color: var(--color-text-light);
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="admin-header">
        <div className="admin-title">
          <h1>⚙️ Administration</h1>
        </div>
        <div className="user-info">
          <span>{user?.name}</span>
          <button className="logout-btn" onClick={logout}>
            Abmelden
          </button>
        </div>
      </div>
      <div className="admin-container">
        {error && (
          <div className="alert alert-danger">
            {error}
            <button
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-lg)' }}
              onClick={() => setError('')}
            >
              ✕
            </button>
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success">
            {successMsg}
            <button
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-lg)' }}
              onClick={() => setSuccessMsg('')}
            >
              ✕
            </button>
          </div>
        )}
        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Übersicht
          </button>
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Benutzer
          </button>
          <button
            className={`admin-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Gruppen
          </button>
          <button
            className={`admin-tab ${activeTab === 'clusters' ? 'active' : ''}`}
            onClick={() => setActiveTab('clusters')}
          >
            Cluster
          </button>
          <button
            className={`admin-tab ${activeTab === 'assignments' ? 'active' : ''}`}
            onClick={() => setActiveTab('assignments')}
          >
            Zuweisungen
          </button>
        </div>
        {activeTab === 'overview' && (
          <div>
            <h2>Übersicht</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
              <div style={{ background: 'var(--color-surface)', padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 var(--spacing-md) 0', color: 'var(--color-primary)', fontSize: 'var(--font-size-2xl)' }}>{users.length}</h3>
                <p style={{ margin: 0, color: 'var(--color-text-light)' }}>Benutzer gesamt</p>
              </div>
              <div style={{ background: 'var(--color-surface)', padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 var(--spacing-md) 0', color: 'var(--color-primary)', fontSize: 'var(--font-size-2xl)' }}>{groups.length}</h3>
                <p style={{ margin: 0, color: 'var(--color-text-light)' }}>Kundengruppen</p>
              </div>
              <div style={{ background: 'var(--color-surface)', padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 var(--spacing-md) 0', color: 'var(--color-primary)', fontSize: 'var(--font-size-2xl)' }}>{clusters.length}</h3>
                <p style={{ margin: 0, color: 'var(--color-text-light)' }}>Proxmox-Cluster</p>
              </div>
              <div style={{ background: 'var(--color-surface)', padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ margin: '0 0 var(--spacing-md) 0', color: 'var(--color-primary)', fontSize: 'var(--font-size-2xl)' }}>{assignments.length}</h3>
                <p style={{ margin: 0, color: 'var(--color-text-light)' }}>Zuweisungen</p>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'users' && (
          <div>
            <div className="admin-actions">
              <button className="btn-primary" onClick={() => setShowUserModal(true)}>
                + Benutzer hinzufügen
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>Lädt...</div>
            ) : users.length === 0 ? (
              <div className="empty-state">
                <h3>Noch keine Benutzer</h3>
                <p>Lege den ersten Benutzer an, um zu starten.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>E-Mail</th>
                      <th>Name</th>
                      <th>Rolle</th>
                      <th>Erstellt</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.name}</td>
                        <td><strong>{renderRole(u.role)}</strong></td>
                        <td>{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
                        <td>
                          <button
                            className="btn-danger"
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
            )}
            <div className={`modal-overlay ${showUserModal ? 'show' : ''}`}>
              <div className="modal-content">
                <div className="modal-header">
                  <h2>Neuen Benutzer hinzufügen</h2>
                  <button className="close-btn" onClick={() => setShowUserModal(false)}>✕</button>
                </div>
                <div className="form-group">
                  <label>E-Mail</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                    placeholder="Vollständiger Name"
                  />
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setShowUserModal(false)}>Abbrechen</button>
                  <button className="btn-primary" onClick={handleCreateUser}>Benutzer anlegen</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'groups' && (
          <div>
            <div className="admin-actions">
              <button className="btn-primary" onClick={() => setShowGroupModal(true)}>
                + Gruppe hinzufügen
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>Lädt...</div>
            ) : groups.length === 0 ? (
              <div className="empty-state">
                <h3>Noch keine Gruppen</h3>
              </div>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Gruppenname</th>
                      <th>Benutzer</th>
                      <th>Erstellt</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={g.id}>
                        <td>{g.name}</td>
                        <td>{g.userCount || 0}</td>
                        <td>{new Date(g.created_at).toLocaleDateString('de-DE')}</td>
                        <td>
                          <button
                            className="btn-danger"
                            onClick={() => handleDeleteGroup(g.id)}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={`modal-overlay ${showGroupModal ? 'show' : ''}`}>
              <div className="modal-content">
                <div className="modal-header">
                  <h2>Neue Gruppe hinzufügen</h2>
                  <button className="close-btn" onClick={() => setShowGroupModal(false)}>✕</button>
                </div>
                <div className="form-group">
                  <label>Gruppenname</label>
                  <input
                    type="text"
                    value={newGroup.name}
                    onChange={e => setNewGroup({...newGroup, name: e.target.value})}
                    placeholder="z. B. Team A"
                  />
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setShowGroupModal(false)}>Abbrechen</button>
                  <button className="btn-primary" onClick={handleCreateGroup}>Gruppe anlegen</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'clusters' && (
          <div>
            <div className="admin-actions">
              <button className="btn-primary" onClick={() => setShowClusterModal(true)}>
                + Cluster hinzufügen
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>Lädt...</div>
            ) : clusters.length === 0 ? (
              <div className="empty-state">
                <h3>Keine Cluster konfiguriert</h3>
                <p>Füge deinen ersten Proxmox-Cluster hinzu.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>URL</th>
                      <th>Erstellt</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusters.map(c => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td style={{ fontSize: 'var(--font-size-sm)', fontFamily: 'monospace', overflow: 'auto' }}>{c.url}</td>
                        <td>{new Date(c.created_at).toLocaleDateString('de-DE')}</td>
                        <td>
                          <button
                            className="btn-danger"
                            onClick={() => handleDeleteCluster(c.id)}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={`modal-overlay ${showClusterModal ? 'show' : ''}`}>
              <div className="modal-content">
                <div className="modal-header">
                  <h2>Proxmox-Cluster hinzufügen</h2>
                  <button className="close-btn" onClick={() => setShowClusterModal(false)}>✕</button>
                </div>
                <div className="form-group">
                  <label>Cluster-Name</label>
                  <input
                    type="text"
                    value={newCluster.name}
                    onChange={e => setNewCluster({...newCluster, name: e.target.value})}
                    placeholder="z. B. Cluster 1"
                  />
                </div>
                <div className="form-group">
                  <label>Proxmox URL</label>
                  <input
                    type="text"
                    value={newCluster.url}
                    onChange={e => setNewCluster({...newCluster, url: e.target.value})}
                    placeholder="https://proxmox.example.com:8006"
                  />
                </div>
                <div className="form-group">
                  <label>API-Token</label>
                  <textarea
                    value={newCluster.apiToken}
                    onChange={e => setNewCluster({...newCluster, apiToken: e.target.value})}
                    placeholder="user@pam!tokenid=xxxxx..."
                    style={{ minHeight: '100px' }}
                  ></textarea>
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setShowClusterModal(false)}>Abbrechen</button>
                  <button className="btn-primary" onClick={handleCreateCluster}>Cluster hinzufügen</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'assignments' && (
          <div>
            <div className="admin-actions">
              <button className="btn-primary" onClick={() => setShowAssignmentModal(true)}>
                + Zuweisung erstellen
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>Lädt...</div>
            ) : assignments.length === 0 ? (
              <div className="empty-state">
                <h3>Keine Zuweisungen</h3>
                <p>Weise Container Benutzern oder Gruppen zu.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Container-ID</th>
                      <th>Cluster</th>
                      <th>Zugewiesen an</th>
                      <th>Typ</th>
                      <th>Erstellt</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id}>
                        <td>{a.container_id}</td>
                        <td>{a.cluster_name}</td>
                        <td>{a.assigned_to_name}</td>
                        <td>{renderAssignmentType(a.assigned_to_type)}</td>
                        <td>{new Date(a.created_at).toLocaleDateString('de-DE')}</td>
                        <td>
                          <button
                            className="btn-danger"
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
            )}
            <div className={`modal-overlay ${showAssignmentModal ? 'show' : ''}`}>
              <div className="modal-content">
                <div className="modal-header">
                  <h2>Zuweisung erstellen</h2>
                  <button className="close-btn" onClick={() => setShowAssignmentModal(false)}>✕</button>
                </div>
                <div className="form-group">
                  <label>Container-ID</label>
                  <input
                    type="text"
                    value={newAssignment.containerId}
                    onChange={e => setNewAssignment({...newAssignment, containerId: e.target.value})}
                    placeholder="100"
                  />
                </div>
                <div className="form-group">
                  <label>Cluster</label>
                  <select
                    value={newAssignment.clusterId}
                    onChange={e => setNewAssignment({...newAssignment, clusterId: e.target.value})}
                  >
                    <option value="">Cluster auswählen</option>
                    {clusters.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Zuweisen an</label>
                  <select
                    value={newAssignment.assignedToType}
                    onChange={e => setNewAssignment({...newAssignment, assignedToType: e.target.value})}
                  >
                    <option value="user">Benutzer</option>
                    <option value="group">Gruppe</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{newAssignment.assignedToType === 'user' ? 'Benutzer' : 'Gruppe'}</label>
                  <select
                    value={newAssignment.assignedToId}
                    onChange={e => setNewAssignment({...newAssignment, assignedToId: e.target.value})}
                  >
                    <option value="">{newAssignment.assignedToType === 'user' ? 'Benutzer auswählen' : 'Gruppe auswählen'}</option>
                    {newAssignment.assignedToType === 'user' ? (
                      users.map(u => (
                        <option key={u.id} value={u.id}>{u.email}</option>
                      ))
                    ) : (
                      groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setShowAssignmentModal(false)}>Abbrechen</button>
                  <button className="btn-primary" onClick={handleCreateAssignment}>Zuweisung erstellen</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
