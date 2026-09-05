const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '..', 'data'));
const requestPath = path.join(dataDir, 'system-update-request.json');
const statusPath = path.join(dataDir, 'system-update-status.json');
const logPath = path.join(dataDir, 'system-update.log');
const readyPath = path.join(dataDir, 'system-updater-ready');
const versionPath = path.join(dataDir, 'system-updater-version');
const timezonePath = path.join(dataDir, 'system-timezone.txt');


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

function getSystemUpdateStatus() {
  const status = safeJsonRead(statusPath, null) || {
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

  let log = '';
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
    log = lines.slice(-250).join('\n');
  } catch (_) {
    log = '';
  }

  const helperVersion = Number.parseInt(safeTextRead(versionPath, '1'), 10) || 1;
  const hostTimezone = safeTextRead(timezonePath, '');

  return {
    ...status,
    helperInstalled: fs.existsSync(readyPath),
    helperVersion,
    hostTimezone,
    log
  };
}

function startSystemUpdate(type, requestedBy = '', options = {}) {
  if (!['os', 'portal', 'timezone'].includes(type)) {
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
  if (type === 'timezone' && Number(current.helperVersion || 1) < 2) {
    const error = new Error('Host updater helper is outdated');
    error.code = 'HELPER_OUTDATED';
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
  startSystemUpdate
};
