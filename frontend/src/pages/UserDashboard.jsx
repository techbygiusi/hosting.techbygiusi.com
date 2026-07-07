import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';
import ThemeButton from '../components/ThemeButton';
import ResourceDetail, { getPercent, formatBytes, renderStatus, renderType } from '../components/ResourceDetail';
import CreateMachineModal from '../components/CreateMachineModal';

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
  const [detailId, setDetailId] = useState(null);
  const [provisioningOptions, setProvisioningOptions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetchResources = useCallback(async (withSpinner = true) => {
    try {
      if (withSpinner) setLoading(true);
      setError('');
      const response = await userApi.getResources();
      setResources(response.data.resources || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Dienste konnten nicht geladen werden.'));
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
    // Provisioning available? (silently – read-only tokens simply return no clusters)
    userApi.getProvisioningOptions()
      .then(res => setProvisioningOptions(res.data.clusters || []))
      .catch(() => setProvisioningOptions([]));
  }, [fetchResources]);

  // Auto-refresh metrics every 30s while the tab is visible
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchResources(false);
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, [fetchResources]);

  const detailResource = resources.find(item => item.id === detailId) || null;

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

        {provisioningOptions.length > 0 && (
          <div className="dashboard-actions desktop-only-block">
            <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>Neuen Container erstellen</button>
          </div>
        )}

        {loading ? (
          <div className="loading"><span className="spinner"></span><span>Dienste werden geladen...</span></div>
        ) : resources.length === 0 ? (
          <section className="empty-state panel-card">
            <h2>Keine Dienste</h2>
            <p>Dir sind noch keine Dienste zugewiesen.</p>
            {provisioningOptions.length > 0 && (
              <button type="button" className="btn-primary desktop-only-block" onClick={() => setShowCreate(true)}>Ersten Container erstellen</button>
            )}
          </section>
        ) : (
          <section className="resource-grid">
            {resources.map(resource => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onOpenDetails={() => setDetailId(resource.id)}
              />
            ))}
          </section>
        )}
      </main>

      {detailResource && (
        <ResourceDetail
          resource={detailResource}
          onClose={() => setDetailId(null)}
          onChanged={() => fetchResources(false)}
        />
      )}

      {showCreate && (
        <CreateMachineModal
          options={provisioningOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => fetchResources(false)}
        />
      )}
    </div>
  );
}

function ResourceCard({ resource, onOpenDetails }) {
  const cpuPercent = getCpuPercent(resource);
  const memPercent = getPercent(resource.mem, resource.maxmem);
  const publicUrl = resource.publicUrl || resource.webUrl;

  return (
    <article className="resource-card compact-resource-card">
      <div className="resource-card-header">
        <div>
          <span className="resource-id">
            {renderType(resource.type)} · {resource.containerId}
            {resource.groupName && <span className="group-chip">{resource.groupName}</span>}
          </span>
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
      ) : null}

      <button type="button" className="btn-secondary full-button service-detail-toggle" onClick={onOpenDetails}>
        Details anzeigen
      </button>

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
function getCpuPercent(resource) {
  const cpu = Number(resource.cpu || 0);
  if (cpu <= 1) return Math.min(Math.max(cpu * 100, 0), 100);
  return Math.min(Math.max(cpu, 0), 100);
}
