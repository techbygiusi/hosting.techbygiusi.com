import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return value;
  }
}

export default function SystemUpdates() {
  const [update, setUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [waitingForBackend, setWaitingForBackend] = useState(false);
  const [hostTimezone, setHostTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'; } catch (_) { return 'Europe/Berlin'; }
  });
  const timezoneTouched = useRef(false);
  const reloadScheduled = useRef(false);
  const logRef = useRef(null);
  const logFollowEnabled = useRef(true);

  const running = ['queued', 'running'].includes(update?.status);
  const timezoneOptions = useMemo(() => {
    try {
      if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
    } catch (_) {
    }
    return ['Europe/Berlin', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];
  }, []);

  const loadStatus = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await adminApi.getSystemUpdateStatus();
      const next = response.data?.update || null;
      setUpdate(next);
      setWaitingForBackend(false);
      if (!timezoneTouched.current && next?.hostTimezone) setHostTimezone(next.hostTimezone);
      if (next?.status === 'completed' && next?.type === 'portal' && !reloadScheduled.current) {
        reloadScheduled.current = true;
        setNotice('Portal update completed. Reloading the portal…');
        window.setTimeout(() => window.location.reload(), 2500);
      }
    } catch (err) {
      if (silent) {
        setWaitingForBackend(true);
      } else {
        setError(getErrorMessage(err, 'Update status could not be loaded.'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const timer = window.setInterval(() => loadStatus(true), 850);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async (type) => {
    const label = type === 'portal' ? 'portal application' : 'Debian operating system';
    if (!window.confirm(`Start the ${label} update now?`)) return;
    setStarting(type);
    setError('');
    setNotice('');
    reloadScheduled.current = false;
    try {
      const response = await adminApi.startSystemUpdate(type);
      setUpdate(response.data?.update || null);
      setNotice(type === 'portal' ? 'Portal update started.' : 'Debian update started.');
    } catch (err) {
      setError(getErrorMessage(err, 'The update could not be started.'));
    } finally {
      setStarting('');
    }
  };

  const saveTimezone = async () => {
    const timezone = String(hostTimezone || '').trim();
    if (!timezone) {
      setError('Choose a timezone first.');
      return;
    }
    if (!window.confirm(`Set the Debian host timezone to ${timezone}?`)) return;
    setStarting('timezone');
    setError('');
    setNotice('');
    try {
      const response = await adminApi.startSystemUpdate('timezone', { timezone });
      setUpdate(response.data?.update || null);
      setNotice(`Timezone change to ${timezone} started.`);
    } catch (err) {
      setError(getErrorMessage(err, 'The host timezone could not be changed.'));
    } finally {
      setStarting('');
    }
  };

  const steps = useMemo(() => update?.steps || [], [update]);
  const finalizing = running && Number(update?.progress || 0) >= 100 && steps.length > 0 && steps.every((step) => step.status === 'done');

  useEffect(() => {
    const element = logRef.current;
    if (!element || !logFollowEnabled.current) return;
    element.scrollTop = element.scrollHeight;
  }, [update?.log]);

  const handleLogScroll = () => {
    const element = logRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    logFollowEnabled.current = distanceFromBottom <= 48;
  };

  if (loading) {
    return <SectionCard><div className="page-state-clean">Loading update status…</div></SectionCard>;
  }

  return (
    <div className="system-updates-page">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {waitingForBackend ? <InlineNotice tone="info">The portal is restarting. Waiting for the backend to come back online…</InlineNotice> : null}
      {!update?.helperInstalled ? (
        <InlineNotice tone="warning">
          The Debian host updater is not installed yet. Run <code>./setup-updater.sh</code> as root once in <code>/opt/hosting.techbygiusi.com</code>.
        </InlineNotice>
      ) : Number(update?.helperVersion || 1) < 2 ? (
        <InlineNotice tone="warning">
          Refresh the Debian helper once with <code>./setup-updater.sh</code> as root to enable host timezone management.
        </InlineNotice>
      ) : null}

      <div className="system-update-actions-grid">
        <SectionCard title="Debian updates" className="system-update-action-card">
          <div className="system-update-action-content">
            <p>Refresh the Debian package lists and install available package upgrades. No automatic reboot is performed.</p>
            <div className="system-update-command-preview">
              <code>apt-get update</code>
              <code>apt-get -y upgrade</code>
            </div>
            <div className="system-update-action-footer">
              <button type="button" className="btn-primary" onClick={() => start('os')} disabled={!update?.helperInstalled || running || !!starting}>
                {starting === 'os' ? 'Starting…' : 'Update Debian'}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Portal update" className="system-update-action-card">
          <div className="system-update-action-content">
            <p>Pull the Git repository, rebuild the Docker Compose stack and remove unused Docker images.</p>
            <div className="system-update-command-preview">
              <code>git pull --ff-only</code>
              <code>docker compose up --build -d</code>
              <code>docker image prune -f</code>
            </div>
            <div className="system-update-action-footer">
              <button type="button" className="btn-primary" onClick={() => start('portal')} disabled={!update?.helperInstalled || running || !!starting}>
                {starting === 'portal' ? 'Starting…' : 'Update portal'}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Host timezone" className="system-update-timezone-card">
          <div className="system-update-timezone-layout">
            <div className="system-update-timezone-copy">
              <p>Set the timezone of the Debian LXC host with <code>timedatectl</code>.</p>
              <small>Current host timezone: <strong>{update?.hostTimezone || 'Unknown'}</strong></small>
            </div>
            <div className="host-timezone-control">
              <label htmlFor="host-timezone">Timezone</label>
              <input
                id="host-timezone"
                className="search-clean"
                list="host-timezone-options"
                value={hostTimezone}
                onChange={(event) => { setHostTimezone(event.target.value); timezoneTouched.current = true; }}
                placeholder="Europe/Berlin"
                autoComplete="off"
              />
              <datalist id="host-timezone-options">
                {timezoneOptions.map((timezone) => <option key={timezone} value={timezone} />)}
              </datalist>
            </div>
            <button
              type="button"
              className="btn-primary system-update-timezone-button"
              onClick={saveTimezone}
              disabled={!update?.helperInstalled || Number(update?.helperVersion || 1) < 2 || running || !!starting}
            >
              {starting === 'timezone' ? 'Applying…' : 'Apply timezone'}
            </button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Update progress" className="system-update-progress-card">
        <div className="system-update-progress-head">
          <div>
            <span className={`status-badge ${update?.status === 'completed' ? 'success' : update?.status === 'failed' ? 'danger' : running ? 'warning' : 'neutral'}`}>
              {update?.status || 'idle'}
            </span>
            <strong>{finalizing ? 'Finalizing update…' : (update?.currentStep || 'No update is running')}</strong>
          </div>
          <span>{Math.max(0, Math.min(100, Number(update?.progress || 0)))}%</span>
        </div>
        <div className="system-update-progress-track" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, Number(update?.progress || 0)))}%` }} />
        </div>

        {steps.length ? (
          <div className="system-update-steps">
            {steps.map((step, index) => (
              <div key={step.key || index} className={`system-update-step ${step.status || 'pending'}`}>
                <span className="system-update-step-dot" />
                <div>
                  <strong>{step.label}</strong>
                  {step.message ? <small>{step.message}</small> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="system-update-meta">
          <span>Started: <strong>{formatDate(update?.startedAt)}</strong></span>
          <span>Finished: <strong>{formatDate(update?.finishedAt)}</strong></span>
        </div>
        {update?.error ? <InlineNotice tone="danger">{update.error}</InlineNotice> : null}
      </SectionCard>

      <SectionCard title="Live output" className="system-update-log-card">
        <pre ref={logRef} onScroll={handleLogScroll}>{update?.log || 'No update output yet.'}</pre>
      </SectionCard>
    </div>
  );
}
