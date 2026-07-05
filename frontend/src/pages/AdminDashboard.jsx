import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi, adminApi, getErrorMessage, translateMessage } from '../services/api';
import '../styles/globals.css';
import ThemeButton from '../components/ThemeButton';
import Modal from '../components/Modal';

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
const emptyCluster = { name: '', url: '', apiToken: '', allowProvisioning: false };
const emptyResource = { name: '', containerId: '', clusterId: '', userId: '', groupId: '', publicUrl: '', adminUrl: '' };
const emptyGroup = { name: '', memberIds: [] };
const emptyAdminCred = { label: '', username: '', secret: '', url: '', notes: '', clusterId: '', userId: '' };
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
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState(emptyGroup);
  const [editGroupId, setEditGroupId] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [clusterCaps, setClusterCaps] = useState({}); // clusterId -> capabilities
  const [capsLoading, setCapsLoading] = useState(false);
  const [checkingCapsId, setCheckingCapsId] = useState(null);
  const [adminCredentials, setAdminCredentials] = useState([]);
  const [showCredModal, setShowCredModal] = useState(false);
  const [editCredId, setEditCredId] = useState(null);
  const [newCred, setNewCred] = useState(emptyAdminCred);
  const [revealedCreds, setRevealedCreds] = useState({});
  const [resourceCredsFor, setResourceCredsFor] = useState(null); // resource object

  const tabs = [
    ['overview', 'Übersicht'],
    ['users', 'Benutzer'],
    ['groups', 'Gruppen'],
    ['clusters', 'Proxmox'],
    ['resources', 'Dienste'],
    ['audit', 'Protokoll'],
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
      const needsUsers = ['overview', 'users', 'groups', 'resources'].includes(tab);
      const needsClusters = ['overview', 'clusters', 'resources', 'settings'].includes(tab);
      const needsResources = ['overview', 'resources'].includes(tab);
      const needsGroups = ['groups', 'resources', 'overview'].includes(tab);
      const needsAudit = tab === 'audit';
      const needsSettings = tab === 'settings';

      if (needsUsers) requests.push(adminApi.getUsers().then(res => setUsers(res.data.users || [])));
      if (needsClusters) requests.push(
        adminApi.getClusters().then(res => {
          const list = res.data.clusters || [];
          setClusters(list);
          // On the clusters tab, always show token permissions – fetch them
          // in the background so the badges appear without "Token prüfen".
          if (tab === 'clusters') loadAllCapabilities(list);
        })
      );
      if (needsResources) requests.push(adminApi.getResources().then(res => setResources(res.data.resources || [])));
      if (needsGroups) requests.push(adminApi.getGroups().then(res => setGroups(res.data.groups || [])));
      if (needsAudit) requests.push(adminApi.getAudit(200).then(res => setAuditEntries(res.data.entries || [])));
      if (needsSettings) {
        requests.push(loadSettings());
        requests.push(adminApi.getAdminCredentials().then(res => setAdminCredentials(res.data.credentials || [])).catch(() => {}));
      }

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
    setNewCluster({
      name: item.name || '',
      url: item.url || '',
      apiToken: '',
      allowProvisioning: !!item.allow_provisioning
    });
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

  const loadAllCapabilities = async (clusterList) => {
    // Fetch token permissions for every cluster in parallel (best-effort).
    setCapsLoading(true);
    await Promise.all((clusterList || []).map(async (cluster) => {
      try {
        const res = await adminApi.getClusterCapabilities(cluster.id);
        setClusterCaps(prev => ({ ...prev, [cluster.id]: res.data.capabilities }));
      } catch (_) {
        setClusterCaps(prev => ({ ...prev, [cluster.id]: { error: true } }));
      }
    }));
    setCapsLoading(false);
  };

  const handleCheckCapabilities = async (clusterId) => {
    // "Token prüfen" re-fetches just this cluster and updates the badges live,
    // no tab switch or page reload needed.
    try {
      setCheckingCapsId(clusterId);
      setError('');
      const res = await adminApi.getClusterCapabilities(clusterId);
      setClusterCaps(prev => ({ ...prev, [clusterId]: res.data.capabilities }));
    } catch (err) {
      setError(getErrorMessage(err, 'Berechtigungen konnten nicht geprüft werden.'));
      setClusterCaps(prev => ({ ...prev, [clusterId]: { error: true } }));
    } finally {
      setCheckingCapsId(null);
    }
  };

  const openResourceCreds = (resource) => setResourceCredsFor(resource);

  const openCreateCred = () => { setEditCredId(null); setNewCred(emptyAdminCred); setShowCredModal(true); };
  const openEditCred = (item) => {
    setEditCredId(item.id);
    setNewCred({
      label: item.label || '', username: item.username || '', secret: '',
      url: item.url || '', notes: item.notes || '',
      clusterId: item.cluster_id || '', userId: item.user_id || ''
    });
    setShowCredModal(true);
  };
  const closeCredModal = () => { setShowCredModal(false); setEditCredId(null); setNewCred(emptyAdminCred); };

  const handleSaveCred = async (e) => {
    e.preventDefault();
    if (!newCred.label.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return; }
    try {
      setActionLoading(true);
      setError('');
      const payload = {
        ...newCred,
        clusterId: newCred.clusterId || null,
        userId: newCred.userId || null
      };
      if (editCredId) {
        await adminApi.updateAdminCredential(editCredId, payload);
        showSuccess('Zugangsdaten gespeichert.');
      } else {
        await adminApi.createAdminCredential(payload);
        showSuccess('Zugangsdaten angelegt.');
      }
      closeCredModal();
      await loadData('settings');
    } catch (err) {
      setError(getErrorMessage(err, 'Zugangsdaten konnten nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCred = async (credId) => {
    if (!window.confirm('Diese Zugangsdaten löschen?')) return;
    try {
      setActionLoading(true);
      await adminApi.deleteAdminCredential(credId);
      showSuccess('Zugangsdaten gelöscht.');
      await loadData('settings');
    } catch (err) {
      setError(getErrorMessage(err, 'Zugangsdaten konnten nicht gelöscht werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleRevealCred = async (credId) => {
    if (revealedCreds[credId] !== undefined) {
      setRevealedCreds(prev => { const next = { ...prev }; delete next[credId]; return next; });
      return;
    }
    try {
      const res = await adminApi.revealAdminCredential(credId);
      setRevealedCreds(prev => ({ ...prev, [credId]: res.data.secret || '' }));
    } catch (err) {
      setError(getErrorMessage(err, 'Passwort konnte nicht angezeigt werden.'));
    }
  };

  const openCreateGroup = () => {
    setEditGroupId(null);
    setNewGroup(emptyGroup);
    setShowGroupModal(true);
  };

  const openEditGroup = (item) => {
    setEditGroupId(item.id);
    setNewGroup({ name: item.name || '', memberIds: (item.members || []).map(member => member.id) });
    setShowGroupModal(true);
  };

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setEditGroupId(null);
    setNewGroup(emptyGroup);
  };

  const toggleGroupMember = (userId) => {
    setNewGroup(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(userId)
        ? prev.memberIds.filter(id => id !== userId)
        : [...prev.memberIds, userId]
    }));
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!newGroup.name.trim()) {
      setError('Bitte einen Gruppennamen eingeben.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      if (editGroupId) {
        await adminApi.updateGroup(editGroupId, newGroup);
        showSuccess('Gruppe wurde gespeichert.');
      } else {
        const res = await adminApi.createGroup({ name: newGroup.name });
        if (newGroup.memberIds.length > 0) {
          await adminApi.updateGroup(res.data.group.id, newGroup);
        }
        showSuccess('Gruppe wurde angelegt.');
      }
      closeGroupModal();
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Gruppe konnte nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Diese Gruppe löschen? Zugeordnete Dienste verlieren die Gruppen-Freigabe.')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteGroup(groupId);
      showSuccess('Gruppe wurde gelöscht.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Gruppe konnte nicht gelöscht werden.'));
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
      groupId: item.groupId || '',
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
      setError(getErrorMessage(err, 'Dienste konnten nicht geladen werden.'));
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
      setError('Bitte Cluster, Dienst und Benutzer auswählen.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      if (editResourceId) {
        await adminApi.updateResource(editResourceId, newResource);
        showSuccess('Dienst wurde gespeichert.');
      } else {
        await adminApi.createResource(newResource);
        showSuccess('Dienst wurde angelegt.');
      }
      closeResourceModal();
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Dienst konnte nicht gespeichert werden.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!window.confirm('Diesen Dienst entfernen?')) return;

    try {
      setActionLoading(true);
      setError('');
      await adminApi.deleteResource(resourceId);
      showSuccess('Dienst wurde entfernt.');
      await loadData(activeTab);
    } catch (err) {
      setError(getErrorMessage(err, 'Dienst konnte nicht entfernt werden.'));
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
            <MetricCard label="Gruppen" value={groups.length} onClick={() => setActiveTab('groups')} />
            <MetricCard label="Cluster" value={clusters.length} onClick={() => setActiveTab('clusters')} />
            <MetricCard label="Dienste" value={resources.length} onClick={() => setActiveTab('resources')} />
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

        {!loading && activeTab === 'groups' && (
          <section className="panel-card">
            <PanelHeader title="Gruppen" action="Gruppe anlegen" onAction={openCreateGroup} />
            <p className="hint-text panel-hint">Dienste, die einer Gruppe zugewiesen sind, sehen alle Mitglieder der Gruppe.</p>
            {groups.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Gruppen</h2></div>
            ) : (
              <div className="list-grid">
                {groups.map(item => (
                  <article key={item.id} className="list-card">
                    <div>
                      <span className="resource-id">{item.member_count} {item.member_count === 1 ? 'Mitglied' : 'Mitglieder'} · {item.resource_count} {item.resource_count === 1 ? 'Dienst' : 'Dienste'}</span>
                      <h2>{item.name}</h2>
                      <p>{(item.members || []).map(member => member.name).join(', ') || 'Noch keine Mitglieder'}</p>
                    </div>
                    <div className="card-actions">
                      <button type="button" className="btn-secondary btn-small" onClick={() => openEditGroup(item)}>Bearbeiten</button>
                      <button type="button" className="btn-danger btn-small" onClick={() => handleDeleteGroup(item.id)} disabled={actionLoading}>Löschen</button>
                    </div>
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
                  <article key={item.id} className="list-card cluster-list-card">
                    <div>
                      <h2>{item.name}</h2>
                      <p className="cluster-address">{item.url}</p>
                      {clusterCaps[item.id]
                        ? (clusterCaps[item.id].error
                            ? <p className="hint-text caps-error">Berechtigungen nicht abrufbar – Token/Verbindung prüfen.</p>
                            : <CapabilityBadges caps={clusterCaps[item.id]} />)
                        : <p className="hint-text caps-loading">{capsLoading ? 'Berechtigungen werden geladen…' : '—'}</p>}
                    </div>
                    <div className="card-actions">
                      <button type="button" className="btn-secondary btn-small" onClick={() => handleCheckCapabilities(item.id)} disabled={checkingCapsId === item.id}>{checkingCapsId === item.id ? 'Prüfe…' : 'Token prüfen'}</button>
                      <button type="button" className="btn-secondary btn-small" onClick={() => openEditCluster(item)}>Bearbeiten</button>
                      <button type="button" className="btn-danger btn-small" onClick={() => handleDeleteCluster(item.id)} disabled={actionLoading}>Löschen</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'resources' && (
          <section className="panel-card">
            <PanelHeader title="Dienste" action="Dienst anlegen" onAction={openCreateResource} />
            {resources.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Dienste</h2></div>
            ) : (
              <div className="resource-grid admin-resource-grid">
                {resources.map(item => <ResourceCard key={item.id} resource={item} onEdit={openEditResource} onDelete={handleDeleteResource} onManageCredentials={openResourceCreds} actionLoading={actionLoading} />)}
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'audit' && (
          <section className="panel-card">
            <PanelHeader title="Protokoll" action="Aktualisieren" onAction={() => loadData('audit')} />
            {auditEntries.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Einträge</h2></div>
            ) : (
              <div className="audit-list">
                {auditEntries.map(entry => (
                  <div key={entry.id} className="audit-row">
                    <div className="audit-main">
                      <strong>{renderAuditAction(entry.action)}</strong>
                      <span>{entry.details || entry.target || ''}</span>
                    </div>
                    <div className="audit-meta">
                      <span>{entry.user_email || 'System'}</span>
                      <span>{formatAuditTime(entry.created_at)}</span>
                      {entry.ip && <span>{entry.ip}</span>}
                    </div>
                  </div>
                ))}
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

        {!loading && activeTab === 'settings' && (
          <ProvisioningSettings
            clusters={clusters}
            onSaved={() => loadData('settings')}
            onError={(msg) => setError(msg)}
            onSuccess={showSuccess}
          />
        )}

        {!loading && activeTab === 'settings' && (
          <section className="panel-card">
            <PanelHeader title="Zugangsdaten" action="Hinzufügen" onAction={openCreateCred} />
            {adminCredentials.length === 0 ? (
              <div className="empty-state soft-box"><h2>Keine Zugangsdaten</h2></div>
            ) : (
              <div className="list-grid">
                {adminCredentials.map(item => (
                  <article key={item.id} className="list-card credential-card">
                    <div className="credential-main">
                      <strong>{item.label}</strong>
                      {item.username && <span className="credential-user">{item.username}</span>}
                      <span className="credential-scope">
                        {item.cluster_name ? `Cluster: ${item.cluster_name}` : ''}
                        {item.cluster_name && item.user_name ? ' · ' : ''}
                        {item.user_name ? `Benutzer: ${item.user_name}` : ''}
                        {!item.cluster_name && !item.user_name ? 'Allgemein' : ''}
                      </span>
                      {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="credential-url">{item.url}</a>}
                      {item.notes && <small className="credential-notes">{item.notes}</small>}
                      <code className="credential-secret">{revealedCreds[item.id] !== undefined ? (revealedCreds[item.id] || '(leer)') : '••••••••'}</code>
                    </div>
                    <div className="card-actions">
                      <button type="button" className="btn-secondary btn-small" onClick={() => toggleRevealCred(item.id)}>{revealedCreds[item.id] !== undefined ? 'Verbergen' : 'Anzeigen'}</button>
                      <button type="button" className="btn-secondary btn-small" onClick={() => openEditCred(item)}>Bearbeiten</button>
                      <button type="button" className="btn-danger btn-small" onClick={() => handleDeleteCred(item.id)} disabled={actionLoading}>Löschen</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {showCredModal && (
        <Modal title={editCredId ? 'Zugangsdaten bearbeiten' : 'Zugangsdaten anlegen'} onClose={closeCredModal}>
          <form className="form-stack" onSubmit={handleSaveCred}>
            <label className="form-group"><span>Bezeichnung</span><input type="text" value={newCred.label} onChange={e => setNewCred(prev => ({ ...prev, label: e.target.value }))} placeholder="z. B. Cluster-Root-Login" /></label>
            <label className="form-group"><span>Benutzername</span><input type="text" value={newCred.username} onChange={e => setNewCred(prev => ({ ...prev, username: e.target.value }))} placeholder="Optional" autoComplete="off" /></label>
            <label className="form-group"><span>Passwort / Secret</span><input type="password" value={newCred.secret} onChange={e => setNewCred(prev => ({ ...prev, secret: e.target.value }))} placeholder={editCredId ? 'Leer lassen, wenn unverändert' : ''} autoComplete="new-password" /></label>
            <label className="form-group"><span>URL</span><input type="url" value={newCred.url} onChange={e => setNewCred(prev => ({ ...prev, url: e.target.value }))} placeholder="Optional" /></label>
            <div className="form-row-2">
              <label className="form-group"><span>Cluster (optional)</span><select value={newCred.clusterId} onChange={e => setNewCred(prev => ({ ...prev, clusterId: e.target.value }))}><option value="">Keiner</option>{clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="form-group"><span>Benutzer (optional)</span><select value={newCred.userId} onChange={e => setNewCred(prev => ({ ...prev, userId: e.target.value }))}><option value="">Keiner</option>{users.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div>
            <label className="form-group"><span>Notizen</span><textarea rows="2" value={newCred.notes} onChange={e => setNewCred(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional"></textarea></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeCredModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>{editCredId ? 'Speichern' : 'Anlegen'}</button></div>
          </form>
        </Modal>
      )}

      {resourceCredsFor && (
        <AdminResourceCredentials
          resource={resourceCredsFor}
          onClose={() => setResourceCredsFor(null)}
          onError={(msg) => setError(msg)}
        />
      )}

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

            <div className="form-section-divider">
              <label className="toggle-row">
                <span className="toggle-label">Self-Service: Benutzer dürfen Maschinen erstellen</span>
                <span className="toggle-switch">
                  <input type="checkbox" checked={newCluster.allowProvisioning} onChange={e => handleClusterChange('allowProvisioning', e.target.checked)} />
                  <span className="toggle-track"><span className="toggle-thumb"></span></span>
                </span>
              </label>
              {newCluster.allowProvisioning && (
                <p className="hint-text">Die Details (VMID-/IP-Bereich, Typen, Templates, Limits) konfigurierst du unter <strong>Einstellungen → Self-Service</strong>.</p>
              )}
            </div>

            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeClusterModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>Speichern</button></div>
          </form>
        </Modal>
      )}

      {showResourceModal && (
        <Modal title={editResourceId ? 'Dienst bearbeiten' : 'Dienst anlegen'} onClose={closeResourceModal}>
          <form className="form-stack" onSubmit={handleSaveResource}>
            <label className="form-group"><span>Cluster</span><select value={newResource.clusterId} onChange={e => { setNewResource(prev => ({ ...prev, clusterId: e.target.value, containerId: '', name: editResourceId ? prev.name : '' })); setClusterContainers([]); }}><option value="">Bitte auswählen</option>{clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" className="btn-secondary" onClick={handleLoadClusterContainers} disabled={actionLoading || !newResource.clusterId}>{currentClusterName ? `Dienste von ${currentClusterName} laden` : 'Dienste laden'}</button>
            <label className="form-group"><span>Container oder VM</span>{clusterContainers.length > 0 ? <select value={newResource.containerId} onChange={e => handleResourceContainerChange(e.target.value)}><option value="">Bitte auswählen</option>{clusterContainers.map(item => <option key={`${item.type}-${item.vmid}`} value={item.vmid}>{item.vmid} · {item.name || item.type} · {renderType(item.type)} · {renderStatus(item.status)}</option>)}</select> : <input type="text" value={newResource.containerId} onChange={e => setNewResource(prev => ({ ...prev, containerId: e.target.value }))} placeholder="VMID oder CTID" />}</label>
            <label className="form-group"><span>Anzeigename</span><input type="text" value={newResource.name} onChange={e => setNewResource(prev => ({ ...prev, name: e.target.value }))} placeholder="Optional" /></label>
            <label className="form-group"><span>Benutzer</span><select value={newResource.userId} onChange={e => setNewResource(prev => ({ ...prev, userId: e.target.value }))}><option value="">Bitte auswählen</option>{users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>
            <label className="form-group"><span>Gruppe (geteilter Zugriff)</span><select value={newResource.groupId} onChange={e => setNewResource(prev => ({ ...prev, groupId: e.target.value }))}><option value="">Keine Gruppe</option>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="form-group"><span>Öffentliche Seite</span><input type="url" value={newResource.publicUrl} onChange={e => setNewResource(prev => ({ ...prev, publicUrl: e.target.value }))} placeholder="https://app.example.com" /></label>
            <label className="form-group"><span>Verwaltungsseite</span><input type="url" value={newResource.adminUrl} onChange={e => setNewResource(prev => ({ ...prev, adminUrl: e.target.value }))} placeholder="https://admin.example.com" /></label>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeResourceModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>{editResourceId ? 'Speichern' : 'Anlegen'}</button></div>
          </form>
        </Modal>
      )}
      {showGroupModal && (
        <Modal title={editGroupId ? 'Gruppe bearbeiten' : 'Gruppe anlegen'} onClose={closeGroupModal}>
          <form className="form-stack" onSubmit={handleSaveGroup}>
            <label className="form-group"><span>Name</span><input type="text" value={newGroup.name} onChange={e => setNewGroup(prev => ({ ...prev, name: e.target.value }))} placeholder="z. B. Minecraft-Team" /></label>
            <div className="form-group">
              <span>Mitglieder</span>
              <div className="member-checklist">
                {users.length === 0 && <p className="hint-text">Noch keine Benutzer vorhanden.</p>}
                {users.map(item => (
                  <label key={item.id} className="checkbox-row">
                    <input type="checkbox" checked={newGroup.memberIds.includes(item.id)} onChange={() => toggleGroupMember(item.id)} />
                    <span>{item.name} · {item.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeGroupModal}>Abbrechen</button><button type="submit" className="btn-primary" disabled={actionLoading}>{editGroupId ? 'Speichern' : 'Anlegen'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/**
 * Admin management of credentials attached to a specific resource.
 * The admin can add/edit/delete only its own entries (created_by_role='admin').
 * User-created entries are shown read-only and can never be touched by the admin.
 */
function AdminResourceCredentials({ resource, onClose, onError }) {
  const emptyForm = { label: '', username: '', secret: '', url: '', notes: '' };
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getResourceCredentials(resource.id);
      setCredentials(res.data.credentials || []);
    } catch (err) {
      onError(getErrorMessage(err, 'Zugangsdaten konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [resource.id]);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (item) => {
    setEditId(item.id);
    setForm({ label: item.label || '', username: item.username || '', secret: '', url: item.url || '', notes: item.notes || '' });
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) { onError('Bitte eine Bezeichnung eingeben.'); return; }
    try {
      setBusy(true);
      if (editId) await adminApi.updateResourceCredential(resource.id, editId, form);
      else await adminApi.createResourceCredential(resource.id, form);
      setShowForm(false); setEditId(null); setForm(emptyForm);
      await load();
    } catch (err) {
      onError(getErrorMessage(err, 'Zugangsdaten konnten nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`"${item.label}" wirklich löschen?`)) return;
    try {
      setBusy(true);
      await adminApi.deleteResourceCredential(resource.id, item.id);
      await load();
    } catch (err) {
      onError(getErrorMessage(err, 'Zugangsdaten konnten nicht gelöscht werden.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleReveal = async (item) => {
    if (revealed[item.id] !== undefined) {
      setRevealed(prev => { const next = { ...prev }; delete next[item.id]; return next; });
      return;
    }
    try {
      const res = await adminApi.revealResourceCredential(resource.id, item.id);
      setRevealed(prev => ({ ...prev, [item.id]: res.data.secret || '' }));
    } catch (err) {
      onError(getErrorMessage(err, 'Passwort konnte nicht angezeigt werden.'));
    }
  };

  const adminCreds = credentials.filter(item => item.canManage);
  const userCreds = credentials.filter(item => !item.canManage);

  return (
    <Modal title={`Zugangsdaten · ${resource.name}`} onClose={onClose}>
      <p className="hint-text panel-hint">Hinterlegte Zugangsdaten erscheinen beim Benutzer. Der Benutzer kann sie behalten oder löschen. Vom Benutzer selbst angelegte Zugangsdaten kannst du nicht sehen oder löschen.</p>

      <div className="tasks-toolbar">
        <span className="hint-text">{adminCreds.length} von dir · {userCreds.length} vom Benutzer</span>
        <button type="button" className="btn-primary btn-small" onClick={openCreate}>Hinzufügen</button>
      </div>

      {loading && <div className="loading inline-loading"><span className="spinner"></span><span>Laden...</span></div>}

      {!loading && adminCreds.map(item => (
        <div key={item.id} className="credential-row">
          <div className="credential-main">
            <strong>{item.label}<span className="cred-tag cred-tag-admin">von Admin</span></strong>
            {item.username && <span className="credential-user">{item.username}</span>}
            {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="credential-url">{item.url}</a>}
            {item.notes && <small className="credential-notes">{item.notes}</small>}
            <code className="credential-secret">{revealed[item.id] !== undefined ? (revealed[item.id] || '(leer)') : '••••••••'}</code>
          </div>
          <div className="credential-actions">
            <button type="button" className="btn-secondary btn-small" onClick={() => toggleReveal(item)}>{revealed[item.id] !== undefined ? 'Verbergen' : 'Anzeigen'}</button>
            <button type="button" className="btn-secondary btn-small" onClick={() => openEdit(item)}>Bearbeiten</button>
            <button type="button" className="btn-danger btn-small" onClick={() => remove(item)} disabled={busy}>Löschen</button>
          </div>
        </div>
      ))}

      {!loading && userCreds.map(item => (
        <div key={item.id} className="credential-row credential-row-locked">
          <div className="credential-main">
            <strong>{item.label}<span className="cred-tag cred-tag-user">vom Benutzer</span></strong>
            {item.username && <span className="credential-user">{item.username}</span>}
            {item.url && <span className="credential-url">{item.url}</span>}
            <code className="credential-secret">••••••••</code>
            <small className="hint-text">Nur für den Benutzer sichtbar – nicht verwaltbar.</small>
          </div>
        </div>
      ))}

      {!loading && credentials.length === 0 && !showForm && (
        <p className="hint-text tab-empty">Noch keine Zugangsdaten hinterlegt.</p>
      )}

      {showForm && (
        <form className="form-stack credential-form" onSubmit={save}>
          <label className="form-group"><span>Bezeichnung</span><input type="text" value={form.label} onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))} placeholder="z. B. SSH root" /></label>
          <label className="form-group"><span>Benutzername</span><input type="text" value={form.username} onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))} placeholder="Optional" autoComplete="off" /></label>
          <label className="form-group"><span>Passwort / Secret</span><input type="password" value={form.secret} onChange={e => setForm(prev => ({ ...prev, secret: e.target.value }))} placeholder={editId ? 'Leer lassen, wenn unverändert' : ''} autoComplete="new-password" /></label>
          <label className="form-group"><span>URL</span><input type="url" value={form.url} onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))} placeholder="Optional" /></label>
          <label className="form-group"><span>Notizen</span><textarea rows="2" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional"></textarea></label>
          <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Abbrechen</button><button type="submit" className="btn-primary" disabled={busy}>{editId ? 'Speichern' : 'Hinzufügen'}</button></div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Self-Service configuration per cluster (Settings tab).
 * Cluster dropdown → LXC-only self-service, live storages/templates
 * fetched via the cluster API token, VMID/IP ranges and limits.
 */
function ProvisioningSettings({ clusters, onSaved, onError, onSuccess }) {
  const [clusterId, setClusterId] = useState('');
  const [form, setForm] = useState({
    allowProvisioning: false, allowTypes: 'ct', vmidMin: '', vmidMax: '',
    ipStart: '', ipEnd: '', ipPrefix: '24', gateway: '',
    bridge: 'vmbr0', storage: 'local', templateStorage: 'local',
    allowedTemplates: [],
    maxCores: '2', maxMemoryMb: '2048', maxDiskGb: '20', defaultPassword: ''
  });
  const [storages, setStorages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [caps, setCaps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const toggleAllowed = (field, volid, checked) => {
    setForm(prev => {
      const current = new Set(prev[field] || []);
      if (checked) current.add(volid); else current.delete(volid);
      return { ...prev, [field]: Array.from(current) };
    });
  };

  useEffect(() => {
    if (!clusterId) { setLoaded(false); return; }
    let active = true;
    (async () => {
      try {
        setBusy(true);
        const [provRes, capRes] = await Promise.all([
          adminApi.getClusterProvisioning(clusterId),
          adminApi.getClusterCapabilities(clusterId).catch(() => ({ data: { capabilities: null } }))
        ]);
        if (!active) return;
        const p = provRes.data.provisioning;
        setForm({
          allowProvisioning: !!p.allowProvisioning,
          allowTypes: 'ct',
          vmidMin: p.vmidMin === null ? '' : String(p.vmidMin ?? ''),
          vmidMax: p.vmidMax === null ? '' : String(p.vmidMax ?? ''),
          ipStart: p.ipStart || '', ipEnd: p.ipEnd || '', ipPrefix: String(p.ipPrefix ?? '24'),
          gateway: p.gateway || '', bridge: p.bridge || 'vmbr0',
          storage: p.storage || 'local', templateStorage: p.templateStorage || 'local',
          allowedTemplates: Array.isArray(p.allowedTemplates) ? p.allowedTemplates : [],
          maxCores: String(p.maxCores ?? '2'), maxMemoryMb: String(p.maxMemoryMb ?? '2048'),
          maxDiskGb: String(p.maxDiskGb ?? '20'), defaultPassword: ''
        });
        setCaps(capRes.data.capabilities);
        setLoaded(true);
        adminApi.getClusterStorages(clusterId).then(res => {
          if (!active) return;
          const liveStorages = (res.data.storages || []).filter(s => s && s.storage);
          setStorages(liveStorages);
          if (liveStorages.length > 0) {
            const names = liveStorages.map(s => s.storage);
            setForm(prev => names.includes(prev.storage) ? prev : { ...prev, storage: names[0] });
          }
        }).catch(() => setStorages([]));
      } catch (err) {
        onError(getErrorMessage(err, 'Konfiguration konnte nicht geladen werden.'));
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [clusterId]);

  const loadTemplates = async () => {
    try {
      const res = await adminApi.getClusterTemplates(clusterId, form.templateStorage);
      const found = res.data.templates || [];
      setTemplates(found);
      if (found.length === 0) onError('Keine CT-Templates in diesem Storage gefunden.');
      else if (form.allowedTemplates.length === 0) setField('allowedTemplates', found.map(t => t.volid));
    } catch (err) {
      onError(getErrorMessage(err, 'Templates konnten nicht geladen werden.'));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      await adminApi.updateClusterProvisioning(clusterId, form);
      onSuccess('Self-Service-Konfiguration gespeichert.');
      onSaved();
    } catch (err) {
      onError(getErrorMessage(err, 'Konfiguration konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };

  const storageNames = storages.map(s => s.storage);

  return (
    <section className="panel-card provisioning-settings-panel">
      <PanelHeader title="Self-Service" />

      <label className="form-group">
        <span>Cluster</span>
        <select value={clusterId} onChange={e => setClusterId(e.target.value)}>
          <option value="">Bitte auswählen</option>
          {clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>

      {clusterId && caps && !caps.canProvision && (
        <div className="alert alert-danger">Der API-Token dieses Clusters hat kein VM.Allocate – Self-Service funktioniert damit nicht. Passe die Token-Rechte in Proxmox an.</div>
      )}

      {clusterId && loaded && (
        <form className="form-stack provisioning-form" onSubmit={save}>
          <label className="toggle-row">
            <span className="toggle-label">Self-Service für diesen Cluster aktivieren</span>
            <span className="toggle-switch">
              <input type="checkbox" checked={form.allowProvisioning} onChange={e => setField('allowProvisioning', e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb"></span></span>
            </span>
          </label>

          {form.allowProvisioning && (
            <>
              <div className="form-row-2">
                <label className="form-group"><span>VMID von</span><input type="number" min="100" value={form.vmidMin} onChange={e => setField('vmidMin', e.target.value)} placeholder="900" /></label>
                <label className="form-group"><span>VMID bis</span><input type="number" min="100" value={form.vmidMax} onChange={e => setField('vmidMax', e.target.value)} placeholder="999" /></label>
              </div>
              <div className="form-row-2">
                <label className="form-group"><span>IP von</span><input type="text" value={form.ipStart} onChange={e => setField('ipStart', e.target.value)} placeholder="10.0.10.100" /></label>
                <label className="form-group"><span>IP bis</span><input type="text" value={form.ipEnd} onChange={e => setField('ipEnd', e.target.value)} placeholder="10.0.10.150" /></label>
              </div>
              <div className="form-row-2">
                <label className="form-group"><span>Präfix (CIDR)</span><input type="number" min="8" max="32" value={form.ipPrefix} onChange={e => setField('ipPrefix', e.target.value)} placeholder="24" /></label>
                <label className="form-group"><span>Gateway</span><input type="text" value={form.gateway} onChange={e => setField('gateway', e.target.value)} placeholder="10.0.10.1" /></label>
              </div>
              <div className="form-row-2">
                <label className="form-group"><span>Bridge</span><input type="text" value={form.bridge} onChange={e => setField('bridge', e.target.value)} placeholder="vmbr0" /></label>
                <label className="form-group"><span>Disk-Storage</span><select value={storageNames.includes(form.storage) ? form.storage : ''} onChange={e => setField('storage', e.target.value)} disabled={storages.length === 0}>{storages.length === 0 && <option value="">Keine Live-Storage gefunden</option>}{storages.length > 0 && !storageNames.includes(form.storage) && <option value="" disabled>Bitte auswählen</option>}{storages.map(s => <option key={s.storage} value={s.storage}>{s.storage}{s.type ? ` (${s.type})` : ''}</option>)}</select></label>
              </div>

              <div className="provision-block">
                  <div className="storage-row">
                    <label className="form-group"><span>CT-Template-Storage</span><input type="text" value={form.templateStorage} onChange={e => setField('templateStorage', e.target.value)} placeholder="local" /></label>
                    <button type="button" className="btn-secondary storage-fetch-btn" onClick={loadTemplates}>Templates abrufen</button>
                  </div>
                  {templates.length > 0 && (
                    <div className="select-list">
                      <div className="select-list-head">
                        <span>{templates.length} Template(s) gefunden – wähle die freigegebenen</span>
                        <div className="select-list-actions">
                          <button type="button" onClick={() => setField('allowedTemplates', templates.map(t => t.volid))}>Alle</button>
                          <button type="button" onClick={() => setField('allowedTemplates', [])}>Keine</button>
                        </div>
                      </div>
                      {templates.map(t => (
                        <label key={t.volid} className="select-list-item">
                          <input type="checkbox" checked={form.allowedTemplates.includes(t.volid)} onChange={e => toggleAllowed('allowedTemplates', t.volid, e.target.checked)} />
                          <span>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {form.allowedTemplates.length > 0 && templates.length === 0 && (
                    <small className="hint-text">{form.allowedTemplates.length} Template(s) freigegeben. „Templates abrufen", um die Auswahl zu ändern.</small>
                  )}
              </div>

              <div className="form-row-3">
                <label className="form-group"><span>Max. Kerne</span><input type="number" min="1" value={form.maxCores} onChange={e => setField('maxCores', e.target.value)} /></label>
                <label className="form-group"><span>Max. RAM (MB)</span><input type="number" min="256" step="256" value={form.maxMemoryMb} onChange={e => setField('maxMemoryMb', e.target.value)} /></label>
                <label className="form-group"><span>Max. Disk (GB)</span><input type="number" min="4" value={form.maxDiskGb} onChange={e => setField('maxDiskGb', e.target.value)} /></label>
              </div>

              <label className="form-group"><span>Standard-Root-Passwort (optional)</span><input type="password" value={form.defaultPassword} onChange={e => setField('defaultPassword', e.target.value)} placeholder={caps ? 'Leer lassen, wenn unverändert' : ''} autoComplete="new-password" /></label>
            </>
          )}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Speichern...' : 'Konfiguration speichern'}</button>
          </div>
        </form>
      )}

      {clusterId && busy && !loaded && <div className="loading inline-loading"><span className="spinner"></span><span>Laden...</span></div>}
    </section>
  );
}

function CapabilityBadges({ caps }) {
  const items = [
    ['Lesen', true],
    ['Power', caps.canPower],
    ['Konsole', caps.canConsole],
    ['Erstellen', caps.canProvision]
  ];
  return (
    <div className="capability-badges">
      {items.map(([label, ok]) => (
        <span key={label} className={`capability-badge ${ok ? 'capability-ok' : 'capability-missing'}`}>{label}</span>
      ))}
    </div>
  );
}

function renderAuditAction(action) {
  const map = {
    'power.start': 'Maschine gestartet',
    'power.stop': 'Maschine gestoppt',
    'power.shutdown': 'Maschine heruntergefahren',
    'power.reboot': 'Maschine neu gestartet',
    'console.open': 'Konsole geöffnet',
    'credential.create': 'Zugangsdaten angelegt',
    'credential.update': 'Zugangsdaten geändert',
    'credential.delete': 'Zugangsdaten gelöscht',
    'credential.reveal': 'Passwort angezeigt',
    'machine.create': 'Maschine erstellt',
    'machine.delete': 'Maschine gelöscht',
    'group.create': 'Gruppe angelegt',
    'group.update': 'Gruppe geändert',
    'group.delete': 'Gruppe gelöscht',
    'cluster.create': 'Cluster angelegt',
    'cluster.update': 'Cluster geändert',
    'cluster.provisioning': 'Self-Service konfiguriert',
    'admin.credential.create': 'Zugangsdaten angelegt (Vault)',
    'admin.credential.update': 'Zugangsdaten geändert (Vault)',
    'admin.credential.delete': 'Zugangsdaten gelöscht (Vault)',
    'admin.credential.reveal': 'Passwort angezeigt (Vault)',
    'resource.create': 'Dienst angelegt',
    'resource.update': 'Dienst geändert',
    'password.change': 'Passwort geändert'
  };
  return map[action] || action;
}

function formatAuditTime(value) {  if (!value) return '';
  const date = new Date(`${value}Z`.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
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

function ResourceCard({ resource, onEdit, onDelete, onManageCredentials, actionLoading }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cpuPercent = getCpuPercent(resource);
  const memPercent = getPercent(resource.mem, resource.maxmem);
  const publicUrl = resource.publicUrl || resource.webUrl;
  const ipAddress = getPrimaryIp(resource);

  return (
    <article className="resource-card compact-resource-card">
      <div className="resource-card-header">
        <div><span className="resource-id">{renderType(resource.type)} · {resource.containerId}</span><h2>{resource.name}</h2></div>
        <span className={`status-badge status-${resource.status || 'unknown'}`}>{renderStatus(resource.status)}</span>
      </div>

      <div className="resource-summary">
        <div><span>Benutzer</span><strong>{resource.userName || resource.userEmail || 'Nicht gesetzt'}</strong></div>
        <div><span>Cluster</span><strong>{resource.clusterName || 'Unbekannt'}</strong></div>
        <div><span>IP-Adresse</span><strong>{ipAddress || 'Nicht bekannt'}</strong></div>
        {resource.groupName && <div><span>Gruppe</span><strong>{resource.groupName}</strong></div>}
      </div>

      <Metric label="CPU" percent={cpuPercent} detail={`${cpuPercent.toFixed(1)} %`} />
      <Metric label="RAM" percent={memPercent} detail={`${formatBytes(resource.mem)} / ${formatBytes(resource.maxmem)}`} />

      {(publicUrl || resource.adminUrl) && (
        <div className="service-link-row">
          {publicUrl && <a className="btn-secondary full-button" href={publicUrl} target="_blank" rel="noreferrer">Öffentliche Seite</a>}
          {resource.adminUrl && <a className="btn-secondary full-button" href={resource.adminUrl} target="_blank" rel="noreferrer">Verwaltungsseite</a>}
        </div>
      )}

      <button type="button" className="btn-secondary full-button service-detail-toggle" onClick={() => setDetailsOpen(true)}>
        Details anzeigen
      </button>

      {detailsOpen && (
        <Modal title={`Details · ${resource.name}`} onClose={() => setDetailsOpen(false)} className="detail-modal-card">
          <div className="resource-details detail-modal-content">
            <div className="resource-meta">
              <span>Benutzer</span><span>{resource.userName || resource.userEmail || 'Nicht gesetzt'}</span>
              <span>Cluster</span><span>{resource.clusterName || 'Unbekannt'}</span>
              <span>Node</span><span>{resource.node || 'Unbekannt'}</span>
              <span>Typ</span><span>{renderType(resource.type)}</span>
              <span>ID</span><span>{resource.containerId || 'Unbekannt'}</span>
              <span>IP-Adresse</span><span>{ipAddress || 'Nicht bekannt'}</span>
              <span>Status</span><span>{renderStatus(resource.status)}</span>
            </div>
            <DiskDetails resource={resource} />
            <div className="button-stack">
              <button type="button" className="btn-secondary full-button" onClick={() => { setDetailsOpen(false); onManageCredentials(resource); }}>Zugangsdaten hinterlegen</button>
              <button type="button" className="btn-secondary full-button" onClick={() => { setDetailsOpen(false); onEdit(resource); }}>Bearbeiten</button>
              <button type="button" className="btn-danger full-button" onClick={() => { setDetailsOpen(false); onDelete(resource.id); }} disabled={actionLoading}>Entfernen</button>
            </div>
            {resource.monitorError && <p className="hint-text">Monitoring nicht erreichbar.</p>}
          </div>
        </Modal>
      )}
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

function getPercent(value, max) {
  if (!max) return 0;
  return Math.min(Math.max((Number(value) / Number(max)) * 100, 0), 100);
}

function getPrimaryIp(resource) {
  if (resource.primaryIp) return resource.primaryIp;
  const ips = Array.isArray(resource.ips) ? resource.ips : [];
  return ips.find(item => item.ipv4)?.ipv4 || '';
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
  return 'Dienst';
}
