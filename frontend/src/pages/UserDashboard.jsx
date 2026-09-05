import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PortalShell from '../components/PortalShell';
import PageSkeleton from '../components/PageSkeleton';
import { ServerIcon, BookIcon, SettingsIcon, HomeIcon, TerminalIcon, LinkIcon } from '../components/Icons';
import { EmptyState, InlineNotice, SectionCard, StatCard, StatusBadge } from '../components/UiBits';
import { useAuth } from '../context/AuthContext';
import { userApi, getErrorMessage } from '../services/api';
import { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';
import AvatarSettingsPanel from '../components/AvatarSettingsPanel';
import AccountEmailSettingsPanel from '../components/AccountEmailSettingsPanel';
import AccountPasswordSettingsPanel from '../components/AccountPasswordSettingsPanel';
import NotificationSettingsPanel from '../components/NotificationSettingsPanel';
import WikiBrowser from '../components/WikiBrowser';
import CreateMachineModal from '../components/CreateMachineModal';
import { useTheme } from '../components/ThemeButton';

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = bytes;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function resourceTypeLabel(resource) {
  const raw = String(resource?.resourceType || resource?.type || '').toLowerCase();
  if (raw === 'qemu' || raw === 'vm') return 'Virtual machine';
  if (raw === 'lxc' || raw === 'ct') return 'Container';
  if (raw === 'website') return 'Website';
  return raw ? raw.toUpperCase() : 'Service';
}

function servicePrimaryUrl(resource) {
  return resource.publicUrl || resource.webUrl || '';
}

function percent(value, max) {
  const current = Number(value || 0);
  const total = Number(max || 0);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(Math.max((current / total) * 100, 0), 100);
}

function cpuPercent(resource) {
  const value = Number(resource.cpu || 0);
  return value <= 1 ? Math.min(Math.max(value * 100, 0), 100) : Math.min(Math.max(value, 0), 100);
}

function ServiceCard({ resource, onDetails, onConsole, compact = false }) {
  const publicUrl = servicePrimaryUrl(resource);
  const adminUrl = resource.adminUrl || '';
  const canConsole = Boolean(resource?.capabilities?.canConsole);
  const cpu = cpuPercent(resource);
  const memory = percent(resource.mem, resource.maxmem);

  return (
    <article className={`service-tile ${compact ? 'compact' : ''}`}>
      <div className="service-tile-head">
        <div className="service-tile-icon"><ServerIcon size={20} /></div>
        <div className="service-tile-title">
          <strong>{resource.name}</strong>
          <span>{resourceTypeLabel(resource)} · {resource.containerId || resource.id}</span>
        </div>
        <StatusBadge status={resource.status} />
      </div>

      <div className="service-tile-meta">
        <span>{resource.clusterName || 'Unknown cluster'}</span>
        <span>{resource.node || 'Unknown node'}</span>
      </div>

      {!compact ? (
        <div className="service-tile-metrics">
          <div>
            <span>CPU</span>
            <strong>{cpu.toFixed(1)}%</strong>
            <i><b style={{ width: `${cpu}%` }} /></i>
          </div>
          <div>
            <span>Memory</span>
            <strong>{memory.toFixed(1)}%</strong>
            <i><b style={{ width: `${memory}%` }} /></i>
          </div>
        </div>
      ) : null}

      <div className="service-tile-actions">
        {publicUrl ? <a className="btn-primary btn-small" href={publicUrl} target="_blank" rel="noreferrer"><LinkIcon size={15} />Open</a> : null}
        {adminUrl && !compact ? <a className="btn-secondary btn-small" href={adminUrl} target="_blank" rel="noreferrer">Admin</a> : null}
        {canConsole ? <button type="button" className="btn-secondary btn-small" onClick={() => onConsole(resource.id)}><TerminalIcon size={15} />Console</button> : null}
        <button type="button" className="btn-secondary btn-small" onClick={() => onDetails(resource.id)}>Details</button>
      </div>
    </article>
  );
}

function ServiceDetailPanel({ resource, onClose, onConsole }) {
  if (!resource) return null;
  const publicUrl = servicePrimaryUrl(resource);
  const values = [
    ['Cluster', resource.clusterName || '—'],
    ['Node', resource.node || '—'],
    ['Type', resourceTypeLabel(resource)],
    ['ID', resource.containerId || '—'],
    ['Status', resource.status || '—'],
    ['Uptime', formatUptime(resource.uptime)],
    ['CPU', resource.maxcpu ? `${resource.maxcpu} cores` : '—'],
    ['Memory', resource.maxmem ? formatBytes(resource.maxmem) : '—'],
    ['Service IP', resource.manualIp || resource.primaryIp || resource.ip || '—'],
    ['Operating system', resource.operatingSystem || '—']
  ];

  return (
    <aside className="service-detail-panel section-card">
      <div className="service-detail-panel-head">
        <div>
          <span className="eyebrow-clean">Service details</span>
          <h2>{resource.name}</h2>
          <p>{resource.clusterName || 'Unknown cluster'} · {resourceTypeLabel(resource)}</p>
        </div>
        <button type="button" className="service-detail-close" onClick={onClose} aria-label="Close service details">×</button>
      </div>

      <div className="service-detail-actions">
        {publicUrl ? <a className="btn-primary" href={publicUrl} target="_blank" rel="noreferrer">Open service</a> : null}
        {resource.adminUrl ? <a className="btn-secondary" href={resource.adminUrl} target="_blank" rel="noreferrer">Open admin</a> : null}
        {resource?.capabilities?.canConsole ? <button type="button" className="btn-secondary" onClick={() => onConsole(resource.id)}>Open console</button> : null}
      </div>

      <div className="detail-grid-clean">
        {values.map(([label, value]) => (
          <div key={label} className="detail-pair-clean"><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
    </aside>
  );
}

function UserOverview({ resources, onOpenProvisioning, onSelectService, onConsole }) {
  const running = resources.filter((item) => String(item.status || '').toLowerCase().includes('run')).length;
  const stopped = resources.filter((item) => String(item.status || '').toLowerCase().includes('stop')).length;
  const totalMemory = resources.reduce((sum, item) => sum + Number(item.maxmem || 0), 0);
  const clusters = new Set(resources.map((item) => item.clusterName).filter(Boolean));

  return (
    <div className="user-dashboard-v4">
      <section className="hero-card-clean user-dashboard-hero-v4">
        <div>
          <p className="eyebrow-clean">Overview</p>
          <h2>{running === resources.length && resources.length ? 'All assigned services are running.' : 'Your hosting overview'}</h2>
          <p>{resources.length} services across {clusters.size} {clusters.size === 1 ? 'cluster' : 'clusters'}.</p>
        </div>
        <button type="button" className="btn-primary" onClick={onOpenProvisioning}>Create container</button>
      </section>

      <div className="user-dashboard-stats-v4">
        <StatCard label="Services" value={resources.length} hint="Assigned to your account" />
        <StatCard label="Running" value={running} hint="Online" tone="success" />
        <StatCard label="Stopped" value={stopped} hint="Offline" tone={stopped ? 'danger' : 'neutral'} />
        <StatCard label="Memory" value={formatBytes(totalMemory)} hint="Assigned maximum" />
      </div>

      <SectionCard title="Services" className="user-dashboard-services-v4">
        <div className="service-card-grid dashboard-service-grid">
          {resources.slice(0, 6).map((resource) => (
            <ServiceCard key={resource.id} resource={resource} onDetails={onSelectService} onConsole={onConsole} compact />
          ))}
          {!resources.length ? <EmptyState title="No services yet" text="Assigned services will appear here." /> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function UserServices({ resources, selectedId, detailOpen, onDetails, onCloseDetails, onConsole }) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return resources;
    return resources.filter((item) => [item.name, item.clusterName, item.node, item.status, item.containerId].some((field) => String(field || '').toLowerCase().includes(term)));
  }, [resources, filter]);
  const selected = resources.find((item) => String(item.id) === String(selectedId)) || null;

  return (
    <div className={`service-workspace-v4 ${detailOpen && selected ? 'has-detail' : ''}`}>
      <SectionCard title="Services" action={<input className="search-clean services-inline-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter services…" />}>
        <div className="service-card-grid">
          {filtered.map((resource) => <ServiceCard key={resource.id} resource={resource} onDetails={onDetails} onConsole={onConsole} />)}
          {!filtered.length ? <EmptyState title="No matching services" text="Try another filter." /> : null}
        </div>
      </SectionCard>
      {detailOpen && selected ? <ServiceDetailPanel resource={selected} onClose={onCloseDetails} onConsole={onConsole} /> : null}
    </div>
  );
}

function SettingsSummary({ profile, setProfile, saveProfile, savingProfile, error, notice }) {
  return (
    <SectionCard title="Profile">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      <form className="clean-form-grid compact two-up" onSubmit={saveProfile}>
        <label><span>Name</span><input value={profile.name || ''} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Timezone</span><input value={profile.timezone || ''} onChange={(event) => setProfile((current) => ({ ...current, timezone: event.target.value }))} placeholder="Europe/Berlin" /></label>
        <div className="span-full"><button type="submit" className="btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </SectionCard>
  );
}

export default function UserDashboard() {
  const { user, logout, applyUserPatch } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [resources, setResources] = useState([]);
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [language, setLanguage] = useState(readStoredLanguage());
  const [provisioningOptions, setProvisioningOptions] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [activeProvisioningJob, setActiveProvisioningJob] = useState(null);
  const { theme, setTheme } = useTheme();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [resourcesRes, profileRes, optionsRes, jobsRes] = await Promise.all([
        userApi.getResources(),
        userApi.getProfile(),
        userApi.getProvisioningOptions().catch(() => ({ data: { options: [] } })),
        userApi.getProvisioningJobs(10).catch(() => ({ data: { jobs: [] } }))
      ]);
      const nextResources = resourcesRes.data?.resources || [];
      setResources(nextResources);
      setProfile(profileRes.data?.profile || {});
      setProvisioningOptions(optionsRes.data?.options || []);
      setActiveProvisioningJob((jobsRes.data?.jobs || []).find((item) => ['queued', 'running'].includes(item.status)) || null);
      setSelectedId((current) => current || nextResources[0]?.id || '');
    } catch (err) {
      setError(getErrorMessage(err, 'The dashboard could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openConsole = (resourceId) => {
    window.open(`/console/${resourceId}`, '_blank', 'noopener,noreferrer');
  };

  const openServiceDetails = (resourceId) => {
    setSelectedId(resourceId);
    setDetailOpen(true);
    setActiveTab('services');
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setNotice('');
    try {
      const response = await userApi.updateProfile({ name: profile.name, timezone: profile.timezone });
      const nextProfile = response.data?.profile || { ...profile };
      setProfile(nextProfile);
      applyUserPatch({ name: nextProfile.name || profile.name });
      setNotice('Profile updated.');
    } catch (err) {
      setError(getErrorMessage(err, 'The profile could not be saved.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const changeLanguage = async (value) => {
    setLanguage(value);
    storeLanguage(value);
    applyUserPatch({ preferredLanguage: value });
    try {
      await userApi.updateLanguage(value);
    } catch (_) {
    }
  };

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: HomeIcon },
    { key: 'services', label: 'Services', icon: ServerIcon, count: resources.length },
    { key: 'wiki', label: 'Wiki', icon: BookIcon },
    { key: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  const searchItems = useMemo(() => resources.map((resource) => ({
    id: `service-${resource.id}`,
    label: resource.name,
    description: `${resource.clusterName || 'Unknown cluster'} · ${resourceTypeLabel(resource)}`,
    category: 'Service',
    icon: ServerIcon,
    keywords: `${resource.name} ${resource.clusterName || ''} ${resource.node || ''} ${resource.containerId || ''}`,
    onSelect: () => openServiceDetails(resource.id)
  })), [resources]);

  const activeTitle = { dashboard: 'Dashboard', services: 'Services', wiki: 'Wiki', settings: 'Settings' }[activeTab];

  let content = null;
  if (loading) {
    content = <PageSkeleton variant={activeTab === 'services' ? 'table' : 'dashboard'} />;
  } else if (activeTab === 'dashboard') {
    content = <UserOverview resources={resources} onOpenProvisioning={() => setCreateOpen(true)} onSelectService={openServiceDetails} onConsole={openConsole} />;
  } else if (activeTab === 'services') {
    content = <UserServices resources={resources} selectedId={selectedId} detailOpen={detailOpen} onDetails={openServiceDetails} onCloseDetails={() => setDetailOpen(false)} onConsole={openConsole} />;
  } else if (activeTab === 'wiki') {
    content = <SectionCard title="Wiki"><WikiBrowser language={language} /></SectionCard>;
  } else {
    content = (
      <div className="settings-layout-clean user-settings-grid-v4">
        <SettingsSummary profile={profile} setProfile={setProfile} saveProfile={saveProfile} savingProfile={savingProfile} error={error} notice={notice} />
        <SectionCard title="Appearance & language">
          <div className="settings-choice-grid">
            <div className="settings-choice-block"><span className="settings-choice-label">Appearance</span><div className="segmented-clean"><button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button><button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button></div></div>
            <div className="settings-choice-block"><span className="settings-choice-label">Language</span><div className="segmented-clean"><button type="button" className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')}>English</button><button type="button" className={language === 'de' ? 'active' : ''} onClick={() => changeLanguage('de')}>Deutsch</button></div></div>
          </div>
        </SectionCard>
        <SectionCard title="Profile picture"><AvatarSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Email address"><AccountEmailSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Password"><AccountPasswordSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Notifications"><NotificationSettingsPanel language={language} /></SectionCard>
      </div>
    );
  }

  return (
    <>
      <PortalShell
        user={user}
        title={activeTitle}
        navItems={navItems}
        activeKey={activeTab}
        onSelect={(key) => { setActiveTab(key); if (key !== 'services') setDetailOpen(false); }}
        onLogout={logout}
        onOpenSettings={() => setActiveTab('settings')}
        language={language}
        searchItems={searchItems}
      >
        {error && activeTab !== 'settings' ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {content}
      </PortalShell>

      {createOpen ? (
        <CreateMachineModal
          options={provisioningOptions}
          initialJob={activeProvisioningJob}
          onClose={() => setCreateOpen(false)}
          onCreated={load}
        />
      ) : null}
    </>
  );
}
