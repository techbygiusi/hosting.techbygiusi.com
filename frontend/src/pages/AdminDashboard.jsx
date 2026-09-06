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
  LinkIcon,
  BillingIcon
} from '../components/Icons';
import { EmptyState, InlineNotice, SectionCard, StatCard, StatusBadge } from '../components/UiBits';
import { useAuth } from '../context/AuthContext';
import { adminApi, getErrorMessage } from '../services/api';
import { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';
import PangolinSettingsPanel from '../components/PangolinSettingsPanel';
import WikiAdminPanel from '../components/WikiAdminPanel';
import AdminEmailSettings from '../components/AdminEmailSettings';
import AdminAccountSettings from '../components/AdminAccountSettings';
import SelfServiceSettings from '../components/SelfServiceSettings';
import TemplateManager from '../components/TemplateManager';
import MaintenanceManager from '../components/MaintenanceManager';
import AuditLog from '../components/AuditLog';
import SystemUpdates from '../components/SystemUpdates';
import AdminBilling from '../components/AdminBilling';
import AdminResourceCredentials from '../components/AdminResourceCredentials';

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


function ClusterToggle({ label, hint, checked, onChange }) {
  return (
    <div className="cluster-toggle-card">
      <div>
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <button type="button" className={`toggle-clean ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
    </div>
  );
}

function ClusterLocationField({ data, onChange }) {
  const [query, setQuery] = useState(data.locationLabel || data.location_label || '');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQuery(data.locationLabel || data.location_label || '');
    setResults([]);
  }, [data.id]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3 || value === String(data.locationLabel || data.location_label || '').trim()) {
      setResults([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await adminApi.searchLocations(value);
        if (active) setResults(response.data?.results || []);
      } catch (_) {
        if (active) setResults([]);
      } finally {
        if (active) setBusy(false);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, data.locationLabel, data.location_label]);

  const choose = (item) => {
    setQuery(item.label);
    setResults([]);
    onChange({ locationLabel: item.label, locationLat: item.lat, locationLon: item.lon });
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    onChange({ locationLabel: '', locationLat: null, locationLon: null });
  };

  return (
    <div className="form-group span-full cluster-location-field">
      <span>Location</span>
      <div className="cluster-location-input-row">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange({ locationLabel: '', locationLat: null, locationLon: null });
          }}
          placeholder="Search city or location…"
          autoComplete="off"
        />
        {query ? <button type="button" className="btn-secondary" onClick={clear}>Clear</button> : null}
      </div>
      {busy ? <small className="hint-text">Searching…</small> : null}
      {results.length ? (
        <div className="cluster-location-results">
          {results.map((item) => (
            <button type="button" key={`${item.lat}-${item.lon}-${item.label}`} onClick={() => choose(item)}>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
      {(data.locationLabel || data.location_label) ? <small className="cluster-location-selected">Selected: {data.locationLabel || data.location_label}</small> : null}
    </div>
  );
}

function ClusterLoadBar({ label, value }) {
  const numeric = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="admin-cluster-load-row">
      <div><span>{label}</span><strong>{formatPercent(numeric)}</strong></div>
      <div className="admin-cluster-load-track"><span style={{ width: `${numeric}%` }} /></div>
    </div>
  );
}

function AdminOverview({ users, clusters, resources, groups, clusterStats, onOpen }) {
  const onlineClusters = clusterStats.filter((item) => !item.error).length;
  const totalNodes = clusterStats.reduce((sum, item) => sum + Number(item.totals?.nodes || 0), 0);
  const runningServices = resources.filter((item) => String(item.status || '').toLowerCase().includes('run')).length;

  return (
    <div className="admin-overview-v8">
      <section className="hero-card-clean admin-overview-hero-v8">
        <div className="admin-running-summary-v8">
          <p className="eyebrow-clean">Services online</p>
          <div className="admin-running-count-v8"><strong>{runningServices}</strong><span>of {resources.length}</span></div>
          <p>{onlineClusters} of {clusters.length} clusters reachable · {totalNodes} nodes</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => onOpen('services')}>Manage services</button>
      </section>

      <div className="admin-overview-stats-v8">
        <StatCard label="Users" value={users.length} hint="Portal accounts" />
        <StatCard label="Clusters" value={clusters.length} hint={`${onlineClusters} reachable`} tone={clusters.length && onlineClusters === clusters.length ? 'success' : 'neutral'} />
        <StatCard label="Groups" value={groups.length} hint="Access groups" />
        <StatCard label="Nodes" value={totalNodes} hint="Proxmox nodes" />
      </div>

      <SectionCard title="Cluster utilization" className="admin-cluster-capacity-v8">
        <div className="admin-cluster-grid-v8">
          {clusterStats.map((cluster) => (
            <article key={cluster.id} className="admin-cluster-graph-card-v8">
              <div className="cluster-stat-head">
                <div>
                  <strong>{cluster.name}</strong>
                  <span>· {cluster.totals?.nodes || 0} nodes</span>
                </div>
                <span className={`status-badge ${cluster.error ? 'danger' : 'success'}`}>{cluster.error ? 'Offline' : 'Online'}</span>
              </div>
              {cluster.error ? (
                <InlineNotice tone="danger" persistent>{cluster.error}</InlineNotice>
              ) : (
                <div className="admin-cluster-load-grid-v8">
                  <ClusterLoadBar label="CPU" value={cluster.totals?.cpuPercent} />
                  <ClusterLoadBar label="Memory" value={cluster.totals?.memPercent} />
                  <ClusterLoadBar label="Storage" value={cluster.totals?.storagePercent} />
                </div>
              )}
            </article>
          ))}
          {!clusterStats.length ? <EmptyState title="No cluster stats" text="Add a cluster to view live utilization." /> : null}
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
  const [testingCluster, setTestingCluster] = useState(false);

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
  const openClusterEditor = (entry = null) => setEditor({
    type: 'cluster',
    mode: entry ? 'edit' : 'create',
    data: entry ? {
      ...entry,
      apiToken: '',
      allowProvisioning: Number(entry.allow_provisioning ?? entry.allowProvisioning ?? 0) === 1,
      allowPublishing: Number(entry.allow_publishing ?? entry.allowPublishing ?? 1) === 1,
      locationLabel: entry.location_label || entry.locationLabel || '',
      locationLat: entry.location_lat ?? entry.locationLat ?? null,
      locationLon: entry.location_lon ?? entry.locationLon ?? null
    } : {
      name: '',
      url: '',
      apiToken: '',
      allowProvisioning: false,
      allowPublishing: true,
      locationLabel: '',
      locationLat: null,
      locationLon: null
    }
  });
  const openGroupEditor = (entry = null) => setEditor({ type: 'group', mode: entry ? 'edit' : 'create', data: entry ? { ...entry, memberIds: (entry.members || []).map((member) => member.id) } : { name: '', memberIds: [] } });
  const openResourceEditor = (entry = null) => setEditor({
    type: 'resource',
    mode: entry ? 'edit' : 'create',
    data: entry ? {
      ...entry,
      publicUrl: entry.publicUrl ?? entry.public_url ?? entry.webUrl ?? entry.web_url ?? '',
      adminUrl: entry.adminUrl ?? entry.admin_url ?? '',
      manualIp: entry.manualIp ?? entry.manual_ip ?? '',
      sshPort: entry.sshPort ?? entry.ssh_port ?? 22,
      billable: !!entry.billable
    } : {
      name: '',
      containerId: '',
      clusterId: clusters[0]?.id || '',
      userId: '',
      groupId: '',
      publicUrl: '',
      adminUrl: '',
      manualIp: '',
      sshPort: 22,
      billable: false
    }
  });

  const testClusterConnection = async () => {
    if (!editor || editor.type !== 'cluster') return;
    setTestingCluster(true);
    setError('');
    setNotice('');
    try {
      const data = editor.data || {};
      const response = await adminApi.testProxmox({
        clusterId: editor.mode === 'edit' ? data.id : undefined,
        url: data.url,
        apiToken: data.apiToken || undefined
      });
      setNotice(response.data?.message || 'Proxmox API connection successful.');
    } catch (err) {
      setError(getErrorMessage(err, 'Proxmox API connection test failed.'));
    } finally {
      setTestingCluster(false);
    }
  };

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
          publicUrl: data.publicUrl ?? data.public_url ?? data.webUrl ?? data.web_url ?? '',
          adminUrl: data.adminUrl ?? data.admin_url ?? '',
          manualIp: data.manualIp ?? data.manual_ip ?? '',
          sshPort: data.sshPort ?? data.ssh_port ?? 22,
          billable: !!data.billable
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
    const userManagedMachine = kind === 'resource' && (entry.isSelfService === true || entry.source === 'self-service');
    const label = entry.name || entry.email || 'this entry';
    const question = userManagedMachine
      ? `Permanently delete ${label} from Proxmox and the portal? This cannot be undone.`
      : `Delete ${label}?`;
    if (!window.confirm(question)) return;
    setError('');
    setNotice('');
    try {
      if (kind === 'user') await adminApi.deleteUser(entry.id);
      if (kind === 'cluster') await adminApi.deleteCluster(entry.id);
      if (kind === 'group') await adminApi.deleteGroup(entry.id);
      if (kind === 'resource') await adminApi.deleteResource(entry.id);
      if (editor?.type === kind && editor?.data?.id === entry.id) setEditor(null);
      setNotice(userManagedMachine ? 'Container deletion started successfully.' : 'Deleted successfully.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, userManagedMachine ? 'The container could not be deleted.' : 'The entry could not be deleted.'));
    }
  };

  const navItems = [
    { key: 'overview', label: 'Overview', icon: HomeIcon, section: 'Workspace' },
    { key: 'services', label: 'Services', icon: ServerIcon, section: 'Workspace', count: resources.length },
    { key: 'users', label: 'Users', icon: UserIcon, section: 'Workspace', count: users.length },
    { key: 'groups', label: 'Groups', icon: DashboardIcon, section: 'Workspace', count: groups.length },
    { key: 'billing', label: 'Billing', icon: BillingIcon, section: 'Workspace' },
    { key: 'wiki', label: 'Wiki', icon: BookIcon, section: 'Workspace' },
    { key: 'clusters', label: 'Clusters', icon: GlobeIcon, section: 'Infrastructure', count: clusters.length },
    { key: 'templates', label: 'Templates', icon: ServerIcon, section: 'Infrastructure' },
    { key: 'selfservice', label: 'Self-Service', icon: UserIcon, section: 'Infrastructure' },
    { key: 'maintenance', label: 'Maintenance', icon: BellIcon, section: 'Infrastructure' },
    { key: 'email', label: 'Email', icon: BellIcon, section: 'Platform' },
    { key: 'pangolin', label: 'Pangolin', icon: LinkIcon, section: 'Platform' },
    { key: 'updates', label: 'System Updates', icon: ServerIcon, section: 'Platform' },
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
    { key: 'location', label: 'Location', render: (row) => row.location_label || '—' },
    { key: 'selfService', label: 'Self-service', render: (row) => <span className={`status-badge ${Number(row.allow_provisioning || 0) === 1 ? 'success' : 'neutral'}`}>{Number(row.allow_provisioning || 0) === 1 ? 'Enabled' : 'Disabled'}</span> },
    { key: 'publishing', label: 'Public access', render: (row) => <span className={`status-badge ${Number(row.allow_publishing ?? 1) === 1 ? 'success' : 'neutral'}`}>{Number(row.allow_publishing ?? 1) === 1 ? 'Enabled' : 'Disabled'}</span> }
  ], []);
  const groupColumns = useMemo(() => [
    { key: 'name', label: 'Name' },
    {
      key: 'members',
      label: 'Members',
      render: (row) => (row.members || []).length ? (
        <div className="group-member-chip-list">
          {(row.members || []).map((member) => <span key={member.id} className="group-member-chip">{member.name || member.email}</span>)}
        </div>
      ) : <span className="muted-table-value">No members</span>
    }
  ], []);
  const resourceColumns = useMemo(() => [
    { key: 'name', label: 'Name' },
    { key: 'clusterName', label: 'Cluster', render: (row) => row.clusterName || row.cluster_name || '—' },
    { key: 'owner', label: 'Owner', render: (row) => row.userName || row.user_name || row.groupName || row.group_name || '—' },
    { key: 'billing', label: 'Billing', render: (row) => <span className={`status-badge ${row.billable ? 'success' : 'neutral'}`}>{row.billable ? (row.billingSource === 'self-service' ? 'Self-service' : 'Billable') : 'Excluded'}</span> },
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
      description: `${(entry.members || []).length} member${(entry.members || []).length === 1 ? '' : 's'}`,
      category: 'Group',
      icon: DashboardIcon,
      keywords: entry.name || '',
      onSelect: () => { selectTab('groups'); openGroupEditor(entry); }
    }));
    return [...serviceItems, ...userItems, ...clusterItems, ...groupItems];
  }, [resources, users, clusters, groups]);

  const renderEditorPage = (type, listTitle) => {
    if (!editor || editor.type !== type) return null;

    const userManagedResource = type === 'resource'
      && editor.mode === 'edit'
      && (editor.data.isSelfService === true || editor.data.source === 'self-service');

    if (userManagedResource) {
      const resourceName = editor.data.name || `Service ${editor.data.containerId || editor.data.container_id || ''}`;
      return (
        <div className="admin-editor-replacement">
          <div className="subpage-back-row">
            <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>← Back to {listTitle}</button>
          </div>
          <SectionCard>
            <div className="admin-user-managed-service">
              <div className="admin-user-managed-service-head">
                <div>
                  <span className="status-badge warning">User managed</span>
                  <h2>{resourceName}</h2>
                  <p>This service was created by the user through Self-service.</p>
                </div>
                <div className="admin-user-managed-lock" aria-hidden="true"><LockIcon size={24} /></div>
              </div>
              <div className="admin-user-managed-notice">
                <strong>Service user managed</strong>
                <span>Credentials, passwords, SSH access, URLs and service access settings are private to the service owner. The administrator can monitor the infrastructure resource, but cannot open or manage its access.</span>
              </div>
              <div className="admin-user-managed-grid">
                <div><span>Cluster</span><strong>{editor.data.clusterName || editor.data.cluster_name || '—'}</strong></div>
                <div><span>Owner</span><strong>{editor.data.userName || editor.data.user_name || editor.data.userEmail || editor.data.user_email || '—'}</strong></div>
                <div><span>Type</span><strong>{editor.data.type || editor.data.resourceType || editor.data.resource_type || '—'}</strong></div>
                <div><span>ID</span><strong>{editor.data.containerId || editor.data.container_id || '—'}</strong></div>
                <div><span>Status</span><strong>{editor.data.status || '—'}</strong></div>
                <div><span>Billing</span><strong>Self-service</strong></div>
              </div>
            </div>
          </SectionCard>
          <section className="service-danger-zone admin-service-danger-zone">
            <div className="service-danger-zone-copy">
              <span className="service-danger-zone-kicker">Danger zone</span>
              <strong>Delete user-created container</strong>
              <p>This permanently destroys the Self-service VM/CT in Proxmox and removes it from the portal. User credentials remain private and are not exposed before deletion.</p>
            </div>
            <button type="button" className="btn-danger" onClick={() => removeEntry('resource', editor.data)}>Delete container</button>
          </section>
        </div>
      );
    }

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
              <ClusterLocationField
                key={editor.data.id || 'new-cluster'}
                data={editor.data}
                onChange={(patch) => setEditor((current) => ({ ...current, data: { ...current.data, ...patch } }))}
              />
              <div className="cluster-feature-grid span-full">
                <ClusterToggle
                  label="Self-service"
                  hint="Allow users assigned to this cluster to create approved LXC containers. Limits and templates are configured under Self-service."
                  checked={!!editor.data.allowProvisioning}
                  onChange={(value) => setEditor((current) => ({ ...current, data: { ...current.data, allowProvisioning: value } }))}
                />
                <ClusterToggle
                  label="Public access / Pangolin"
                  hint="Allow services on this cluster to use the cluster-specific Pangolin connector and public publishing configuration."
                  checked={!!editor.data.allowPublishing}
                  onChange={(value) => setEditor((current) => ({ ...current, data: { ...current.data, allowPublishing: value } }))}
                />
              </div>
              <div className="cluster-api-test-row span-full">
                <div>
                  <strong>Proxmox API</strong>
                  <span>Test the current URL and API token before saving.</span>
                </div>
                <button type="button" className="btn-secondary" onClick={testClusterConnection} disabled={testingCluster || !editor.data.url || (editor.mode === 'create' && !editor.data.apiToken)}>
                  {testingCluster ? 'Testing…' : 'Test connection'}
                </button>
              </div>
              <label className="span-full"><span>API token {editor.mode === 'edit' ? '(leave empty to keep existing)' : ''}</span><textarea rows="5" value={editor.data.apiToken || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, apiToken: event.target.value } }))} required={editor.mode === 'create'} /></label>
            </> : null}

            {type === 'group' ? <>
              <label className="span-full"><span>Name</span><input value={editor.data.name || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} required /></label>
              <div className="group-member-editor span-full">
                <div className="group-member-editor-head">
                  <div><strong>Users in this group</strong><span>Select the portal users that belong to this group.</span></div>
                  <span className="pill pill-neutral">{(editor.data.memberIds || []).length} selected</span>
                </div>
                <div className="group-member-picker-grid">
                  {users.filter((entry) => entry.role === 'user').map((entry) => {
                    const selected = (editor.data.memberIds || []).some((id) => String(id) === String(entry.id));
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`group-member-picker ${selected ? 'selected' : ''}`}
                        onClick={() => setEditor((current) => {
                          const currentIds = current.data.memberIds || [];
                          const nextIds = selected
                            ? currentIds.filter((id) => String(id) !== String(entry.id))
                            : [...currentIds, entry.id];
                          return { ...current, data: { ...current.data, memberIds: nextIds } };
                        })}
                      >
                        <span className="group-member-check">{selected ? '✓' : ''}</span>
                        <span><strong>{entry.name || entry.email}</strong><small>{entry.email}</small></span>
                      </button>
                    );
                  })}
                  {!users.some((entry) => entry.role === 'user') ? <span className="muted-table-value">No user accounts available.</span> : null}
                </div>
              </div>
            </> : null}

            {type === 'resource' ? <>
              <label><span>Name</span><input value={editor.data.name || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, name: event.target.value } }))} /></label>
              <label><span>Service / VM ID</span><input value={editor.data.containerId || editor.data.container_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, containerId: event.target.value } }))} required /></label>
              <label><span>Cluster</span><select value={editor.data.clusterId || editor.data.cluster_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, clusterId: event.target.value } }))} required><option value="">Select cluster</option>{clusters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label><span>User</span><select value={editor.data.userId || editor.data.user_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, userId: event.target.value, user_id: '', groupId: '', group_id: '' } }))}><option value="">No direct user</option>{users.filter((entry) => entry.role === 'user').map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.email}</option>)}</select></label>
              <label><span>Group</span><select value={editor.data.groupId || editor.data.group_id || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, groupId: event.target.value, group_id: '', userId: '', user_id: '' } }))}><option value="">No group</option>{groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label><span>Website URL</span><input value={editor.data.publicUrl ?? editor.data.public_url ?? editor.data.webUrl ?? editor.data.web_url ?? ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, publicUrl: event.target.value } }))} placeholder="https://service.example.com" /></label>
              <label><span>Admin URL</span><input value={editor.data.adminUrl ?? editor.data.admin_url ?? ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, adminUrl: event.target.value } }))} placeholder="https://admin.example.com" /></label>
              <label><span>Service IP</span><input value={editor.data.manualIp ?? editor.data.manual_ip ?? ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, manualIp: event.target.value } }))} placeholder="10.10.20.20" /></label>
              <label><span>SSH port</span><input type="number" min="1" max="65535" value={editor.data.sshPort ?? editor.data.ssh_port ?? 22} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, sshPort: event.target.value } }))} /></label>
              <div className="cluster-feature-grid span-full">
                <ClusterToggle
                  label="Include in billing"
                  hint="Admin-assigned services are excluded by default. Self-service containers are always billed automatically."
                  checked={!!editor.data.billable}
                  onChange={(value) => setEditor((current) => ({ ...current, data: { ...current.data, billable: value } }))}
                />
              </div>
            </> : null}

            <div className="form-actions left span-full">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </SectionCard>
        {type === 'resource' && editor.mode === 'edit' && !(editor.data.isSelfService === true || editor.data.source === 'self-service') ? (
          <AdminResourceCredentials
            resourceId={editor.data.id}
            adminUrl={editor.data.adminUrl ?? editor.data.admin_url ?? ''}
          />
        ) : null}
      </div>
    );
  };

  const renderCrudWorkspace = ({ type, title, subtitle, addLabel, columns, rows, onAdd, onEdit, emptyText }) => {
    if (editor?.type === type) return renderEditorPage(type, title);
    return (
      <SectionCard action={<button type="button" className="btn-primary" onClick={onAdd}>{addLabel}</button>}>
        <CrudTable
          columns={columns}
          rows={rows}
          renderActions={(entry) => {
            const userManaged = type === 'resource' && (entry.isSelfService === true || entry.source === 'self-service');
            return userManaged ? (
              <button type="button" className="btn-secondary btn-small" onClick={() => onEdit(entry)}>View</button>
            ) : (
              <>
                <button type="button" className="btn-secondary btn-small" onClick={() => onEdit(entry)}>Edit</button>
                <button type="button" className="btn-danger btn-small" onClick={() => removeEntry(type, entry)}>Delete</button>
              </>
            );
          }}
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
  } else if (activeTab === 'billing') {
    content = <AdminBilling language={language} />;
  } else if (activeTab === 'wiki') {
    content = <WikiAdminPanel language={language} />;
  } else if (activeTab === 'templates') {
    content = <TemplateManager clusters={clusters} />;
  } else if (activeTab === 'selfservice') {
    content = <SelfServiceSettings clusters={clusters} />;
  } else if (activeTab === 'maintenance') {
    content = <MaintenanceManager />;
  } else if (activeTab === 'email') {
    content = <AdminEmailSettings />;
  } else if (activeTab === 'pangolin') {
    content = <PangolinSettingsPanel language={language} clusters={clusters} />;
  } else if (activeTab === 'updates') {
    content = <SystemUpdates />;
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
      onLanguageChange={changeLanguage}
      searchItems={searchItems}
    >
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {content}
    </PortalShell>
  );
}
