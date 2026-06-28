import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi, adminApi, getErrorMessage, translateMessage } from '../services/api';
import '../styles/globals.css';
import ThemeButton from '../components/ThemeButton';

function LogoutIcon() {
  return (
    <svg className="logout-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 6H5v12h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </svg>
  );
}

const emptyUser = { email: '', name: '', password: '', role: 'user' };
const emptyCluster = { name: '', url: '', apiToken: '' };
const emptyResource = { name: '', containerId: '', clusterId: '', userId: '', publicUrl: '', adminUrl: '' };
const emptySmtp = { smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '' };

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [resources, setResources] = useState([]);
  const [clusterContainers, setClusterContainers] = useState([]);
  const [settings, setSettings] = useState(emptySmtp);
  const [newUser, setNewUser] = useState(emptyUser);
  const [newCluster, setNewCluster] = useState(emptyCluster);
  const [newResource, setNewResource] = useState(emptyResource);
  const [editUserId, setEditUserId] = useState(null);
  const [editClusterId, setEditClusterId] = useState(null);
  const [editResourceId, setEditResourceId] = useState(null);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [clusterTestResult, setClusterTestResult] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSetupCheckModal, setShowSetupCheckModal] = useState(false);
  const [setupCheck, setSetupCheck] = useState(null);
  const [setupCheckLoading, setSetupCheckLoading] = useState(false);
  const [selectedSetupClusterId, setSelectedSetupClusterId] = useState('');
  const [setupClusterTestResult, setSetupClusterTestResult] = useState(null);
  const [setupSmtpTestResult, setSetupSmtpTestResult] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const tabs = [
    ['overview', 'Übersicht'],
    ['users', 'Benutzer'],
    ['clusters', 'Proxmox'],
    ['resources', 'Ressourcen'],
    ['settings', 'Einstellungen']
  ];

  const adminCount = users.filter(item => item.role === 'admin').length;
  const userCount = users.filter(item => item.role === 'user').length;
  const onlineCount = resources.filter(item => item.status === 'running').length;
  const currentClusterName = useMemo(() => {
    const cluster = clusters.find(item => String(item.id) === String(newResource.clusterId));
    return cluster?.name || '';
  }, [clusters, newResource.clusterId]);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (tab = activeTab) => {
    try {
      setLoading(true);
      setError('');

      const requests = [];
      const needsUsers = ['overview', 'users', 'resources'].includes(tab);
      const needsClusters = ['overview', 'clusters', 'resources'].includes(tab);
      const needsResources = ['overview', 'resources'].includes(tab);
      const needsSettings = tab === 'settings';

      if (needsUsers) requests.push(adminApi.getUsers().then(res => setUsers(res.data.users || [])));
      if (needsClusters) requests.push(adminApi.getClusters().then(res => setClusters(res.data.clusters || [])));
      if (needsResources) requests.push(adminApi.getResources().then(res => setResources(res.data.resources || [])));
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
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const openCreateUser = () => {
    setEditUserId(null);
    setNewUser(emptyUser);
    setShowUserModal(true);
  };

  const openEditUser = (item) => {
    setEditUserId(item.id);
    setNewUser({ email: item.email || '', name: item.name || '', password: '', role: item.role || 'user' });
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditUserId(null);
    setNewUser(emptyUser);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name) {
      setError('Bitte Name und E-Mail-Adresse eingeben.');
      return;
    }
    if (!editUserId && !newUser.password) {
      setError('Bitte ein Startpasswort eingeben.');
      return;
    }
    if (newUser.password && newUser.password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      if (editUserId) {
        const payload = { email: newUser.email, name: newUser.name, role: newUser.role };
        if (newUser.password) payload.password = newUser.password;
        await adminApi.updateUser(editUserId, payload);
        showSuccess('Benutzer wurde gespeichert.');
      } else {
        await adminApi.createUser(newUser);
        showSuccess('Benutzer wurde angelegt.');
      }
      closeUserModal();
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Diesen Benutzer löschen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteUser(userId);
      showSuccess('Benutzer wurde gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const openCreateCluster = () => {
    setEditClusterId(null);
    setNewCluster(emptyCluster);
    setClusterTestResult(null);
    setShowClusterModal(true);
  };

  const openEditCluster = (item) => {
    setEditClusterId(item.id);
    setNewCluster({ name: item.name || '', url: item.url || '', apiToken: '' });
    setClusterTestResult(null);
    setShowClusterModal(true);
  };

  const closeClusterModal = () => {
    setShowClusterModal(false);
    setEditClusterId(null);
    setNewCluster(emptyCluster);
    setClusterTestResult(null);
  };

  const handleClusterChange = (field, value) => {
    setNewCluster(prev => ({ ...prev, [field]: value }));
    setClusterTestResult(null);
    setError('');
  };

  const handleTestCluster = async () => {
    if (!newCluster.url || (!newCluster.apiToken && !editClusterId)) {
      setClusterTestResult({ success: false, message: 'Bitte URL und API-Token eingeben.' });
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const res = await adminApi.testProxmox({ ...newCluster, clusterId: editClusterId || undefined });
      setClusterTestResult(res.data);
    } catch (err) {
      setClusterTestResult({ success: false, message: getErrorMessage(err, 'Proxmox-Test fehlgeschlagen.') });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCluster = async (e) => {
    e.preventDefault();
    if (!newCluster.name || !newCluster.url || (!newCluster.apiToken && !editClusterId)) {
      setError('Bitte Cluster-Name, URL und API-Token eingeben.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      if (editClusterId) {
        await adminApi.updateCluster(editClusterId, newCluster);
        showSuccess('Proxmox-Cluster wurde gespeichert.');
      } else {
        await adminApi.createCluster(newCluster);
        showSuccess('Proxmox-Cluster wurde angelegt.');
      }
      closeClusterModal();
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCluster = async (clusterId) => {
    if (!window.confirm('Diesen Cluster löschen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteCluster(clusterId);
      showSuccess('Cluster wurde gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const openCreateResource = () => {
    setEditResourceId(null);
    setNewResource(emptyResource);
    setClusterContainers([]);
    setShowResourceModal(true);
  };

  const openEditResource = (item) => {
    setEditResourceId(item.id);
    setNewResource({
      name: item.name || '',
      containerId: item.containerId || '',
      clusterId: item.clusterId || '',
      userId: item.userId || '',
      publicUrl: item.publicUrl || item.webUrl || '',
      adminUrl: item.adminUrl || ''
    });
    setClusterContainers([]);
    setShowResourceModal(true);
  };

  const closeResourceModal = () => {
    setShowResourceModal(false);
    setEditResourceId(null);
    setNewResource(emptyResource);
    setClusterContainers([]);
  };

  const handleLoadClusterContainers = async () => {
    if (!newResource.clusterId) {
      setError('Bitte zuerst einen Cluster auswählen.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const res = await adminApi.getClusterContainers(newResource.clusterId);
      setClusterContainers(res.data.containers || []);
      if (!res.data.containers?.length) {
        showSuccess('Keine Container oder VMs gefunden.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Ressourcen konnten nicht geladen werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResourceContainerChange = (containerId) => {
    const selected = clusterContainers.find(item => String(item.vmid) === String(containerId));
    setNewResource(prev => ({
      ...prev,
      containerId,
      name: prev.name || selected?.name || ''
    }));
  };

  const handleSaveResource = async (e) => {
    e.preventDefault();
    if (!newResource.clusterId || !newResource.containerId || !newResource.userId) {
      setError('Bitte Cluster, Ressource und Benutzer auswählen.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      if (editResourceId) {
        await adminApi.updateResource(editResourceId, newResource);
        showSuccess('Ressource wurde gespeichert.');
      } else {
        await adminApi.createResource(newResource);
        showSuccess('Ressource wurde angelegt.');
      }
      closeResourceModal();
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Ressource konnte nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!window.confirm('Diese Ressource löschen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteResource(resourceId);
      showSuccess('Ressource wurde gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Ressource konnte nicht gelöscht werden.'));
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
    try {
      setActionLoading(true);
      setError('');
      await adminApi.updateSettings(settings);
      setSettings(prev => ({ ...prev, smtpPassword: '' }));
      showSuccess('SMTP wurde gespeichert.');
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP konnte nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const openSetupCheck = async () => {
    setShowSetupCheckModal(true);
    setSetupCheckLoading(true);
    setSetupClusterTestResult(null);
    setSetupSmtpTestResult(null);
    setError('');

    try {
      const [stateRes, usersRes, clustersRes, settingsRes] = await Promise.all([
        authApi.setupRequired(),
        adminApi.getUsers(),
        adminApi.getClusters(),
        adminApi.getSettings()
      ]);

      const loadedUsers = usersRes.data.users || [];
      const loadedClusters = clustersRes.data.clusters || [];
      const loadedSettings = settingsRes.data.settings || {};

      setUsers(loadedUsers);
      setClusters(loadedClusters);
      setSettings({
        smtpHost: loadedSettings.smtp_host || '',
        smtpPort: loadedSettings.smtp_port || '587',
        smtpUser: loadedSettings.smtp_user || '',
        smtpPassword: ''
      });
      setSetupCheck({
        ...(stateRes.data || {}),
        users: loadedUsers,
        clusters: loadedClusters,
        settings: loadedSettings
      });
      setSelectedSetupClusterId(loadedClusters[0]?.id ? String(loadedClusters[0].id) : '');
    } catch (err) {
      setSetupCheck({ error: getErrorMessage(err, 'Einrichtung konnte nicht geprüft werden.') });
    } finally {
      setSetupCheckLoading(false);
    }
  };

  const closeSetupCheck = () => {
    setShowSetupCheckModal(false);
    setSetupCheck(null);
    setSelectedSetupClusterId('');
    setSetupClusterTestResult(null);
    setSetupSmtpTestResult(null);
  };

  const handleTestSetupCluster = async () => {
    if (!selectedSetupClusterId) {
      setSetupClusterTestResult({ success: false, message: 'Bitte Cluster auswählen.' });
      return;
    }

    try {
      setActionLoading(true);
      setSetupClusterTestResult(null);
      const res = await adminApi.testProxmox({ clusterId: selectedSetupClusterId });
      setSetupClusterTestResult(res.data);
    } catch (err) {
      setSetupClusterTestResult({ success: false, message: getErrorMessage(err, 'Proxmox-Test fehlgeschlagen.') });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestSetupSmtp = async () => {
    try {
      setActionLoading(true);
      setSetupSmtpTestResult(null);
      const res = await adminApi.testSmtp({});
      setSetupSmtpTestResult(res.data);
    } catch (err) {
      setSetupSmtpTestResult({ success: false, message: getErrorMessage(err, 'SMTP-Test fehlgeschlagen.') });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="app-page">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-brand"><h1>Hosting by TechByGiusi</h1></div>
          <div className="site-actions"><ThemeButton /><button type="button" className="btn-secondary logout-button" onClick={logout} aria-label="Abmelden"><LogoutIcon /><span className="logout-label">Abmelden</span></button></div>
        </div>
      </header>

      <main className="app-container compact-container">
        {error && <div className="alert alert-danger">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        <nav className="app-tabs" aria-label="Admin-Bereiche">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>{label}</button>
          ))}
        </nav>

        {loading && <div className="loading"><span className="spinner"></span><span>Daten werden geladen...</span></div>}

        {!loading && activeTab === 'overview' && (
          <section className="dashboard-grid">
            <MetricCard label="Benutzer" value={userCount} onClick={() => setActiveTab('users')} />
            <MetricCard label="Administratoren" value={adminCount} onClick={() => setActiveTab('users')} />
            <MetricCard label="Cluster" value={clusters.length} onClick={() => setActiveTab('clusters')} />
            <MetricCard label="Ressourcen" value={resources.length} onClick={() => setActiveTab('resources')} />
            <MetricCard label="Online" value={onlineCount} onClick={() => setActiveTab('resources')} />
          </section>
        )}

        {!loading && activeTab === 'users' && (
          <section className="panel-card">
            <PanelHeader title="Benutzer" action="Benutzer anlegen" onAction={openCreateUser} />
            {users.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Benutzer</h2></div>
            ) : (
              <div className="list-grid">
                {users.map(item => (
                  <article key={item.id} className="list-card">
                    <div><span className="resource-id">{item.role === 'admin' ? 'Administrator' : 'Benutzer'}</span><h2>{item.name}</h2><p>{item.email}</p></div>
                    <div className="card-actions"><button type="button" className="btn-secondary btn-small" onClick={() => openEditUser(item)}>Bearbeiten</button><button type="button" className="btn-danger btn-small" onClick={() => handleDeleteUser(item.id)} disabled={actionLoading || item.id === user?.id}>Löschen</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'clusters' && (
          <section className="panel-card">
            <PanelHeader title="Proxmox" action="Cluster hinzufügen" onAction={openCreateCluster} />
            {clusters.length === 0 ? (
              <div className="empty-state soft-box"><h2>Kein Cluster</h2></div>
            ) : (
              <div className="list-grid">
                {clusters.map(item => (
                  <article key={item.id} className="list-card">
                    <div><span className="resource-id">Proxmox</span><h2>{item.name}</h2><p>{item.url}</p></div>
                    <div className="card-actions"><button type="button" className="btn-secondary btn-small" onClick={() => openEditCluster(item)}>Bearbeiten</button><button type="button" className="btn-danger btn-small" onClick={() => handleDeleteCluster(item.id)} disabled={actionLoading}>Löschen</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'resources' && (
          <section className="panel-card">
            <PanelHeader title="Ressourcen" action="Ressource anlegen" onAction={openCreateResource} />
            {resources.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Ressourcen</h2></div>
            ) : (
              <div className="resource-grid admin-resource-grid">
                {resources.map(item => <ResourceCard key={item.id} resource={item} onEdit={openEditResource} onDelete={handleDeleteResource} actionLoading={actionLoading} />)}
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'settings' && (
          <section className="panel-card settings-card">
            <PanelHeader title="Einstellungen" />
            <div className="settings-action-row">
              <button type="button" className="btn-secondary" onClick={openSetupCheck}>Einrichtung prüfen</button>
            </div>
            <form className="form-grid" onSubmit={handleSaveSettings}>
              <label className="form-group"><span>SMTP-Host</span><input type="text" name="smtpHost" value={settings.smtpHost} onChange={handleSettingsChange} placeholder="smtp.example.com" /></label>
              <label className="form-group"><span>SMTP-Port</span><input type="text" name="smtpPort" value={settings.smtpPort} onChange={handleSettingsChange} placeholder="587" /></label>
              <label className="form-group"><span>SMTP-Benutzer</span><input type="email" name="smtpUser" value={settings.smtpUser} onChange={handleSettingsChange} placeholder="noreply@example.com" /></label>
              <label className="form-group"><span>SMTP-Passwort</span><input type="password" name="smtpPassword" value={settings.smtpPassword} onChange={handleSettingsChange} placeholder="Leer lassen, vorhandenes Passwort verwenden" /></label>
              <div className="form-actions full-width"><button type="button" className="btn-secondary" onClick={handleTestSmtp} disabled={actionLoading}>SMTP testen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Speichern</button></div>
            </form>
            {smtpTestResult && <div className={`test-result ${smtpTestResult.success ? 'success' : 'error'}`}>{translateMessage(smtpTestResult.message)}</div>}
          </section>
        )}
      </main>

      {showSetupCheckModal && (
        <Modal title="Einrichtung prüfen" onClose={closeSetupCheck}>
          {setupCheckLoading ? (
            <div className="loading inline-loading"><span className="spinner"></span><span>Prüfung läuft...</span></div>
          ) : setupCheck?.error ? (
            <div className="alert alert-danger">{setupCheck.error}</div>
          ) : (
            <div className="setup-check-grid">
              <SetupCheckRow label="Administrator" ok={setupCheck?.adminConfigured} detail={setupCheck?.adminUser?.email || `${(setupCheck?.users || []).filter(item => item.role === 'admin').length} Administrator`} />
              <SetupCheckRow label="Proxmox" ok={setupCheck?.proxmoxConfigured} detail={`${setupCheck?.clusters?.length || 0} Cluster`} />
              <SetupCheckRow label="SMTP" ok={setupCheck?.smtpConfigured} detail={setupCheck?.settings?.smtp_user || 'Nicht hinterlegt'} />

              <div className="setup-check-test">
                <h3>Proxmox</h3>
                <div className="setup-check-actions">
                  <select value={selectedSetupClusterId} onChange={e => { setSelectedSetupClusterId(e.target.value); setSetupClusterTestResult(null); }}>
                    <option value="">Cluster auswählen</option>
                    {(setupCheck?.clusters || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <button type="button" className="btn-secondary" onClick={handleTestSetupCluster} disabled={actionLoading || !selectedSetupClusterId}>Testen</button>
                </div>
                {setupClusterTestResult && <div className={`test-result ${setupClusterTestResult.success ? 'success' : 'error'}`}>{translateMessage(setupClusterTestResult.message)}</div>}
              </div>

              <div className="setup-check-test">
                <h3>SMTP</h3>
                <button type="button" className="btn-secondary" onClick={handleTestSetupSmtp} disabled={actionLoading}>SMTP testen</button>
                {setupSmtpTestResult && <div className={`test-result ${setupSmtpTestResult.success ? 'success' : 'error'}`}>{translateMessage(setupSmtpTestResult.message)}</div>}
              </div>

              {setupCheck?.setupRequired && (
                <button type="button" className="btn-primary full-button" onClick={() => { window.location.href = '/setup'; }}>Setup öffnen</button>
              )}
            </div>
          )}
          <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeSetupCheck}>Schließen</button></div>
        </Modal>
      )}

      {showUserModal && (
        <Modal title={editUserId ? 'Benutzer bearbeiten' : 'Benutzer anlegen'} onClose={closeUserModal}>
          <form className="form-stack" onSubmit={handleSaveUser}>
            <label className="form-group"><span>Name</span><input type="text" value={newUser.name} onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))} placeholder="Max Mustermann" /></label>
            <label className="form-group"><span>E-Mail-Adresse</span><input type="email" value={newUser.email} onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))} placeholder="max@example.com" /></label>
            <label className="form-group"><span>{editUserId ? 'Neues Passwort' : 'Startpasswort'}</span><input type="text" value={newUser.password} onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))} placeholder={editUserId ? 'Leer lassen, wenn unverändert' : 'Passwort für den Benutzer'} /></label>
            <label className="form-group"><span>Rolle</span><select value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}><option value="user">Benutzer</option><option value="admin">Administrator</option></select></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeUserModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>{editUserId ? 'Speichern' : 'Anlegen'}</button></div>
          </form>
        </Modal>
      )}

      {showClusterModal && (
        <Modal title={editClusterId ? 'Proxmox bearbeiten' : 'Proxmox hinzufügen'} onClose={closeClusterModal}>
          <form className="form-stack" onSubmit={handleSaveCluster}>
            <label className="form-group"><span>Name</span><input type="text" value={newCluster.name} onChange={e => handleClusterChange('name', e.target.value)} placeholder="Home Lab" /></label>
            <label className="form-group"><span>URL</span><input type="text" value={newCluster.url} onChange={e => handleClusterChange('url', e.target.value)} placeholder="https://10.10.0.10:8006" /></label>
            <label className="form-group"><span>API-Token</span><input type="password" value={newCluster.apiToken} onChange={e => handleClusterChange('apiToken', e.target.value)} placeholder={editClusterId ? 'Leer lassen, vorhandenen Token verwenden' : 'api@pam!hosting=secret'} /></label>
            <button type="button" className="btn-secondary full-button" onClick={handleTestCluster} disabled={actionLoading}>Proxmox-Verbindung testen</button>
            {clusterTestResult && <div className={`test-result ${clusterTestResult.success ? 'success' : 'error'}`}>{translateMessage(clusterTestResult.message)}</div>}
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeClusterModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Speichern</button></div>
          </form>
        </Modal>
      )}

      {showResourceModal && (
        <Modal title={editResourceId ? 'Ressource bearbeiten' : 'Ressource anlegen'} onClose={closeResourceModal}>
          <form className="form-stack" onSubmit={handleSaveResource}>
            <label className="form-group"><span>Cluster</span><select value={newResource.clusterId} onChange={e => { setNewResource(prev => ({ ...prev, clusterId: e.target.value, containerId: '', name: editResourceId ? prev.name : '' })); setClusterContainers([]); }}><option value="">Bitte auswählen</option>{clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" className="btn-secondary" onClick={handleLoadClusterContainers} disabled={actionLoading || !newResource.clusterId}>{currentClusterName ? `Ressourcen von ${currentClusterName} laden` : 'Ressourcen laden'}</button>
            <label className="form-group"><span>Container oder VM</span>{clusterContainers.length > 0 ? <select value={newResource.containerId} onChange={e => handleResourceContainerChange(e.target.value)}><option value="">Bitte auswählen</option>{clusterContainers.map(item => <option key={`${item.type}-${item.vmid}`} value={item.vmid}>{item.vmid} · {item.name || item.type} · {renderType(item.type)} · {renderStatus(item.status)}</option>)}</select> : <input type="text" value={newResource.containerId} onChange={e => setNewResource(prev => ({ ...prev, containerId: e.target.value }))} placeholder="VMID oder CTID" />}</label>
            <label className="form-group"><span>Anzeigename</span><input type="text" value={newResource.name} onChange={e => setNewResource(prev => ({ ...prev, name: e.target.value }))} placeholder="Optional" /></label>
            <label className="form-group"><span>Benutzer</span><select value={newResource.userId} onChange={e => setNewResource(prev => ({ ...prev, userId: e.target.value }))}><option value="">Bitte auswählen</option>{users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>
            <label className="form-group"><span>Öffentliche Seite</span><input type="url" value={newResource.publicUrl} onChange={e => setNewResource(prev => ({ ...prev, publicUrl: e.target.value }))} placeholder="https://app.example.com" /></label>
            <label className="form-group"><span>Verwaltungsseite</span><input type="url" value={newResource.adminUrl} onChange={e => setNewResource(prev => ({ ...prev, adminUrl: e.target.value }))} placeholder="https://admin.example.com" /></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeResourceModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>{editResourceId ? 'Speichern' : 'Anlegen'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PanelHeader({ title, action, onAction }) {
  return <div className="panel-header"><h2>{title}</h2>{action && <button type="button" className="btn-primary" onClick={onAction}>{action}</button>}</div>;
}

function MetricCard({ label, value, onClick }) {
  return <button type="button" className="metric-card metric-link-card" onClick={onClick}><span>{label}</span><div className="metric-value">{value}</div></button>;
}

function SetupCheckRow({ label, ok, detail }) {
  return (
    <div className="setup-check-row">
      <div>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
      <strong className={ok ? 'setup-ok' : 'setup-missing'}>{ok ? 'OK' : 'Fehlt'}</strong>
    </div>
  );
}

function ResourceCard({ resource, onEdit, onDelete, actionLoading }) {
  const cpuPercent = getCpuPercent(resource);
  const memPercent = getPercent(resource.mem, resource.maxmem);

  return (
    <article className="resource-card">
      <div className="resource-card-header">
        <div><span className="resource-id">{renderType(resource.type)} · {resource.containerId}</span><h2>{resource.name}</h2></div>
        <span className={`status-badge status-${resource.status || 'unknown'}`}>{renderStatus(resource.status)}</span>
      </div>
      <div className="resource-meta">
        <span>Benutzer</span><span>{resource.userName || resource.userEmail || 'Nicht gesetzt'}</span>
        <span>Cluster</span><span>{resource.clusterName}</span>
        <span>Node</span><span>{resource.node || 'Unbekannt'}</span>
      </div>
      <Metric label="CPU" percent={cpuPercent} detail={`${cpuPercent.toFixed(1)} %`} />
      <Metric label="RAM" percent={memPercent} detail={`${formatBytes(resource.mem)} / ${formatBytes(resource.maxmem)}`} />
      <DiskDetails resource={resource} />
      <div className="button-stack">
        {resource.publicUrl && <a className="btn-secondary full-button" href={resource.publicUrl} target="_blank" rel="noreferrer">Öffentliche Seite</a>}
        {resource.adminUrl && <a className="btn-secondary full-button" href={resource.adminUrl} target="_blank" rel="noreferrer">Verwaltungsseite</a>}
        <button type="button" className="btn-secondary full-button" onClick={() => onEdit(resource)}>Bearbeiten</button>
        <button type="button" className="btn-danger full-button" onClick={() => onDelete(resource.id)} disabled={actionLoading}>Entfernen</button>
      </div>
      {resource.monitorError && <p className="hint-text">Monitoring nicht erreichbar.</p>}
    </article>
  );
}

function DiskDetails({ resource }) {
  const filesystems = Array.isArray(resource.filesystems) ? resource.filesystems : [];
  const disks = Array.isArray(resource.disks) ? resource.disks : [];

  if (filesystems.length > 0 || disks.length > 0) {
    return (
      <div className="disk-details">
        {filesystems.length > 0 && <span className="disk-section-title">Dateisysteme</span>}
        {filesystems.map((disk) => <DiskMetric key={`fs-${disk.id || disk.name}`} disk={disk} />)}
        {disks.length > 0 && <span className="disk-section-title">Datenträger</span>}
        {disks.map((disk) => <DiskMetric key={`disk-${disk.id || disk.name}`} disk={disk} />)}
      </div>
    );
  }

  const diskPercent = getPercent(resource.disk, resource.maxdisk);
  return <Metric label="Datenträger" percent={diskPercent} detail={`${formatBytes(resource.disk)} / ${formatBytes(resource.maxdisk)}`} />;
}

function DiskMetric({ disk }) {
  const hasUsed = disk.used !== null && disk.used !== undefined && Number.isFinite(Number(disk.used));
  const maxdisk = Number(disk.maxdisk || 0);
  const percent = hasUsed && maxdisk ? getPercent(disk.used, maxdisk) : 0;
  const title = disk.name || disk.id || 'Disk';
  const subtitle = [disk.storage, disk.volume].filter(Boolean).join(' · ');
  const detail = hasUsed && maxdisk ? `${formatBytes(disk.used)} / ${formatBytes(maxdisk)}` : maxdisk ? `Größe ${formatBytes(maxdisk)}` : 'Größe nicht gemeldet';

  return (
    <div className="disk-row">
      <div className="disk-row-header"><span>{title}</span><small>{hasUsed ? `${percent.toFixed(1)}%` : 'Belegung nicht gemeldet'}</small></div>
      {hasUsed && <div className="progress-bar"><span style={{ width: `${percent}%` }}></span></div>}
      <small>{detail}</small>
      {subtitle && <small className="disk-source">{subtitle}</small>}
    </div>
  );
}

function Metric({ label, percent, detail }) {
  const safePercent = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return <div className="metric-line"><div><span>{label}</span><span>{safePercent.toFixed(1)}%</span></div><div className="progress-bar"><span style={{ width: `${safePercent}%` }}></span></div><small>{detail}</small></div>;
}

function Modal({ title, children, onClose }) {
  return <div className="modal-overlay active" role="dialog" aria-modal="true"><div className="modal-card"><div className="modal-header"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">×</button></div>{children}</div></div>;
}

function getPercent(value, max) {
  if (!max) return 0;
  return Math.min(Math.max((Number(value) / Number(max)) * 100, 0), 100);
}

function getCpuPercent(resource) {
  const cpu = Number(resource.cpu || 0);
  if (cpu <= 1) return Math.min(Math.max(cpu * 100, 0), 100);
  return Math.min(Math.max(cpu, 0), 100);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function renderStatus(status) {
  switch (status) {
    case 'running': return 'Online';
    case 'stopped': return 'Offline';
    case 'paused': return 'Pausiert';
    case 'suspended': return 'Angehalten';
    default: return 'Unbekannt';
  }
}

function renderType(type) {
  if (type === 'lxc') return 'LXC';
  if (type === 'qemu') return 'VM';
  return 'Ressource';
}
