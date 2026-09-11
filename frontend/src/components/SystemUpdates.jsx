import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';


async function hardReloadPortal(completionKey = '') {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (_) {
  }

  try {
    if ('caches' in window) {
      const names = await window.caches.keys();
      await Promise.all(names.map((name) => window.caches.delete(name)));
    }
  } catch (_) {
  }

  try {
    if (completionKey) sessionStorage.setItem('hosting-portal-last-reloaded-update', completionKey);
  } catch (_) {
  }

  const url = new URL(window.location.href);
  url.searchParams.set('__portalRefresh', String(Date.now()));
  window.location.replace(url.toString());
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return value;
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / (1024 ** index);
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export default function SystemUpdates() {
  const [update, setUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [packageFile, setPackageFile] = useState(null);
  const [uploadingPackage, setUploadingPackage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [waitingForBackend, setWaitingForBackend] = useState(false);
  const [hostTimezone, setHostTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'; } catch (_) { return 'Europe/Berlin'; }
  });
  const timezoneTouched = useRef(false);
  const reloadScheduled = useRef(false);
  const portalUpdateObservedRunning = useRef(false);
  const logRef = useRef(null);
  const packageInputRef = useRef(null);
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
      if (next?.type === 'portal' && ['queued', 'running'].includes(next?.status)) {
        portalUpdateObservedRunning.current = true;
      }
      if (next?.status === 'completed' && next?.type === 'portal' && portalUpdateObservedRunning.current && !reloadScheduled.current) {
        const completionKey = String(next?.id || next?.finishedAt || next?.startedAt || 'portal-update');
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem('hosting-portal-last-reloaded-update') === completionKey;
        } catch (_) {
        }
        if (!alreadyReloaded) {
          reloadScheduled.current = true;
          portalUpdateObservedRunning.current = false;
          setNotice('Portal update completed. Reloading the portal…');
          window.setTimeout(() => { hardReloadPortal(completionKey); }, 2500);
        }
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
    const label = type === 'portal' ? 'portal application' : 'host operating system';
    if (!window.confirm(`Start the ${label} update now?`)) return;
    setStarting(type);
    setError('');
    setNotice('');
    reloadScheduled.current = false;
    if (type === 'portal') portalUpdateObservedRunning.current = true;
    try {
      const response = await adminApi.startSystemUpdate(type);
      setUpdate(response.data?.update || null);
      setNotice(type === 'portal' ? 'Portal update started.' : 'Host update started.');
    } catch (err) {
      setError(getErrorMessage(err, 'The update could not be started.'));
    } finally {
      setStarting('');
    }
  };

  const uploadPackage = async () => {
    if (!packageFile) {
      setError('Choose a ZIP package first.');
      return;
    }
    if (!String(packageFile.name || '').toLowerCase().endsWith('.zip')) {
      setError('The portal package must be a ZIP file.');
      return;
    }
    if (Number(packageFile.size || 0) > 100 * 1024 * 1024) {
      setError('The portal package must be smaller than 100 MB.');
      return;
    }

    setUploadingPackage(true);
    setUploadProgress(0);
    setError('');
    setNotice('');
    try {
      const response = await adminApi.uploadSystemUpdatePackage(packageFile, (event) => {
        if (!event?.total) return;
        setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });
      setUpdate(response.data?.update || update);
      const uploaded = response.data?.package;
      setNotice(`${uploaded?.version || uploaded?.originalFilename || 'Portal package'} uploaded and ready for the next portal update.`);
      setPackageFile(null);
      if (packageInputRef.current) packageInputRef.current.value = '';
      setUploadProgress(100);
    } catch (err) {
      setError(getErrorMessage(err, 'The portal package could not be uploaded.'));
    } finally {
      setUploadingPackage(false);
    }
  };

  const rollbackPackage = async (packageInfo) => {
    if (!packageInfo?.id) return;
    const version = packageInfo.version || packageInfo.originalFilename || 'this version';
    if (!window.confirm(`Roll back the portal to ${version}? The portal will restart after the package is restored.`)) return;
    setStarting(`rollback:${packageInfo.id}`);
    setError('');
    setNotice('');
    reloadScheduled.current = false;
    portalUpdateObservedRunning.current = true;
    try {
      const response = await adminApi.rollbackSystemUpdatePackage(packageInfo.id);
      setUpdate(response.data?.update || update);
      setNotice(`Rollback to ${version} started.`);
    } catch (err) {
      setError(getErrorMessage(err, 'The rollback could not be started.'));
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
          The host updater is not installed yet. Run <code>./setup-updater.sh</code> as root once in <code>/opt/hosting.techbygiusi.com</code>.
        </InlineNotice>
      ) : Number(update?.helperVersion || 1) < 3 ? (
        <InlineNotice tone="warning">
          Refresh the host updater once with <code>./setup-updater.sh</code> as root to install the current update support.
        </InlineNotice>
      ) : Number(update?.helperVersion || 1) < 4 ? (
        <InlineNotice tone="warning">
          Run <code>./setup-updater.sh</code> as root once more after installing this version. This enables local ZIP package updates and removes the GitHub dependency from future portal updates.
        </InlineNotice>
      ) : null}

      <SectionCard title="Upload new package" className="system-update-package-card">
        <div className="system-update-package-layout">
          <div className="system-update-package-copy">
            <p>Upload a complete Hosting Portal ZIP package. The package is stored locally on the server and the newest upload becomes the version installed by the next Portal update.</p>
            <div className="system-update-package-state">
              <span>Installed: <strong>{update?.currentPackage?.version || update?.currentPackage?.originalFilename || 'Not recorded yet'}</strong></span>
              <span>Ready to install: <strong>{update?.pendingPackage?.version || update?.pendingPackage?.originalFilename || 'No package uploaded'}</strong></span>
              {update?.pendingPackage?.commit ? <span>Commit: <strong>{update.pendingPackage.commit}</strong></span> : null}
              {update?.pendingPackage?.sizeBytes ? <span>{formatBytes(update.pendingPackage.sizeBytes)} · SHA-256 {String(update.pendingPackage.sha256 || '').slice(0, 12)}…</span> : null}
            </div>
          </div>
          <div className="system-update-package-control">
            <label htmlFor="portal-package-file">Portal package</label>
            <input
              ref={packageInputRef}
              id="portal-package-file"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(event) => { setPackageFile(event.target.files?.[0] || null); setUploadProgress(0); }}
              disabled={running || uploadingPackage}
            />
            <div className="system-update-package-file-meta">
              <span>{packageFile ? `${packageFile.name} · ${formatBytes(packageFile.size)}` : 'Choose the full ZIP returned for a portal release.'}</span>
              {uploadingPackage ? <span>{uploadProgress}%</span> : null}
            </div>
            {uploadingPackage ? <div className="system-update-upload-track"><span style={{ width: `${uploadProgress}%` }} /></div> : null}
            <button type="button" className="btn-primary" onClick={uploadPackage} disabled={!packageFile || running || uploadingPackage}>
              {uploadingPackage ? 'Uploading…' : 'Upload package'}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Version history" className="system-update-history-card">
        <div className="system-update-history-head">
          <p>The five most recently installed portal packages are kept on disk. Older packages are removed automatically.</p>
          <span>{Math.min(5, update?.packageHistory?.length || 0)} / 5 stored</span>
        </div>
        {update?.packageHistory?.length ? (
          <div className="system-update-history-list">
            {update.packageHistory.map((item) => {
              const current = String(update?.currentPackage?.id || '') === String(item?.id || '');
              return (
                <div className={`system-update-history-row ${current ? 'current' : ''}`} key={item.id}>
                  <div className="system-update-history-version">
                    <strong>{item.version || item.originalFilename || 'Portal version'}</strong>
                    <span className={`status-badge ${current ? 'success' : 'neutral'}`}>{current ? 'Current' : 'Rollback available'}</span>
                  </div>
                  <div className="system-update-history-commit"><span>Commit</span><strong>{item.commit || 'Legacy package'}</strong></div>
                  <div className="system-update-history-meta">
                    <span>{formatDate(item.lastInstalledAt || item.installedAt)}</span>
                    <span>{formatBytes(item.sizeBytes)}</span>
                  </div>
                  <div className="system-update-history-action">
                    {!current ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => rollbackPackage(item)}
                        disabled={running || !!starting || !item.available}
                      >
                        {starting === `rollback:${item.id}` ? 'Starting…' : 'Rollback'}
                      </button>
                    ) : null}
                    {!item.available ? <small>Package missing</small> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="page-state-clean">Version history starts after the first package-based portal update.</div>
        )}
      </SectionCard>

      <div className="system-update-actions-grid">
        <SectionCard title="Host updates" className="system-update-action-card">
          <div className="system-update-action-content">
            <p>Refresh the host package lists and install available Debian package upgrades. No automatic reboot is performed.</p>
            <div className="system-update-command-preview">
              <code>apt-get update</code>
              <code>apt-get -y upgrade</code>
            </div>
            <div className="system-update-action-footer">
              <button type="button" className="btn-primary" onClick={() => start('os')} disabled={!update?.helperInstalled || Number(update?.helperVersion || 1) < 3 || running || !!starting}>
                {starting === 'os' ? 'Starting…' : 'Update host'}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Portal update" className="system-update-action-card">
          <div className="system-update-action-content">
            <p>Install the newest uploaded ZIP package, rebuild the Docker Compose stack and remove unused Docker images.</p>
            <div className="system-update-command-preview">
              <code>validate uploaded ZIP package</code>
              <code>install package into /opt/hosting.techbygiusi.com</code>
              <code>docker compose up --build -d</code>
              <code>docker image prune -f</code>
            </div>
            <div className="system-update-action-footer">
              <button type="button" className="btn-primary" onClick={() => start('portal')} disabled={!update?.helperInstalled || Number(update?.helperVersion || 1) < 4 || !update?.pendingPackage || running || !!starting}>
                {starting === 'portal' ? 'Starting…' : 'Update portal'}
              </button>
              {!update?.pendingPackage ? <small className="system-update-action-hint">Upload a package first.</small> : null}
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
              disabled={!update?.helperInstalled || Number(update?.helperVersion || 1) < 3 || running || !!starting}
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
