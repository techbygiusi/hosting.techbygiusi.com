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


function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2));
  fs.renameSync(temporaryPath, filePath);
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
  if (Number(current.helperVersion || 1) < 3) {
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
