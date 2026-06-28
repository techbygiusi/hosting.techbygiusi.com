import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminApi, getErrorMessage, translateMessage } from '../services/api';
import '../styles/globals.css';

const emptyUser = { email: '', name: '', password: '', role: 'user' };
const emptyCluster = { name: '', url: '', apiToken: '' };
const emptyResource = { name: '', containerId: '', clusterId: '', userId: '', webUrl: '' };
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
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [clusterTestResult, setClusterTestResult] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
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
      showSuccess('Benutzer wurde angelegt.');
      await loadData(activeTab);
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
      showSuccess('Benutzer wurde gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Benutzer konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClusterChange = (field, value) => {
    setNewCluster(prev => ({ ...prev, [field]: value }));
    setClusterTestResult(null);
    setError('');
  };

  const handleTestCluster = async () => {
    if (!newCluster.url || !newCluster.apiToken) {
      setClusterTestResult({ success: false, message: 'Bitte URL und API-Token eingeben.' });
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const res = await adminApi.testProxmox(newCluster);
      setClusterTestResult(res.data);
    } catch (err) {
      setClusterTestResult({ success: false, message: getErrorMessage(err, 'Proxmox-Test fehlgeschlagen.') });
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
      setClusterTestResult(null);
      setShowClusterModal(false);
      showSuccess('Proxmox-Cluster wurde gespeichert.');
      await loadData(activeTab);
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
      showSuccess('Cluster wurde gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Cluster konnte nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
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
        showSuccess('Der Cluster hat keine Container oder VMs zurückgegeben.');
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

  const handleCreateResource = async (e) => {
    e.preventDefault();
    if (!newResource.clusterId || !newResource.containerId || !newResource.userId) {
      setError('Bitte Cluster, Ressource und Benutzer auswählen.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      await adminApi.createResource(newResource);
      setNewResource(emptyResource);
      setClusterContainers([]);
      setShowResourceModal(false);
      showSuccess('Ressource wurde angelegt.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Ressource konnte nicht angelegt werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!window.confirm('Diese Ressource wirklich löschen?')) return;

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

  return (
    <div className="app-page">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-brand">
            <span className="site-mark">TG</span>
            <div>
              <p>Hosting Portal</p>
              <h1>Verwaltung</h1>
            </div>
          </div>
          <div className="site-actions">
            <button type="button" className="btn-secondary" onClick={logout}>Abmelden</button>
          </div>
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
          <>
            <section className="dashboard-grid">
              <MetricCard label="Benutzer" value={userCount} />
              <MetricCard label="Administratoren" value={adminCount} />
              <MetricCard label="Cluster" value={clusters.length} />
              <MetricCard label="Ressourcen" value={resources.length} />
              <MetricCard label="Online" value={onlineCount} />
            </section>
          </>
        )}

        {!loading && activeTab === 'users' && (
          <section className="panel-card">
            <PanelHeader title="Benutzer" action="Benutzer anlegen" onAction={() => setShowUserModal(true)} />
            <div className="table-responsive">
              <table>
                <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Aktion</th></tr></thead>
                <tbody>
                  {users.map(item => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td>{item.role === 'admin' ? 'Administrator' : 'Benutzer'}</td>
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
            <PanelHeader title="Proxmox" action="Cluster hinzufügen" onAction={() => { setClusterTestResult(null); setShowClusterModal(true); }} />
            <div className="table-responsive">
              <table>
                <thead><tr><th>Name</th><th>URL</th><th>Aktion</th></tr></thead>
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

        {!loading && activeTab === 'resources' && (
          <section className="panel-card">
            <PanelHeader title="Ressourcen" action="Ressource anlegen" onAction={() => setShowResourceModal(true)} />
            {resources.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Ressourcen</h2><p>Lege eine Ressource an, damit Benutzer Status und Weblink sehen.</p></div>
            ) : (
              <div className="resource-grid admin-resource-grid">
                {resources.map(item => <ResourceCard key={item.id} resource={item} onDelete={handleDeleteResource} actionLoading={actionLoading} />)}
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'settings' && (
          <section className="panel-card settings-card">
            <PanelHeader title="Einstellungen" />
            <form className="form-grid" onSubmit={handleSaveSettings}>
              <label className="form-group"><span>SMTP-Host</span><input type="text" name="smtpHost" value={settings.smtpHost} onChange={handleSettingsChange} placeholder="smtp.example.com" /></label>
              <label className="form-group"><span>SMTP-Port</span><input type="text" name="smtpPort" value={settings.smtpPort} onChange={handleSettingsChange} placeholder="587" /></label>
              <label className="form-group"><span>SMTP-Benutzer</span><input type="email" name="smtpUser" value={settings.smtpUser} onChange={handleSettingsChange} placeholder="noreply@example.com" /></label>
              <label className="form-group"><span>SMTP-Passwort</span><input type="password" name="smtpPassword" value={settings.smtpPassword} onChange={handleSettingsChange} placeholder="Leer lassen, wenn unverändert" /></label>
              <div className="form-actions full-width">
                <button type="button" className="btn-secondary" onClick={handleTestSmtp} disabled={actionLoading}>SMTP testen</button>
                <button type="submit" className="btn-primary" disabled={actionLoading}>Speichern</button>
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
        <Modal title="Proxmox-Cluster hinzufügen" onClose={() => { setClusterTestResult(null); setShowClusterModal(false); }}>
          <form className="form-stack" onSubmit={handleCreateCluster}>
            <label className="form-group"><span>Name</span><input type="text" value={newCluster.name} onChange={e => handleClusterChange('name', e.target.value)} placeholder="Home Lab" /></label>
            <label className="form-group"><span>URL</span><input type="text" value={newCluster.url} onChange={e => handleClusterChange('url', e.target.value)} placeholder="https://10.10.0.10:8006" /></label>
            <label className="form-group"><span>API-Token</span><input type="password" value={newCluster.apiToken} onChange={e => handleClusterChange('apiToken', e.target.value)} placeholder="api@pam!hosting=secret" /></label>
            <button type="button" className="btn-secondary full-button" onClick={handleTestCluster} disabled={actionLoading}>Proxmox-Verbindung testen</button>
            {clusterTestResult && <div className={`test-result ${clusterTestResult.success ? 'success' : 'error'}`}>{translateMessage(clusterTestResult.message)}</div>}
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => { setClusterTestResult(null); setShowClusterModal(false); }}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Speichern</button></div>
          </form>
        </Modal>
      )}

      {showResourceModal && (
        <Modal title="Ressource anlegen" onClose={() => setShowResourceModal(false)}>
          <form className="form-stack" onSubmit={handleCreateResource}>
            <label className="form-group"><span>Cluster</span><select value={newResource.clusterId} onChange={e => { setNewResource(prev => ({ ...prev, clusterId: e.target.value, containerId: '', name: '' })); setClusterContainers([]); }}><option value="">Bitte auswählen</option>{clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" className="btn-secondary" onClick={handleLoadClusterContainers} disabled={actionLoading || !newResource.clusterId}>{currentClusterName ? `Ressourcen von ${currentClusterName} laden` : 'Ressourcen laden'}</button>
            <label className="form-group"><span>Container oder VM</span>{clusterContainers.length > 0 ? <select value={newResource.containerId} onChange={e => handleResourceContainerChange(e.target.value)}><option value="">Bitte auswählen</option>{clusterContainers.map(item => <option key={`${item.type}-${item.vmid}`} value={item.vmid}>{item.vmid} · {item.name || item.type} · {renderType(item.type)} · {renderStatus(item.status)}</option>)}</select> : <input type="text" value={newResource.containerId} onChange={e => setNewResource(prev => ({ ...prev, containerId: e.target.value }))} placeholder="VMID oder CTID" />}</label>
            <label className="form-group"><span>Anzeigename</span><input type="text" value={newResource.name} onChange={e => setNewResource(prev => ({ ...prev, name: e.target.value }))} placeholder="Optional" /></label>
            <label className="form-group"><span>Benutzer</span><select value={newResource.userId} onChange={e => setNewResource(prev => ({ ...prev, userId: e.target.value }))}><option value="">Bitte auswählen</option>{users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>
            <label className="form-group"><span>Weblink</span><input type="url" value={newResource.webUrl} onChange={e => setNewResource(prev => ({ ...prev, webUrl: e.target.value }))} placeholder="https://app.example.com" /></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setShowResourceModal(false)}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Anlegen</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PanelHeader({ title, text, action, onAction }) {
  return (
    <div className="panel-header">
      <div><h2>{title}</h2>{text && <p>{text}</p>}</div>
      {action && <button type="button" className="btn-primary" onClick={onAction}>{action}</button>}
    </div>
  );
}

function MetricCard({ label, value }) {
  return <article className="metric-card"><span>{label}</span><div className="metric-value">{value}</div></article>;
}

function ResourceCard({ resource, onDelete, actionLoading }) {
  const cpuPercent = getCpuPercent(resource);
  const memPercent = getPercent(resource.mem, resource.maxmem);
  const diskPercent = getPercent(resource.disk, resource.maxdisk);

  return (
    <article className="resource-card">
      <div className="resource-card-header">
        <div>
          <span className="resource-id">{renderType(resource.type)} · {resource.containerId}</span>
          <h2>{resource.name}</h2>
        </div>
        <span className={`status-badge status-${resource.status || 'unknown'}`}>{renderStatus(resource.status)}</span>
      </div>
      <div className="resource-meta">
        <span>Benutzer</span><span>{resource.userName || resource.userEmail || 'Nicht gesetzt'}</span>
        <span>Cluster</span><span>{resource.clusterName}</span>
        <span>Node</span><span>{resource.node || 'Unbekannt'}</span>
      </div>
      <Metric label="CPU" percent={cpuPercent} detail={`${cpuPercent.toFixed(1)} %`} />
      <Metric label="RAM" percent={memPercent} detail={`${formatBytes(resource.mem)} / ${formatBytes(resource.maxmem)}`} />
      <Metric label="Disk" percent={diskPercent} detail={`${formatBytes(resource.disk)} / ${formatBytes(resource.maxdisk)}`} />
      {resource.webUrl && <a className="btn-secondary full-button" href={resource.webUrl} target="_blank" rel="noreferrer">Webseite öffnen</a>}
      {resource.monitorError && <p className="hint-text">Monitoring nicht erreichbar.</p>}
      <button type="button" className="btn-danger full-button" onClick={() => onDelete(resource.id)} disabled={actionLoading}>Entfernen</button>
    </article>
  );
}

function Metric({ label, percent, detail }) {
  const safePercent = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return (
    <div className="metric-line">
      <div><span>{label}</span><span>{safePercent.toFixed(1)}%</span></div>
      <div className="progress-bar"><span style={{ width: `${safePercent}%` }}></span></div>
      <small>{detail}</small>
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
