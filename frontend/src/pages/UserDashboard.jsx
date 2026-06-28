import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchContainers();
  }, []);

  const fetchContainers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await userApi.getContainers();
      setContainers(response.data.containers || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Container konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  };

  const renderStatus = (status) => {
    switch (status) {
      case 'running': return 'Läuft';
      case 'stopped': return 'Gestoppt';
      case 'paused': return 'Pausiert';
      case 'suspended': return 'Angehalten';
      default: return status || 'Unbekannt';
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="app-page">
      <header className="app-topbar">
        <div>
          <p className="eyebrow">Hosting Portal</p>
          <h1>Meine Systeme</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user?.name || user?.email}</span>
          <button type="button" className="btn-secondary" onClick={logout}>Abmelden</button>
        </div>
      </header>

      <main className="app-container">
        {error && <div className="alert alert-danger">{error}</div>}

        {loading ? (
          <div className="loading"><span className="spinner"></span><span>Container werden geladen...</span></div>
        ) : containers.length === 0 ? (
          <section className="empty-state panel-card">
            <h2>Keine Systeme zugewiesen</h2>
            <p>Dir sind noch keine Container oder VMs zugewiesen.</p>
          </section>
        ) : (
          <section className="resource-grid">
            {containers.map(container => {
              const memPercent = container.maxmem ? (container.mem / container.maxmem) * 100 : 0;
              const cpuPercent = container.maxcpu ? (container.cpu / container.maxcpu) * 100 : 0;
              const diskPercent = container.maxdisk ? (container.disk / container.maxdisk) * 100 : 0;

              return (
                <article key={`${container.clusterId}-${container.id}`} className="resource-card">
                  <div className="resource-card-header">
                    <div>
                      <span className="resource-id">{container.type?.toUpperCase()} · {container.id}</span>
                      <h2>{container.name || 'Ohne Namen'}</h2>
                    </div>
                    <span className={`status-badge status-${container.status || 'unknown'}`}>{renderStatus(container.status)}</span>
                  </div>

                  <div className="resource-meta">
                    <span>Node</span><strong>{container.node}</strong>
                    <span>Cluster</span><strong>{container.clusterName}</strong>
                  </div>

                  <Metric label="CPU" percent={cpuPercent} detail={`${container.cpu || 0}/${container.maxcpu || 0} Kerne`} />
                  <Metric label="Arbeitsspeicher" percent={memPercent} detail={`${formatBytes(container.mem)} / ${formatBytes(container.maxmem)}`} />
                  <Metric label="Datenträger" percent={diskPercent} detail={`${formatBytes(container.disk)} / ${formatBytes(container.maxdisk)}`} />

                  {container.ips?.length > 0 && (
                    <div className="ip-list">
                      <span>IP-Adressen</span>
                      {container.ips.map((ip, idx) => <code key={idx}>{ip.ipv4 || ip.ipv6 || 'k. A.'}</code>)}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn-primary full-button"
                    onClick={() => container.webUiUrl && window.open(container.webUiUrl, '_blank')}
                    disabled={container.status !== 'running'}
                  >
                    {container.status === 'running' ? 'Konsole öffnen' : 'System offline'}
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}

function Metric({ label, percent, detail }) {
  const safePercent = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return (
    <div className="metric-line">
      <div><span>{label}</span><strong>{safePercent.toFixed(1)}%</strong></div>
      <div className="progress-bar"><span style={{ width: `${safePercent}%` }}></span></div>
      <small>{detail}</small>
    </div>
  );
}
