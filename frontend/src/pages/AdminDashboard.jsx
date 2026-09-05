import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalShell from '../components/PortalShell';
import PageSkeleton from '../components/PageSkeleton';
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
    <div className="admin-overview-v4">
      <section className="hero-card-clean admin-overview-hero-v4">
        <div>
          <p className="eyebrow-clean">Administrator</p>
          <h2>{runningServices} of {resources.length} services running</h2>
          <p>{onlineClusters} of {clusters.length} clusters reachable · {totalNodes} nodes</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => onOpen('services')}>Manage services</button>
      </section>

      <div className="admin-overview-stats-v4">
        <StatCard label="Services" value={resources.length} hint={`${runningServices} running`} tone="success" />
        <StatCard label="Users" value={users.length} hint="Portal accounts" />
        <StatCard label="Clusters" value={clusters.length} hint={`${onlineClusters} reachable`} tone={clusters.length && onlineClusters === clusters.length ? 'success' : 'neutral'} />
        <StatCard label="Groups" value={groups.length} hint="Access groups" />
        <StatCard label="Nodes" value={totalNodes} hint="Proxmox nodes" />
      </div>

      <SectionCard title="Cluster capacity" className="admin-cluster-capacity-v4">
        <div className="cluster-stat-grid admin-cluster-grid-v4">
          {clusterStats.map((cluster) => (
            <div key={cluster.id} className="cluster-stat-card">
              <div className="cluster-stat-head">
                <div><strong>{cluster.name}</strong><span>{cluster.location_label || cluster.url}</span></div>
                <span className={`status-badge ${cluster.error ? 'danger' : 'success'}`}>{cluster.error ? 'Offline' : 'Online'}</span>
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
          {!clusterStats.length ? <EmptyState title="No cluster stats" text="Add a cluster to view live data." /> : null}
        </div>
      </SectionCard>

      <SectionCard title="Quick access" className="admin-quick-access-v4">
        <div className="admin-shortcut-grid admin-shortcut-grid-v4">
          <button type="button" onClick={() => onOpen('selfservice')}><strong>Self-Service</strong><span>Provisioning</span></button>
          <button type="button" onClick={() => onOpen('pangolin')}><strong>Pangolin</strong><span>Publishing</span></button>
          <button type="button" onClick={() => onOpen('maintenance')}><strong>Maintenance</strong><span>Windows</span></button>
          <button type="button" onClick={() => onOpen('email')}><strong>Email</strong><span>SMTP</span></button>
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
  const [editor, setEditor] = useState(null);
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
    if (requested && requested !== activeTab) {
      setActiveTab(requested);
      setEditor(null);
    }
  }, [searchParams, activeTab]);

  const selectTab = (key) => {
    setActiveTab(key);
    setEditor(null);
    setSearchParams(key === 'overview' ? {} : { tab: key });
  };

  const changeLanguage = (value) => {
    setLanguage(value);
    storeLanguage(value);
  };

  const openUserEditor = (entry = null) => setEditor({ type: 'user', mode: entry ? 'edit' : 'create', data: entry ? { ...entry, password: '' } : { name: '', email: '', password: '', role: 'user' } });
  const openClusterEditor = (entry = null) => setEditor({ type: 'cluster', mode: entry ? 'edit' : 'create', data: entry ? { ...entry, apiToken: '' } : { name: '', url: '', apiToken: '' } });
  const openGroupEditor = (entry = null) => setEditor({ type: 'group', mode: entry ? 'edit' : 'create', data: entry ? { ...entry } : { name: '' } });
  const openResourceEditor = (entry = null) => setEditor({
    type: 'resource',
    mode: entry ? 'edit' : 'create',
    data: entry ? { ...entry } : { name: '', containerId: '', clusterId: clusters[0]?.id || '', userId: '', groupId: '', adminUrl: '' }
  });

  const saveEditor = async (event) => {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { type, mode, data } = editor;
      if (type === 'user') {
        const payload = { ...data };
        if (mode === 'edit' && !payload.password) delete payload.password;
        if (mode === 'create') await adminApi.createUser(payload);
        else await adminApi.updateUser(data.id, payload);
      }
      if (type === 'cluster') {
        const payload = { ...data };
        if (mode === 'edit' && !payload.apiToken) delete payload.apiToken;
        if (mode === 'create') await adminApi.createCluster(payload);
        else await adminApi.updateCluster(data.id, payload);
      }
      if (type === 'group') {
        if (mode === 'create') await adminApi.createGroup(data);
        else await adminApi.updateGroup(data.id, data);
      }
      if (type === 'resource') {
        const payload = {
          ...data,
          containerId: data.containerId || data.container_id,
          clusterId: data.clusterId || data.cluster_id,
          userId: data.userId || data.user_id || null,
          groupId: data.groupId || data.group_id || null,
          adminUrl: data.adminUrl ?? data.admin_url ?? ''
        };
        if (mode === 'create') await adminApi.createResource(payload);
        else await adminApi.updateResource(data.id, payload);
      }
      setNotice('Saved successfully.');
      setEditor(null);
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
      if (editor?.type === kind && editor?.data?.id === entry.id) setEditor(null);
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


  const searchItems = useMemo(() => {
    const serviceItems = resources.map((entry) => ({
      id: `service-${entry.id}`,
      label: entry.name,
      description: `${entry.clusterName || entry.cluster_name || 'Unknown cluster'} · Service ${entry.containerId || entry.container_id || ''}`,
      category: 'Service',
      icon: ServerIcon,
      keywords: `${entry.name || ''} ${entry.clusterName || entry.cluster_name || ''} ${entry.node || ''} ${entry.containerId || entry.container_id || ''}`,
      onSelect: () => { selectTab('services'); openResourceEditor(entry); }
    }));
    const userItems = users.map((entry) => ({
      id: `user-${entry.id}`,
      label: entry.name || entry.email,
      description: entry.email,
      category: 'User',
      icon: UserIcon,
      keywords: `${entry.name || ''} ${entry.email || ''} ${entry.role || ''}`,
      onSelect: () => { selectTab('users'); openUserEditor(entry); }
    }));
    const clusterItems = clusters.map((entry) => ({
      id: `cluster-${entry.id}`,
      label: entry.name,
      description: entry.location_label || entry.url,
      category: 'Cluster',
      icon: GlobeIcon,
      keywords: `${entry.name || ''} ${entry.url || ''} ${entry.location_label || ''}`,
      onSelect: () => { selectTab('clusters'); openClusterEditor(entry); }
    }));
    const groupItems = groups.map((entry) => ({
      id: `group-${entry.id}`,
      label: entry.name,
      description: 'Access group',
      category: 'Group',
      icon: DashboardIcon,
      keywords: entry.name || '',
      onSelect: () => { selectTab('groups'); openGroupEditor(entry); }
    }));
    return [...serviceItems, ...userItems, ...clusterItems, ...groupItems];
  }, [resources, users, clusters, groups]);

  const renderEditorPage = (type, listTitle) => {
    if (!editor || editor.type !== type) return null;
    const title = `${editor.mode === 'create' ? 'Create' : 'Edit'} ${type}`;
    return (
      <div className="admin-editor-replacement">
        <div className="subpage-back-row">
          <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>← Back to {listTitle}</button>
        </div>
        <SectionCard title={title} subtitle={editor.mode === 'create' ? `Add a new ${type}.` : `Update ${editor.data.name || editor.data.email || `this ${type}`}.`}>
          <form className="clean-form-grid compact admin-editor-form" onSubmit={saveEditor}>
            {type === 'user' ? <>
              <label><span>Name</span><input value={editor.data.name || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label>
              <label><span>Email</span><input type="email" value={editor.data.email || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, email: event.target.value } }))} required /></label>
              <label><span>Role</span><select value={editor.data.role || 'user'} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, role: event.target.value } }))}><option value="user">User</option><option value="admin">Admin</option></select></label>
              <label><span>Password {editor.mode === 'edit' ? '(optional)' : ''}</span><input type="password" value={editor.data.password || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, password: event.target.value } }))} required={editor.mode === 'create'} /></label>
            </> : null}

            {type === 'cluster' ? <>
              <label><span>Name</span><input value={editor.data.name || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label>
              <label><span>URL</span><input value={editor.data.url || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, url: event.target.value } }))} required /></label>
              <label className="span-full"><span>API token {editor.mode === 'edit' ? '(leave empty to keep existing)' : ''}</span><textarea rows="6" value={editor.data.apiToken || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, apiToken: event.target.value } }))} required={editor.mode === 'create'} /></label>
            </> : null}

            {type === 'group' ? <label><span>Name</span><input value={editor.data.name || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label> : null}

            {type === 'resource' ? <>
              <label><span>Name</span><input value={editor.data.name || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} /></label>
              <label><span>Service / VM ID</span><input value={editor.data.containerId || editor.data.container_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, containerId: event.target.value } }))} required /></label>
              <label><span>Cluster</span><select value={editor.data.clusterId || editor.data.cluster_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, clusterId: event.target.value } }))} required><option value="">Select cluster</option>{clusters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label><span>User</span><select value={editor.data.userId || editor.data.user_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, userId: event.target.value, user_id: '', groupId: '', group_id: '' } }))}><option value="">No direct user</option>{users.filter((entry) => entry.role === 'user').map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.email}</option>)}</select></label>
              <label><span>Group</span><select value={editor.data.groupId || editor.data.group_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, groupId: event.target.value, group_id: '', userId: '', user_id: '' } }))}><option value="">No group</option>{groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label><span>Admin URL</span><input value={editor.data.adminUrl ?? editor.data.admin_url ?? ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, adminUrl: event.target.value } }))} placeholder="https://example.com" /></label>
            </> : null}

            <div className="form-actions left span-full">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </SectionCard>
      </div>
    );
  };

  const renderCrudWorkspace = ({ type, title, subtitle, addLabel, columns, rows, onAdd, onEdit, emptyText }) => {
    if (editor?.type === type) return renderEditorPage(type, title);
    return (
      <SectionCard title={title} subtitle={subtitle} action={<button type="button" className="btn-primary" onClick={onAdd}>{addLabel}</button>}>
        <CrudTable
          columns={columns}
          rows={rows}
          renderActions={(entry) => <>
            <button type="button" className="btn-secondary btn-small" onClick={() => onEdit(entry)}>Edit</button>
            <button type="button" className="btn-danger btn-small" onClick={() => removeEntry(type, entry)}>Delete</button>
          </>}
          emptyText={emptyText}
        />
      </SectionCard>
    );
  };

  let content = null;
  if (loading && ['overview', 'services', 'users', 'groups', 'clusters'].includes(activeTab)) {
    content = <PageSkeleton variant={activeTab === 'overview' ? 'dashboard' : 'table'} />;
  } else if (activeTab === 'overview') {
    content = <AdminOverview users={users} clusters={clusters} resources={resources} groups={groups} clusterStats={clusterStats} onOpen={selectTab} />;
  } else if (activeTab === 'users') {
    content = renderCrudWorkspace({ type: 'user', title: 'Users', subtitle: 'Portal accounts and access', addLabel: 'Add user', columns: usersColumns, rows: users, onAdd: () => openUserEditor(), onEdit: openUserEditor, emptyText: 'Create the first portal user.' });
  } else if (activeTab === 'clusters') {
    content = renderCrudWorkspace({ type: 'cluster', title: 'Clusters', subtitle: 'Connected Proxmox backends', addLabel: 'Add cluster', columns: clustersColumns, rows: clusters, onAdd: () => openClusterEditor(), onEdit: openClusterEditor, emptyText: 'Add a Proxmox cluster to start managing infrastructure.' });
  } else if (activeTab === 'groups') {
    content = renderCrudWorkspace({ type: 'group', title: 'Groups', subtitle: 'Customer groups for service assignment', addLabel: 'Add group', columns: groupColumns, rows: groups, onAdd: () => openGroupEditor(), onEdit: openGroupEditor, emptyText: 'Groups help you assign services to teams or customers.' });
  } else if (activeTab === 'services') {
    content = renderCrudWorkspace({ type: 'resource', title: 'Services', subtitle: 'Assignments visible to portal users', addLabel: 'Add service', columns: resourceColumns, rows: resources, onAdd: () => openResourceEditor(), onEdit: openResourceEditor, emptyText: 'Assign the first service to a user or a group.' });
  } else if (activeTab === 'wiki') {
    content = <WikiAdminPanel language={language} />;
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
  const activeSubtitle = '';

  return (
    <PortalShell
      user={user}
      title={activeItem?.label || 'Overview'}
      subtitle={activeSubtitle}
      navItems={navItems}
      activeKey={activeTab}
      onSelect={selectTab}
      onLogout={logout}
      onOpenSettings={() => selectTab('settings')}
      language={language}
      searchItems={searchItems}
    >
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {content}
    </PortalShell>
  );
}
