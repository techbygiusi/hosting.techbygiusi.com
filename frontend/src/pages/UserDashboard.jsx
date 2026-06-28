import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';
import ThemeButton from '../components/ThemeButton';

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
      setError(getErrorMessage(err, 'Ressourcen konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-brand">
            <p>Hosting Portal</p>
            <h1>Meine Ressourcen</h1>
          </div>
          <div className="site-actions">
            <ThemeButton />
            <button type="button" className="btn-secondary" onClick={logout}>Abmelden</button>
          </div>
        </div>
      </header>

      <main className="app-container compact-container">
        {error && <div className="alert alert-danger">{error}</div>}

        {loading ? (
          <div className="loading"><span className="spinner"></span><span>Ressourcen werden geladen...</span></div>
        ) : resources.length === 0 ? (
          <section className="empty-state panel-card">
            <h2>Keine Ressourcen</h2>
            <p>Dir sind noch keine Container oder VMs zugewiesen.</p>
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
        <span>Cluster</span><span>{resource.clusterName}</span>
        <span>Node</span><span>{resource.node || 'Unbekannt'}</span>
      </div>

      <Metric label="CPU" percent={cpuPercent} detail={`${cpuPercent.toFixed(1)} %`} />
      <Metric label="RAM" percent={memPercent} detail={`${formatBytes(resource.mem)} / ${formatBytes(resource.maxmem)}`} />
      <Metric label="Disk" percent={diskPercent} detail={`${formatBytes(resource.disk)} / ${formatBytes(resource.maxdisk)}`} />

      {resource.webUrl ? (
        <a className="btn-primary full-button" href={resource.webUrl} target="_blank" rel="noreferrer">Webseite öffnen</a>
      ) : (
        <button type="button" className="btn-secondary full-button" disabled>Kein Weblink</button>
      )}

      {resource.monitorError && <p className="hint-text">Monitoring ist gerade nicht erreichbar.</p>}
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
