const { get, run, all } = require('../config/database');
const { decrypt } = require('./cryptoService');
const { getClusterDashboardStats } = require('./proxmoxService');
const { getPangolinConfig, testPangolinConnection } = require('./pangolinService');

const SETTING_KEY = 'cluster_health_display_v1';
const ALLOWED_TYPES = new Set(['cluster', 'cpu', 'memory', 'storage', 'nodes', 'uptime', 'clock', 'logo', 'pangolin', 'services', 'location']);
const GLOBAL_TYPES = new Set(['clock', 'logo']);
const GRID_COLUMNS = 8;
const GRID_ROWS = 4;
const DEFAULT_TIME_ZONE = 'Europe/Berlin';
const DEFAULT_TIME_FORMAT = '24h';

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

function normalizeTimeZone(value) {
  const timezone = String(value || DEFAULT_TIME_ZONE).trim().slice(0, 80) || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch (_) {
    return DEFAULT_TIME_ZONE;
  }
}

function defaultSize(type) {
  if (type === 'nodes') return { w: 8, h: 1 };
  if (type === 'cluster') return { w: 4, h: 1 };
  return { w: 2, h: 1 };
}

function sanitizeSize(type, w, h) {
  const width = toInt(w, defaultSize(type).w, 1, GRID_COLUMNS);
  const height = toInt(h, defaultSize(type).h, 1, GRID_ROWS);

  if (type === 'nodes') {
    if (width >= 8) return { w: 8, h: 1 };
    if (height >= 2) return { w: 4, h: 2 };
    return { w: 4, h: 1 };
  }

  if (type === 'cluster') return { w: width >= 8 ? 8 : 4, h: 1 };
  return { w: width >= 4 ? 4 : 2, h: 1 };
}

function sanitizeWidget(widget = {}, index = 0) {
  const type = ALLOWED_TYPES.has(String(widget.type || '')) ? String(widget.type) : 'cluster';
  const size = sanitizeSize(type, widget.w, widget.h);
  const w = size.w;
  const h = size.h;
  const x = toInt(widget.x, 0, 0, Math.max(0, GRID_COLUMNS - w));
  const y = toInt(widget.y, 0, 0, Math.max(0, GRID_ROWS - h));
  const clusterId = GLOBAL_TYPES.has(type) ? null : (Number.isInteger(Number(widget.clusterId)) ? Number(widget.clusterId) : null);
  return {
    id: String(widget.id || `widget-${Date.now()}-${index}`).slice(0, 80),
    type,
    clusterId,
    label: String(widget.label || '').trim().slice(0, 80),
    x,
    y,
    w,
    h,
    ...(type === 'clock' ? {
      timezone: normalizeTimeZone(widget.timezone),
      timeFormat: widget.timeFormat === '12h' ? '12h' : DEFAULT_TIME_FORMAT
    } : {})
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

async function getPangolinWidgetStatus(clusterId) {
  try {
    const config = await getPangolinConfig(clusterId);
    if (!config.enabled) {
      return {
        state: 'disabled',
        baseDomain: config.baseDomain || '',
        message: 'Publishing disabled'
      };
    }

    const configured = !!(config.apiUrl && config.apiKey && config.orgId && config.siteId && config.domainId && config.baseDomain);
    if (!configured) {
      return {
        state: 'unconfigured',
        baseDomain: config.baseDomain || '',
        message: 'Pangolin configuration incomplete'
      };
    }

    await testPangolinConnection({ clusterId });
    return {
      state: 'online',
      baseDomain: config.baseDomain || '',
      message: 'Pangolin API reachable'
    };
  } catch (err) {
    return {
      state: 'offline',
      baseDomain: '',
      message: 'Pangolin API unavailable'
    };
  }
}

function emptyClusterData(cluster, error = '') {
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
    error: error || 'Cluster unavailable'
  };
}

let cache = { key: '', expiresAt: 0, data: null };

async function getClusterHealthDisplayData() {
  const config = await getClusterHealthDisplayConfig();
  const clusterIds = Array.from(new Set(config.widgets.map((widget) => widget.clusterId).filter(Boolean))).sort((a, b) => a - b);
  const pangolinClusterIds = Array.from(new Set(config.widgets.filter((widget) => widget.type === 'pangolin').map((widget) => widget.clusterId).filter(Boolean))).sort((a, b) => a - b);
  const needsServiceCounts = config.widgets.some((widget) => widget.type === 'services');
  const cacheKey = JSON.stringify({ clusterIds, pangolinClusterIds, needsServiceCounts });

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

  const serviceCounts = new Map();
  if (needsServiceCounts) {
    const rows = await all(`
      SELECT cluster_id, COUNT(*) AS total
      FROM resources
      WHERE cluster_id IN (${placeholders})
      GROUP BY cluster_id
    `, clusterIds);
    rows.forEach((row) => serviceCounts.set(Number(row.cluster_id), Number(row.total || 0)));
  }

  const pangolinSet = new Set(pangolinClusterIds.map(Number));
  const data = await Promise.all(clusters.map(async (cluster) => {
    const clusterId = Number(cluster.id);
    const [statsResult, pangolinResult] = await Promise.allSettled([
      getClusterDashboardStats(String(cluster.url || '').replace(/\/+$/, ''), decrypt(cluster.api_token)),
      pangolinSet.has(clusterId) ? getPangolinWidgetStatus(clusterId) : Promise.resolve(null)
    ]);

    const base = statsResult.status === 'fulfilled'
      ? {
          id: clusterId,
          name: cluster.name,
          location: cluster.location_label || '',
          ...statsResult.value
        }
      : emptyClusterData(cluster, statsResult.reason?.message || 'Cluster unavailable');

    return {
      ...base,
      portalServices: serviceCounts.get(clusterId) || 0,
      pangolin: pangolinResult.status === 'fulfilled' ? pangolinResult.value : {
        state: 'offline',
        baseDomain: '',
        message: 'Pangolin API unavailable'
      }
    };
  }));

  cache = { key: cacheKey, expiresAt: Date.now() + 5000, data };
  return { config, clusters: data };
}

module.exports = {
  DEFAULT_CONFIG,
  getClusterHealthDisplayConfig,
  saveClusterHealthDisplayConfig,
  getClusterHealthDisplayData
};
