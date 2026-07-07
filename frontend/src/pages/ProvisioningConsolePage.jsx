import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import TerminalView from '../components/TerminalView';
import { userApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 768px)').matches;
}

export default function ProvisioningConsolePage() {
  const [searchParams] = useSearchParams();
  const clusterId = searchParams.get('clusterId') || '';
  const communityScript = searchParams.get('script') || '';
  const [sessionInfo, setSessionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [desktop, setDesktop] = useState(isDesktopViewport());

  const title = useMemo(() => sessionInfo?.script || 'Community Script', [sessionInfo]);

  useEffect(() => {
    const onResize = () => setDesktop(isDesktopViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function openConsole() {
      if (!desktop) {
        setLoading(false);
        return;
      }
      if (!clusterId || !communityScript) {
        setError('Community Script oder Cluster fehlt.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError('');
        const res = await userApi.openCommunityScriptConsole({ clusterId, communityScript });
        if (!cancelled) setSessionInfo(res.data);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Community Script konnte nicht gestartet werden.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    openConsole();
    return () => { cancelled = true; };
  }, [clusterId, communityScript, desktop]);

  const closeTab = () => window.close();

  return (
    <div className="app-page console-page">
      <header className="console-page-header">
        <div>
          <p className="eyebrow">Community Script</p>
          <h1>{title}</h1>
        </div>
        <div className="console-page-actions">
          <Link className="btn-secondary" to="/dashboard">Zurück</Link>
          <button type="button" className="btn-primary" onClick={closeTab}>Tab schließen</button>
        </div>
      </header>

      <main className="console-page-main">
        {!desktop && (
          <section className="panel-card console-page-message">
            <h2>Nur auf Desktop verfügbar</h2>
            <p>Container-Erstellung und Community Scripts sind auf Mobile deaktiviert, damit die interaktive Proxmox-Konsole zuverlässig bedienbar bleibt.</p>
          </section>
        )}

        {desktop && loading && <div className="loading"><span className="spinner"></span><span>Terminal wird vorbereitet...</span></div>}
        {desktop && error && <div className="alert alert-danger">{error}</div>}

        {desktop && !loading && !error && sessionInfo && (
          <section className="console-page-card">
            <div className="console-page-meta">
              <span>{sessionInfo.clusterName || 'Unbekannter Cluster'}</span>
              <span>{sessionInfo.node || 'Unbekannte Node'}</span>
              <span>{sessionInfo.script || 'Community Script'}</span>
            </div>
            <TerminalView sessionInfo={sessionInfo} resourceName={sessionInfo.script || 'Community Script'} fullscreen />
          </section>
        )}
      </main>
    </div>
  );
}
