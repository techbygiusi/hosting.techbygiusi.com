/**
 * monitoringService.js - Polls Proxmox and Pangolin, detects status
 * transitions, records managed resource events and sends opted-in alerts.
 *
 * Infrastructure alerts (cluster / node / Pangolin) reuse the same interval
 * and debounce rules as resource monitoring so there is only one scheduler.
 */

const { all, run } = require('../config/database');
const { decrypt } = require('./cryptoService');
const { getClusterResources, getClusterNodes } = require('./proxmoxService');
const { getPangolinConfig, testPangolinConnection } = require('./pangolinService');
const { recordClusterBillingUsage } = require('./billingService');
const { sendEmail } = require('./emailService');
const { resourceDownTemplate, resourceRecoveredTemplate, infrastructureDownTemplate } = require('./emailTemplates');
const { safeIdentifier } = require('../middleware/validate');

const INTERVAL_MS = Math.max(15, parseInt(process.env.MONITOR_INTERVAL_SECONDS || '60', 10)) * 1000;
const DEBOUNCE_CHECKS = Math.max(1, parseInt(process.env.MONITOR_DEBOUNCE_CHECKS || '2', 10));
const EVENT_RETENTION_DAYS = Math.max(1, parseInt(process.env.MONITOR_EVENT_RETENTION_DAYS || '30', 10));

// clusterId -> Map<containerId, { status, pendingStatus, pendingCount }>
const stateByCluster = new Map();
// Infrastructure health uses the same debounced state shape.
const clusterHealthState = new Map();
const nodeHealthState = new Map(); // `${clusterId}:${node}` -> state
const pangolinHealthState = new Map(); // single key: pangolin
let timer = null;
let running = false;

function isDown(status) {
  return status !== 'running';
}

function isInfraDown(status) {
  return status !== 'online';
}

/**
 * Debounce infrastructure transitions. If monitoring starts while a component
 * is already down, treat the healthy state as the implicit baseline and alert
 * only after the configured number of consecutive failed checks.
 */
function observeInfraState(store, key, currentStatus) {
  const current = currentStatus === 'online' ? 'online' : 'offline';
  let entry = store.get(key);

  if (!entry) {
    if (current === 'online') {
      store.set(key, { status: 'online', pendingStatus: null, pendingCount: 0 });
      return null;
    }
    entry = { status: 'online', pendingStatus: 'offline', pendingCount: 1 };
    store.set(key, entry);
    if (DEBOUNCE_CHECKS <= 1) {
      entry.status = 'offline';
      entry.pendingStatus = null;
      entry.pendingCount = 0;
      return { oldStatus: 'online', newStatus: 'offline' };
    }
    return null;
  }

  if (current === entry.status) {
    entry.pendingStatus = null;
    entry.pendingCount = 0;
    return null;
  }

  if (entry.pendingStatus === current) entry.pendingCount += 1;
  else {
    entry.pendingStatus = current;
    entry.pendingCount = 1;
  }

  if (entry.pendingCount < DEBOUNCE_CHECKS) return null;

  const transition = { oldStatus: entry.status, newStatus: current };
  entry.status = current;
  entry.pendingStatus = null;
  entry.pendingCount = 0;
  return transition;
}

/**
 * All portal users that should be notified for a given managed resource:
 * the owner plus members of the shared group (deduplicated), filtered by
 * their notification preference column.
 */
async function getRecipients(clusterId, containerId, prefColumn) {
  const preferenceColumn = safeIdentifier(
    prefColumn,
    ['notify_resource_down', 'notify_resource_recovered'],
    'notification preference'
  );
  return all(
    `
    SELECT DISTINCT u.id, u.email, u.name, u.preferred_language, u.preferred_theme
    FROM resources r
    LEFT JOIN user_groups ug ON ug.group_id = r.group_id
    JOIN users u ON u.id = r.user_id OR u.id = ug.user_id
    WHERE r.cluster_id = ? AND r.container_id = ? AND u.${preferenceColumn} = 1
    `,
    [clusterId, String(containerId)]
  );
}

async function getAdminRecipients(prefColumn) {
  const preferenceColumn = safeIdentifier(
    prefColumn,
    ['notify_cluster_down', 'notify_node_down', 'notify_pangolin_down'],
    'administrator infrastructure notification preference'
  );
  return all(
    `SELECT id, email, name, preferred_language, preferred_theme
     FROM users
     WHERE role = 'admin' AND ${preferenceColumn} = 1`
  );
}

async function getManagedResourceName(clusterId, containerId) {
  const rows = await all(
    'SELECT name FROM resources WHERE cluster_id = ? AND container_id = ? LIMIT 1',
    [clusterId, String(containerId)]
  );
  return rows[0]?.name || null;
}

async function recordEvent(clusterId, containerId, resourceName, oldStatus, newStatus) {
  try {
    await run(
      'INSERT INTO status_events (cluster_id, container_id, resource_name, old_status, new_status) VALUES (?, ?, ?, ?, ?)',
      [clusterId, String(containerId), resourceName || '', oldStatus || '', newStatus || '']
    );
  } catch (err) {
    console.error('Monitoring: could not record status event:', err.message);
  }
}

async function notifyTransition(cluster, resource, oldStatus, newStatus) {
  const wentDown = !isDown(oldStatus) && isDown(newStatus);
  const recovered = isDown(oldStatus) && !isDown(newStatus);
  if (!wentDown && !recovered) return;

  const managedName = await getManagedResourceName(cluster.id, resource.id);
  const displayName = managedName || resource.name;

  await recordEvent(cluster.id, resource.id, displayName, oldStatus, newStatus);

  const prefColumn = wentDown ? 'notify_resource_down' : 'notify_resource_recovered';
  let recipients = [];
  try {
    recipients = await getRecipients(cluster.id, resource.id, prefColumn);
  } catch (err) {
    console.error('Monitoring: recipient lookup failed:', err.message);
    return;
  }

  for (const user of recipients) {
    const template = wentDown
      ? resourceDownTemplate({
          name: user.name,
          resourceName: displayName,
          containerId: resource.id,
          clusterName: cluster.name,
          since: new Date(),
          language: user.preferred_language || 'en',
          theme: user.preferred_theme || 'light'
        })
      : resourceRecoveredTemplate({
          name: user.name,
          resourceName: displayName,
          containerId: resource.id,
          clusterName: cluster.name,
          since: new Date(),
          language: user.preferred_language || 'en',
          theme: user.preferred_theme || 'light'
        });
    try {
      await sendEmail(user.email, template.subject, template.text, template.html);
    } catch (err) {
      console.error(`Monitoring: mail to ${user.email} failed:`, err.message);
    }
  }

  console.log(
    `Monitoring: ${cluster.name} / ${resource.id} (${displayName}) ${oldStatus} -> ${newStatus}` +
    (recipients.length ? ` - ${recipients.length} notification(s) sent` : '')
  );
}

async function notifyInfrastructureDown({ kind, serviceName, clusterName = '', detail = '', prefColumn }) {
  let recipients = [];
  try {
    recipients = await getAdminRecipients(prefColumn);
  } catch (err) {
    console.error('Monitoring: admin recipient lookup failed:', err.message);
    return;
  }

  for (const user of recipients) {
    const template = infrastructureDownTemplate({
      name: user.name,
      kind,
      serviceName,
      clusterName,
      detail,
      language: user.preferred_language || 'en',
      theme: user.preferred_theme || 'light'
    });
    try {
      await sendEmail(user.email, template.subject, template.text, template.html);
    } catch (err) {
      console.error(`Monitoring: infrastructure mail to ${user.email} failed:`, err.message);
    }
  }

  if (recipients.length) {
    console.log(`Monitoring: ${kind} "${serviceName}" unavailable - ${recipients.length} admin notification(s) sent`);
  }
}

async function processNodeHealth(cluster, apiToken) {
  let nodes;
  try {
    nodes = await getClusterNodes(cluster.url, apiToken);
  } catch (err) {
    console.error(`Monitoring: node status for cluster "${cluster.name}" unavailable:`, err.message);
    return;
  }

  const seen = new Set();
  for (const node of nodes) {
    const key = `${cluster.id}:${node.node}`;
    seen.add(key);
    const transition = observeInfraState(nodeHealthState, key, node.status === 'online' ? 'online' : 'offline');
    if (transition && !isInfraDown(transition.oldStatus) && isInfraDown(transition.newStatus)) {
      await notifyInfrastructureDown({
        kind: 'node',
        serviceName: node.node,
        clusterName: cluster.name,
        detail: `Node status: ${node.status || 'unknown'}`,
        prefColumn: 'notify_node_down'
      });
    }
  }

  // Nodes intentionally removed from the cluster are forgotten silently.
  for (const key of [...nodeHealthState.keys()]) {
    if (key.startsWith(`${cluster.id}:`) && !seen.has(key)) nodeHealthState.delete(key);
  }
}

async function pollCluster(cluster) {
  const apiToken = decrypt(cluster.api_token);
  let resources;
  try {
    resources = await getClusterResources(cluster.url, apiToken);
    observeInfraState(clusterHealthState, String(cluster.id), 'online');
  } catch (err) {
    const transition = observeInfraState(clusterHealthState, String(cluster.id), 'offline');
    if (transition && !isInfraDown(transition.oldStatus) && isInfraDown(transition.newStatus)) {
      await notifyInfrastructureDown({
        kind: 'cluster',
        serviceName: cluster.name,
        detail: String(err.message || 'Proxmox API unavailable').slice(0, 500),
        prefColumn: 'notify_cluster_down'
      });
    }
    // Cluster unreachable - do not flap all resources or nodes to "down".
    console.error(`Monitoring: cluster "${cluster.name}" unreachable:`, err.message);
    return;
  }

  await processNodeHealth(cluster, apiToken);

  try {
    await recordClusterBillingUsage(cluster, resources);
  } catch (err) {
    console.error(`Billing: usage sample for cluster "${cluster.name}" failed:`, err.message);
  }

  let state = stateByCluster.get(cluster.id);
  const firstRun = !state;
  if (firstRun) {
    state = new Map();
    stateByCluster.set(cluster.id, state);
  }

  const seen = new Set();

  for (const resource of resources) {
    const key = String(resource.id);
    seen.add(key);
    const current = resource.status || 'unknown';
    const entry = state.get(key);

    if (!entry) {
      // Baseline - never alert on the very first resource observation.
      state.set(key, { status: current, pendingStatus: null, pendingCount: 0 });
      continue;
    }

    if (current === entry.status) {
      entry.pendingStatus = null;
      entry.pendingCount = 0;
      continue;
    }

    if (entry.pendingStatus === current) entry.pendingCount += 1;
    else {
      entry.pendingStatus = current;
      entry.pendingCount = 1;
    }

    if (entry.pendingCount >= DEBOUNCE_CHECKS) {
      const oldStatus = entry.status;
      entry.status = current;
      entry.pendingStatus = null;
      entry.pendingCount = 0;
      await notifyTransition(cluster, resource, oldStatus, current);
    }
  }

  // Resources removed from the cluster: drop state silently.
  for (const key of [...state.keys()]) {
    if (!seen.has(key)) state.delete(key);
  }
}

async function pollPangolin(clusters = []) {
  const activeKeys = new Set();
  for (const cluster of clusters) {
    const key = `pangolin:${cluster.id}`;
    let config;
    try {
      config = await getPangolinConfig(cluster.id);
    } catch (err) {
      console.error(`Monitoring: Pangolin configuration for ${cluster.name} could not be read:`, err.message);
      continue;
    }

    if (!config?.enabled || Number(cluster.allow_publishing ?? 1) !== 1) {
      pangolinHealthState.delete(key);
      continue;
    }

    activeKeys.add(key);
    try {
      await testPangolinConnection({ clusterId: cluster.id });
      observeInfraState(pangolinHealthState, key, 'online');
    } catch (err) {
      const transition = observeInfraState(pangolinHealthState, key, 'offline');
      if (transition && !isInfraDown(transition.oldStatus) && isInfraDown(transition.newStatus)) {
        await notifyInfrastructureDown({
          kind: 'pangolin',
          serviceName: `${cluster.name} · ${config.apiUrl || 'Pangolin'}`,
          detail: String(err.message || 'Pangolin API unavailable').slice(0, 500),
          prefColumn: 'notify_pangolin_down'
        });
      }
      console.error(`Monitoring: Pangolin unreachable for ${cluster.name}:`, err.message);
    }
  }

  for (const key of [...pangolinHealthState.keys()]) {
    if (!activeKeys.has(key)) pangolinHealthState.delete(key);
  }
}

async function pollAll() {
  if (running) return; // never overlap
  running = true;
  try {
    const clusters = await all('SELECT id, name, url, api_token, allow_publishing FROM proxmox_clusters');
    const activeClusterIds = new Set(clusters.map(cluster => String(cluster.id)));

    for (const cluster of clusters) await pollCluster(cluster);
    await pollPangolin(clusters);

    for (const key of [...clusterHealthState.keys()]) {
      if (!activeClusterIds.has(String(key))) clusterHealthState.delete(key);
    }
    for (const key of [...nodeHealthState.keys()]) {
      if (!activeClusterIds.has(String(key).split(':')[0])) nodeHealthState.delete(key);
    }

    if (Math.random() < 0.01) {
      await run(`DELETE FROM status_events WHERE created_at < datetime('now', ?)`, [`-${EVENT_RETENTION_DAYS} days`]);
    }
  } catch (err) {
    console.error('Monitoring: poll cycle failed:', err.message);
  } finally {
    running = false;
  }
}

function startMonitoring() {
  if (timer) return;
  timer = setInterval(pollAll, INTERVAL_MS);
  timer.unref?.();
  setTimeout(pollAll, 10 * 1000).unref?.();
  console.log(`✓ Monitoring started (interval ${INTERVAL_MS / 1000}s, debounce ${DEBOUNCE_CHECKS} checks)`);
}

function stopMonitoring() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startMonitoring, stopMonitoring };
