const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '..', 'data'));
const requestPath = path.join(dataDir, 'system-update-request.json');
const statusPath = path.join(dataDir, 'system-update-status.json');
const logPath = path.join(dataDir, 'system-update.log');
const readyPath = path.join(dataDir, 'system-updater-ready');

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

  return {
    ...status,
    helperInstalled: fs.existsSync(readyPath),
    log
  };
}

function startSystemUpdate(type, requestedBy = '') {
  if (!['os', 'portal'].includes(type)) {
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
  if (['queued', 'running'].includes(current.status)) {
    const error = new Error('Another update is already running');
    error.code = 'ALREADY_RUNNING';
    throw error;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const request = {
    id: crypto.randomUUID(),
    type,
    requestedBy: String(requestedBy || ''),
    requestedAt: new Date().toISOString()
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
    error: ''
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
