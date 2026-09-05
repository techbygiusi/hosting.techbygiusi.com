import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../components/PortalShell';
import { DashboardIcon, ServerIcon, BookIcon, SettingsIcon, HomeIcon, LinkIcon, UserIcon } from '../components/Icons';
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
import ActionModal from '../components/ActionModal';
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

function detailPairs(resource) {
  return [
    ['Cluster', resource.clusterName || '—'],
    ['Node', resource.node || '—'],
    ['Type', resourceTypeLabel(resource)],
    ['ID', resource.containerId || '—'],
    ['Status', resource.status || '—'],
    ['Uptime', formatUptime(resource.uptime)],
    ['CPU', resource.maxcpu ? `${resource.maxcpu} cores` : '—'],
    ['Memory', resource.maxmem ? formatBytes(resource.maxmem) : '—'],
    ['Service IP', resource.manualIp || resource.ip || resource.primaryIp || '—'],
    ['Operating system', resource.operatingSystem || '—']
  ];
}

function servicePrimaryUrl(resource) {
  return resource.publicUrl || resource.webUrl || resource.adminUrl || '';
}

function UserOverview({ resources, onOpenProvisioning, onSelectService }) {
  const running = resources.filter((item) => String(item.status || '').toLowerCase().includes('run')).length;
  const stopped = resources.filter((item) => String(item.status || '').toLowerCase().includes('stop')).length;
  const totalMemory = resources.reduce((sum, item) => sum + Number(item.maxmem || 0), 0);
  const clusters = new Set(resources.map((item) => item.clusterName).filter(Boolean));

  return (
    <div className="dashboard-grid-full">
      <section className="hero-card-clean span-2">
        <div>
          <p className="eyebrow-clean">Overview</p>
          <h2>Everything looks tidy.</h2>
          <p>Your services, docs and access tools live in one place now.</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn-primary" onClick={onOpenProvisioning}>Create container</button>
        </div>
      </section>

      <StatCard label="Services" value={resources.length} hint="Visible in your account" tone="neutral" />
      <StatCard label="Running" value={running} hint="Healthy and online" tone="success" />
      <StatCard label="Stopped" value={stopped} hint="Needs attention" tone="danger" />
      <StatCard label="Clusters" value={clusters.size} hint="Assigned locations" tone="neutral" />

      <SectionCard title="Your services" subtitle="Quick access to the latest resources" className="span-2">
        <div className="service-list-compact">
          {resources.slice(0, 6).map((resource) => (
            <button type="button" className="service-row-card" key={resource.id} onClick={() => onSelectService(resource.id)}>
              <div>
                <strong>{resource.name}</strong>
                <span>{resource.clusterName || 'Unassigned cluster'}</span>
              </div>
              <StatusBadge status={resource.status} />
            </button>
          ))}
          {!resources.length ? <EmptyState title="No services yet" text="Services assigned by the admin will appear here." /> : null}
        </div>
      </SectionCard>

      <SectionCard title="Capacity snapshot" subtitle="Based on assigned service limits">
        <div className="metric-pair-list">
          <div><span>Total memory</span><strong>{formatBytes(totalMemory)}</strong></div>
          <div><span>Total CPU cores</span><strong>{resources.reduce((sum, item) => sum + Number(item.maxcpu || 0), 0)}</strong></div>
          <div><span>Provisioned machines</span><strong>{resources.filter((item) => item.isSelfService || item.provisioned_id).length}</strong></div>
        </div>
      </SectionCard>
    </div>
  );
}

function UserServices({ resources, selectedId, onSelect, search, onSearch, onOpenConsole }) {
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return resources;
    return resources.filter((item) => [item.name, item.clusterName, item.node, item.status].some((field) => String(field || '').toLowerCase().includes(term)));
  }, [resources, search]);

  const selected = filtered.find((item) => String(item.id) === String(selectedId)) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered[0]) onSelect(filtered[0].id);
  }, [filtered, onSelect, selectedId]);

  return (
    <div className="two-column-layout">
      <SectionCard title="Services" subtitle="Browse and manage your assigned services" action={<input className="search-clean" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search services…" />}>
        <div className="service-table-clean">
          {filtered.map((resource) => (
            <button type="button" key={resource.id} className={`service-table-row ${String(selected?.id) === String(resource.id) ? 'active' : ''}`} onClick={() => onSelect(resource.id)}>
              <div className="service-table-main">
                <strong>{resource.name}</strong>
                <span>{resource.clusterName || 'No cluster'} · {resourceTypeLabel(resource)}</span>
              </div>
              <div className="service-table-side">
                <StatusBadge status={resource.status} />
              </div>
            </button>
          ))}
          {!filtered.length ? <EmptyState title="No matching services" text="Try another search or wait for new assignments." /> : null}
        </div>
      </SectionCard>

      <SectionCard title={selected ? selected.name : 'Service details'} subtitle={selected ? `${selected.clusterName || 'Unknown cluster'} · ${resourceTypeLabel(selected)}` : 'Select a service to inspect it'}>
        {selected ? (
          <>
            <div className="service-action-row">
              {servicePrimaryUrl(selected) ? <a className="btn-primary" href={servicePrimaryUrl(selected)} target="_blank" rel="noreferrer">Open service</a> : null}
              {selected.adminUrl ? <a className="btn-secondary" href={selected.adminUrl} target="_blank" rel="noreferrer">Open admin</a> : null}
              <button type="button" className="btn-secondary" onClick={() => onOpenConsole(selected.id)}>Open console</button>
            </div>
            <div className="detail-grid-clean">
              {detailPairs(selected).map(([label, value]) => (
                <div key={label} className="detail-pair-clean">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </>
        ) : <EmptyState title="No service selected" text="Choose a service on the left to see details and actions." />}
      </SectionCard>
    </div>
  );
}

function SettingsSummary({ profile, setProfile, saveProfile, savingProfile, error, notice }) {
  return (
    <SectionCard title="Profile" subtitle="Basic account settings">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      <form className="clean-form-grid compact two-up" onSubmit={saveProfile}>
        <label>
          <span>Name</span>
          <input value={profile.name || ''} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          <span>Timezone</span>
          <input value={profile.timezone || ''} onChange={(event) => setProfile((current) => ({ ...current, timezone: event.target.value }))} placeholder="Europe/Berlin" />
        </label>
        <div className="span-full"><button type="submit" className="btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </SectionCard>
  );
}

export default function UserDashboard() {
  const navigate = useNavigate();
  const { user, logout, applyUserPatch } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [resources, setResources] = useState([]);
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [language, setLanguage] = useState(readStoredLanguage());
  const [provisioningOptions, setProvisioningOptions] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [jobModal, setJobModal] = useState(null);
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
      setJobModal((jobsRes.data?.jobs || []).find((item) => ['queued', 'running'].includes(item.status)) || null);
      if (nextResources[0] && !selectedId) setSelectedId(nextResources[0].id);
    } catch (err) {
      setError(getErrorMessage(err, 'The dashboard could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const openConsole = (resourceId) => {
    navigate(`/console/${resourceId}`);
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
      // keep local change
    }
  };

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: HomeIcon },
    { key: 'services', label: 'Services', icon: ServerIcon, badge: `${resources.length}` },
    { key: 'wiki', label: 'Wiki', icon: BookIcon },
    { key: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  const activeTitle = {
    dashboard: 'Dashboard',
    services: 'Services',
    wiki: 'Wiki',
    settings: 'Settings'
  }[activeTab];

  const toolbar = <input className="search-clean global-toolbar-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services, clusters or docs…" />;

  let content = null;
  if (loading) {
    content = <SectionCard><div className="page-state-clean">Loading…</div></SectionCard>;
  } else if (activeTab === 'dashboard') {
    content = <UserOverview resources={resources} onOpenProvisioning={() => setCreateOpen(true)} onSelectService={(id) => { setSelectedId(id); setActiveTab('services'); }} />;
  } else if (activeTab === 'services') {
    content = <UserServices resources={resources} selectedId={selectedId} onSelect={setSelectedId} search={search} onSearch={setSearch} onOpenConsole={openConsole} />;
  } else if (activeTab === 'wiki') {
    content = <SectionCard title="Wiki" subtitle="Documentation and shared knowledge"><WikiBrowser /></SectionCard>;
  } else {
    content = (
      <div className="settings-layout-clean">
        <SettingsSummary
          profile={profile}
          setProfile={setProfile}
          saveProfile={saveProfile}
          savingProfile={savingProfile}
          error={error}
          notice={notice}
        />
        <SectionCard title="Appearance & language" subtitle="Personal display preferences for this account">
          <div className="settings-choice-grid">
            <div className="settings-choice-block">
              <span className="settings-choice-label">Appearance</span>
              <div className="segmented-clean">
                <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
                <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
              </div>
            </div>
            <div className="settings-choice-block">
              <span className="settings-choice-label">Language</span>
              <div className="segmented-clean">
                <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')}>English</button>
                <button type="button" className={language === 'de' ? 'active' : ''} onClick={() => changeLanguage('de')}>Deutsch</button>
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Profile picture"><AvatarSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Email address"><AccountEmailSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Password"><AccountPasswordSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Notifications" subtitle="Mail preferences for service monitoring"><NotificationSettingsPanel language={language} /></SectionCard>
      </div>
    );
  }

  return (
    <>
      <PortalShell
        user={user}
        title={activeTitle}
        subtitle="A rebuilt full-width workspace for your hosting portal."
        navItems={navItems}
        activeKey={activeTab}
        onSelect={setActiveTab}
        onLogout={logout}
        toolbar={toolbar}
        language={language}
        onLanguageChange={changeLanguage}
        footer={<span>Hosting by TechByGiusi · Self-hosted. More freedom.</span>}
      >
        {error && activeTab !== 'settings' ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {content}
      </PortalShell>

      {createOpen ? (
        <CreateMachineModal
          options={provisioningOptions}
          initialJob={jobModal}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { load(); }}
        />
      ) : null}

      {jobModal && !createOpen ? (
        <ActionModal title="Provisioning still running" subtitle="A machine creation job is active." onClose={() => setJobModal(null)}>
          <p>You can reopen the create dialog to watch the live progress.</p>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setJobModal(null)}>Dismiss</button>
            <button type="button" className="btn-primary" onClick={() => { setCreateOpen(true); }}>Open provisioning</button>
          </div>
        </ActionModal>
      ) : null}
    </>
  );
}
