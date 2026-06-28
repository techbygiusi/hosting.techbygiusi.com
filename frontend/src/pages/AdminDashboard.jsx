import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminApi, getErrorMessage, translateMessage } from '../services/api';
import '../styles/globals.css';

const emptyUser = { email: '', name: '', password: '', role: 'user' };
const emptyCluster = { name: '', url: '', apiToken: '' };
const emptyAssignment = { containerId: '', clusterId: '', assignedToId: '' };
const emptySmtp = { smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '' };

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [clusterContainers, setClusterContainers] = useState([]);
  const [settings, setSettings] = useState(emptySmtp);
  const [newUser, setNewUser] = useState(emptyUser);
  const [newCluster, setNewCluster] = useState(emptyCluster);
  const [newAssignment, setNewAssignment] = useState(emptyAssignment);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const renderRole = (role) => role === 'admin' ? 'Administrator' : 'Benutzer';
  const adminCount = users.filter(item => item.role === 'admin').length;
  const userCount = users.filter(item => item.role === 'user').length;

  const currentClusterName = useMemo(() => {
    const cluster = clusters.find(item => String(item.id) === String(newAssignment.clusterId));
    return cluster?.name || '';
  }, [clusters, newAssignment.clusterId]);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (tab = activeTab) => {
    try {
      setLoading(true);
      setError('');

      const requests = [];
      const needsUsers = ['overview', 'users', 'assignments'].includes(tab);
      const needsClusters = ['overview', 'clusters', 'assignments'].includes(tab);
      const needsAssignments = ['overview', 'assignments'].includes(tab);
      const needsSettings = tab === 'settings';

      if (needsUsers) requests.push(adminApi.getUsers().then(res => setUsers(res.data.users || [])));
      if (needsClusters) requests.push(adminApi.getClusters().then(res => setClusters(res.data.clusters || [])));
      if (needsAssignments) requests.push(adminApi.getAssignments().then(res => setAssignments(res.data.assignments || [])));
      if (needsSettings) requests.push(loadSettings());

      await Promise.all(requests);
    } catch (err) {
      setError(getErrorMessage(err, 'Daten konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    const res = await adminApi.getSettings();
    const smtp = res.data.settings || {};
    setSettings({
      smtpHost: smtp.smtp_host || '',
      smtpPort: smtp.smtp_port || '587',
      smtpUser: smtp.smtp_user || '',
      smtpPassword: ''
    });
    setSmtpTestResult(null);
  };

  const showSuccess = (message) => {
    setSuccessMsg(message);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name || !newUser.password) {
      setError('Bitte Name, E-Mail-Adresse und Passwort eingeben.');
      return;
    }
    if (newUser.password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      await adminApi.createUser(newUser);
      setNewUser(emptyUser);
      setShowUserModal(false);
      showSuccess('Benutzer erfolgreich angelegt.');
      await loadData('users');
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht angelegt werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Diesen Benutzer wirklich löschen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteUser(userId);
      showSuccess('Benutzer erfolgreich gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCluster = async (e) => {
    e.preventDefault();
    if (!newCluster.name || !newCluster.url || !newCluster.apiToken) {
      setError('Bitte Cluster-Name, URL und API-Token eingeben.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      await adminApi.createCluster(newCluster);
      setNewCluster(emptyCluster);
      setShowClusterModal(false);
      showSuccess('Proxmox-Cluster erfolgreich gespeichert.');
      await loadData('clusters');
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht hinzugefügt werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCluster = async (clusterId) => {
    if (!window.confirm('Diesen Cluster wirklich löschen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteCluster(clusterId);
      showSuccess('Cluster erfolgreich gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoadClusterContainers = async () => {
    if (!newAssignment.clusterId) {
      setError('Bitte zuerst einen Cluster auswählen.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const res = await adminApi.getClusterContainers(newAssignment.clusterId);
      setClusterContainers(res.data.containers || []);
      if (!res.data.containers?.length) {
        showSuccess('Der Cluster hat keine Container oder VMs zurückgegeben.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Container konnten nicht geladen werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignment.containerId || !newAssignment.clusterId || !newAssignment.assignedToId) {
      setError('Bitte Cluster, Container/VM und Benutzer auswählen.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      await adminApi.createAssignment(newAssignment);
      setNewAssignment(emptyAssignment);
      setClusterContainers([]);
      setShowAssignmentModal(false);
      showSuccess('Zuweisung erfolgreich angelegt.');
      await loadData('assignments');
    } catch (err) {
      setError(getErrorMessage(err, 'Zuweisung konnte nicht angelegt werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Diese Zuweisung wirklich löschen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteAssignment(assignmentId);
      showSuccess('Zuweisung erfolgreich gelöscht.');
      await loadData('assignments');
    } catch (err) {
      setError(getErrorMessage(err, 'Zuweisung konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
    setSmtpTestResult(null);
    setError('');
  };

  const handleTestSmtp = async () => {
    if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPassword) {
      setError('Für den SMTP-Test bitte auch das SMTP-Passwort eingeben.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const res = await adminApi.testSmtp(settings);
      setSmtpTestResult(res.data);
    } catch (err) {
      setSmtpTestResult({ success: false, message: getErrorMessage(err, 'SMTP-Test fehlgeschlagen.') });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser) {
      setError('Bitte SMTP-Host, Port und Benutzer eingeben.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      await adminApi.updateSettings(settings);
      setSettings(prev => ({ ...prev, smtpPassword: '' }));
      showSuccess('SMTP-Einstellungen erfolgreich gespeichert.');
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP-Einstellungen konnten nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="app-page">
      <header className="app-topbar">
        <div>
          <p className="eyebrow">Hosting Portal</p>
          <h1>Administration</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user?.name || user?.email}</span>
          <button type="button" className="btn-secondary" onClick={logout}>Abmelden</button>
        </div>
      </header>

      <main className="app-container">
        <nav className="app-tabs" aria-label="Administration">
          <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Übersicht</button>
          <button type="button" className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>Benutzer</button>
          <button type="button" className={activeTab === 'clusters' ? 'active' : ''} onClick={() => setActiveTab('clusters')}>Proxmox</button>
          <button type="button" className={activeTab === 'assignments' ? 'active' : ''} onClick={() => setActiveTab('assignments')}>Zuweisungen</button>
          <button type="button" className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>Einstellungen</button>
        </nav>

        {error && <div className="alert alert-danger">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}
        {loading && <div className="loading"><span className="spinner"></span><span>Lädt...</span></div>}

        {!loading && activeTab === 'overview' && (
          <section className="dashboard-grid">
            <article className="metric-card">
              <span>Benutzer</span>
              <strong>{users.length}</strong>
              <small>{adminCount} Administratoren · {userCount} Benutzer</small>
            </article>
            <article className="metric-card">
              <span>Proxmox-Cluster</span>
              <strong>{clusters.length}</strong>
              <small>Gespeicherte API-Verbindungen</small>
            </article>
            <article className="metric-card">
              <span>Zuweisungen</span>
              <strong>{assignments.length}</strong>
              <small>Direkte Benutzerzuweisungen</small>
            </article>
          </section>
        )}

        {!loading && activeTab === 'users' && (
          <section className="panel-card">
            <div className="panel-header">
              <div>
                <h2>Benutzer</h2>
                <p>Lege Benutzer mit festem Startpasswort und Rolle an.</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setShowUserModal(true)}>Benutzer anlegen</button>
            </div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Aktion</th></tr>
                </thead>
                <tbody>
                  {users.map(item => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td><span className="badge">{renderRole(item.role)}</span></td>
                      <td><button type="button" className="btn-danger btn-small" onClick={() => handleDeleteUser(item.id)} disabled={actionLoading || item.id === user?.id}>Löschen</button></td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan="4" className="empty-cell">Keine Benutzer vorhanden.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && activeTab === 'clusters' && (
          <section className="panel-card">
            <div className="panel-header">
              <div>
                <h2>Proxmox</h2>
                <p>Verwalte die API-Verbindungen zu deinen Clustern.</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setShowClusterModal(true)}>Cluster hinzufügen</button>
            </div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr><th>Name</th><th>URL</th><th>Aktion</th></tr>
                </thead>
                <tbody>
                  {clusters.map(item => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.url}</td>
                      <td><button type="button" className="btn-danger btn-small" onClick={() => handleDeleteCluster(item.id)} disabled={actionLoading}>Löschen</button></td>
                    </tr>
                  ))}
                  {clusters.length === 0 && <tr><td colSpan="3" className="empty-cell">Kein Cluster gespeichert.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && activeTab === 'assignments' && (
          <section className="panel-card">
            <div className="panel-header">
              <div>
                <h2>Zuweisungen</h2>
                <p>Weise Container oder VMs direkt einem Benutzer zu.</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setShowAssignmentModal(true)}>Zuweisung anlegen</button>
            </div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr><th>Container/VM</th><th>Cluster</th><th>Benutzer</th><th>Aktion</th></tr>
                </thead>
                <tbody>
                  {assignments.map(item => (
                    <tr key={item.id}>
                      <td>{item.container_id}</td>
                      <td>{item.cluster_name}</td>
                      <td>{item.assigned_user_name ? `${item.assigned_user_name} (${item.assigned_to_name})` : item.assigned_to_name}</td>
                      <td><button type="button" className="btn-danger btn-small" onClick={() => handleDeleteAssignment(item.id)} disabled={actionLoading}>Löschen</button></td>
                    </tr>
                  ))}
                  {assignments.length === 0 && <tr><td colSpan="4" className="empty-cell">Keine Zuweisungen vorhanden.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && activeTab === 'settings' && (
          <section className="panel-card settings-card">
            <div className="panel-header">
              <div>
                <h2>Einstellungen</h2>
                <p>Ändere SMTP-Daten auch nach der Erstkonfiguration.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={handleSaveSettings}>
              <label className="form-group">
                <span>SMTP-Host</span>
                <input type="text" name="smtpHost" value={settings.smtpHost} onChange={handleSettingsChange} placeholder="smtp.example.com" />
              </label>
              <label className="form-group">
                <span>SMTP-Port</span>
                <input type="text" name="smtpPort" value={settings.smtpPort} onChange={handleSettingsChange} placeholder="587" />
              </label>
              <label className="form-group">
                <span>SMTP-Benutzer</span>
                <input type="email" name="smtpUser" value={settings.smtpUser} onChange={handleSettingsChange} placeholder="noreply@example.com" />
              </label>
              <label className="form-group">
                <span>SMTP-Passwort</span>
                <input type="password" name="smtpPassword" value={settings.smtpPassword} onChange={handleSettingsChange} placeholder="Leer lassen, um es nicht zu ändern" />
              </label>
              <div className="form-actions full-width">
                <button type="button" className="btn-secondary" onClick={handleTestSmtp} disabled={actionLoading}>SMTP testen</button>
                <button type="submit" className="btn-primary" disabled={actionLoading}>SMTP speichern</button>
              </div>
            </form>
            {smtpTestResult && <div className={`test-result ${smtpTestResult.success ? 'success' : 'error'}`}>{translateMessage(smtpTestResult.message)}</div>}
          </section>
        )}
      </main>

      {showUserModal && (
        <Modal title="Benutzer anlegen" onClose={() => setShowUserModal(false)}>
          <form className="form-stack" onSubmit={handleCreateUser}>
            <label className="form-group"><span>Name</span><input type="text" value={newUser.name} onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))} placeholder="Max Mustermann" /></label>
            <label className="form-group"><span>E-Mail-Adresse</span><input type="email" value={newUser.email} onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))} placeholder="max@example.com" /></label>
            <label className="form-group"><span>Startpasswort</span><input type="text" value={newUser.password} onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))} placeholder="Passwort für den Benutzer" /></label>
            <label className="form-group"><span>Rolle</span><select value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}><option value="user">Benutzer</option><option value="admin">Administrator</option></select></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setShowUserModal(false)}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Anlegen</button></div>
          </form>
        </Modal>
      )}

      {showClusterModal && (
        <Modal title="Proxmox-Cluster hinzufügen" onClose={() => setShowClusterModal(false)}>
          <form className="form-stack" onSubmit={handleCreateCluster}>
            <label className="form-group"><span>Name</span><input type="text" value={newCluster.name} onChange={e => setNewCluster(prev => ({ ...prev, name: e.target.value }))} placeholder="Home Lab" /></label>
            <label className="form-group"><span>URL</span><input type="text" value={newCluster.url} onChange={e => setNewCluster(prev => ({ ...prev, url: e.target.value }))} placeholder="https://10.10.0.10:8006" /></label>
            <label className="form-group"><span>API-Token</span><input type="password" value={newCluster.apiToken} onChange={e => setNewCluster(prev => ({ ...prev, apiToken: e.target.value }))} placeholder="user@pam!tokenid=secret" /></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setShowClusterModal(false)}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Speichern</button></div>
          </form>
        </Modal>
      )}

      {showAssignmentModal && (
        <Modal title="Zuweisung anlegen" onClose={() => setShowAssignmentModal(false)}>
          <form className="form-stack" onSubmit={handleCreateAssignment}>
            <label className="form-group"><span>Cluster</span><select value={newAssignment.clusterId} onChange={e => { setNewAssignment(prev => ({ ...prev, clusterId: e.target.value, containerId: '' })); setClusterContainers([]); }}><option value="">Bitte auswählen</option>{clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" className="btn-secondary" onClick={handleLoadClusterContainers} disabled={actionLoading || !newAssignment.clusterId}>{currentClusterName ? `Container von ${currentClusterName} laden` : 'Container laden'}</button>
            <label className="form-group"><span>Container/VM</span>{clusterContainers.length > 0 ? <select value={newAssignment.containerId} onChange={e => setNewAssignment(prev => ({ ...prev, containerId: e.target.value }))}><option value="">Bitte auswählen</option>{clusterContainers.map(item => <option key={`${item.type}-${item.vmid}`} value={item.vmid}>{item.vmid} · {item.name || item.type} · {item.status}</option>)}</select> : <input type="text" value={newAssignment.containerId} onChange={e => setNewAssignment(prev => ({ ...prev, containerId: e.target.value }))} placeholder="VMID oder CTID" />}</label>
            <label className="form-group"><span>Benutzer</span><select value={newAssignment.assignedToId} onChange={e => setNewAssignment(prev => ({ ...prev, assignedToId: e.target.value }))}><option value="">Bitte auswählen</option>{users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setShowAssignmentModal(false)}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Zuweisen</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay active" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
