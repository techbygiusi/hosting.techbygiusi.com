import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi, getErrorMessage } from '../services/api';
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

export default function UserDashboard() {
  const { logout } = useAuth();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await userApi.getResources();
      setResources(response.data.resources || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Dienste konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-brand">
            <h1>Hosting by TechByGiusi</h1>
          </div>
          <div className="site-actions">
            <ThemeButton />
            <button type="button" className="btn-secondary logout-button" onClick={logout} aria-label="Abmelden"><LogoutIcon /><span className="logout-label">Abmelden</span></button>
          </div>
        </div>
      </header>

      <main className="app-container compact-container">
        {error && <div className="alert alert-danger">{error}</div>}

        {loading ? (
          <div className="loading"><span className="spinner"></span><span>Dienste werden geladen...</span></div>
        ) : resources.length === 0 ? (
          <section className="empty-state panel-card">
            <h2>Keine Dienste</h2>
            <p>Dir sind noch keine Dienste zugewiesen.</p>
          </section>
        ) : (
          <section className="resource-grid">
            {resources.map(resource => <ResourceCard key={resource.id} resource={resource} />)}
          </section>
        )}
      </main>
    </div>
  );
}

function ResourceCard({ resource }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cpuPercent = getCpuPercent(resource);
  const memPercent = getPercent(resource.mem, resource.maxmem);
  const publicUrl = resource.publicUrl || resource.webUrl;

  return (
    <article className="resource-card compact-resource-card">
      <div className="resource-card-header">
        <div>
          <span className="resource-id">{renderType(resource.type)} · {resource.containerId}</span>
          <h2>{resource.name}</h2>
        </div>
        <span className={`status-badge status-${resource.status || 'unknown'}`}>{renderStatus(resource.status)}</span>
      </div>

      <div className="resource-summary">
        <div><span>Cluster</span><strong>{resource.clusterName || 'Unbekannt'}</strong></div>
        <div><span>Node</span><strong>{resource.node || 'Unbekannt'}</strong></div>
      </div>

      <Metric label="CPU" percent={cpuPercent} detail={`${cpuPercent.toFixed(1)} %`} />
      <Metric label="RAM" percent={memPercent} detail={`${formatBytes(resource.mem)} / ${formatBytes(resource.maxmem)}`} />

      {publicUrl ? (
        <a className="btn-primary full-button" href={publicUrl} target="_blank" rel="noreferrer">Öffentliche Seite</a>
      ) : (
        <button type="button" className="btn-secondary full-button" disabled>Keine öffentliche Seite</button>
      )}

      <button type="button" className="btn-secondary full-button service-detail-toggle" onClick={() => setDetailsOpen(value => !value)}>
        {detailsOpen ? 'Details ausblenden' : 'Details anzeigen'}
      </button>

      {detailsOpen && (
        <div className="resource-details">
          <div className="resource-meta">
            <span>Cluster</span><span>{resource.clusterName || 'Unbekannt'}</span>
            <span>Node</span><span>{resource.node || 'Unbekannt'}</span>
          </div>
          <DiskDetails resource={resource} />
          {resource.monitorError && <p className="hint-text">Monitoring ist gerade nicht erreichbar.</p>}
        </div>
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
  const detail = hasUsed && maxdisk
    ? `${formatBytes(disk.used)} / ${formatBytes(maxdisk)}`
    : maxdisk ? `Größe ${formatBytes(maxdisk)}` : 'Größe nicht gemeldet';

  return (
    <div className="disk-row">
      <div className="disk-row-header">
        <span>{title}</span>
        <small>{hasUsed ? `${percent.toFixed(1)}%` : 'Belegung nicht gemeldet'}</small>
      </div>
      {hasUsed && <div className="progress-bar"><span style={{ width: `${percent}%` }}></span></div>}
      <small>{detail}</small>
      {subtitle && <small className="disk-source">{subtitle}</small>}
    </div>
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
  return 'Dienst';
}
