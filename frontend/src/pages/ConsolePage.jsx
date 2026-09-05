import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import TerminalView from '../components/TerminalView';
import { userApi, getErrorMessage } from '../services/api';
import '../styles/globals.css';
import { readStoredLanguage } from '../components/LanguageSwitch';
import { translatePortalText } from '../i18n';
import { BrandMark } from '../components/BrandLogo';
import PageSkeleton from '../components/PageSkeleton';

export default function ConsolePage() {
  const { resourceId } = useParams();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [powerError, setPowerError] = useState('');
  const [machineTransition, setMachineTransition] = useState('');
  const [transitionSawOffline, setTransitionSawOffline] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState('power');
  const [consoleGeneration, setConsoleGeneration] = useState(0);
  const closeCheckTimer = useRef(null);
  const closeConsoleSessionRef = useRef(null);
  const closingTabRef = useRef(false);
  const [consoleToolbarTarget, setConsoleToolbarTarget] = useState(null);

  useEffect(() => {
    document.documentElement.classList.add('console-route-active');
    document.body.classList.add('console-route-active');
    return () => {
      document.documentElement.classList.remove('console-route-active');
      document.body.classList.remove('console-route-active');
      if (closeCheckTimer.current) clearTimeout(closeCheckTimer.current);
    };
  }, []);

  const fetchResource = useCallback(async ({ initial = false } = {}) => {
    try {
      if (initial) setLoading(true);
      if (initial) setError('');
      const res = await userApi.getResourceDetails(resourceId);
      const next = res.data.resource || null;
      setResource(next);
      return next;
    } catch (err) {
      if (initial) setError(getErrorMessage(err, 'Dienst konnte nicht geladen werden.'));
      return null;
    } finally {
      if (initial) setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchResource({ initial: true });
    })();
    return () => { cancelled = true; };
  }, [fetchResource]);

  const beginTransition = useCallback((kind, { sawOffline = false } = {}) => {
    setTransitionSawOffline(!!sawOffline);
    setTransitionPhase('power');
    setPowerError('');
    setMachineTransition(kind);
  }, []);

  useEffect(() => {
    if (!machineTransition) return undefined;
    let cancelled = false;
    let polling = false;

    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const [next, readinessResponse] = await Promise.all([
          fetchResource(),
          userApi.getConsoleReadiness(resourceId).catch(() => null)
        ]);
        if (cancelled || !next) return;

        const readiness = readinessResponse?.data || {};
        const running = next.status === 'running';
        const ready = !!readiness.ready;
        setTransitionPhase(readiness.phase || (running ? 'console' : 'power'));

        if (!running || readiness.powerReady === false || !ready) {
          if (machineTransition === 'rebooting') setTransitionSawOffline(true);
          return;
        }

        if (machineTransition === 'starting') {
          setMachineTransition('');
          setTransitionPhase('ready');
          setConsoleGeneration(value => value + 1);
          return;
        }

        if (machineTransition === 'rebooting' && transitionSawOffline) {
          setMachineTransition('');
          setTransitionPhase('ready');
          setConsoleGeneration(value => value + 1);
        }
      } finally {
        polling = false;
      }
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [machineTransition, transitionSawOffline, fetchResource, resourceId]);

  const registerConsoleSessionCloser = useCallback((closer) => {
    closeConsoleSessionRef.current = typeof closer === 'function' ? closer : null;
  }, []);

  useEffect(() => {
    const closeSession = () => {
      try { closeConsoleSessionRef.current?.(); } catch (_) { /* noop */ }
    };
    window.addEventListener('pagehide', closeSession);
    return () => window.removeEventListener('pagehide', closeSession);
  }, []);

  const closeTab = useCallback(() => {
    closingTabRef.current = true;
    try { closeConsoleSessionRef.current?.(); } catch (_) { /* noop */ }

    // Give the WebSocket close handshake a brief head start so the backend can
    // end the Proxmox/SSH upstream cleanly before the browser tab disappears.
    window.setTimeout(() => {
      window.close();
      // Browsers refuse window.close() for tabs that were not script-opened.
      // In that case, leave the closed console page and return to the portal.
      window.setTimeout(() => {
        if (!window.closed) window.location.assign('/dashboard');
      }, 160);
    }, 50);
  }, []);

  const startMachine = async () => {
    if (!resource?.capabilities?.canPower) return;
    try {
      beginTransition('starting');
      await userApi.powerAction(resource.id, 'start');
    } catch (err) {
      setMachineTransition('');
      setPowerError(getErrorMessage(err, 'Maschine konnte nicht gestartet werden.'));
      await fetchResource();
    }
  };

  const handleRebootDetected = useCallback(() => {
    // The console connection has already closed after the reboot command, so
    // this is our offline edge. Reconnect only after the readiness probe later
    // confirms that the real console target is usable again.
    beginTransition('rebooting', { sawOffline: true });
  }, [beginTransition]);

  const handleConsoleClosed = useCallback(({ rebootRequested } = {}) => {
    if (closingTabRef.current || rebootRequested || machineTransition) return;
    let attempts = 0;
    const inspect = async () => {
      attempts += 1;
      const next = await fetchResource();
      if (next && next.status !== 'running') {
        beginTransition('rebooting', { sawOffline: true });
        return;
      }
      if (attempts < 5) closeCheckTimer.current = setTimeout(inspect, 1500);
    };
    closeCheckTimer.current = setTimeout(inspect, 700);
  }, [beginTransition, fetchResource, machineTransition]);

  const caps = resource?.capabilities || {};
  const canUseConsole = !!caps.canConsole;
  const isRunning = resource?.status === 'running';
  const language = readStoredLanguage();
  const text = (value) => translatePortalText(value, language);
  const isSshConsole = resource?.consoleMode === 'ssh';
  const consoleTitle = isSshConsole ? text('SSH-Konsole') : text('Proxmox-Konsole');
  const consoleTarget = isSshConsole
    ? `${resource?.manualIp || resource?.primaryIp || text('Unbekannte IP')}:${resource?.sshPort || 22}`
    : (resource?.node || text('Unbekannter Node'));

  const waitingForMachine = machineTransition === 'starting' || machineTransition === 'rebooting';

  return (
    <div className="app-page console-page">
      <header className="console-page-header console-page-header-unified">
        <div className="console-header-identity">
          <BrandMark className="console-brand-mark" size={42} />
          <div className="console-header-title">
            <p className="eyebrow">{consoleTitle}</p>
            <h1>{resource?.name || text('Konsole')}</h1>
          </div>
          {resource && (
            <div className="console-header-meta" aria-label={text('Konsoleninformationen')}>
              <span>{resource.clusterName || text('Unbekannter Cluster')}</span>
              <span>{isSshConsole ? `${text('SSH-Ziel')} ${consoleTarget}` : consoleTarget}</span>
              <span>ID {resource.containerId || resource.id}</span>
            </div>
          )}
        </div>
        <div className="console-header-controls">
          <div className="console-header-terminal-controls" ref={setConsoleToolbarTarget} />
          <div className="console-page-actions">
            <Link className="btn-secondary" to="/dashboard">{text('Zurück')}</Link>
            <button type="button" className="btn-primary" onClick={closeTab}>{text('Tab schließen')}</button>
          </div>
        </div>
      </header>

      <main className="console-page-main">
        {loading && <PageSkeleton variant="console" compact />}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && resource && !canUseConsole && (
          <section className="panel-card console-page-message">
            <h2>{text('Keine Konsolenberechtigung')}</h2>
            <p>{text('Der API-Token dieses Clusters erlaubt keinen Konsolen-Zugriff.')}</p>
          </section>
        )}

        {!loading && !error && resource && canUseConsole && waitingForMachine && (
          <section className="panel-card console-page-message console-machine-wait">
            <span className="spinner"></span>
            <div>
              <h2>{machineTransition === 'rebooting' ? text('Neustart...') : text('Startet...')}</h2>
              <p>{isSshConsole
                ? (transitionPhase === 'ssh'
                  ? text('Teste SSH-Anmeldung...')
                  : transitionPhase === 'credentials'
                    ? text('Prüfe SSH-Zugang...')
                    : text('Warte auf System...'))
                : text('Teste Konsole...')}
              </p>
            </div>
          </section>
        )}

        {!loading && !error && resource && canUseConsole && !isRunning && !waitingForMachine && (
          <section className="panel-card console-page-message">
            <h2>{text('Maschine ist gestoppt')}</h2>
            <p>{text('Starte die Maschine zuerst, danach kann die Konsole geöffnet werden.')}</p>
            {powerError && <div className="alert alert-danger">{powerError}</div>}
            {caps.canPower && (
              <div className="form-actions console-start-actions">
                <button type="button" className="btn-primary" onClick={startMachine}>{text('Maschine starten')}</button>
              </div>
            )}
          </section>
        )}

        {!loading && !error && resource && canUseConsole && isRunning && !waitingForMachine && (
          <section className="console-page-card console-page-card-terminal-only">
            <TerminalView
              key={`${resource.id}-${consoleGeneration}`}
              resourceId={resource.id}
              resourceName={resource.name}
              fullscreen
              toolbarTarget={consoleToolbarTarget}
              onRebootDetected={handleRebootDetected}
              onConnectionClosed={handleConsoleClosed}
              onSessionCloserReady={registerConsoleSessionCloser}
            />
          </section>
        )}
      </main>
    </div>
  );
}
