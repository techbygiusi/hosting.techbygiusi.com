const crypto = require('crypto');
const axios = require('axios');
const { get, run } = require('../config/database');
const { encrypt, decrypt } = require('./cryptoService');

const SETTING_KEY = 'hermes_agent_config_v1';

const DEFAULT_PERMISSIONS = {
  overviewRead: true,
  servicesRead: true,
  clustersRead: true,
  wikiRead: true,
  wikiWrite: false,
  logsRead: false,
  credentialsRead: false,
  sshAccess: false
};

const DEFAULT_COMMAND = `You are the administrative assistant for this Hosting Portal.

Use the Hosting Portal connection whenever the administrator asks about portal services, clusters, documentation, audit information, credentials, or service access. Start with read-only inspection and only use capabilities that the portal explicitly grants to you. Never bypass a disabled permission. Never reveal bearer tokens, API keys, passwords, or other secrets in normal chat output unless the administrator explicitly asks for that exact secret. When you change wiki content, keep the existing tone and language structure. When you run an SSH command, explain what you are going to do and return the relevant result without unnecessary raw output. Keep answers concise and focused on this portal.`;

function normalizeApiUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error('Hermes API URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Hermes API URL must start with http:// or https://');
  return raw.endsWith('/v1') ? raw : `${raw}/v1`;
}

function normalizePermissions(value = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map((key) => [key, value[key] === undefined ? DEFAULT_PERMISSIONS[key] : !!value[key]]));
}

function defaultConfig() {
  return {
    enabled: false,
    name: 'Hermes Agent',
    apiUrl: 'http://127.0.0.1:8642/v1',
    apiKeyEncrypted: '',
    model: 'hermes-agent',
    command: DEFAULT_COMMAND,
    portalTokenEncrypted: encrypt(crypto.randomBytes(32).toString('hex')),
    permissions: { ...DEFAULT_PERMISSIONS }
  };
}

async function loadRawConfig() {
  const row = await get('SELECT value FROM settings WHERE key = ?', [SETTING_KEY]);
  if (!row?.value) {
    const initial = defaultConfig();
    await run(
      `INSERT INTO settings (key, value, created_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [SETTING_KEY, JSON.stringify(initial)]
    );
    return initial;
  }
  try {
    const parsed = JSON.parse(row.value);
    return {
      ...defaultConfig(),
      ...parsed,
      permissions: normalizePermissions(parsed.permissions || {})
    };
  } catch (_) {
    return defaultConfig();
  }
}

async function getHermesConfig() {
  const raw = await loadRawConfig();
  return {
    enabled: !!raw.enabled,
    name: String(raw.name || 'Hermes Agent').slice(0, 80),
    apiUrl: String(raw.apiUrl || ''),
    apiKey: decrypt(raw.apiKeyEncrypted || ''),
    apiKeyConfigured: !!decrypt(raw.apiKeyEncrypted || ''),
    model: String(raw.model || 'hermes-agent').slice(0, 120),
    command: String(raw.command || DEFAULT_COMMAND),
    portalToken: decrypt(raw.portalTokenEncrypted || ''),
    permissions: normalizePermissions(raw.permissions || {})
  };
}

async function saveHermesConfig(input = {}) {
  const current = await loadRawConfig();
  const apiUrl = normalizeApiUrl(input.apiUrl ?? current.apiUrl ?? '');
  const name = String(input.name ?? current.name ?? 'Hermes Agent').trim().slice(0, 80) || 'Hermes Agent';
  const model = String(input.model ?? current.model ?? 'hermes-agent').trim().slice(0, 120) || 'hermes-agent';
  const command = String(input.command ?? current.command ?? DEFAULT_COMMAND).trim().slice(0, 12000) || DEFAULT_COMMAND;
  const incomingKey = String(input.apiKey || '').trim();
  const apiKeyEncrypted = incomingKey && incomingKey !== '***hidden***' ? encrypt(incomingKey) : String(current.apiKeyEncrypted || '');
  let portalTokenEncrypted = String(current.portalTokenEncrypted || '');
  if (!decrypt(portalTokenEncrypted)) portalTokenEncrypted = encrypt(crypto.randomBytes(32).toString('hex'));

  const stored = {
    enabled: input.enabled === undefined ? !!current.enabled : !!input.enabled,
    name,
    apiUrl,
    apiKeyEncrypted,
    model,
    command,
    portalTokenEncrypted,
    permissions: normalizePermissions(input.permissions || current.permissions || {})
  };

  await run(
    `INSERT INTO settings (key, value, created_at, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [SETTING_KEY, JSON.stringify(stored)]
  );
  return getHermesConfig();
}

async function regeneratePortalToken() {
  const current = await loadRawConfig();
  current.portalTokenEncrypted = encrypt(crypto.randomBytes(32).toString('hex'));
  await run(
    `INSERT INTO settings (key, value, created_at, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [SETTING_KEY, JSON.stringify(current)]
  );
  return decrypt(current.portalTokenEncrypted);
}

function buildConnectionCommand(config, portalOrigin) {
  const apiBase = `${String(portalOrigin || '').replace(/\/+$/, '')}/api/hermes`;
  return `Connect this Hermes Agent to my Hosting Portal and save this connection permanently for future sessions.\n\nConnection name: Hosting Portal\nPortal URL: ${String(portalOrigin || '').replace(/\/+$/, '')}\nPortal Agent API: ${apiBase}\nAuthentication header: Authorization: Bearer ${config.portalToken}\n\nSave these connection details in your persistent memory or as a reusable skill named "hosting-portal". Keep the bearer token private and never print it in normal chat responses. At the beginning of a portal task, request GET ${apiBase}/capabilities and follow only the permissions and endpoints returned there. Do not try to bypass disabled capabilities. Reuse this saved connection in future sessions until I explicitly ask you to remove or replace it.\n\nAfter saving it, test the connection with GET ${apiBase}/capabilities and confirm that the Hosting Portal connection is ready.`;
}

function buildChatSystemPrompt(config, portalOrigin) {
  const apiBase = `${String(portalOrigin || '').replace(/\/+$/, '')}/api/hermes`;
  return `${config.command}\n\nHosting Portal connection for this session:\n- Portal API: ${apiBase}\n- Authentication: Authorization: Bearer ${config.portalToken}\n- Start by calling GET ${apiBase}/capabilities when portal data or an action is needed.\n- Respect the returned capability allowlist.\n- Keep the bearer token secret.`;
}

function hermesHeaders(config) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
}

async function testHermesConnection(input = null) {
  const config = input ? { ...(await getHermesConfig()), ...input } : await getHermesConfig();
  const apiUrl = normalizeApiUrl(config.apiUrl);
  const apiKey = String(config.apiKey || '').trim();
  if (!apiUrl) throw new Error('Hermes API URL is required');
  if (!apiKey) throw new Error('Hermes API key is required');
  const response = await axios.get(`${apiUrl}/models`, {
    headers: hermesHeaders({ apiKey }),
    timeout: 10000,
    maxRedirects: 2
  });
  return { ok: true, models: Array.isArray(response.data?.data) ? response.data.data.map((item) => item?.id).filter(Boolean) : [] };
}

async function sendHermesChat({ messages, portalOrigin }) {
  const config = await getHermesConfig();
  if (!config.enabled) throw new Error('Hermes Agent is disabled');
  if (!config.apiUrl || !config.apiKey) throw new Error('Hermes Agent is not configured');
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter((item) => item && ['user', 'assistant'].includes(item.role))
    .slice(-20)
    .map((item) => ({ role: item.role, content: String(item.content || '').slice(0, 12000) }));
  if (!safeMessages.some((item) => item.role === 'user' && item.content.trim())) throw new Error('Message is required');

  const response = await axios.post(`${normalizeApiUrl(config.apiUrl)}/chat/completions`, {
    model: config.model || 'hermes-agent',
    stream: false,
    messages: [
      { role: 'system', content: buildChatSystemPrompt(config, portalOrigin) },
      ...safeMessages
    ]
  }, {
    headers: hermesHeaders(config),
    timeout: 120000,
    maxRedirects: 2,
    maxContentLength: 2 * 1024 * 1024
  });

  const message = response.data?.choices?.[0]?.message?.content;
  if (!message) throw new Error('Hermes Agent returned no message');
  return { message: String(message), model: response.data?.model || config.model || 'hermes-agent' };
}

module.exports = {
  DEFAULT_COMMAND,
  DEFAULT_PERMISSIONS,
  normalizeApiUrl,
  normalizePermissions,
  getHermesConfig,
  saveHermesConfig,
  regeneratePortalToken,
  buildConnectionCommand,
  testHermesConnection,
  sendHermesChat
};
