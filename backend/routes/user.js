const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { HTTP_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');
const {
  getAllContainers,
  getContainerIps,
  powerAction,
  getVmTasks,
  getTaskLog,
  getTaskStatus,
  getCapabilities,
  getClusterFirewallStatus,
  getClusterNodeAddresses,
  createTermProxy,
  getOnlineNodes,
  getNodeTemplates,
  getNodeStorages,
  getNextVmidInRange,
  createLxcContainer,
  destroyProxmoxResource,
  POWER_ACTIONS
} = require('../services/proxmoxService');
const { enrichResources } = require('../services/resourceService');
const { encrypt, decrypt } = require('../services/cryptoService');
const { createConsoleSession } = require('../services/consoleService');
const { logAudit } = require('../services/auditService');
const { buildPangolinResourceName } = require('../utils/pangolinResourceName');
const {
  getPangolinConfig,
  publicConfig: getPublicPangolinConfig,
  createPublication,
  updatePublication,
  deletePublication
} = require('../services/pangolinService');

/* ------------------------------------------------------------ ACCESS ---- */
/**
 * A user can access a resource if they own it (user_id) OR are a member of
 * the group the resource is shared with (group_id).
 */
const ACCESS_FILTER = `(
  r.user_id = ?
  OR (r.group_id IS NOT NULL AND r.group_id IN (SELECT group_id FROM user_groups WHERE user_id = ?))
)`;


async function getResourceRowsForUser(userId, resourceId = null) {
  const params = [userId, userId];
  let filter = `WHERE ${ACCESS_FILTER}`;

  if (resourceId) {
    filter += ' AND r.id = ?';
    params.push(resourceId);
  }

  return all(`
    SELECT
      r.*,
      pc.name as cluster_name,
      pc.url as cluster_url,
      pc.api_token,
      COALESCE(pc.allow_publishing, 1) as allow_publishing,
      u.name as user_name,
      u.email as user_email,
      cg.name as group_name,
      pm.id as provisioned_id,
      pm.ip as provisioned_ip,
      pm.source_template as provisioned_template,
      pm.user_id as provisioned_user_id
    FROM resources r
    JOIN proxmox_clusters pc ON r.cluster_id = pc.id
    JOIN users u ON r.user_id = u.id
    LEFT JOIN customer_groups cg ON r.group_id = cg.id
    LEFT JOIN provisioned_machines pm ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
    ${filter}
    ORDER BY r.created_at DESC
  `, params);
}

/**
 * Load one accessible resource with decrypted cluster credentials and its
 * live node/type from Proxmox. Used by power/log/console endpoints.
 */
async function getAccessibleResource(userId, resourceId) {
  const rows = await getResourceRowsForUser(userId, resourceId);
  if (rows.length === 0) {
    throw new AppError('Resource not accessible', HTTP_STATUS.FORBIDDEN);
  }

  const row = rows[0];
  const apiToken = decrypt(row.api_token);
  const containers = await getAllContainers(row.cluster_url, apiToken);
  const live = containers.find(item => String(item.vmid) === String(row.container_id));

  if (!live) {
    throw new AppError('Selected Proxmox resource was not found', HTTP_STATUS.NOT_FOUND);
  }

  return {
    row,
    clusterUrl: row.cluster_url,
    apiToken,
    node: live.node,
    type: live.type,
    vmid: live.vmid,
    name: row.name || live.name
  };
}


const RESOURCE_CREATION_TASK_TYPES = new Set([
  'vzcreate',
  'qmcreate',
  'qmclone',
  'vzrestore',
  'qmrestore'
]);

/**
 * Convert SQLite's UTC `YYYY-MM-DD HH:mm:ss` timestamps to Unix seconds.
 * Portal resource rows are recreated when a VMID is assigned again, which
 * gives us a reliable lower boundary for the current machine lifecycle.
 */
function portalTimestampToUnix(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
    ? raw
    : `${raw.replace(' ', 'T')}Z`;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : 0;
}

/**
 * Keep only tasks belonging to the current VM/CT lifecycle. Proxmox reuses
 * task history by VMID, so a deleted machine and a later replacement with the
 * same ID would otherwise expose the old machine's tasks and logs.
 *
 * The newest create/clone/restore task near or after the portal resource's
 * creation time is the preferred boundary. The portal creation timestamp is
 * used as a safe fallback for manually assigned resources.
 */
function filterTasksForCurrentLifecycle(tasks, resourceRow) {
  const list = Array.isArray(tasks) ? tasks : [];
  const portalCreatedAt = portalTimestampToUnix(resourceRow?.created_at);
  const createLookupFloor = portalCreatedAt > 0 ? portalCreatedAt - (10 * 60) : 0;

  const latestCreate = list.reduce((latest, task) => {
    const started = Number(task?.starttime || 0);
    if (!RESOURCE_CREATION_TASK_TYPES.has(String(task?.type || ''))) return latest;
    if (createLookupFloor > 0 && started < createLookupFloor) return latest;
    return started > latest ? started : latest;
  }, 0);

  const lifecycleStart = latestCreate || portalCreatedAt;
  if (!lifecycleStart) return list;

  return list.filter(task => Number(task?.starttime || task?.endtime || 0) >= lifecycleStart);
}

async function getCurrentLifecycleTasks(target, limit = 30) {
  // Fetch a wider window so the lifecycle create task is still available even
  // after several power, console or backup actions.
  const tasks = await getVmTasks(
    target.clusterUrl,
    target.apiToken,
    target.node,
    target.vmid,
    Math.max(Number(limit) || 30, 200)
  );
  return filterTasksForCurrentLifecycle(tasks, target.row).slice(0, limit);
}

// Capability cache per cluster (60s) to avoid hammering /access/permissions
const capabilityCache = new Map();
async function getClusterCapabilities(clusterId, clusterUrl, apiToken) {
  const cached = capabilityCache.get(clusterId);
  if (cached && Date.now() - cached.time < 60 * 1000) return cached.value;

  let value;
  try {
    value = await getCapabilities(clusterUrl, apiToken);
  } catch (err) {
    value = { readOnly: true, canPower: false, canConsole: false, canProvision: false, privileges: [] };
  }
  capabilityCache.set(clusterId, { time: Date.now(), value });
  return value;
}


async function attachSharedManagementUrls(resources) {
  if (!Array.isArray(resources) || resources.length === 0) return resources;

  const ids = resources.map(resource => resource.id).filter(Boolean);
  if (ids.length === 0) return resources;

  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(
    `SELECT resource_id, url
     FROM resource_credentials
     WHERE COALESCE(purpose, 'general') = 'management'
       AND resource_id IN (${placeholders})`,
    ids
  );

  const credentialUrls = rows.reduce((acc, row) => {
    acc[String(row.resource_id)] = row.url || '';
    return acc;
  }, {});

  return resources.map(resource => ({
    ...resource,
    adminUrl: resource.adminUrl || credentialUrls[String(resource.id)] || ''
  }));
}

function mapPublicationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceId: row.resource_id,
    pangolinResourceId: row.pangolin_resource_id,
    pangolinTargetId: row.pangolin_target_id,
    protocol: row.protocol,
    subdomain: row.subdomain || '',
    publicPort: row.public_port || null,
    targetPort: row.target_port,
    targetMethod: row.target_method || '',
    publicUrl: row.public_url || '',
    status: row.status || 'active',
    lastError: row.last_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function attachPublications(resources) {
  if (!Array.isArray(resources) || resources.length === 0) return resources;
  const ids = resources.map(resource => resource.id).filter(Boolean);
  if (ids.length === 0) return resources;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(
    `SELECT *
     FROM resource_publications
     WHERE resource_id IN (${placeholders})
     ORDER BY CASE protocol WHEN 'http' THEN 0 WHEN 'tcp' THEN 1 ELSE 2 END,
              created_at ASC,
              id ASC`,
    ids
  );
  const byResource = rows.reduce((acc, row) => {
    const key = String(row.resource_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(mapPublicationRow(row));
    return acc;
  }, {});
  return resources.map(resource => {
    const publications = byResource[String(resource.id)] || [];
    const primaryHttpPublication = publications.find(item => item.protocol === 'http' && item.publicUrl) || null;
    return {
      ...resource,
      publications,
      publication: publications[0] || null,
      publicationCount: publications.length,
      publicUrl: primaryHttpPublication?.publicUrl || '',
      webUrl: primaryHttpPublication?.publicUrl || ''
    };
  });
}

async function getOwnedPublishableResource(userId, resourceId, { requireClusterPublishing = false } = {}) {
  const rows = await getResourceRowsForUser(userId, resourceId);
  if (rows.length === 0 || String(rows[0].user_id) !== String(userId)) {
    throw new AppError('Only the assigned user can manage publishing for this service', HTTP_STATUS.FORBIDDEN);
  }
  if (requireClusterPublishing && Number(rows[0].allow_publishing ?? 1) !== 1) {
    throw new AppError('Public publishing is disabled for this cluster', HTTP_STATUS.FORBIDDEN);
  }
  const enriched = await attachPublications(await enrichResources(rows));
  const resource = enriched[0];
  if (!resource.primaryIp) {
    throw new AppError('No reachable IPv4 address was found for this service', HTTP_STATUS.BAD_REQUEST);
  }
  return resource;
}

function normalizePublishingProtocol(value) {
  const protocol = String(value || 'http').trim().toLowerCase();
  if (!['http', 'tcp', 'udp'].includes(protocol)) {
    throw new AppError('Unsupported publishing protocol', HTTP_STATUS.BAD_REQUEST);
  }
  return protocol;
}

/* ----------------------------------------------------------- PROFILE ---- */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await get(
      'SELECT id, email, name, role, preferred_language, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    const groups = await all(`
      SELECT cg.id, cg.name FROM customer_groups cg
      JOIN user_groups ug ON ug.group_id = cg.id
      WHERE ug.user_id = ?
    `, [req.user.id]);

    res.json({ user: { ...user, preferredLanguage: user.preferred_language || 'en', groups } });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new AppError('Name is required', HTTP_STATUS.BAD_REQUEST);

    await run(
      'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [String(name).trim(), req.user.id]
    );

    const user = await get(
      'SELECT id, email, name, role, preferred_language, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user: { ...user, preferredLanguage: user.preferred_language || 'en' } });
  } catch (err) {
    next(err);
  }
});


/* --------------------------------------------------------- LANGUAGE ---- */
router.put('/language', async (req, res, next) => {
  try {
    const language = String(req.body?.language || '').trim().toLowerCase();
    if (!['en', 'de'].includes(language)) {
      throw new AppError('Unsupported language', HTTP_STATUS.BAD_REQUEST);
    }

    await run(
      'UPDATE users SET preferred_language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [language, req.user.id]
    );

    res.json({ preferredLanguage: language });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------- NOTIFICATION PREFERENCES ---- */
router.get('/notifications', async (req, res, next) => {
  try {
    const row = await get(
      'SELECT notify_resource_down, notify_resource_recovered, notify_maintenance, preferred_language FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!row) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    res.json({
      preferences: {
        notifyResourceDown: !!row.notify_resource_down,
        notifyResourceRecovered: !!row.notify_resource_recovered,
        notifyMaintenance: !!row.notify_maintenance
      },
      preferredLanguage: row.preferred_language || 'en'
    });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications', async (req, res, next) => {
  try {
    const { notifyResourceDown, notifyResourceRecovered, notifyMaintenance } = req.body;

    await run(
      `UPDATE users
       SET notify_resource_down = ?, notify_resource_recovered = ?, notify_maintenance = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [notifyResourceDown ? 1 : 0, notifyResourceRecovered ? 1 : 0, notifyMaintenance ? 1 : 0, req.user.id]
    );

    res.json({
      message: 'Notification preferences updated',
      preferences: {
        notifyResourceDown: !!notifyResourceDown,
        notifyResourceRecovered: !!notifyResourceRecovered,
        notifyMaintenance: !!notifyMaintenance
      }
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------- RESOURCES ---- */
router.get('/resources', async (req, res, next) => {
  try {
    const rows = await getResourceRowsForUser(req.user.id);
    const resources = await attachPublications(await attachSharedManagementUrls(await enrichResources(rows)));

    // Attach capabilities per cluster so the UI knows which actions to show
    const clusterIds = [...new Set(rows.map(row => row.cluster_id))];
    const capsByCluster = {};
    for (const clusterId of clusterIds) {
      const row = rows.find(item => item.cluster_id === clusterId);
      capsByCluster[clusterId] = await getClusterCapabilities(clusterId, row.cluster_url, decrypt(row.api_token));
    }

    const publishingConfig = await getPangolinConfig();
    res.json({
      resources: resources.map(resource => {
        const ownsResource = String(resource.userId) === String(req.user.id);
        const clusterPublishingEnabled = resource.clusterPublishingEnabled !== false;
        const canPublish = ownsResource && !!resource.primaryIp && !!publishingConfig.enabled && clusterPublishingEnabled;
        return {
          ...resource,
          canManagePublicPage: ownsResource && (canPublish || Number(resource.publicationCount || 0) > 0),
          canPublish,
          publishingClusterEnabled: clusterPublishingEnabled,
          canDelete: !!resource.canDelete && ownsResource && !!capsByCluster[resource.clusterId]?.canProvision,
          // Power and console capabilities are cluster-token based for every
          // accessible resource. They are not limited to self-provisioned machines,
          // so admin-created services assigned directly or through a group can use
          // the desktop console when the token has VM.Console.
          capabilities: capsByCluster[resource.clusterId] || { readOnly: true }
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

router.get('/resources/:id', async (req, res, next) => {
  try {
    const rows = await getResourceRowsForUser(req.user.id, req.params.id);
    if (rows.length === 0) throw new AppError('Resource not accessible', HTTP_STATUS.FORBIDDEN);

    const resources = await attachPublications(await attachSharedManagementUrls(await enrichResources(rows)));
    const caps = await getClusterCapabilities(rows[0].cluster_id, rows[0].cluster_url, decrypt(rows[0].api_token));
    const publishingConfig = await getPangolinConfig();
    const ownsResource = String(resources[0].userId) === String(req.user.id);
    const clusterPublishingEnabled = resources[0].clusterPublishingEnabled !== false;
    const canPublish = ownsResource && !!resources[0].primaryIp && !!publishingConfig.enabled && clusterPublishingEnabled;
    res.json({
      resource: {
        ...resources[0],
        canManagePublicPage: ownsResource && (canPublish || Number(resources[0].publicationCount || 0) > 0),
        canPublish,
        publishingClusterEnabled: clusterPublishingEnabled,
        canDelete: !!resources[0].canDelete && ownsResource && !!caps.canProvision,
        capabilities: caps
      }
    });
  } catch (err) {
    next(err);
  }
});


router.get('/publishing/options', async (req, res, next) => {
  try {
    const config = await getPangolinConfig();
    const visible = getPublicPangolinConfig(config);
    let clusterEnabled = true;

    if (req.query.resourceId) {
      const rows = await getResourceRowsForUser(req.user.id, req.query.resourceId);
      if (rows.length === 0 || String(rows[0].user_id) !== String(req.user.id)) {
        throw new AppError('Only the assigned user can manage publishing for this service', HTTP_STATUS.FORBIDDEN);
      }
      clusterEnabled = Number(rows[0].allow_publishing ?? 1) === 1;
    }

    res.json({
      publishing: {
        enabled: visible.enabled && clusterEnabled,
        globalEnabled: visible.enabled,
        clusterEnabled,
        baseDomain: visible.baseDomain,
        defaultTargetMethod: visible.defaultTargetMethod,
        protocols: {
          http: { enabled: visible.httpEnabled, allowedPorts: visible.allowedHttpPorts },
          tcp: { enabled: visible.tcpEnabled, allowedPorts: visible.allowedTcpPorts },
          udp: { enabled: visible.udpEnabled, allowedPorts: visible.allowedUdpPorts }
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

function normalizePublicationInput(body, config) {
  const protocol = normalizePublishingProtocol(body?.protocol);
  const targetPort = Number(body?.targetPort);
  const publicPort = Number(body?.publicPort || targetPort);
  const subdomain = String(body?.subdomain || '').trim().toLowerCase();
  const targetMethod = protocol === 'http'
    ? String(body?.targetMethod || config.defaultTargetMethod || 'http').trim().toLowerCase()
    : '';

  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw new AppError('Target port must be between 1 and 65535', HTTP_STATUS.BAD_REQUEST);
  }
  if (protocol !== 'http' && (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535)) {
    throw new AppError('Public port must be between 1 and 65535', HTTP_STATUS.BAD_REQUEST);
  }

  return { protocol, targetPort, publicPort, subdomain, targetMethod };
}

async function assertPublicationSlotAvailable(input, publicationId = null) {
  if (input.protocol === 'http') {
    const collision = await get(
      `SELECT id
       FROM resource_publications
       WHERE protocol = 'http'
         AND subdomain = ?
         AND (? IS NULL OR id != ?)`,
      [input.subdomain, publicationId, publicationId]
    );
    if (collision) throw new AppError('This subdomain is already in use', HTTP_STATUS.CONFLICT);
    return;
  }

  const collision = await get(
    `SELECT id
     FROM resource_publications
     WHERE protocol = ?
       AND public_port = ?
       AND (? IS NULL OR id != ?)`,
    [input.protocol, input.publicPort, publicationId, publicationId]
  );
  if (collision) {
    throw new AppError(`This ${input.protocol.toUpperCase()} public port is already in use`, HTTP_STATUS.CONFLICT);
  }
}

async function syncResourcePrimaryPublicationUrl(resourceId) {
  const primary = await get(
    `SELECT public_url
     FROM resource_publications
     WHERE resource_id = ? AND protocol = 'http' AND status = 'active'
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [resourceId]
  );
  const publicUrl = primary?.public_url || '';
  await run(
    'UPDATE resources SET web_url = ?, public_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [publicUrl, publicUrl, resourceId]
  );
  return publicUrl;
}

function publicationDisplayName(resource, input) {
  return buildPangolinResourceName({
    userName: resource.userName,
    userEmail: resource.userEmail,
    userId: resource.userId,
    containerName: resource.name,
    containerId: resource.containerId,
    protocol: input.protocol,
    targetPort: input.targetPort,
    publicPort: input.publicPort
  });
}

async function createResourcePublication(req, resource, config, input) {
  await assertPublicationSlotAvailable(input);
  const result = await createPublication(config, {
    name: publicationDisplayName(resource, input),
    ip: resource.primaryIp,
    ...input
  });

  try {
    const insertResult = await run(
      `INSERT INTO resource_publications
        (resource_id, pangolin_resource_id, pangolin_target_id, protocol, subdomain, public_port, target_port, target_method, public_url, status, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', '', CURRENT_TIMESTAMP)`,
      [resource.id, result.pangolinResourceId, result.pangolinTargetId, result.protocol, result.subdomain || null, result.publicPort, result.targetPort, result.targetMethod || null, result.publicUrl]
    );
    await syncResourcePrimaryPublicationUrl(resource.id);
    const publication = { ...result, id: insertResult.lastID, resourceId: resource.id, status: 'active', lastError: '' };
    await logAudit(req, 'resource.publication.create', `resource:${resource.id}:publication:${insertResult.lastID}`, result.publicUrl);
    return publication;
  } catch (databaseError) {
    await deletePublication(config, {
      pangolin_resource_id: result.pangolinResourceId,
      pangolin_target_id: result.pangolinTargetId
    }).catch(() => {});
    throw databaseError;
  }
}

async function updateResourcePublication(req, resource, config, existing, input) {
  if (existing.protocol !== input.protocol) {
    throw new AppError('The protocol of an existing publication cannot be changed', HTTP_STATUS.BAD_REQUEST);
  }
  await assertPublicationSlotAvailable(input, existing.id);
  const result = await updatePublication(config, existing, {
    name: publicationDisplayName(resource, input),
    ip: resource.primaryIp,
    ...input
  });

  await run(
    `UPDATE resource_publications
     SET pangolin_resource_id = ?,
         pangolin_target_id = ?,
         protocol = ?,
         subdomain = ?,
         public_port = ?,
         target_port = ?,
         target_method = ?,
         public_url = ?,
         status = 'active',
         last_error = '',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND resource_id = ?`,
    [result.pangolinResourceId, result.pangolinTargetId, result.protocol, result.subdomain || null, result.publicPort, result.targetPort, result.targetMethod || null, result.publicUrl, existing.id, resource.id]
  );
  await syncResourcePrimaryPublicationUrl(resource.id);
  await logAudit(req, 'resource.publication.update', `resource:${resource.id}:publication:${existing.id}`, result.publicUrl);
  return { ...result, id: existing.id, resourceId: resource.id, status: 'active', lastError: '' };
}

async function deleteResourcePublication(req, resource, publication) {
  const config = await getPangolinConfig();
  await deletePublication(config, publication);
  await run('DELETE FROM resource_publications WHERE id = ? AND resource_id = ?', [publication.id, resource.id]);
  await syncResourcePrimaryPublicationUrl(resource.id);
  await logAudit(req, 'resource.publication.remove', `resource:${resource.id}:publication:${publication.id}`, publication.public_url || '');
}

async function getOwnedResourceWithoutIpRequirement(userId, resourceId) {
  const rows = await getResourceRowsForUser(userId, resourceId);
  if (rows.length === 0 || String(rows[0].user_id) !== String(userId)) {
    throw new AppError('Only the assigned user can manage publishing for this service', HTTP_STATUS.FORBIDDEN);
  }
  const enriched = await attachPublications(await enrichResources(rows));
  return enriched[0];
}

router.get('/resources/:id/publications', async (req, res, next) => {
  try {
    const resource = await getOwnedResourceWithoutIpRequirement(req.user.id, req.params.id);
    res.json({ publications: resource.publications || [], primaryIp: resource.primaryIp || '' });
  } catch (err) {
    next(err);
  }
});

router.post('/resources/:id/publications', async (req, res, next) => {
  try {
    const resource = await getOwnedPublishableResource(req.user.id, req.params.id, { requireClusterPublishing: true });
    const config = await getPangolinConfig();
    const input = normalizePublicationInput(req.body, config);
    const publication = await createResourcePublication(req, resource, config, input);
    res.status(HTTP_STATUS.CREATED).json({ message: 'Public access added', publication });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/publications/:publicationId', async (req, res, next) => {
  try {
    const resource = await getOwnedPublishableResource(req.user.id, req.params.id, { requireClusterPublishing: true });
    const existing = await get(
      'SELECT * FROM resource_publications WHERE id = ? AND resource_id = ?',
      [req.params.publicationId, resource.id]
    );
    if (!existing) throw new AppError('Publication not found', HTTP_STATUS.NOT_FOUND);
    const config = await getPangolinConfig();
    const input = normalizePublicationInput(req.body, config);
    const publication = await updateResourcePublication(req, resource, config, existing, input);
    res.json({ message: 'Public access saved', publication });
  } catch (err) {
    try {
      await run(
        `UPDATE resource_publications
         SET status = 'error', last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND resource_id = ?`,
        [String(err.message || 'Publishing failed').slice(0, 1000), req.params.publicationId, req.params.id]
      );
    } catch (_) {}
    next(err);
  }
});

router.delete('/resources/:id/publications/:publicationId', async (req, res, next) => {
  try {
    const resource = await getOwnedResourceWithoutIpRequirement(req.user.id, req.params.id);
    const publication = await get(
      'SELECT * FROM resource_publications WHERE id = ? AND resource_id = ?',
      [req.params.publicationId, resource.id]
    );
    if (!publication) throw new AppError('Publication not found', HTTP_STATUS.NOT_FOUND);
    await deleteResourcePublication(req, resource, publication);
    res.json({ message: 'Public access removed' });
  } catch (err) {
    next(err);
  }
});

// Backward-compatible singular endpoints for older cached frontends.
router.get('/resources/:id/publication', async (req, res, next) => {
  try {
    const resource = await getOwnedResourceWithoutIpRequirement(req.user.id, req.params.id);
    res.json({ publication: resource.publications?.[0] || null, publications: resource.publications || [], primaryIp: resource.primaryIp || '' });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/publication', async (req, res, next) => {
  try {
    const resource = await getOwnedPublishableResource(req.user.id, req.params.id, { requireClusterPublishing: true });
    const config = await getPangolinConfig();
    const input = normalizePublicationInput(req.body, config);
    const existing = await get(
      'SELECT * FROM resource_publications WHERE resource_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
      [resource.id]
    );
    const publication = existing && existing.protocol === input.protocol
      ? await updateResourcePublication(req, resource, config, existing, input)
      : await createResourcePublication(req, resource, config, input);
    res.json({ message: 'Public access saved', publication });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id/publication', async (req, res, next) => {
  try {
    const resource = await getOwnedResourceWithoutIpRequirement(req.user.id, req.params.id);
    const publications = await all('SELECT * FROM resource_publications WHERE resource_id = ?', [resource.id]);
    for (const publication of publications) {
      await deleteResourcePublication(req, resource, publication);
    }
    res.json({ message: 'Public access removed' });
  } catch (err) {
    next(err);
  }
});

// Legacy manual URL storage was replaced by server-side Pangolin publishing.
router.put('/resources/:id/public-page', async (req, res, next) => {
  next(new AppError('Manual public URLs are no longer supported. Use the publishing dialog.', HTTP_STATUS.GONE));
});


router.delete('/resources/:id', async (req, res, next) => {
  try {
    const row = await get(`
      SELECT
        r.*,
        pc.name as cluster_name,
        pc.url as cluster_url,
        pc.api_token,
        pm.id as provisioned_id,
        pm.vmid as provisioned_vmid,
        pm.ip as provisioned_ip,
        pm.user_id as provisioned_user_id
      FROM resources r
      JOIN proxmox_clusters pc ON r.cluster_id = pc.id
      JOIN provisioned_machines pm ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
      WHERE r.id = ? AND r.user_id = ? AND pm.user_id = ?
    `, [req.params.id, req.user.id, req.user.id]);

    if (!row) {
      throw new AppError('Only self-created machines can be deleted by the user', HTTP_STATUS.FORBIDDEN);
    }

    const apiToken = decrypt(row.api_token);
    const caps = await getClusterCapabilities(row.cluster_id, row.cluster_url, apiToken);
    if (!caps.canProvision) {
      throw new AppError('Machine deletion is not permitted for this cluster token', HTTP_STATUS.FORBIDDEN);
    }

    const publications = await all('SELECT * FROM resource_publications WHERE resource_id = ?', [row.id]);
    if (publications.length > 0) {
      const publishingConfig = await getPangolinConfig();
      for (const publication of publications) {
        await deletePublication(publishingConfig, publication);
      }
      await run('DELETE FROM resource_publications WHERE resource_id = ?', [row.id]);
    }

    const liveResources = await getAllContainers(row.cluster_url, apiToken);
    const live = liveResources.find(item => String(item.vmid) === String(row.container_id));
    let upid = '';
    let node = live?.node || '';

    if (live) {
      const result = await destroyProxmoxResource(row.cluster_url, apiToken, live.node, live.type, live.vmid);
      upid = result.upid || '';
      node = result.node || live.node;
    }

    await run('DELETE FROM resource_credentials WHERE resource_id = ?', [req.params.id]);
    await run('DELETE FROM resources WHERE id = ?', [req.params.id]);
    await run('DELETE FROM provisioned_machines WHERE id = ?', [row.provisioned_id]);

    await logAudit(req, 'machine.delete', `resource:${req.params.id}`, `${row.name || row.hostname || row.container_id} (VMID ${row.container_id})`);

    res.json({ message: 'Machine deleted', upid, node });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------- POWER ---- */
router.post('/resources/:id/power', async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!POWER_ACTIONS.includes(action)) {
      throw new AppError('Invalid power action', HTTP_STATUS.BAD_REQUEST);
    }

    const target = await getAccessibleResource(req.user.id, req.params.id);
    const caps = await getClusterCapabilities(target.row.cluster_id, target.clusterUrl, target.apiToken);
    if (!caps.canPower) {
      throw new AppError('Power management is not permitted for this cluster token', HTTP_STATUS.FORBIDDEN);
    }

    const result = await powerAction(target.clusterUrl, target.apiToken, target.node, target.type, target.vmid, action);
    await logAudit(req, `power.${action}`, `resource:${req.params.id}`, `${target.name} (VMID ${target.vmid})`);

    res.json({ message: 'Power action started', upid: result.upid, node: target.node });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------- TASKS/LOGS ---- */
router.get('/resources/:id/tasks', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    const tasks = await getCurrentLifecycleTasks(target, 30);
    res.json({ tasks, node: target.node });
  } catch (err) {
    next(err);
  }
});

router.get('/resources/:id/tasks/:upid/log', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    const upid = String(req.params.upid || '');

    // Validate against the filtered current lifecycle, not only the VMID in
    // the UPID. VMIDs can be reused and old task logs must stay inaccessible.
    const tasks = await getCurrentLifecycleTasks(target, 200);
    if (!tasks.some(task => task.upid === upid)) {
      throw new AppError('Task log does not belong to the current machine lifecycle', HTTP_STATUS.FORBIDDEN);
    }

    const [log, status] = await Promise.all([
      getTaskLog(target.clusterUrl, target.apiToken, target.node, upid),
      getTaskStatus(target.clusterUrl, target.apiToken, target.node, upid).catch(() => ({}))
    ]);
    res.json({ log, status });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------- CONSOLE ---- */
router.post('/resources/:id/console', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    const caps = await getClusterCapabilities(target.row.cluster_id, target.clusterUrl, target.apiToken);
    if (!caps.canConsole) {
      throw new AppError('Console access is not permitted for this cluster token', HTTP_STATUS.FORBIDDEN);
    }

    const term = await createTermProxy(target.clusterUrl, target.apiToken, target.node, target.type, target.vmid);
    const autoLogin = target.type === 'lxc' ? await getRootConsoleCredential(req.params.id) : null;
    const sessionToken = createConsoleSession({
      clusterUrl: target.clusterUrl,
      apiToken: target.apiToken,
      node: target.node,
      type: target.type,
      vmid: target.vmid,
      port: term.port,
      ticket: term.ticket
    });

    await logAudit(req, 'console.open', `resource:${req.params.id}`, `${target.name} (VMID ${target.vmid})`);

    res.json({
      sessionToken,
      user: term.user,
      ticket: term.ticket,
      wsPath: `/api/console/ws?token=${sessionToken}`,
      autoLogin
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------- CREDENTIALS ---- */
async function assertResourceAccess(userId, resourceId) {
  const rows = await getResourceRowsForUser(userId, resourceId);
  if (rows.length === 0) throw new AppError('Resource not accessible', HTTP_STATUS.FORBIDDEN);
  return rows[0];
}


async function getRootConsoleCredential(resourceId) {
  const rows = await all(
    `SELECT id, label, username, secret_encrypted
     FROM resource_credentials
     WHERE resource_id = ?
       AND COALESCE(purpose, 'general') != 'management'
       AND secret_encrypted IS NOT NULL
       AND (
         LOWER(TRIM(COALESCE(username, ''))) = 'root'
         OR LOWER(COALESCE(label, '')) LIKE '%root%'
       )
     ORDER BY CASE WHEN LOWER(TRIM(COALESCE(username, ''))) = 'root' THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [resourceId]
  );
  const cred = rows[0];
  if (!cred) return null;
  const secret = decrypt(cred.secret_encrypted);
  if (!secret) return null;
  return { username: cred.username || 'root', secret };
}

router.get('/resources/:id/credentials', async (req, res, next) => {
  try {
    await assertResourceAccess(req.user.id, req.params.id);
    const rows = await all(
      `SELECT id, label, username, url, notes, created_by_role, COALESCE(purpose, 'general') AS purpose, created_at, updated_at
       FROM resource_credentials
       WHERE resource_id = ?
       ORDER BY CASE WHEN COALESCE(purpose, 'general') = 'management' THEN 0 ELSE 1 END, label`,
      [req.params.id]
    );
    res.json({
      credentials: rows.map(row => ({
        ...row,
        hasSecret: true,
        fromAdmin: row.created_by_role === 'admin',
        canManage: row.created_by_role !== 'admin' || row.purpose === 'management'
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get('/resources/:id/credentials/:credId/reveal', async (req, res, next) => {
  try {
    await assertResourceAccess(req.user.id, req.params.id);
    const cred = await get(
      'SELECT id, label, secret_encrypted FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);

    await logAudit(req, 'credential.reveal', `resource:${req.params.id}`, cred.label);
    res.json({ secret: decrypt(cred.secret_encrypted) });
  } catch (err) {
    next(err);
  }
});

router.post('/resources/:id/credentials', async (req, res, next) => {
  try {
    const resource = await assertResourceAccess(req.user.id, req.params.id);
    const { label, username, secret, url, notes, purpose: requestedPurpose } = req.body;
    const purpose = requestedPurpose === 'management' ? 'management' : 'general';
    const nextLabel = String(label || (purpose === 'management' ? 'Verwaltungsseite' : '')).trim();

    if (!nextLabel) {
      throw new AppError('Label is required', HTTP_STATUS.BAD_REQUEST);
    }

    const nextUrl = String(url || (purpose === 'management' ? (resource.admin_url || '') : '')).trim();

    if (purpose === 'management') {
      const existing = await get(
        "SELECT * FROM resource_credentials WHERE resource_id = ? AND COALESCE(purpose, 'general') = 'management'",
        [req.params.id]
      );
      if (existing) {
        const nextSecret = secret !== undefined && secret !== '' ? encrypt(secret) : existing.secret_encrypted;
        await run(
          'UPDATE resource_credentials SET label = ?, username = ?, secret_encrypted = ?, url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nextLabel, String(username ?? existing.username ?? '').trim(), nextSecret, nextUrl, String(notes ?? existing.notes ?? '').trim(), existing.id]
        );
        await logAudit(req, 'credential.update', `resource:${req.params.id}`, nextLabel);
        return res.json({ id: existing.id, message: 'Credential saved' });
      }
    }

    const result = await run(
      'INSERT INTO resource_credentials (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, nextLabel, String(username || '').trim(), encrypt(secret || ''), nextUrl, String(notes || '').trim(), req.user.id, 'user', purpose]
    );

    await logAudit(req, 'credential.create', `resource:${req.params.id}`, nextLabel);
    res.status(HTTP_STATUS.CREATED).json({ id: result.lastID, message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    await assertResourceAccess(req.user.id, req.params.id);
    const { label, username, secret, url, notes, purpose: requestedPurpose } = req.body;
    const cred = await get(
      'SELECT * FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    // Management-page credentials are shared between admin and authorized users.
    // Other admin-provided credentials stay read-only for users.
    if (cred.created_by_role === 'admin' && cred.purpose !== 'management') {
      throw new AppError('Admin-provided credentials cannot be edited', HTTP_STATUS.FORBIDDEN);
    }
    const purpose = cred.purpose === 'management' || requestedPurpose === 'management' ? 'management' : 'general';
    const nextLabel = String(label ?? cred.label ?? (purpose === 'management' ? 'Verwaltungsseite' : '')).trim();
    if (!nextLabel) throw new AppError('Label is required', HTTP_STATUS.BAD_REQUEST);

    if (purpose === 'management') {
      const duplicate = await get(
        "SELECT id FROM resource_credentials WHERE resource_id = ? AND COALESCE(purpose, 'general') = 'management' AND id != ?",
        [req.params.id, req.params.credId]
      );
      if (duplicate) throw new AppError('Management credential already exists', HTTP_STATUS.BAD_REQUEST);
    }

    const nextSecret = secret !== undefined && secret !== '' ? encrypt(secret) : cred.secret_encrypted;

    await run(
      'UPDATE resource_credentials SET label = ?, username = ?, secret_encrypted = ?, url = ?, notes = ?, purpose = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextLabel, String(username ?? cred.username ?? '').trim(), nextSecret, String(url ?? cred.url ?? '').trim(), String(notes ?? cred.notes ?? '').trim(), purpose, req.params.credId]
    );

    await logAudit(req, 'credential.update', `resource:${req.params.id}`, nextLabel);
    res.json({ message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    await assertResourceAccess(req.user.id, req.params.id);
    const cred = await get(
      'SELECT id, label FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);

    await run('DELETE FROM resource_credentials WHERE id = ?', [req.params.credId]);
    await logAudit(req, 'credential.delete', `resource:${req.params.id}`, cred.label);
    res.json({ message: 'Credential deleted' });
  } catch (err) {
    next(err);
  }
});


/* ------------------------------------------------------ PROVISIONING ---- */
/**
 * Clusters where self-service provisioning is enabled AND the API token
 * actually has VM.Allocate. Self-service intentionally exposes only LXC
 * containers; VM creation stays an admin-only Proxmox task.
 */
router.get('/provisioning/options', async (req, res, next) => {
  try {
    const clusters = await all(
      "SELECT * FROM proxmox_clusters WHERE allow_provisioning = 1 AND vmid_min IS NOT NULL AND vmid_max IS NOT NULL"
    );

    const options = [];
    for (const cluster of clusters) {
      const apiToken = decrypt(cluster.api_token);
      const caps = await getClusterCapabilities(cluster.id, cluster.url, apiToken);
      if (!caps.canProvision || !caps.canManageFirewall || !caps.canVerifyFirewall) continue;

      const allowTypes = 'ct';
      let templates = [];
      let firewallEnabled = false;
      let unavailableReason = '';

      try {
        const firewallStatus = await getClusterFirewallStatus(cluster.url, apiToken);
        firewallEnabled = !!firewallStatus.enabled;
        if (!firewallEnabled) unavailableReason = 'Proxmox datacenter firewall is disabled';
      } catch (_) {
        unavailableReason = 'Proxmox datacenter firewall status could not be verified';
      }

      const parseList = (json) => { try { const p = JSON.parse(json || '[]'); return Array.isArray(p) ? p : []; } catch (_) { return []; } };
      const allowedTemplates = parseList(cluster.allowed_templates);

      try {
        const nodes = await getOnlineNodes(cluster.url, apiToken);
        if (nodes.length > 0) {
          const node = nodes[0].node;
          templates = await getNodeTemplates(cluster.url, apiToken, node, cluster.template_storage || 'local');
          // Self-service only exposes templates explicitly approved by the admin.
          templates = templates.filter(t => allowedTemplates.includes(t.volid));
        }
      } catch (_) { /* templates are optional while the cluster is unavailable */ }

      if (!unavailableReason && templates.length === 0) {
        unavailableReason = 'No approved container template is currently available';
      }

      options.push({
        clusterId: cluster.id,
        clusterName: cluster.name,
        allowTypes,
        available: firewallEnabled && templates.length > 0,
        unavailableReason,
        hasDefaultPassword: !!cluster.default_password_encrypted,
        maxCores: cluster.max_cores || 2,
        maxMemoryMb: cluster.max_memory_mb || 2048,
        maxDiskGb: Math.min(cluster.max_disk_gb || 20, 32),
        templates
      });
    }

    res.json({ clusters: options });
  } catch (err) {
    next(err);
  }
});



router.post('/provisioning/create', async (req, res, next) => {
  try {
    const { clusterId, type, hostname, template, cores, memoryMb, diskGb, rootPassword } = req.body;
    if (type && type !== 'ct') {
      throw new AppError('VMs are not allowed on this cluster', HTTP_STATUS.FORBIDDEN);
    }
    if (req.body.communityScript) {
      throw new AppError('Community scripts are not available', HTTP_STATUS.BAD_REQUEST);
    }
    const kind = 'ct';

    const cluster = await get(
      'SELECT * FROM proxmox_clusters WHERE id = ? AND allow_provisioning = 1',
      [clusterId]
    );
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    if (!cluster.vmid_min || !cluster.vmid_max || !cluster.ip_start || !cluster.ip_end || !cluster.gateway) {
      throw new AppError('Provisioning is not fully configured for this cluster', HTTP_STATUS.BAD_REQUEST);
    }

    const cleanHostname = String(hostname || '').trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(cleanHostname)) {
      throw new AppError('Hostname is invalid', HTTP_STATUS.BAD_REQUEST);
    }

    if (!template || !String(template).includes('vztmpl')) {
      throw new AppError('Template is invalid', HTTP_STATUS.BAD_REQUEST);
    }

    let password = rootPassword;
    if (!password && cluster.default_password_encrypted) {
      password = decrypt(cluster.default_password_encrypted);
    }
    if (!password || String(password).length < 8) {
      throw new AppError('Root password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST);
    }

    const safeCores = Math.min(Math.max(parseInt(cores, 10) || 1, 1), cluster.max_cores || 2);
    const safeMemory = Math.min(Math.max(parseInt(memoryMb, 10) || 512, 256), cluster.max_memory_mb || 2048);
    const safeDisk = Math.min(Math.max(parseInt(diskGb, 10) || 8, 4), Math.min(cluster.max_disk_gb || 20, 32));

    const apiToken = decrypt(cluster.api_token);
    const caps = await getClusterCapabilities(cluster.id, cluster.url, apiToken);
    if (!caps.canProvision) {
      throw new AppError('Provisioning is not permitted for this cluster token', HTTP_STATUS.FORBIDDEN);
    }
    if (!caps.canManageFirewall) {
      throw new AppError('Provisioning firewall permission is missing', HTTP_STATUS.FORBIDDEN);
    }
    if (!caps.canVerifyFirewall) {
      throw new AppError('Provisioning firewall audit permission is missing', HTTP_STATUS.FORBIDDEN);
    }

    const allowedTemplates = (() => {
      try {
        const parsed = JSON.parse(cluster.allowed_templates || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    })();
    if (!allowedTemplates.includes(template)) {
      throw new AppError('Template is not allowed', HTTP_STATUS.BAD_REQUEST);
    }

    // Allocate VMID within the admin range and a free IP within the pool
    const reserved = await all('SELECT vmid FROM provisioned_machines WHERE cluster_id = ?', [cluster.id]);
    const vmid = await getNextVmidInRange(cluster.url, apiToken, cluster.vmid_min, cluster.vmid_max, reserved.map(row => row.vmid));

    const usedIps = new Set(
      (await all('SELECT ip FROM provisioned_machines WHERE cluster_id = ? AND ip IS NOT NULL', [cluster.id]))
        .map(row => stripCidr(row.ip))
        .filter(Boolean)
    );
    const lateralDestinations = new Set();

    // Scan live guest interfaces so address allocation stays collision-free and
    // public guest addresses outside the self-service subnet are blocked too.
    const liveResources = await getAllContainers(cluster.url, apiToken).catch(() => []);
    for (const item of liveResources) {
      const ips = await getContainerIps(cluster.url, apiToken, item.node, item.type, item.vmid).catch(() => []);
      ips.forEach(entry => {
        const ipv4 = stripCidr(entry.ipv4 || entry.ip || '');
        if (ipv4) {
          usedIps.add(ipv4);
          lateralDestinations.add(ipv4);
        }
      });
    }

    // Block cluster management addresses explicitly as well. Private management
    // networks are already covered by the mandatory RFC1918 rules; this also
    // protects hosts that use public or otherwise unusual IPv4 addresses.
    const nodeAddresses = await getClusterNodeAddresses(cluster.url, apiToken).catch(() => []);
    nodeAddresses.forEach(address => lateralDestinations.add(address));

    const ip = allocateIp(cluster.ip_start, cluster.ip_end, usedIps);
    if (!ip) throw new AppError('No free IP address available in the configured range', HTTP_STATUS.BAD_REQUEST);

    const nodes = await getOnlineNodes(cluster.url, apiToken);
    if (nodes.length === 0) throw new AppError('No online node available', HTTP_STATUS.BAD_REQUEST);
    const node = nodes[0].node;

    const liveTemplates = await getNodeTemplates(cluster.url, apiToken, node, cluster.template_storage || 'local');
    if (!liveTemplates.some(item => item.volid === template)) {
      throw new AppError('Template is not allowed', HTTP_STATUS.BAD_REQUEST);
    }

    const liveStorages = await getNodeStorages(cluster.url, apiToken, node);
    const liveStorageNames = liveStorages.map(item => item.storage);
    const configuredStorage = cluster.storage || 'local';
    const selectedStorage = liveStorageNames.includes(configuredStorage) ? configuredStorage : liveStorageNames[0];
    if (!selectedStorage) throw new AppError('No available Proxmox storage found on the selected node', HTTP_STATUS.BAD_REQUEST);

    const createResult = await createLxcContainer(cluster.url, apiToken, node, {
      vmid,
      hostname: cleanHostname,
      ostemplate: template,
      storage: selectedStorage,
      diskGb: safeDisk,
      cores: safeCores,
      memoryMb: safeMemory,
      password,
      bridge: cluster.bridge || 'vmbr0',
      ip,
      ipPrefix: cluster.ip_prefix || 24,
      gateway: cluster.gateway,
      blockedDestinations: Array.from(lateralDestinations)
    });

    await run(
      'INSERT INTO provisioned_machines (cluster_id, vmid, ip, hostname, source_template, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [cluster.id, vmid, ip, cleanHostname, template, req.user.id]
    );

    // Register as portal resource owned by the requesting user
    const resourceResult = await run(
      'INSERT INTO resources (name, container_id, cluster_id, user_id, web_url, public_url, admin_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanHostname, String(vmid), cluster.id, req.user.id, '', '', '']
    );

    // Persist the exact root password used for provisioning on the newly
    // created resource. This also covers a cluster default password when the
    // user leaves the password field empty.
    await run(
      `INSERT INTO resource_credentials
        (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [resourceResult.lastID, 'Root-Passwort', 'root', encrypt(password), '', 'Automatisch beim Erstellen des Containers gespeichert.', req.user.id, 'user', 'general']
    );

    await logAudit(req, 'credential.create', `resource:${resourceResult.lastID}`, 'Root-Passwort');
    await logAudit(req, 'machine.create', `resource:${resourceResult.lastID}`, `${kind.toUpperCase()} ${cleanHostname} (VMID ${vmid}, ${ip})`);

    res.status(HTTP_STATUS.CREATED).json({
      message: 'Machine creation started',
      resourceId: resourceResult.lastID,
      type: kind,
      vmid,
      ip,
      node,
      upid: createResult.upid,
      isolation: createResult.isolation || 'internet-only',
      credentialsStored: true
    });
  } catch (err) {
    next(err);
  }
});

function stripCidr(ip) {
  return String(ip || '').split('/')[0].trim();
}

function ipToLong(ip) {
  const parts = String(ip || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function longToIp(long) {
  return [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join('.');
}

function allocateIp(start, end, usedIps) {
  const from = ipToLong(start);
  const to = ipToLong(end);
  if (from === null || to === null || from > to) return null;

  for (let current = from; current <= to; current += 1) {
    const candidate = longToIp(current);
    if (!usedIps.has(candidate)) return candidate;
  }
  return null;
}

/* --------------------------------------------- LEGACY CONTAINER ROUTES -- */
async function getAssignedContainersFallback(userId) {
  const assignments = await all(`
    SELECT ca.*, pc.url, pc.api_token, pc.name as cluster_name
    FROM container_assignments ca
    JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
    WHERE ca.assigned_to_type = 'user' AND ca.assigned_to_id = ?
  `, [userId]);

  const containers = [];
  for (const assignment of assignments) {
    try {
      const apiToken = decrypt(assignment.api_token);
      const allContainers = await getAllContainers(assignment.url, apiToken);
      const container = allContainers.find(item => String(item.vmid) === String(assignment.container_id));

      if (container) {
        const ips = await getContainerIps(assignment.url, apiToken, container.node, container.type, container.vmid);
        containers.push({
          id: container.vmid,
          name: container.name,
          containerId: String(container.vmid),
          type: container.type,
          status: container.status,
          node: container.node,
          cpu: container.cpu || 0,
          maxcpu: container.maxcpu || 0,
          mem: container.mem || 0,
          maxmem: container.maxmem || 0,
          disk: container.disk || 0,
          maxdisk: container.maxdisk || 0,
          ips,
          clusterId: assignment.cluster_id,
          clusterName: assignment.cluster_name,
          webUrl: ''
        });
      }
    } catch (error) {
      console.error(`Error fetching container ${assignment.container_id}:`, error.message);
    }
  }
  return containers;
}

router.get('/containers', async (req, res, next) => {
  try {
    const rows = await getResourceRowsForUser(req.user.id);
    if (rows.length > 0) {
      const resources = (await enrichResources(rows)).map(resource => ({ ...resource, adminUrl: '' }));
      res.json({ containers: resources });
      return;
    }
    const containers = await getAssignedContainersFallback(req.user.id);
    res.json({ containers });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------- PASSWORD ---- */
router.post('/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current and new password required', HTTP_STATUS.BAD_REQUEST);
    }
    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const passwordMatch = await bcryptjs.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      throw new AppError('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED);
    }

    const newPasswordHash = await bcryptjs.hash(newPassword, 12);
    await run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newPasswordHash, req.user.id]);

    await logAudit(req, 'password.change', `user:${req.user.id}`);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
