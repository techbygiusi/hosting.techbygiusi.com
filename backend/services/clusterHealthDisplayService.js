const { get, run, all } = require('../config/database');
const { decrypt } = require('./cryptoService');
const { getClusterDashboardStats } = require('./proxmoxService');

const SETTING_KEY = 'cluster_health_display_v1';
const ALLOWED_TYPES = new Set(['cluster', 'cpu', 'memory', 'storage', 'nodes', 'uptime', 'clock']);
const GRID_COLUMNS = 8;
const GRID_ROWS = 4;

const DEFAULT_CONFIG = {
  enabled: true,
  title: 'Cluster Health',
  theme: 'dark',
  language: 'en',
  refreshSeconds: 10,
  columns: GRID_COLUMNS,
  rows: GRID_ROWS,
  width: 800,
  height: 480,
  widgets: []
};

function toInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeWidget(widget = {}, index = 0) {
  const type = ALLOWED_TYPES.has(String(widget.type || '')) ? String(widget.type) : 'cluster';
  const w = toInt(widget.w, type === 'nodes' ? 4 : type === 'cluster' ? 4 : 2, 1, GRID_COLUMNS);
  const h = toInt(widget.h, type === 'nodes' ? 2 : 1, 1, GRID_ROWS);
  const x = toInt(widget.x, 0, 0, Math.max(0, GRID_COLUMNS - w));
  const y = toInt(widget.y, 0, 0, Math.max(0, GRID_ROWS - h));
  const clusterId = type === 'clock' ? null : (Number.isInteger(Number(widget.clusterId)) ? Number(widget.clusterId) : null);
  return {
    id: String(widget.id || `widget-${Date.now()}-${index}`).slice(0, 80),
    type,
    clusterId,
    label: String(widget.label || '').trim().slice(0, 80),
    x,
    y,
    w,
    h
  };
}

function normalizeConfig(input = {}) {
  const widgets = Array.isArray(input.widgets) ? input.widgets.slice(0, 32).map(sanitizeWidget) : [];
  return {
    enabled: input.enabled !== false,
    title: String(input.title || DEFAULT_CONFIG.title).trim().slice(0, 80) || DEFAULT_CONFIG.title,
    theme: input.theme === 'light' ? 'light' : 'dark',
    language: input.language === 'de' ? 'de' : 'en',
    refreshSeconds: toInt(input.refreshSeconds, DEFAULT_CONFIG.refreshSeconds, 5, 120),
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    width: 800,
    height: 480,
    widgets
  };
}

async function getClusterHealthDisplayConfig() {
  const row = await get('SELECT value FROM settings WHERE key = ?', [SETTING_KEY]);
  if (!row?.value) return { ...DEFAULT_CONFIG, widgets: [] };
  try {
    return normalizeConfig(JSON.parse(row.value));
  } catch (_) {
    return { ...DEFAULT_CONFIG, widgets: [] };
  }
}

async function saveClusterHealthDisplayConfig(input) {
  const config = normalizeConfig(input);
  const clusterIds = Array.from(new Set(config.widgets.map((widget) => widget.clusterId).filter(Boolean)));
  if (clusterIds.length) {
    const placeholders = clusterIds.map(() => '?').join(',');
    const rows = await all(`SELECT id FROM proxmox_clusters WHERE id IN (${placeholders})`, clusterIds);
    const existing = new Set(rows.map((row) => Number(row.id)));
    for (const clusterId of clusterIds) {
      if (!existing.has(Number(clusterId))) throw new Error(`Cluster ${clusterId} does not exist`);
    }
  }

  await run(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `, [SETTING_KEY, JSON.stringify(config)]);
  return config;
}

let cache = { key: '', expiresAt: 0, data: null };

async function getClusterHealthDisplayData() {
  const config = await getClusterHealthDisplayConfig();
  const clusterIds = Array.from(new Set(config.widgets.map((widget) => widget.clusterId).filter(Boolean))).sort((a, b) => a - b);
  const cacheKey = JSON.stringify(clusterIds);
  if (cache.data && cache.key === cacheKey && cache.expiresAt > Date.now()) {
    return { config, clusters: cache.data };
  }

  if (!clusterIds.length) return { config, clusters: [] };
  const placeholders = clusterIds.map(() => '?').join(',');
  const clusters = await all(`
    SELECT id, name, url, api_token, location_label
    FROM proxmox_clusters
    WHERE id IN (${placeholders})
    ORDER BY name COLLATE NOCASE
  `, clusterIds);

  const settled = await Promise.allSettled(clusters.map(async (cluster) => {
    const stats = await getClusterDashboardStats(String(cluster.url || '').replace(/\/+$/, ''), decrypt(cluster.api_token));
    return {
      id: Number(cluster.id),
      name: cluster.name,
      location: cluster.location_label || '',
      ...stats
    };
  }));

  const data = settled.map((result, index) => {
    const cluster = clusters[index];
    if (result.status === 'fulfilled') return result.value;
    return {
      id: Number(cluster.id),
      name: cluster.name,
      location: cluster.location_label || '',
      nodes: [],
      totals: {
        nodes: 0,
        online: 0,
        cpuPercent: 0,
        mem: 0,
        maxmem: 0,
        memPercent: 0,
        storageUsed: 0,
        storageTotal: 0,
        storagePercent: 0
      },
      error: result.reason?.message || 'Cluster unavailable'
    };
  });

  cache = { key: cacheKey, expiresAt: Date.now() + 5000, data };
  return { config, clusters: data };
}

module.exports = {
  DEFAULT_CONFIG,
  getClusterHealthDisplayConfig,
  saveClusterHealthDisplayConfig,
  getClusterHealthDisplayData
};
