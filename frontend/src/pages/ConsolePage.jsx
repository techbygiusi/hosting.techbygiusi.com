import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import TerminalView from '../components/TerminalView';
import { userApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';

export default function ConsolePage() {
  const { resourceId } = useParams();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.classList.add('console-route-active');
    document.body.classList.add('console-route-active');
    return () => {
      document.documentElement.classList.remove('console-route-active');
      document.body.classList.remove('console-route-active');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadResource() {
      try {
        setLoading(true);
        setError('');
        const res = await userApi.getResourceDetails(resourceId);
        if (!cancelled) setResource(res.data.resource || null);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Dienst konnte nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadResource();
    return () => { cancelled = true; };
  }, [resourceId]);

  const closeTab = () => {
    window.close();
  };

  const caps = resource?.capabilities || {};
  const canUseConsole = !!caps.canConsole;
  const isRunning = resource?.status === 'running';

  return (
    <div className="app-page console-page">
      <header className="console-page-header">
        <div>
          <p className="eyebrow">Proxmox Console</p>
          <h1>{resource?.name || 'Konsole'}</h1>
        </div>
        <div className="console-page-actions">
          <Link className="btn-secondary" to="/dashboard">Zurück</Link>
          <button type="button" className="btn-primary" onClick={closeTab}>Tab schließen</button>
        </div>
      </header>

      <main className="console-page-main">
        {loading && <div className="loading"><span className="spinner"></span><span>Konsole wird vorbereitet...</span></div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && resource && !canUseConsole && (
          <section className="panel-card console-page-message">
            <h2>Keine Konsolenberechtigung</h2>
            <p>Der API-Token dieses Clusters erlaubt keinen Konsolen-Zugriff.</p>
          </section>
        )}

        {!loading && !error && resource && canUseConsole && !isRunning && (
          <section className="panel-card console-page-message">
            <h2>Maschine ist gestoppt</h2>
            <p>Starte den Container zuerst, danach kann die Konsole geöffnet werden.</p>
          </section>
        )}

        {!loading && !error && resource && canUseConsole && isRunning && (
          <section className="console-page-card">
            <div className="console-page-meta">
              <span>{resource.clusterName || 'Unbekannter Cluster'}</span>
              <span>{resource.node || 'Unbekannter Node'}</span>
              <span>ID {resource.containerId || resource.id}</span>
            </div>
            <TerminalView resourceId={resource.id} resourceName={resource.name} fullscreen />
          </section>
        )}
      </main>
    </div>
  );
}
