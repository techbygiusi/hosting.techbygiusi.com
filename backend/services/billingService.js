const { all, get, run } = require('../config/database');

const GB = 1024 ** 3;
const lastObservedAt = new Map();

const DEFAULTS = Object.freeze({
  currency: 'EUR',
  cpuPerCoreHour: 0,
  memoryPerGbHour: 0,
  storagePerGbMonth: 0
});

const SETTING_KEYS = {
  currency: 'billing_currency',
  cpuPerCoreHour: 'billing_cpu_per_core_hour',
  memoryPerGbHour: 'billing_memory_per_gb_hour',
  storagePerGbMonth: 'billing_storage_per_gb_month'
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeMonth(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  const [, month] = raw.split('-').map(Number);
  return month >= 1 && month <= 12 ? raw : currentMonth();
}

function monthInfo(value) {
  const month = normalizeMonth(value);
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01 00:00:00`;
  const nextDate = new Date(Date.UTC(year, monthNumber, 1));
  const next = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month, start, next, hours: days * 24 };
}

function numberSetting(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function getBillingSettings() {
  const keys = Object.values(SETTING_KEYS);
  const placeholders = keys.map(() => '?').join(',');
  const rows = await all(`SELECT key, value FROM settings WHERE key IN (${placeholders})`, keys);
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const currency = String(map[SETTING_KEYS.currency] || DEFAULTS.currency).trim().toUpperCase();
  return {
    currency: /^[A-Z]{3}$/.test(currency) ? currency : DEFAULTS.currency,
    cpuPerCoreHour: numberSetting(map[SETTING_KEYS.cpuPerCoreHour], DEFAULTS.cpuPerCoreHour),
    memoryPerGbHour: numberSetting(map[SETTING_KEYS.memoryPerGbHour], DEFAULTS.memoryPerGbHour),
    storagePerGbMonth: numberSetting(map[SETTING_KEYS.storagePerGbMonth], DEFAULTS.storagePerGbMonth)
  };
}

async function saveBillingSettings(input = {}) {
  const currency = String(input.currency || DEFAULTS.currency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter ISO code');
  const values = {
    currency,
    cpuPerCoreHour: numberSetting(input.cpuPerCoreHour, NaN),
    memoryPerGbHour: numberSetting(input.memoryPerGbHour, NaN),
    storagePerGbMonth: numberSetting(input.storagePerGbMonth, NaN)
  };
  for (const [key, value] of Object.entries(values)) {
    if (key !== 'currency' && !Number.isFinite(value)) throw new Error('Billing rates must be zero or positive numbers');
  }
  for (const [name, dbKey] of Object.entries(SETTING_KEYS)) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)\n       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [dbKey, String(values[name])]
    );
  }
  return values;
}


async function billableRowsForCluster(clusterId) {
  return all(`
    SELECT
      r.id, r.name, r.container_id, r.cluster_id, r.user_id, r.group_id,
      COALESCE(r.billable, 0) as manual_billable,
      u.name as direct_user_name, u.email as direct_user_email,
      pm.id as provisioned_id, pm.user_id as provisioned_user_id
    FROM resources r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN provisioned_machines pm
      ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
    WHERE r.cluster_id = ? AND (COALESCE(r.billable, 0) = 1 OR pm.id IS NOT NULL)
  `, [clusterId]);
}

async function allocationsForRows(rows) {
  const groupIds = [...new Set(rows.map((row) => row.group_id).filter(Boolean))];
  const members = groupIds.length
    ? await all(`
        SELECT ug.group_id, u.id, u.name, u.email
        FROM user_groups ug
        JOIN users u ON u.id = ug.user_id
        WHERE ug.group_id IN (${groupIds.map(() => '?').join(',')}) AND u.role = 'user'
        ORDER BY u.id
      `, groupIds)
    : [];
  const byGroup = new Map();
  for (const member of members) {
    const key = String(member.group_id);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(member);
  }
  return rows.map((row) => {
    if (row.user_id) {
      return {
        row,
        users: [{ id: row.user_id, name: row.direct_user_name || '', email: row.direct_user_email || '' }]
      };
    }
    return { row, users: byGroup.get(String(row.group_id)) || [] };
  });
}

async function recordClusterBillingUsage(cluster, liveResources = []) {
  const rows = await billableRowsForCluster(cluster.id);
  if (!rows.length) return;
  const allocations = await allocationsForRows(rows);
  const now = Date.now();

  for (const { row, users } of allocations) {
    const key = String(row.id);
    const previous = lastObservedAt.get(key);
    lastObservedAt.set(key, now);
    if (!previous || !users.length) continue;

    const live = liveResources.find((item) => String(item.vmid ?? item.id) === String(row.container_id));
    if (!live) continue;

    const elapsed = Math.min(Math.max((now - previous) / 1000, 0), 180);
    if (elapsed < 1) continue;

    const running = String(live.status || '').toLowerCase() === 'running';
    const runningSeconds = running ? elapsed : 0;

    // Billing is allocation-based, not utilization-based:
    // while a service is running, charge its full assigned CPU and RAM.
    // Storage is charged using the full assigned disk capacity for the whole observed period.
    const allocatedCpuCores = Math.max(Number(live.maxcpu || 0), 0);
    const allocatedMemoryBytes = Math.max(Number(live.maxmem || live.mem || 0), 0);
    const allocatedStorageBytes = Math.max(Number(live.maxdisk || live.disk || 0), 0);

    const cpuCoreSeconds = running ? allocatedCpuCores * elapsed : 0;
    const memoryGbSeconds = running ? allocatedMemoryBytes / GB * elapsed : 0;
    const storageGbSeconds = allocatedStorageBytes / GB * elapsed;
    const share = 1 / users.length;
    const source = row.provisioned_id ? 'self-service' : 'assigned';

    for (const user of users) {
      await run(`
        INSERT INTO billing_usage_samples (
          resource_id, resource_name, cluster_id, cluster_name,
          user_id, user_name, user_email, source, share,
          duration_seconds, running_seconds, cpu_core_seconds,
          memory_gb_seconds, storage_gb_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.id, row.name || `Service ${row.container_id}`, cluster.id, cluster.name || '',
        user.id, user.name || '', user.email || '', source, share,
        elapsed * share, runningSeconds * share, cpuCoreSeconds * share,
        memoryGbSeconds * share, storageGbSeconds * share
      ]);
    }
  }

  if (Math.random() < 0.005) {
    await run(`DELETE FROM billing_usage_samples WHERE sampled_at < datetime('now', '-730 days')`);
  }
}

function calculateUsage(row, settings, monthHours) {
  const durationSeconds = Number(row.duration_seconds || 0);
  const runningSeconds = Number(row.running_seconds || 0);
  const cpuCoreSeconds = Number(row.cpu_core_seconds || 0);
  const memoryGbSeconds = Number(row.memory_gb_seconds || 0);
  const storageGbSeconds = Number(row.storage_gb_seconds || 0);

  const runtimeHours = runningSeconds / 3600;
  const cpuCoreHours = cpuCoreSeconds / 3600;
  const memoryGbHours = memoryGbSeconds / 3600;
  const storageGbMonths = storageGbSeconds / (monthHours * 3600);
  const costs = {
    cpu: cpuCoreHours * settings.cpuPerCoreHour,
    memory: memoryGbHours * settings.memoryPerGbHour,
    storage: storageGbMonths * settings.storagePerGbMonth
  };
  return {
    durationHours: durationSeconds / 3600,
    runtimeHours,
    cpuCoreHours,
    memoryGbHours,
    storageGbMonths,
    averageCpuCores: runningSeconds > 0 ? cpuCoreSeconds / runningSeconds : 0,
    averageMemoryGb: runningSeconds > 0 ? memoryGbSeconds / runningSeconds : 0,
    averageStorageGb: durationSeconds > 0 ? storageGbSeconds / durationSeconds : 0,
    costs,
    totalCost: costs.cpu + costs.memory + costs.storage
  };
}

async function availableMonths(userId = null) {
  const params = [];
  const where = userId ? 'WHERE user_id = ?' : '';
  if (userId) params.push(userId);
  const rows = await all(`SELECT DISTINCT substr(sampled_at, 1, 7) as month FROM billing_usage_samples ${where} ORDER BY month DESC LIMIT 24`, params);
  const current = currentMonth();
  const values = rows.map((row) => row.month).filter(Boolean);
  return values.includes(current) ? values : [current, ...values];
}

async function getBillingSummary({ userId = null, month = null } = {}) {
  const settings = await getBillingSettings();
  const info = monthInfo(month);
  const params = [info.start, info.next];
  let userFilter = '';
  if (userId) {
    userFilter = ' AND user_id = ?';
    params.push(userId);
  }

  const aggregate = await get(`
    SELECT
      COALESCE(SUM(duration_seconds), 0) as duration_seconds,
      COALESCE(SUM(running_seconds), 0) as running_seconds,
      COALESCE(SUM(cpu_core_seconds), 0) as cpu_core_seconds,
      COALESCE(SUM(memory_gb_seconds), 0) as memory_gb_seconds,
      COALESCE(SUM(storage_gb_seconds), 0) as storage_gb_seconds,
      COUNT(*) as samples,
      COUNT(DISTINCT resource_id) as resources
    FROM billing_usage_samples
    WHERE sampled_at >= ? AND sampled_at < ?${userFilter}
  `, params);

  const resourceRows = await all(`
    SELECT
      resource_id, MAX(resource_name) as resource_name, MAX(cluster_name) as cluster_name,
      MAX(source) as source,
      COALESCE(SUM(duration_seconds), 0) as duration_seconds,
      COALESCE(SUM(running_seconds), 0) as running_seconds,
      COALESCE(SUM(cpu_core_seconds), 0) as cpu_core_seconds,
      COALESCE(SUM(memory_gb_seconds), 0) as memory_gb_seconds,
      COALESCE(SUM(storage_gb_seconds), 0) as storage_gb_seconds
    FROM billing_usage_samples
    WHERE sampled_at >= ? AND sampled_at < ?${userFilter}
    GROUP BY resource_id
    ORDER BY resource_name COLLATE NOCASE
  `, params);

  const summary = calculateUsage(aggregate || {}, settings, info.hours);

  let fullResourceUsage = new Map();
  if (userId && resourceRows.length) {
    const resourceIds = [...new Set(resourceRows.map((row) => row.resource_id).filter((value) => value !== null && value !== undefined))];
    if (resourceIds.length) {
      const fullRows = await all(`
        SELECT
          resource_id,
          COUNT(DISTINCT user_id) as allocated_users,
          COALESCE(SUM(duration_seconds), 0) as duration_seconds,
          COALESCE(SUM(running_seconds), 0) as running_seconds,
          COALESCE(SUM(cpu_core_seconds), 0) as cpu_core_seconds,
          COALESCE(SUM(memory_gb_seconds), 0) as memory_gb_seconds,
          COALESCE(SUM(storage_gb_seconds), 0) as storage_gb_seconds
        FROM billing_usage_samples
        WHERE sampled_at >= ? AND sampled_at < ?
          AND resource_id IN (${resourceIds.map(() => '?').join(',')})
        GROUP BY resource_id
      `, [info.start, info.next, ...resourceIds]);

      fullResourceUsage = new Map(fullRows.map((row) => [String(row.resource_id), row]));
    }
  }

  const resources = resourceRows.map((row) => {
    const ownUsage = calculateUsage(row, settings, info.hours);
    const fullRow = userId ? fullResourceUsage.get(String(row.resource_id)) : null;
    const fullUsage = fullRow ? calculateUsage(fullRow, settings, info.hours) : ownUsage;
    const allocatedUsers = Math.max(Number(fullRow?.allocated_users || 1), 1);
    const ownDuration = Number(row.duration_seconds || 0);
    const fullDuration = Number(fullRow?.duration_seconds || row.duration_seconds || 0);
    const sharePercent = fullDuration > 0
      ? Math.max(0, Math.min(100, ownDuration / fullDuration * 100))
      : 100 / allocatedUsers;

    return {
      id: row.resource_id,
      name: row.resource_name,
      clusterName: row.cluster_name,
      source: row.source,
      ...ownUsage,
      ownCost: ownUsage.totalCost,
      fullTotalCost: fullUsage.totalCost,
      fullCosts: fullUsage.costs,
      allocatedUsers,
      sharePercent
    };
  }).sort((a, b) => b.totalCost - a.totalCost);

  const result = {
    month: info.month,
    settings,
    summary: { ...summary, samples: Number(aggregate?.samples || 0), resources: Number(aggregate?.resources || 0) },
    resources,
    availableMonths: await availableMonths(userId)
  };

  if (!userId) {
    const userRows = await all(`
      SELECT
        user_id, MAX(user_name) as user_name, MAX(user_email) as user_email,
        COALESCE(SUM(duration_seconds), 0) as duration_seconds,
        COALESCE(SUM(running_seconds), 0) as running_seconds,
        COALESCE(SUM(cpu_core_seconds), 0) as cpu_core_seconds,
        COALESCE(SUM(memory_gb_seconds), 0) as memory_gb_seconds,
        COALESCE(SUM(storage_gb_seconds), 0) as storage_gb_seconds
      FROM billing_usage_samples
      WHERE sampled_at >= ? AND sampled_at < ?
      GROUP BY user_id
      ORDER BY user_name COLLATE NOCASE
    `, [info.start, info.next]);
    result.users = userRows.map((row) => ({
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      ...calculateUsage(row, settings, info.hours)
    })).sort((a, b) => b.totalCost - a.totalCost);
    result.billableServices = await all(`
      SELECT r.id, r.name, r.container_id as containerId, pc.name as clusterName,
             u.name as userName, cg.name as groupName,
             CASE WHEN pm.id IS NOT NULL THEN 'self-service' ELSE 'assigned' END as source
      FROM resources r
      JOIN proxmox_clusters pc ON pc.id = r.cluster_id
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN customer_groups cg ON cg.id = r.group_id
      LEFT JOIN provisioned_machines pm
        ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
      WHERE COALESCE(r.billable, 0) = 1 OR pm.id IS NOT NULL
      ORDER BY r.name COLLATE NOCASE
    `);
  }

  return result;
}

module.exports = {
  DEFAULTS,
  getBillingSettings,
  saveBillingSettings,
  recordClusterBillingUsage,
  getBillingSummary
};
