import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalShell from '../components/PortalShell';
import {
  DashboardIcon,
  ServerIcon,
  UserIcon,
  SettingsIcon,
  GlobeIcon,
  BookIcon,
  HomeIcon,
  BellIcon,
  LockIcon,
  LinkIcon
} from '../components/Icons';
import { EmptyState, InlineNotice, SectionCard, StatCard, StatusBadge } from '../components/UiBits';
import { useAuth } from '../context/AuthContext';
import { adminApi, getErrorMessage } from '../services/api';
import { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';
import ActionModal from '../components/ActionModal';
import PangolinSettingsPanel from '../components/PangolinSettingsPanel';
import WikiAdminPanel from '../components/WikiAdminPanel';
import HostingPortalSettings from '../components/HostingPortalSettings';
import AdminEmailSettings from '../components/AdminEmailSettings';
import AdminAccountSettings from '../components/AdminAccountSettings';
import SelfServiceSettings from '../components/SelfServiceSettings';
import TemplateManager from '../components/TemplateManager';
import MaintenanceManager from '../components/MaintenanceManager';
import AuditLog from '../components/AuditLog';

function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(number >= 10 ? 0 : 1)}%`;
}

function CrudTable({ columns, rows, renderActions, emptyText = 'Nothing here yet.' }) {
  if (!rows.length) return <EmptyState title="No entries" text={emptyText} />;
  return (
    <div className="crud-table-wrap">
      <table className="crud-table-clean">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            {renderActions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
              {renderActions ? <td className="actions-cell">{renderActions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminOverview({ users, clusters, resources, groups, clusterStats, onOpen }) {
  const onlineClusters = clusterStats.filter((item) => !item.error).length;
  const totalNodes = clusterStats.reduce((sum, item) => sum + Number(item.totals?.nodes || 0), 0);
  const runningServices = resources.filter((item) => String(item.status || '').toLowerCase().includes('run')).length;

  return (
    <div className="dashboard-grid-full admin-dashboard-grid">
      <section className="hero-card-clean span-2">
        <div>
          <p className="eyebrow-clean">Administrator overview</p>
          <h2>Infrastructure without the settings maze.</h2>
          <p>Operational tools now have their own places in the main navigation, while Settings is only for your account.</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn-primary" onClick={() => onOpen('services')}>Manage services</button>
        </div>
      </section>

      <StatCard label="Services" value={resources.length} hint={`${runningServices} running`} tone="success" />
      <StatCard label="Users" value={users.length} hint="Portal accounts" />
      <StatCard label="Clusters" value={clusters.length} hint={`${onlineClusters} reachable`} tone={clusters.length && onlineClusters === clusters.length ? 'success' : 'neutral'} />
      <StatCard label="Groups" value={groups.length} hint="Customer groups" />
      <StatCard label="Nodes" value={totalNodes} hint="Across all Proxmox clusters" />

      <SectionCard title="Cluster capacity" subtitle="Live totals from connected Proxmox clusters" className="span-2">
        <div className="cluster-stat-grid">
          {clusterStats.map((cluster) => (
            <div key={cluster.id} className="cluster-stat-card">
              <div className="cluster-stat-head">
                <div>
                  <strong>{cluster.name}</strong>
                  <span>{cluster.location_label || cluster.url}</span>
                </div>
                {cluster.error ? <span className="status-badge danger">Offline</span> : <span className="status-badge success">Online</span>}
              </div>
              <div className="cluster-stat-body">
                <div><span>CPU</span><strong>{formatPercent(cluster.totals?.cpuPercent)}</strong></div>
                <div><span>Memory</span><strong>{formatPercent(cluster.totals?.memPercent)}</strong></div>
                <div><span>Storage</span><strong>{formatPercent(cluster.totals?.storagePercent)}</strong></div>
                <div><span>Nodes</span><strong>{cluster.totals?.nodes || 0}</strong></div>
              </div>
              {cluster.error ? <small className="cluster-error-line">{cluster.error}</small> : null}
            </div>
          ))}
          {!clusterStats.length ? <EmptyState title="No cluster stats" text="Add a cluster to view live infrastructure data." /> : null}
        </div>
      </SectionCard>

      <SectionCard title="Administration shortcuts" subtitle="The important configuration areas are now first-class pages">
        <div className="admin-shortcut-grid">
          <button type="button" onClick={() => onOpen('portal')}><strong>Hosting Portal</strong><span>Health and core portal configuration</span></button>
          <button type="button" onClick={() => onOpen('email')}><strong>Email</strong><span>SMTP and test delivery</span></button>
          <button type="button" onClick={() => onOpen('selfservice')}><strong>Self-Service</strong><span>Container provisioning limits</span></button>
          <button type="button" onClick={() => onOpen('pangolin')}><strong>Pangolin</strong><span>Publishing and remote access</span></button>
          <button type="button" onClick={() => onOpen('maintenance')}><strong>Maintenance</strong><span>Plan and communicate outages</span></button>
          <button type="button" onClick={() => onOpen('audit')}><strong>Audit log</strong><span>Trace administrative actions</span></button>
        </div>
      </SectionCard>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(requestedTab);
  const [language, setLanguage] = useState(readStoredLanguage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [users, setUsers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [resources, setResources] = useState([]);
  const [groups, setGroups] = useState([]);
  const [clusterStats, setClusterStats] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, clustersRes, resourcesRes, groupsRes, statsRes] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getClusters(),
        adminApi.getResources(),
        adminApi.getGroups(),
        adminApi.getClusterStats().catch(() => ({ data: { clusters: [] } }))
      ]);
      setUsers(usersRes.data?.users || []);
      setClusters(clustersRes.data?.clusters || []);
      setResources(resourcesRes.data?.resources || []);
      setGroups(groupsRes.data?.groups || []);
      setClusterStats(statsRes.data?.clusters || []);
    } catch (err) {
      setError(getErrorMessage(err, 'The admin dashboard could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && requested !== activeTab) setActiveTab(requested);
  }, [searchParams, activeTab]);

  const selectTab = (key) => {
    setActiveTab(key);
    setSearchParams(key === 'overview' ? {} : { tab: key });
  };

  const changeLanguage = (value) => {
    setLanguage(value);
    storeLanguage(value);
  };

  const closeModal = () => setModal(null);
  const openUserModal = (entry = null) => setModal({ type: 'user', mode: entry ? 'edit' : 'create', data: entry || { name: '', email: '', password: '', role: 'user' } });
  const openClusterModal = (entry = null) => setModal({ type: 'cluster', mode: entry ? 'edit' : 'create', data: entry || { name: '', url: '', apiToken: '' } });
  const openGroupModal = (entry = null) => setModal({ type: 'group', mode: entry ? 'edit' : 'create', data: entry || { name: '' } });
  const openResourceModal = (entry = null) => setModal({
    type: 'resource',
    mode: entry ? 'edit' : 'create',
    data: entry || { name: '', containerId: '', clusterId: clusters[0]?.id || '', userId: '', groupId: '', adminUrl: '' }
  });

  const saveModal = async (event) => {
    event.preventDefault();
    if (!modal) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { type, mode, data } = modal;
      if (type === 'user') {
        if (mode === 'create') await adminApi.createUser(data);
        else await adminApi.updateUser(data.id, data);
      }
      if (type === 'cluster') {
        if (mode === 'create') await adminApi.createCluster(data);
        else await adminApi.updateCluster(data.id, data);
      }
      if (type === 'group') {
        if (mode === 'create') await adminApi.createGroup(data);
        else await adminApi.updateGroup(data.id, data);
      }
      if (type === 'resource') {
        const payload = { ...data, userId: data.userId || null, groupId: data.groupId || null };
        if (mode === 'create') await adminApi.createResource(payload);
        else await adminApi.updateResource(data.id, payload);
      }
      setNotice('Saved successfully.');
      closeModal();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'The entry could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (kind, entry) => {
    if (!window.confirm(`Delete ${entry.name || entry.email || 'this entry'}?`)) return;
    setError('');
    setNotice('');
    try {
      if (kind === 'user') await adminApi.deleteUser(entry.id);
      if (kind === 'cluster') await adminApi.deleteCluster(entry.id);
      if (kind === 'group') await adminApi.deleteGroup(entry.id);
      if (kind === 'resource') await adminApi.deleteResource(entry.id);
      setNotice('Deleted successfully.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'The entry could not be deleted.'));
    }
  };

  const navItems = [
    { key: 'overview', label: 'Overview', icon: HomeIcon, section: 'Workspace' },
    { key: 'services', label: 'Services', icon: ServerIcon, section: 'Workspace', count: resources.length },
    { key: 'users', label: 'Users', icon: UserIcon, section: 'Workspace', count: users.length },
    { key: 'groups', label: 'Groups', icon: DashboardIcon, section: 'Workspace', count: groups.length },
    { key: 'wiki', label: 'Wiki', icon: BookIcon, section: 'Workspace' },

    { key: 'clusters', label: 'Clusters', icon: GlobeIcon, section: 'Infrastructure', count: clusters.length },
    { key: 'templates', label: 'Templates', icon: ServerIcon, section: 'Infrastructure' },
    { key: 'selfservice', label: 'Self-Service', icon: UserIcon, section: 'Infrastructure' },
    { key: 'maintenance', label: 'Maintenance', icon: BellIcon, section: 'Infrastructure' },

    { key: 'portal', label: 'Hosting Portal', icon: DashboardIcon, section: 'Platform' },
    { key: 'email', label: 'Email', icon: BellIcon, section: 'Platform' },
    { key: 'pangolin', label: 'Pangolin', icon: LinkIcon, section: 'Platform' },
    { key: 'audit', label: 'Audit Log', icon: LockIcon, section: 'Platform' },

    { key: 'settings', label: 'Settings', icon: SettingsIcon, section: 'Account' }
  ];

  const usersColumns = useMemo(() => [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' }
  ], []);
  const clustersColumns = useMemo(() => [
    { key: 'name', label: 'Name' },
    { key: 'url', label: 'URL' },
    { key: 'location', label: 'Location', render: (row) => row.location_label || '—' }
  ], []);
  const groupColumns = useMemo(() => [{ key: 'name', label: 'Name' }], []);
  const resourceColumns = useMemo(() => [
    { key: 'name', label: 'Name' },
    { key: 'clusterName', label: 'Cluster', render: (row) => row.clusterName || row.cluster_name || '—' },
    { key: 'owner', label: 'Owner', render: (row) => row.userName || row.user_name || row.groupName || row.group_name || '—' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'containerId', label: 'ID', render: (row) => row.containerId || row.container_id || '—' }
  ], []);

  let content = null;
  if (loading && ['overview', 'services', 'users', 'groups', 'clusters'].includes(activeTab)) {
    content = <SectionCard><div className="page-state-clean">Loading…</div></SectionCard>;
  } else if (activeTab === 'overview') {
    content = <AdminOverview users={users} clusters={clusters} resources={resources} groups={groups} clusterStats={clusterStats} onOpen={selectTab} />;
  } else if (activeTab === 'users') {
    content = <SectionCard title="Users" subtitle="Portal accounts and access" action={<button type="button" className="btn-primary" onClick={() => openUserModal()}>Add user</button>}><CrudTable columns={usersColumns} rows={users} renderActions={(entry) => <><button type="button" className="btn-secondary btn-small" onClick={() => openUserModal(entry)}>Edit</button><button type="button" className="btn-danger btn-small" onClick={() => removeEntry('user', entry)}>Delete</button></>} emptyText="Create the first portal user." /></SectionCard>;
  } else if (activeTab === 'clusters') {
    content = <SectionCard title="Clusters" subtitle="Connected Proxmox backends" action={<button type="button" className="btn-primary" onClick={() => openClusterModal()}>Add cluster</button>}><CrudTable columns={clustersColumns} rows={clusters} renderActions={(entry) => <><button type="button" className="btn-secondary btn-small" onClick={() => openClusterModal(entry)}>Edit</button><button type="button" className="btn-danger btn-small" onClick={() => removeEntry('cluster', entry)}>Delete</button></>} emptyText="Add a Proxmox cluster to start managing infrastructure." /></SectionCard>;
  } else if (activeTab === 'groups') {
    content = <SectionCard title="Groups" subtitle="Customer groups for service assignment" action={<button type="button" className="btn-primary" onClick={() => openGroupModal()}>Add group</button>}><CrudTable columns={groupColumns} rows={groups} renderActions={(entry) => <><button type="button" className="btn-secondary btn-small" onClick={() => openGroupModal(entry)}>Edit</button><button type="button" className="btn-danger btn-small" onClick={() => removeEntry('group', entry)}>Delete</button></>} emptyText="Groups help you assign services to teams or customers." /></SectionCard>;
  } else if (activeTab === 'services') {
    content = <SectionCard title="Services" subtitle="Assignments visible to portal users" action={<button type="button" className="btn-primary" onClick={() => openResourceModal()}>Add service</button>}><CrudTable columns={resourceColumns} rows={resources} renderActions={(entry) => <><button type="button" className="btn-secondary btn-small" onClick={() => openResourceModal(entry)}>Edit</button><button type="button" className="btn-danger btn-small" onClick={() => removeEntry('resource', entry)}>Delete</button></>} emptyText="Assign the first service to a user or a group." /></SectionCard>;
  } else if (activeTab === 'wiki') {
    content = <SectionCard title="Wiki" subtitle="Manage documentation and articles"><WikiAdminPanel language={language} /></SectionCard>;
  } else if (activeTab === 'templates') {
    content = <TemplateManager clusters={clusters} />;
  } else if (activeTab === 'selfservice') {
    content = <SelfServiceSettings clusters={clusters} />;
  } else if (activeTab === 'maintenance') {
    content = <MaintenanceManager />;
  } else if (activeTab === 'portal') {
    content = <HostingPortalSettings />;
  } else if (activeTab === 'email') {
    content = <AdminEmailSettings />;
  } else if (activeTab === 'pangolin') {
    content = <SectionCard title="Pangolin" subtitle="Public publishing and remote access"><PangolinSettingsPanel language={language} /></SectionCard>;
  } else if (activeTab === 'audit') {
    content = <AuditLog />;
  } else if (activeTab === 'settings') {
    content = <AdminAccountSettings language={language} onLanguageChange={changeLanguage} />;
  }

  const activeItem = navItems.find((item) => item.key === activeTab);

  return (
    <>
      <PortalShell
        user={user}
        title={activeItem?.label || 'Overview'}
        subtitle={activeTab === 'settings' ? 'Your personal administrator preferences.' : 'Full-width administration for the hosting portal.'}
        navItems={navItems}
        activeKey={activeTab}
        onSelect={selectTab}
        onLogout={logout}
        language={language}
        onLanguageChange={changeLanguage}
        footer={<span>Hosting by TechByGiusi · Administrator workspace</span>}
      >
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        {content}
      </PortalShell>

      {modal ? (
        <ActionModal title={`${modal.mode === 'create' ? 'Create' : 'Edit'} ${modal.type}`} onClose={closeModal}>
          <form className="clean-form-grid compact" onSubmit={saveModal}>
            {modal.type === 'user' ? <>
              <label><span>Name</span><input value={modal.data.name || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label>
              <label><span>Email</span><input type="email" value={modal.data.email || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, email: event.target.value } }))} required /></label>
              <label><span>Role</span><select value={modal.data.role || 'user'} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, role: event.target.value } }))}><option value="user">User</option><option value="admin">Admin</option></select></label>
              <label><span>Password {modal.mode === 'edit' ? '(optional)' : ''}</span><input type="password" value={modal.data.password || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, password: event.target.value } }))} required={modal.mode === 'create'} /></label>
            </> : null}

            {modal.type === 'cluster' ? <>
              <label><span>Name</span><input value={modal.data.name || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label>
              <label><span>URL</span><input value={modal.data.url || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, url: event.target.value } }))} required /></label>
              <label className="span-full"><span>API token {modal.mode === 'edit' ? '(leave empty to keep existing)' : ''}</span><textarea rows="4" value={modal.data.apiToken || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, apiToken: event.target.value } }))} required={modal.mode === 'create'} /></label>
            </> : null}

            {modal.type === 'group' ? <label><span>Name</span><input value={modal.data.name || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label> : null}

            {modal.type === 'resource' ? <>
              <label><span>Name</span><input value={modal.data.name || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} /></label>
              <label><span>Service / VM ID</span><input value={modal.data.containerId || modal.data.container_id || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, containerId: event.target.value } }))} required /></label>
              <label><span>Cluster</span><select value={modal.data.clusterId || modal.data.cluster_id || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, clusterId: event.target.value } }))} required><option value="">Select cluster</option>{clusters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label><span>User</span><select value={modal.data.userId || modal.data.user_id || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, userId: event.target.value, groupId: '' } }))}><option value="">No direct user</option>{users.filter((entry) => entry.role === 'user').map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.email}</option>)}</select></label>
              <label><span>Group</span><select value={modal.data.groupId || modal.data.group_id || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, groupId: event.target.value, userId: '' } }))}><option value="">No group</option>{groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label className="span-full"><span>Admin URL</span><input value={modal.data.adminUrl || modal.data.admin_url || ''} onChange={(event) => setModal((current) => ({ ...current, data: { ...current.data, adminUrl: event.target.value } }))} placeholder="https://example.com" /></label>
            </> : null}

            <div className="form-actions left span-full">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </ActionModal>
      ) : null}
    </>
  );
}
