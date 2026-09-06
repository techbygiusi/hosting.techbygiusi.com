import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PortalShell from '../components/PortalShell';
import PageSkeleton from '../components/PageSkeleton';
import PreferenceSlider from '../components/PreferenceSlider';
import { ServerIcon, BookIcon, SettingsIcon, HomeIcon, TerminalIcon, LinkIcon, BillingIcon, GlobeIcon } from '../components/Icons';
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
import UserBilling from '../components/UserBilling';
import UserPublicAccess from '../components/UserPublicAccess';
import ResourceAccessDetails from '../components/ResourceAccessDetails';
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

function formatMoney(value, currency = 'EUR', language = 'en') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch (_) {
    return `${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${currency || 'EUR'}`;
  }
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

function chartValues(history, field, fallback) {
  const values = (Array.isArray(history) ? history : [])
    .map((point) => Number(point?.[field]))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.min(Math.max(value, 0), 100));
  if (values.length >= 2) return values.slice(-48);
  const safeFallback = Math.min(Math.max(Number(fallback || 0), 0), 100);
  return [safeFallback, safeFallback];
}

function MetricSparkline({ label, value, history, field, large = false }) {
  const values = chartValues(history, field, value);
  const width = 100;
  const height = large ? 46 : 34;
  const line = values.map((item, index) => {
    const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
    const y = height - (item / 100) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <div className={`metric-sparkline ${large ? 'large' : ''}`}>
      <div className="metric-sparkline-head"><span>{label}</span><strong>{Number(value || 0).toFixed(1)}%</strong></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label} usage over the last hour`}>
        <polygon className="metric-sparkline-area" points={area} />
        <polyline className="metric-sparkline-line" points={line} />
      </svg>
      <div className="metric-sparkline-axis"><span>1h</span><span>Now</span></div>
    </div>
  );
}

function ServiceCard({ resource, history = [], onDetails, onConsole, compact = false }) {
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
        <div className="service-metric-charts">
          <MetricSparkline label="CPU" value={cpu} history={history} field="cpuPercent" />
          <MetricSparkline label="Memory" value={memory} history={history} field="memoryPercent" />
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

function ServiceDetailView({ resource, history = [], language = 'en', onBack, onConsole, onResourceUpdate, onDeleted }) {
  const [liveResource, setLiveResource] = useState(resource);
  const [powerBusy, setPowerBusy] = useState('');
  const [powerError, setPowerError] = useState('');
  const [powerNotice, setPowerNotice] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { setLiveResource(resource); }, [resource]);
  if (!liveResource) return null;

  const text = language === 'de'
    ? {
        back: '← Zurück zu Services', openService: 'Service öffnen', openAdmin: 'Admin öffnen', openConsole: 'Konsole öffnen',
        start: 'Starten', stop: 'Stoppen', restart: 'Neustarten', unavailable: 'Power-Steuerung ist mit dem aktuellen Proxmox-Token nicht verfügbar.',
        started: 'Aktion wurde gestartet.', failed: 'Power-Aktion konnte nicht ausgeführt werden.',
        dangerZone: 'Gefahrenzone', deleteTitle: 'Container dauerhaft löschen',
        deleteHint: 'Dieser Container wurde von dir über Self-Service erstellt. Beim Löschen wird er dauerhaft aus Proxmox und aus dem Portal entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
        deleteButton: 'Container löschen', deleteConfirmLabel: 'Zum Bestätigen den Servicenamen eingeben',
        deletePermanent: 'Dauerhaft löschen', cancelDelete: 'Abbrechen', deleteFailed: 'Container konnte nicht gelöscht werden.'
      }
    : {
        back: '← Back to services', openService: 'Open service', openAdmin: 'Open admin', openConsole: 'Open console',
        start: 'Start', stop: 'Stop', restart: 'Restart', unavailable: 'Power controls are unavailable with the current Proxmox token.',
        started: 'Power action started.', failed: 'Power action could not be started.',
        dangerZone: 'Danger zone', deleteTitle: 'Permanently delete container',
        deleteHint: 'This container was created by you through Self-service. Deleting it permanently removes it from Proxmox and from the portal. This action cannot be undone.',
        deleteButton: 'Delete container', deleteConfirmLabel: 'Type the service name to confirm',
        deletePermanent: 'Delete permanently', cancelDelete: 'Cancel', deleteFailed: 'The container could not be deleted.'
      };

  const publicUrl = servicePrimaryUrl(liveResource);
  const cpu = cpuPercent(liveResource);
  const memory = percent(liveResource.mem, liveResource.maxmem);
  const status = String(liveResource.status || '').toLowerCase();
  const running = status.includes('run');
  const canPower = liveResource?.capabilities?.canPower !== false;
  const values = [
    ['Cluster', liveResource.clusterName || '—'],
    ['Node', liveResource.node || '—'],
    ['Type', resourceTypeLabel(liveResource)],
    ['ID', liveResource.containerId || '—'],
    ['Status', liveResource.status || '—'],
    ['Uptime', formatUptime(liveResource.uptime)],
    ['CPU', liveResource.maxcpu ? `${liveResource.maxcpu} cores` : '—'],
    ['Memory', liveResource.maxmem ? formatBytes(liveResource.maxmem) : '—'],
    ['Service IP', liveResource.manualIp || liveResource.primaryIp || liveResource.ip || '—'],
    ['Operating system', liveResource.operatingSystem || '—']
  ];

  const deleteSelfServiceResource = async () => {
    if (!liveResource?.canDelete || deleteBusy) return;
    if (deleteConfirm.trim() !== String(liveResource.name || '').trim()) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await userApi.deleteMachine(liveResource.id);
      await onDeleted?.(liveResource);
    } catch (err) {
      setDeleteError(getErrorMessage(err, text.deleteFailed));
    } finally {
      setDeleteBusy(false);
    }
  };

  const runPowerAction = async (action) => {
    if (!canPower || powerBusy) return;
    setPowerBusy(action);
    setPowerError('');
    setPowerNotice('');
    try {
      await userApi.powerAction(liveResource.id, action);
      setPowerNotice(text.started);

      const expected = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : '';
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 900 : 1200));
        try {
          const response = await userApi.getResourceDetails(liveResource.id);
          const next = response.data?.resource;
          if (!next) continue;
          setLiveResource(next);
          onResourceUpdate?.(next);
          const nextStatus = String(next.status || '').toLowerCase();
          if (!expected || nextStatus.includes(expected === 'running' ? 'run' : 'stop')) break;
        } catch (_) {
          // Keep polling briefly while Proxmox completes the task.
        }
      }
    } catch (err) {
      setPowerError(getErrorMessage(err, text.failed));
    } finally {
      setPowerBusy('');
    }
  };

  return (
    <div className="service-detail-page">
      <div className="subpage-back-row">
        <button type="button" className="btn-secondary" onClick={onBack}>{text.back}</button>
      </div>
      <SectionCard
        title={liveResource.name}
        subtitle={`${liveResource.clusterName || 'Unknown cluster'} · ${resourceTypeLabel(liveResource)}`}
        action={(
          <div className="service-detail-actions">
            <div className="service-power-actions" title={!canPower ? text.unavailable : ''}>
              {running ? (
                <>
                  <button type="button" className="btn-secondary" disabled={!canPower || !!powerBusy} onClick={() => runPowerAction('reboot')}>{powerBusy === 'reboot' ? '…' : text.restart}</button>
                  <button type="button" className="btn-danger" disabled={!canPower || !!powerBusy} onClick={() => runPowerAction('stop')}>{powerBusy === 'stop' ? '…' : text.stop}</button>
                </>
              ) : (
                <button type="button" className="btn-primary" disabled={!canPower || !!powerBusy} onClick={() => runPowerAction('start')}>{powerBusy === 'start' ? '…' : text.start}</button>
              )}
            </div>
            {publicUrl ? <a className="btn-primary" href={publicUrl} target="_blank" rel="noreferrer">{text.openService}</a> : null}
            {liveResource.adminUrl ? <a className="btn-secondary" href={liveResource.adminUrl} target="_blank" rel="noreferrer">{text.openAdmin}</a> : null}
            {liveResource?.capabilities?.canConsole ? <button type="button" className="btn-secondary" onClick={() => onConsole(liveResource.id)}>{text.openConsole}</button> : null}
          </div>
        )}
      >
        {powerError ? <InlineNotice tone="danger">{powerError}</InlineNotice> : null}
        {powerNotice ? <InlineNotice tone="success">{powerNotice}</InlineNotice> : null}
        <div className="service-detail-history-grid">
          <MetricSparkline label="CPU" value={cpu} history={history} field="cpuPercent" large />
          <MetricSparkline label="Memory" value={memory} history={history} field="memoryPercent" large />
        </div>
        <div className="detail-grid-clean service-detail-info-grid">
          {values.map(([label, value]) => (
            <div key={label} className="detail-pair-clean"><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
      </SectionCard>
      <ResourceAccessDetails resource={liveResource} language={language} />
      {liveResource.canDelete ? (
        <section className="service-danger-zone">
          <div className="service-danger-zone-copy">
            <span className="service-danger-zone-kicker">{text.dangerZone}</span>
            <strong>{text.deleteTitle}</strong>
            <p>{text.deleteHint}</p>
          </div>
          {!deleteOpen ? (
            <button type="button" className="btn-danger" onClick={() => { setDeleteOpen(true); setDeleteError(''); }}>{text.deleteButton}</button>
          ) : (
            <div className="service-danger-zone-confirm">
              {deleteError ? <InlineNotice tone="danger">{deleteError}</InlineNotice> : null}
              <label>
                <span>{text.deleteConfirmLabel}: <strong>{liveResource.name}</strong></span>
                <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} autoComplete="off" />
              </label>
              <div className="service-danger-zone-actions">
                <button type="button" className="btn-secondary" disabled={deleteBusy} onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(''); }}>{text.cancelDelete}</button>
                <button type="button" className="btn-danger" disabled={deleteBusy || deleteConfirm.trim() !== String(liveResource.name || '').trim()} onClick={deleteSelfServiceResource}>{deleteBusy ? '…' : text.deletePermanent}</button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function UserOverview({ resources, metrics, billing, language, onOpenBilling, onOpenProvisioning, onSelectService, onConsole }) {
  const running = resources.filter((item) => String(item.status || '').toLowerCase().includes('run')).length;
  const stopped = resources.filter((item) => String(item.status || '').toLowerCase().includes('stop')).length;
  const clusters = new Set(resources.map((item) => item.clusterName).filter(Boolean));
  const totalCpu = resources.reduce((sum, item) => sum + Number(item.maxcpu || 0), 0);
  const usedCpu = resources.reduce((sum, item) => {
    const raw = Number(item.cpu || 0);
    const ratio = raw > 1 ? raw / 100 : raw;
    return sum + (Math.min(Math.max(ratio, 0), 1) * Number(item.maxcpu || 0));
  }, 0);
  const cpuUsage = totalCpu > 0 ? Math.min(Math.max((usedCpu / totalCpu) * 100, 0), 100) : 0;
  const usedMemory = resources.reduce((sum, item) => sum + Number(item.mem || 0), 0);
  const totalMemory = resources.reduce((sum, item) => sum + Number(item.maxmem || 0), 0);
  const memoryUsage = totalMemory > 0 ? Math.min(Math.max((usedMemory / totalMemory) * 100, 0), 100) : 0;
  const usedStorage = resources.reduce((sum, item) => sum + Number(item.disk || 0), 0);
  const totalStorage = resources.reduce((sum, item) => sum + Number(item.maxdisk || 0), 0);
  const storageUsage = totalStorage > 0 ? Math.min(Math.max((usedStorage / totalStorage) * 100, 0), 100) : 0;
  const billingCurrency = billing?.settings?.currency || 'EUR';
  const billingTotal = Number(billing?.summary?.totalCost || 0);
  const billingCosts = billing?.summary?.costs || {};
  const billingLabel = language === 'de' ? 'Billing diesen Monat' : 'Billing this month';
  const billingHint = language === 'de' ? 'Billing öffnen' : 'Open billing';
  const billingParts = [
    { label: 'CPU', value: Number(billingCosts.cpu || 0) },
    { label: 'RAM', value: Number(billingCosts.memory || 0) },
    { label: 'Storage', value: Number(billingCosts.storage || 0) }
  ];
  const billingMaxPart = Math.max(...billingParts.map((part) => part.value), 0);

  return (
    <div className="user-dashboard-v4">
      <section className="hero-card-clean user-dashboard-hero-v4">
        <div>
          <p className="eyebrow-clean">Overview</p>
          <h2>{running === resources.length && resources.length ? 'All assigned services are running.' : 'Your hosting overview'}</h2>
          <p>{resources.length} services across {clusters.size} {clusters.size === 1 ? 'cluster' : 'clusters'}.</p>
        </div>
        <div className="user-dashboard-hero-actions">
          <button type="button" className="btn-primary" onClick={onOpenProvisioning}>Create container</button>
        </div>
      </section>

      <div className="user-dashboard-stats-v4">
        <StatCard label="Services" value={resources.length} hint="Assigned to your account" />
        <StatCard label="Running" value={running} hint="Online" tone="success" />
        <StatCard label="Stopped" value={stopped} hint="Offline" tone={stopped ? 'danger' : 'neutral'} />
        <div className="stat-card resource-usage-stat-card">
          <span className="stat-label">Resource usage</span>
          <div className="resource-usage-stat-list">
            <div className="resource-usage-stat-row">
              <div className="resource-usage-stat-head"><span>CPU</span><strong>{cpuUsage.toFixed(1)}%</strong></div>
              <div className="resource-usage-stat-track"><span style={{ width: `${cpuUsage}%` }} /></div>
            </div>
            <div className="resource-usage-stat-row">
              <div className="resource-usage-stat-head"><span>RAM</span><strong>{formatBytes(usedMemory)} / {formatBytes(totalMemory)}</strong></div>
              <div className="resource-usage-stat-track"><span style={{ width: `${memoryUsage}%` }} /></div>
            </div>
            <div className="resource-usage-stat-row">
              <div className="resource-usage-stat-head"><span>Storage</span><strong>{formatBytes(usedStorage)} / {formatBytes(totalStorage)}</strong></div>
              <div className="resource-usage-stat-track"><span style={{ width: `${storageUsage}%` }} /></div>
            </div>
          </div>
        </div>

        <button type="button" className="stat-card dashboard-billing-card" onClick={onOpenBilling}>
          <div className="dashboard-billing-card-head">
            <span className="dashboard-billing-card-icon"><BillingIcon size={17} /></span>
            <span className="stat-label">{billingLabel}</span>
            <strong>{billing ? formatMoney(billingTotal, billingCurrency, language) : '—'}</strong>
          </div>
          <div className="dashboard-billing-cost-graph">
            {billingParts.map((part) => {
              const width = billingMaxPart > 0 ? Math.max((part.value / billingMaxPart) * 100, part.value > 0 ? 4 : 0) : 0;
              return (
                <div className="dashboard-billing-cost-row" key={part.label}>
                  <div><span>{part.label}</span><strong>{formatMoney(part.value, billingCurrency, language)}</strong></div>
                  <div className="dashboard-billing-cost-track"><span style={{ width: `${width}%` }} /></div>
                </div>
              );
            })}
          </div>
          <span className="dashboard-billing-card-link">{billingHint} →</span>
        </button>
      </div>

      <SectionCard title="Services" className="user-dashboard-services-v4">
        <div className="service-card-grid dashboard-service-grid">
          {resources.slice(0, 6).map((resource) => (
            <ServiceCard key={resource.id} resource={resource} history={metrics?.[String(resource.id)]?.points || []} onDetails={onSelectService} onConsole={onConsole} compact />
          ))}
          {!resources.length ? <EmptyState title="No services yet" text="Assigned services will appear here." /> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function UserServices({ resources, metrics, selectedId, detailOpen, language, onDetails, onCloseDetails, onConsole, onOpenProvisioning, onResourceUpdate, onResourceDeleted }) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return resources;
    return resources.filter((item) => [item.name, item.clusterName, item.node, item.status, item.containerId].some((field) => String(field || '').toLowerCase().includes(term)));
  }, [resources, filter]);
  const selected = resources.find((item) => String(item.id) === String(selectedId)) || null;

  if (detailOpen && selected) {
    return <ServiceDetailView resource={selected} history={metrics?.[String(selected.id)]?.points || []} language={language} onBack={onCloseDetails} onConsole={onConsole} onResourceUpdate={onResourceUpdate} onDeleted={onResourceDeleted} />;
  }

  return (
    <SectionCard action={(
      <div className="services-section-actions">
        <input className="search-clean services-inline-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter services…" />
        <button type="button" className="btn-primary" onClick={onOpenProvisioning}>Create container</button>
      </div>
    )}>
      <div className="service-card-grid">
        {filtered.map((resource) => (
          <ServiceCard key={resource.id} resource={resource} history={metrics?.[String(resource.id)]?.points || []} onDetails={onDetails} onConsole={onConsole} />
        ))}
        {!filtered.length ? <EmptyState title="No matching services" text="Try another filter." /> : null}
      </div>
    </SectionCard>
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
  const [metrics, setMetrics] = useState({});
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
  const [billingSummary, setBillingSummary] = useState(null);
  const { theme, setTheme } = useTheme();

  const refreshMetrics = useCallback(async () => {
    try {
      const response = await userApi.getResourceMetrics('hour');
      setMetrics(response.data?.metrics || {});
    } catch (_) {
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [resourcesRes, profileRes, optionsRes, jobsRes, billingRes] = await Promise.all([
        userApi.getResources(),
        userApi.getProfile(),
        userApi.getProvisioningOptions().catch(() => ({ data: { clusters: [], options: [] } })),
        userApi.getProvisioningJobs(10).catch(() => ({ data: { jobs: [] } })),
        userApi.getBilling().catch(() => ({ data: null }))
      ]);
      const nextResources = resourcesRes.data?.resources || [];
      setResources(nextResources);
      setProfile(profileRes.data?.profile || {});
      setProvisioningOptions(optionsRes.data?.clusters || optionsRes.data?.options || []);
      setActiveProvisioningJob((jobsRes.data?.jobs || []).find((item) => ['queued', 'running'].includes(item.status)) || null);
      setBillingSummary(billingRes.data || null);
      setSelectedId((current) => current || nextResources[0]?.id || '');
      refreshMetrics();
    } catch (err) {
      setError(getErrorMessage(err, 'The dashboard could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [refreshMetrics]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(refreshMetrics, 60000);
    return () => window.clearInterval(timer);
  }, [refreshMetrics]);

  const openConsole = (resourceId) => {
    window.open(`/console/${resourceId}`, '_blank', 'noopener,noreferrer');
  };

  const openServiceDetails = (resourceId) => {
    setSelectedId(resourceId);
    setDetailOpen(true);
    setActiveTab('services');
  };

  const updateResource = useCallback((nextResource) => {
    if (!nextResource?.id) return;
    setResources((current) => current.map((item) => String(item.id) === String(nextResource.id) ? nextResource : item));
  }, []);

  const handleResourceDeleted = useCallback(async () => {
    setDetailOpen(false);
    setSelectedId('');
    await load();
  }, [load]);

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
    { key: 'public-access', label: language === 'de' ? 'Öffentlicher Zugriff' : 'Public Access', icon: GlobeIcon },
    { key: 'billing', label: language === 'de' ? 'Billing' : 'Billing', icon: BillingIcon },
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

  const activeTitle = { dashboard: 'Dashboard', services: 'Services', 'public-access': language === 'de' ? 'Öffentlicher Zugriff' : 'Public Access', billing: 'Billing', wiki: 'Wiki', settings: 'Settings' }[activeTab];

  let content = null;
  if (loading) {
    content = <PageSkeleton variant={activeTab === 'services' ? 'table' : 'dashboard'} />;
  } else if (activeTab === 'dashboard') {
    content = <UserOverview
      resources={resources}
      metrics={metrics}
      billing={billingSummary}
      language={language}
      onOpenBilling={() => setActiveTab('billing')}
      onOpenProvisioning={() => setCreateOpen(true)}
      onSelectService={openServiceDetails}
      onConsole={openConsole}
    />;
  } else if (activeTab === 'services') {
    content = <UserServices resources={resources} metrics={metrics} selectedId={selectedId} detailOpen={detailOpen} language={language} onDetails={openServiceDetails} onCloseDetails={() => setDetailOpen(false)} onConsole={openConsole} onOpenProvisioning={() => setCreateOpen(true)} onResourceUpdate={updateResource} onResourceDeleted={handleResourceDeleted} />;
  } else if (activeTab === 'public-access') {
    content = <UserPublicAccess resources={resources} language={language} onResourceUpdate={updateResource} />;
  } else if (activeTab === 'billing') {
    content = <UserBilling language={language} />;
  } else if (activeTab === 'wiki') {
    content = <WikiBrowser language={language} />;
  } else {
    content = (
      <div className="settings-layout-clean settings-grid-compact user-settings-grid-v5">
        <SettingsSummary profile={profile} setProfile={setProfile} saveProfile={saveProfile} savingProfile={savingProfile} error={error} notice={notice} />
        <SectionCard title="Appearance & language" className="settings-preferences-card">
          <div className="settings-choice-grid settings-slider-grid">
            <div className="settings-choice-block">
              <span className="settings-choice-label">Appearance</span>
              <PreferenceSlider
                value={theme}
                ariaLabel="Appearance"
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' }
                ]}
              />
            </div>
            <div className="settings-choice-block">
              <span className="settings-choice-label">Language</span>
              <PreferenceSlider
                value={language}
                ariaLabel="Language"
                onChange={changeLanguage}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'Deutsch' }
                ]}
              />
            </div>
          </div>
        </SectionCard>
        <SectionCard className="settings-compact-card"><AvatarSettingsPanel language={language} /></SectionCard>
        <SectionCard className="settings-compact-card"><AccountEmailSettingsPanel language={language} /></SectionCard>
        <SectionCard className="settings-compact-card"><AccountPasswordSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Notifications" className="settings-compact-card"><NotificationSettingsPanel language={language} /></SectionCard>
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
        onLanguageChange={changeLanguage}
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
