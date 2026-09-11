const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const dataDir = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '..', 'data'));
const requestPath = path.join(dataDir, 'system-update-request.json');
const statusPath = path.join(dataDir, 'system-update-status.json');
const logPath = path.join(dataDir, 'system-update.log');
const readyPath = path.join(dataDir, 'system-updater-ready');
const versionPath = path.join(dataDir, 'system-updater-version');
const timezonePath = path.join(dataDir, 'system-timezone.txt');
const packagesDir = path.join(dataDir, 'update-packages');
const packageStatePath = path.join(dataDir, 'portal-package-state.json');
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_INSTALLED_PACKAGES = 5;
const RELEASE_MANIFEST = 'portal-release.json';


function safeTextRead(filePath, fallback = '') {
  try {
    return String(fs.readFileSync(filePath, 'utf8') || '').trim();
  } catch (_) {
    return fallback;
  }
}

function normalizeTimezone(value) {
  const timezone = String(value || '').trim();
  if (!timezone || timezone.length > 120 || /[\r\n\0]/.test(timezone)) {
    const error = new Error('Invalid timezone');
    error.code = 'INVALID_TIMEZONE';
    throw error;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch (_) {
    const error = new Error('Invalid timezone');
    error.code = 'INVALID_TIMEZONE';
    throw error;
  }
  return timezone;
}

function safeJsonRead(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}


function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function sanitizeReleaseMetadata(value = {}) {
  const version = String(value.version || '').trim().slice(0, 80);
  const commit = String(value.commit || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 240);
  return { version, commit };
}

function readReleaseMetadata(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { version: '', commit: '' };
    const listing = execFileSync('unzip', ['-Z1', filePath], {
      encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024
    });
    const entries = String(listing || '').split(/\r?\n/).filter(Boolean);
    const manifestEntry = entries.find((entry) => entry === RELEASE_MANIFEST)
      || entries.find((entry) => entry.endsWith(`/${RELEASE_MANIFEST}`));
    if (!manifestEntry) return { version: '', commit: '' };
    const raw = execFileSync('unzip', ['-p', filePath, manifestEntry], {
      encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024
    });
    return sanitizeReleaseMetadata(JSON.parse(raw));
  } catch (_) {
    return { version: '', commit: '' };
  }
}

function enrichPackageEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const storedFilename = path.basename(String(entry.storedFilename || ''));
  const filePath = storedFilename ? path.join(packagesDir, storedFilename) : '';
  const metadata = (!entry.commit || !entry.version) ? readReleaseMetadata(filePath) : { version: '', commit: '' };
  return {
    ...entry,
    version: String(metadata.version || entry.version || derivePackageVersion(entry.originalFilename) || '').trim(),
    commit: String(metadata.commit || entry.commit || '').trim(),
    available: !!(filePath && fs.existsSync(filePath))
  };
}

function packageInstallTime(entry) {
  const value = entry?.lastInstalledAt || entry?.installedAt || entry?.uploadedAt || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanPackageState(storedState, { persist = false } = {}) {
  const current = enrichPackageEntry(storedState?.current && typeof storedState.current === 'object' ? storedState.current : null);
  const pending = enrichPackageEntry(storedState?.pending && typeof storedState.pending === 'object' ? storedState.pending : null);
  const sourcePackages = Array.isArray(storedState?.packages) ? storedState.packages : [];
  const byId = new Map();
  for (const item of sourcePackages) {
    const enriched = enrichPackageEntry(item);
    if (enriched?.id) byId.set(String(enriched.id), enriched);
  }
  if (current?.id) byId.set(String(current.id), { ...(byId.get(String(current.id)) || {}), ...current, status: 'installed' });
  if (pending?.id) byId.set(String(pending.id), { ...(byId.get(String(pending.id)) || {}), ...pending, status: 'pending' });

  const installed = [...byId.values()]
    .filter((item) => item?.status === 'installed' || (current?.id && String(item?.id) === String(current.id)))
    .sort((a, b) => packageInstallTime(b) - packageInstallTime(a));
  const keepInstalled = installed.slice(0, MAX_INSTALLED_PACKAGES);
  const keepIds = new Set(keepInstalled.map((item) => String(item.id)));
  if (pending?.id) keepIds.add(String(pending.id));

  const removed = [...byId.values()].filter((item) => item?.id && !keepIds.has(String(item.id)));
  for (const item of removed) {
    const name = path.basename(String(item.storedFilename || ''));
    if (!name) continue;
    try { fs.unlinkSync(path.join(packagesDir, name)); } catch (err) { if (err.code !== 'ENOENT') console.warn('Could not remove old portal package:', err.message); }
  }

  const kept = [...byId.values()]
    .filter((item) => item?.id && keepIds.has(String(item.id)))
    .sort((a, b) => Date.parse(a.uploadedAt || 0) - Date.parse(b.uploadedAt || 0));
  const nextCurrent = current?.id ? kept.find((item) => String(item.id) === String(current.id)) || current : null;
  const nextPending = pending?.id ? kept.find((item) => String(item.id) === String(pending.id)) || pending : null;
  const result = { current: nextCurrent, pending: nextPending, packages: kept };

  if (persist) {
    const persisted = {
      current: nextCurrent ? { ...nextCurrent, available: undefined } : null,
      pending: nextPending ? { ...nextPending, available: undefined } : null,
      packages: kept.map((item) => ({ ...item, available: undefined }))
    };
    writeJsonAtomic(packageStatePath, persisted);
  }
  return result;
}

function packageState() {
  const stored = safeJsonRead(packageStatePath, null) || {};
  const cleaned = cleanPackageState(stored, { persist: false });
  const persistedCleaned = {
    current: cleaned.current ? { ...cleaned.current, available: undefined } : null,
    pending: cleaned.pending ? { ...cleaned.pending, available: undefined } : null,
    packages: cleaned.packages.map((item) => ({ ...item, available: undefined }))
  };
  const normalizedStored = {
    current: stored.current && typeof stored.current === 'object' ? stored.current : null,
    pending: stored.pending && typeof stored.pending === 'object' ? stored.pending : null,
    packages: Array.isArray(stored.packages) ? stored.packages : []
  };
  if (JSON.stringify(normalizedStored) !== JSON.stringify(persistedCleaned)) {
    writeJsonAtomic(packageStatePath, persistedCleaned);
  }
  return cleaned;
}

function normalizePackageFilename(value) {
  const decoded = (() => {
    try { return decodeURIComponent(String(value || '')); } catch (_) { return String(value || ''); }
  })();
  const base = path.basename(decoded || 'hosting-portal-package.zip');
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (safe || 'hosting-portal-package.zip').slice(0, 180);
}

function derivePackageVersion(filename) {
  const match = String(filename || '').match(/(?:^|[-_])v(\d+(?:\.\d+)*)/i);
  return match ? `v${match[1]}` : '';
}

function assertPortalPackage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error('Portal package is empty');
    error.code = 'INVALID_PACKAGE';
    throw error;
  }
  if (buffer.length > MAX_PACKAGE_BYTES) {
    const error = new Error('Portal package is too large');
    error.code = 'PACKAGE_TOO_LARGE';
    throw error;
  }
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const error = new Error('Portal package must be a ZIP archive');
    error.code = 'INVALID_PACKAGE';
    throw error;
  }

  // ZIP central-directory filenames are stored as plain bytes even when the
  // file payloads are compressed. These markers reject unrelated ZIP files
  // before they are queued for the privileged host updater.
  const indexText = buffer.toString('latin1');
  const required = ['docker-compose.yml', 'backend/package.json', 'frontend/package.json'];
  if (!required.every((marker) => indexText.includes(marker))) {
    const error = new Error('The ZIP does not look like a Hosting Portal package');
    error.code = 'INVALID_PACKAGE';
    throw error;
  }
}

function savePortalUpdatePackage(buffer, originalName = '', uploadedBy = '') {
  assertPortalPackage(buffer);
  fs.mkdirSync(packagesDir, { recursive: true });

  const originalFilename = normalizePackageFilename(originalName);
  const filenameVersion = derivePackageVersion(originalFilename);
  const storedFilename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${originalFilename}`;
  const finalPath = path.join(packagesDir, storedFilename);
  const temporaryPath = `${finalPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, buffer, { mode: 0o600 });
  fs.renameSync(temporaryPath, finalPath);
  const releaseMetadata = readReleaseMetadata(finalPath);

  const entry = {
    id: crypto.randomUUID(),
    version: releaseMetadata.version || filenameVersion,
    commit: releaseMetadata.commit || '',
    originalFilename,
    storedFilename,
    sizeBytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    uploadedAt: new Date().toISOString(),
    uploadedBy: String(uploadedBy || ''),
    status: 'pending'
  };

  const state = packageState();
  const packages = state.packages.map((item) => item?.status === 'pending' ? { ...item, status: 'stored' } : item);
  packages.push(entry);
  writeJsonAtomic(packageStatePath, {
    current: state.current,
    pending: entry,
    packages
  });
  cleanPackageState(safeJsonRead(packageStatePath, {}) || {}, { persist: true });
  return entry;
}


function reconcileFailedStatus(status) {
  if (!status || !['queued', 'running'].includes(status.status)) return status;
  const steps = Array.isArray(status.steps) ? status.steps : [];
  const failedStep = steps.find((step) => step?.status === 'failed');
  if (!failedStep) return status;

  const message = String(failedStep.message || `${failedStep.label || 'Update step'} failed`).trim();
  const recovered = {
    ...status,
    status: 'failed',
    currentStep: 'Update failed',
    finishedAt: status.finishedAt || new Date().toISOString(),
    error: status.error || message
  };

  try {
    writeJsonAtomic(statusPath, recovered);
    const existingLog = safeTextRead(logPath, '');
    if (!existingLog.includes('Failed update status recovered by portal status check.')) {
      fs.appendFileSync(logPath, '\nFailed update status recovered by portal status check.\n');
    }
  } catch (_) {
    return status;
  }
  return recovered;
}

function reconcileCompletedStatus(status) {
  if (!status || status.status !== 'running') return status;
  const steps = Array.isArray(status.steps) ? status.steps : [];
  const allStepsDone = steps.length > 0 && steps.every((step) => step?.status === 'done');
  const progressComplete = Number(status.progress || 0) >= 100;
  if (!allStepsDone || !progressComplete) return status;

  let ageMs = 0;
  try {
    ageMs = Date.now() - fs.statSync(statusPath).mtimeMs;
  } catch (_) {
    return status;
  }
  if (ageMs < 2000) return status;

  const recovered = {
    ...status,
    status: 'completed',
    progress: 100,
    currentStep: 'Update completed',
    finishedAt: status.finishedAt || new Date().toISOString(),
    error: ''
  };

  try {
    writeJsonAtomic(statusPath, recovered);
    const existingLog = safeTextRead(logPath, '');
    if (!existingLog.includes('Update completion recovered by portal status check.')) {
      fs.appendFileSync(logPath, '\nUpdate completion recovered by portal status check.\n');
    }
  } catch (_) {
    return status;
  }
  return recovered;
}


function normalizeUpdateLog(value) {
  // Treat updater output like a terminal stream instead of plain text. Several
  // CLI tools redraw the current line with carriage returns and backspaces;
  // rendering those bytes literally creates duplicated fragments and empty
  // lines in the browser.
  const text = String(value || '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u0000/g, '');

  const lines = [];
  let current = '';

  const commit = () => {
    const line = current.replace(/[ \t]+$/g, '');
    current = '';

    // Keep at most one visual spacer line and suppress identical adjacent
    // output lines. This preserves section separation without log noise.
    if (!line) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      return;
    }
    if (lines[lines.length - 1] === line) return;
    lines.push(line);
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '\r') {
      if (text[index + 1] === '\n') {
        commit();
        index += 1;
      } else {
        // A lone CR means "redraw this terminal line". Only keep the newest
        // frame instead of appending every percentage/spinner update.
        current = '';
      }
      continue;
    }

    if (char === '\n') {
      commit();
      continue;
    }

    if (char === '\b') {
      current = current.slice(0, -1);
      continue;
    }

    // Keep normal text and tabs; discard other terminal control characters.
    const code = char.charCodeAt(0);
    if (char === '\t' || code >= 32) current += char;
  }

  if (current) commit();
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function getSystemUpdateStatus() {
  let status = safeJsonRead(statusPath, null) || {
    id: null,
    type: null,
    status: 'idle',
    progress: 0,
    currentStep: '',
    steps: [],
    startedAt: null,
    finishedAt: null,
    error: ''
  };
  status = reconcileFailedStatus(status);
  status = reconcileCompletedStatus(status);

  let log = '';
  try {
    const cleaned = normalizeUpdateLog(fs.readFileSync(logPath, 'utf8'));
    const lines = cleaned.split('\n');
    log = lines.slice(-350).join('\n');
  } catch (_) {
    log = '';
  }

  const helperVersion = Number.parseInt(safeTextRead(versionPath, '1'), 10) || 1;
  const hostTimezone = safeTextRead(timezonePath, '');
  const packages = packageState();

  return {
    ...status,
    helperInstalled: fs.existsSync(readyPath),
    helperVersion,
    hostTimezone,
    pendingPackage: packages.pending,
    currentPackage: packages.current,
    packageHistory: packages.packages
      .filter((item) => item?.status === 'installed')
      .sort((a, b) => packageInstallTime(b) - packageInstallTime(a))
      .slice(0, MAX_INSTALLED_PACKAGES),
    log
  };
}

function queuePortalPackage(packageInfo, requestedBy = '', { rollback = false } = {}) {
  if (!fs.existsSync(readyPath)) {
    const error = new Error('Host updater helper is not installed');
    error.code = 'HELPER_MISSING';
    throw error;
  }
  const current = getSystemUpdateStatus();
  if (Number(current.helperVersion || 1) < 4) {
    const error = new Error('Host updater helper is outdated');
    error.code = 'HELPER_OUTDATED';
    error.requiredVersion = 4;
    throw error;
  }
  if (['queued', 'running'].includes(current.status)) {
    const error = new Error('Another update is already running');
    error.code = 'ALREADY_RUNNING';
    throw error;
  }
  if (!packageInfo?.storedFilename || !packageInfo?.available) {
    const error = new Error('The selected portal package is no longer available');
    error.code = 'PACKAGE_UNAVAILABLE';
    throw error;
  }

  const request = {
    id: crypto.randomUUID(),
    type: 'portal',
    requestedBy: String(requestedBy || ''),
    requestedAt: new Date().toISOString(),
    rollback: !!rollback,
    packageId: packageInfo.id,
    packageFilename: packageInfo.storedFilename,
    packageOriginalFilename: packageInfo.originalFilename,
    packageVersion: packageInfo.version || '',
    packageCommit: packageInfo.commit || '',
    packageSha256: packageInfo.sha256 || ''
  };
  const initialStatus = {
    id: request.id,
    type: 'portal',
    rollback: !!rollback,
    status: 'queued',
    progress: 0,
    currentStep: 'Waiting for host updater',
    steps: [],
    startedAt: null,
    finishedAt: null,
    error: '',
    package: packageInfo
  };
  fs.writeFileSync(statusPath, JSON.stringify(initialStatus, null, 2));
  fs.writeFileSync(logPath, '');
  const temporaryPath = `${requestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(request, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, requestPath);
  return initialStatus;
}

function startPortalRollback(packageId, requestedBy = '') {
  const state = packageState();
  const selected = state.packages.find((item) => String(item?.id || '') === String(packageId || '') && item?.status === 'installed');
  if (!selected) {
    const error = new Error('Rollback package was not found');
    error.code = 'ROLLBACK_PACKAGE_NOT_FOUND';
    throw error;
  }
  if (state.current?.id && String(state.current.id) === String(selected.id)) {
    const error = new Error('The selected version is already installed');
    error.code = 'ROLLBACK_CURRENT_VERSION';
    throw error;
  }
  return queuePortalPackage(selected, requestedBy, { rollback: true });
}

function startSystemUpdate(type, requestedBy = '', options = {}) {
  if (type === 'portal') {
    const state = packageState();
    if (!state.pending?.storedFilename) {
      const error = new Error('No uploaded portal package is ready');
      error.code = 'NO_PORTAL_PACKAGE';
      throw error;
    }
    return queuePortalPackage(state.pending, requestedBy, { rollback: false });
  }

  if (!['os', 'timezone'].includes(type)) {
    const error = new Error('Unsupported update type');
    error.code = 'INVALID_TYPE';
    throw error;
  }

  if (!fs.existsSync(readyPath)) {
    const error = new Error('Host updater helper is not installed');
    error.code = 'HELPER_MISSING';
    throw error;
  }

  const current = getSystemUpdateStatus();
  const minimumHelperVersion = 3;
  if (Number(current.helperVersion || 1) < minimumHelperVersion) {
    const error = new Error('Host updater helper is outdated');
    error.code = 'HELPER_OUTDATED';
    error.requiredVersion = minimumHelperVersion;
    throw error;
  }
  if (['queued', 'running'].includes(current.status)) {
    const error = new Error('Another update is already running');
    error.code = 'ALREADY_RUNNING';
    throw error;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const timezone = type === 'timezone' ? normalizeTimezone(options.timezone) : '';
  const request = {
    id: crypto.randomUUID(),
    type,
    requestedBy: String(requestedBy || ''),
    requestedAt: new Date().toISOString(),
    ...(timezone ? { timezone } : {})
  };

  const initialStatus = {
    id: request.id,
    type,
    status: 'queued',
    progress: 0,
    currentStep: 'Waiting for host updater',
    steps: [],
    startedAt: null,
    finishedAt: null,
    error: '',
    ...(timezone ? { targetTimezone: timezone } : {})
  };

  fs.writeFileSync(statusPath, JSON.stringify(initialStatus, null, 2));
  fs.writeFileSync(logPath, '');
  const temporaryPath = `${requestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(request, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, requestPath);
  return initialStatus;
}

module.exports = {
  getSystemUpdateStatus,
  startSystemUpdate,
  savePortalUpdatePackage,
  MAX_PACKAGE_BYTES,
  startPortalRollback
};
