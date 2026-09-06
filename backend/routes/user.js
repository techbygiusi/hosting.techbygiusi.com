const express = require('express');
const net = require('net');
const bcryptjs = require('bcryptjs');
const router = express.Router();
const { registerIdParams } = require('../middleware/validate');
registerIdParams(router);

const { get, run, all } = require('../config/database');
const { HTTP_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');
const {
  getAllContainers,
  getResourceRrdData,
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
const { createConsoleSession, testSshConnection } = require('../services/consoleService');
const { logAudit } = require('../services/auditService');
const { buildPangolinResourceName } = require('../utils/pangolinResourceName');
const {
  getPangolinConfig,
  publicConfig: getPublicPangolinConfig,
  createPublication,
  updatePublication,
  deletePublication
} = require('../services/pangolinService');
const { ensureClusterTemplates, syncClusterTemplates } = require('../services/templateService');
const { createJob, getJob: getProvisioningJob, listJobsForUser } = require('../services/provisioningJobService');
const { buildAvatarUrl, saveAvatarForUser, deleteAvatarForUser } = require('../services/avatarService');
const { generateToken } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const { testMailTemplate } = require('../services/emailTemplates');
const { getBillingSummary, deleteBillingHistoryIfZeroCost } = require('../services/billingService');

/* ------------------------------------------------------------ ACCESS ---- */
/**
 * A user can access a resource if they own it (user_id) OR are a member of
 * the group the resource is shared with (group_id).
 */
const ACCESS_FILTER = `(
  r.user_id = ?
  OR (r.group_id IS NOT NULL AND r.group_id IN (SELECT group_id FROM user_groups WHERE user_id = ?))
)`;

function normalizeManualIpv4(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (net.isIP(normalized) !== 4) {
    throw new AppError('The service IP must be a valid IPv4 address', HTTP_STATUS.BAD_REQUEST);
  }
  return normalized;
}

function normalizeSshPort(value) {
  const port = value === '' || value === null || value === undefined ? 22 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError('The SSH port must be between 1 and 65535', HTTP_STATUS.BAD_REQUEST);
  }
  return port;
}


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
    LEFT JOIN users u ON r.user_id = u.id
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
    name: row.name || live.name,
    status: live.status || 'unknown'
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
    value = { readOnly: true, canPower: false, canConsole: false, canProvision: false, canClone: false, canManageFirewall: false, canVerifyFirewall: false, privileges: [] };
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
    adminUrl: credentialUrls[String(resource.id)] || resource.adminUrl || ''
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
    const pangolinPublicUrl = primaryHttpPublication?.publicUrl || '';
    const manualPublicUrl = resource.manualPublicUrl || '';
    const adminPublicUrl = resource.source === 'admin' ? (resource.publicUrl || resource.webUrl || '') : '';
    return {
      ...resource,
      publications,
      publication: publications[0] || null,
      publicationCount: publications.length,
      pangolinPublicUrl,
      manualPublicUrl,
      adminPublicUrl,
      publicUrl: adminPublicUrl || pangolinPublicUrl || manualPublicUrl,
      webUrl: adminPublicUrl || pangolinPublicUrl || manualPublicUrl
    };
  });
}

async function getOwnedPublishableResource(userId, resourceId, { requireClusterPublishing = false } = {}) {
  const rows = await getResourceRowsForUser(userId, resourceId);
  if (rows.length === 0 || String(rows[0].user_id) !== String(userId)) {
    throw new AppError('Only the assigned user can manage publishing for this service', HTTP_STATUS.FORBIDDEN);
  }
  if (!rows[0].provisioned_id) {
    throw new AppError('Administrator-provided service URLs are read-only', HTTP_STATUS.FORBIDDEN);
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


function serializeProfileUser(user, groups) {
  if (!user) return null;
  const profile = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLanguage: user.preferred_language || 'en',
    preferredTheme: user.preferred_theme || 'light',
    avatarUrl: buildAvatarUrl(user),
    avatarUpdatedAt: user.avatar_updated_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
  if (groups !== undefined) profile.groups = groups;
  return profile;
}

/* ----------------------------------------------------------- PROFILE ---- */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await get(
      'SELECT id, email, name, role, preferred_language, preferred_theme, avatar_mime, avatar_data, avatar_updated_at, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    const groups = await all(`
      SELECT cg.id, cg.name FROM customer_groups cg
      JOIN user_groups ug ON ug.group_id = cg.id
      WHERE ug.user_id = ?
    `, [req.user.id]);

    res.json({ user: serializeProfileUser(user, groups) });
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
      'SELECT id, email, name, role, preferred_language, preferred_theme, avatar_mime, avatar_data, avatar_updated_at, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user: serializeProfileUser(user) });
  } catch (err) {
    next(err);
  }
});


/* ----------------------------------------------------------- AVATAR ---- */
router.put('/avatar', async (req, res, next) => {
  try {
    const avatar = await saveAvatarForUser(req.user.id, req.body?.avatar);
    await logAudit(req, 'profile.avatar.update', `user:${req.user.id}`);
    res.json(avatar);
  } catch (err) {
    next(err);
  }
});

router.delete('/avatar', async (req, res, next) => {
  try {
    const avatar = await deleteAvatarForUser(req.user.id);
    await logAudit(req, 'profile.avatar.delete', `user:${req.user.id}`);
    res.json(avatar);
  } catch (err) {
    next(err);
  }
});



/* ------------------------------------------------------------ EMAIL ---- */
router.put('/email', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    if (!validEmail) {
      throw new AppError('Invalid email address', HTTP_STATUS.BAD_REQUEST);
    }

    const currentUser = await get('SELECT id, email, role FROM users WHERE id = ?', [req.user.id]);
    if (!currentUser) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const duplicate = await get(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?',
      [email, req.user.id]
    );
    if (duplicate) {
      throw new AppError('User with this email already exists', HTTP_STATUS.CONFLICT);
    }

    if (String(currentUser.email || '').toLowerCase() !== email) {
      await run(
        'UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [email, req.user.id]
      );
      await logAudit(req, 'profile.email.update', `user:${req.user.id}`, `${currentUser.email} -> ${email}`);
    }

    // Issue a fresh session token so the JWT carries the new e-mail address too.
    const token = generateToken(currentUser.id, email, currentUser.role);
    res.json({ email, token });
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


/* ----------------------------------------------------------- THEME ---- */
router.put('/theme', async (req, res, next) => {
  try {
    const theme = String(req.body?.theme || '').trim().toLowerCase();
    if (!['light', 'dark'].includes(theme)) {
      throw new AppError('Unsupported theme', HTTP_STATUS.BAD_REQUEST);
    }

    await run(
      'UPDATE users SET preferred_theme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [theme, req.user.id]
    );

    res.json({ preferredTheme: theme });
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


router.post('/notifications/send-test-mail', async (req, res, next) => {
  try {
    const user = await get(
      'SELECT email, name, preferred_language, preferred_theme FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    const template = testMailTemplate({
      name: user.name || user.email,
      language: user.preferred_language || 'en',
      theme: user.preferred_theme || 'light'
    });
    const result = await sendEmail(user.email, template.subject, template.text, template.html);
    if (!result.success) {
      throw new AppError(result.message || 'Email service not configured', HTTP_STATUS.BAD_REQUEST);
    }

    await logAudit(req, 'user.test_mail_sent', user.email);
    res.json({ success: true, message: 'Test email sent', to: user.email });
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

    const publishingConfigs = Object.fromEntries(await Promise.all(clusterIds.map(async (clusterId) => [String(clusterId), await getPangolinConfig(clusterId)])));
    res.json({
      resources: resources.map(resource => {
        const ownsResource = String(resource.userId) === String(req.user.id);
        const clusterPublishingEnabled = resource.clusterPublishingEnabled !== false;
        const publishingConfig = publishingConfigs[String(resource.clusterId)] || { enabled: false };
        const pangolinAvailable = !!publishingConfig.enabled && clusterPublishingEnabled;
        const adminManaged = resource.source === 'admin';
        const canPublish = !adminManaged && ownsResource && !!resource.primaryIp && pangolinAvailable;
        const canManageManualPublicPage = !adminManaged && ownsResource && !pangolinAvailable;
        const effectivePublicUrl = adminManaged
          ? (resource.adminPublicUrl || resource.publicUrl || resource.webUrl || '')
          : (pangolinAvailable
            ? (resource.pangolinPublicUrl || '')
            : (resource.manualPublicUrl || resource.pangolinPublicUrl || ''));
        return {
          ...resource,
          publicUrl: effectivePublicUrl,
          webUrl: effectivePublicUrl,
          publicAccessMode: adminManaged ? 'admin' : (pangolinAvailable ? 'pangolin' : 'manual'),
          adminManaged,
          canManageManualPublicPage,
          canManageServiceIp: !adminManaged && ownsResource && !!resource.canConfigureManualIp,
          canManagePublicPage: !adminManaged && ownsResource,
          canManageCredentials: !adminManaged && ownsResource && !!resource.isSelfService,
          canPublish,
          publishingClusterEnabled: clusterPublishingEnabled,
          canDelete: !!resource.isSelfService && ownsResource && !!capsByCluster[resource.clusterId]?.canProvision,
          // Power remains cluster-token based. Console access uses VM.Console
          // for the traditional Proxmox serial console, while a manually configured
          // service IP enables the backend SSH relay independently of that permission.
          consoleMode: resource.canConfigureManualIp && resource.manualIp ? 'ssh' : 'proxmox',
          capabilities: {
            ...(capsByCluster[resource.clusterId] || { readOnly: true }),
            canConsole: !!(resource.canConfigureManualIp && resource.manualIp) || !!capsByCluster[resource.clusterId]?.canConsole
          }
        };
      })
    });
  } catch (err) {
    next(err);
  }
});


router.get('/resource-metrics', async (req, res, next) => {
  try {
    const allowedTimeframes = new Set(['hour', 'day', 'week', 'month', 'year']);
    const timeframe = allowedTimeframes.has(String(req.query.timeframe || 'hour'))
      ? String(req.query.timeframe || 'hour')
      : 'hour';
    const rows = await getResourceRowsForUser(req.user.id);
    const clusterCache = new Map();

    for (const row of rows) {
      const key = String(row.cluster_id);
      if (clusterCache.has(key)) continue;
      const apiToken = decrypt(row.api_token);
      try {
        const liveResources = await getAllContainers(row.cluster_url, apiToken);
        clusterCache.set(key, { apiToken, liveResources });
      } catch (_) {
        clusterCache.set(key, { apiToken, liveResources: [] });
      }
    }

    const entries = await Promise.all(rows.map(async (row) => {
      const cluster = clusterCache.get(String(row.cluster_id));
      const live = cluster?.liveResources?.find((item) => String(item.vmid) === String(row.container_id));
      if (!cluster || !live) return [String(row.id), { points: [] }];

      try {
        const points = await getResourceRrdData(
          row.cluster_url,
          cluster.apiToken,
          live.node,
          live.type,
          live.vmid,
          timeframe
        );
        return [String(row.id), { points }];
      } catch (_) {
        const cpuRaw = Number(live.cpu || 0);
        const cpuPercent = Math.min(Math.max(cpuRaw <= 1 ? cpuRaw * 100 : cpuRaw, 0), 100);
        const memoryPercent = Number(live.maxmem || 0) > 0
          ? Math.min(Math.max((Number(live.mem || 0) / Number(live.maxmem)) * 100, 0), 100)
          : 0;
        return [String(row.id), {
          points: [{ time: Math.floor(Date.now() / 1000), cpuPercent, memoryPercent }]
        }];
      }
    }));

    res.json({ timeframe, metrics: Object.fromEntries(entries) });
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
    const publishingConfig = await getPangolinConfig(rows[0].cluster_id);
    const resource = resources[0];
    const ownsResource = String(resource.userId) === String(req.user.id);
    const selfCreatedOwner = !!rows[0].provisioned_id && String(rows[0].provisioned_user_id || '') === String(req.user.id);
    const adminManaged = resource.source === 'admin' || !selfCreatedOwner;
    const clusterPublishingEnabled = resource.clusterPublishingEnabled !== false;
    const pangolinAvailable = !!publishingConfig.enabled && clusterPublishingEnabled;
    const canPublish = !adminManaged && ownsResource && !!resource.primaryIp && pangolinAvailable;
    const canManageManualPublicPage = !adminManaged && ownsResource && !pangolinAvailable;
    const effectivePublicUrl = adminManaged
      ? (resource.adminPublicUrl || resource.publicUrl || resource.webUrl || '')
      : (pangolinAvailable
        ? (resource.pangolinPublicUrl || '')
        : (resource.manualPublicUrl || resource.pangolinPublicUrl || ''));
    res.json({
      resource: {
        ...resource,
        publicUrl: effectivePublicUrl,
        webUrl: effectivePublicUrl,
        publicAccessMode: adminManaged ? 'admin' : (pangolinAvailable ? 'pangolin' : 'manual'),
        adminManaged,
        canManageManualPublicPage,
        canManageServiceIp: !adminManaged && ownsResource && !!resource.canConfigureManualIp,
        canManagePublicPage: !adminManaged && ownsResource,
        canManageCredentials: selfCreatedOwner && !adminManaged,
        canPublish,
        publishingClusterEnabled: clusterPublishingEnabled,
        canDelete: !!resource.canDelete && selfCreatedOwner && !!caps.canProvision,
        consoleMode: resource.canConfigureManualIp && resource.manualIp ? 'ssh' : 'proxmox',
        capabilities: { ...caps, canConsole: !!(resource.canConfigureManualIp && resource.manualIp) || !!caps.canConsole }
      }
    });
  } catch (err) {
    next(err);
  }
});


router.get('/publishing/options', async (req, res, next) => {
  try {
    let clusterEnabled = true;
    let clusterId = null;

    if (req.query.resourceId) {
      const rows = await getResourceRowsForUser(req.user.id, req.query.resourceId);
      if (rows.length === 0 || String(rows[0].user_id) !== String(req.user.id)) {
        throw new AppError('Only the assigned user can manage publishing for this service', HTTP_STATUS.FORBIDDEN);
      }
      clusterEnabled = Number(rows[0].allow_publishing ?? 1) === 1;
      clusterId = rows[0].cluster_id;
    }

    const config = await getPangolinConfig(clusterId);
    const visible = getPublicPangolinConfig(config);

    res.json({
      publishing: {
        enabled: visible.enabled && clusterEnabled,
        globalEnabled: visible.enabled,
        clusterEnabled,
        manualLinkEnabled: !visible.enabled || !clusterEnabled,
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

async function assertPublicationSlotAvailable(input, publicationId = null, clusterId = null) {
  const clusterFilter = clusterId ? 'AND r.cluster_id = ?' : '';
  if (input.protocol === 'http') {
    const params = [input.subdomain, publicationId, publicationId];
    if (clusterId) params.push(clusterId);
    const collision = await get(
      `SELECT rp.id
       FROM resource_publications rp
       JOIN resources r ON r.id = rp.resource_id
       WHERE rp.protocol = 'http'
         AND rp.subdomain = ?
         AND (? IS NULL OR rp.id != ?)
         ${clusterFilter}`,
      params
    );
    if (collision) throw new AppError('This subdomain is already in use on this cluster', HTTP_STATUS.CONFLICT);
    return;
  }

  const params = [input.protocol, input.publicPort, publicationId, publicationId];
  if (clusterId) params.push(clusterId);
  const collision = await get(
    `SELECT rp.id
     FROM resource_publications rp
     JOIN resources r ON r.id = rp.resource_id
     WHERE rp.protocol = ?
       AND rp.public_port = ?
       AND (? IS NULL OR rp.id != ?)
       ${clusterFilter}`,
    params
  );
  if (collision) {
    throw new AppError(`This ${input.protocol.toUpperCase()} public port is already in use on this cluster`, HTTP_STATUS.CONFLICT);
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
  await assertPublicationSlotAvailable(input, null, resource.clusterId);
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
  await assertPublicationSlotAvailable(input, existing.id, resource.clusterId);
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
  const config = await getPangolinConfig(resource.clusterId);
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
  if (!rows[0].provisioned_id) {
    throw new AppError('Administrator-provided service URLs are read-only', HTTP_STATUS.FORBIDDEN);
  }
  const enriched = await attachPublications(await enrichResources(rows));
  return enriched[0];
}

router.get('/resources/:id/publications', async (req, res, next) => {
  try {
    const resource = await getOwnedResourceWithoutIpRequirement(req.user.id, req.params.id);
    res.json({ publications: resource.publications || [], primaryIp: resource.primaryIp || '', manualPublicUrl: resource.manualPublicUrl || '' });
  } catch (err) {
    next(err);
  }
});

router.post('/resources/:id/publications', async (req, res, next) => {
  try {
    const resource = await getOwnedPublishableResource(req.user.id, req.params.id, { requireClusterPublishing: true });
    const config = await getPangolinConfig(resource.clusterId);
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
    const config = await getPangolinConfig(resource.clusterId);
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
    res.json({ publication: resource.publications?.[0] || null, publications: resource.publications || [], primaryIp: resource.primaryIp || '', manualPublicUrl: resource.manualPublicUrl || '' });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/publication', async (req, res, next) => {
  try {
    const resource = await getOwnedPublishableResource(req.user.id, req.params.id, { requireClusterPublishing: true });
    const config = await getPangolinConfig(resource.clusterId);
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

function normalizeManualPublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new AppError('Public page URL is required', HTTP_STATUS.BAD_REQUEST);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new AppError('Public page URL must be a valid http:// or https:// URL', HTTP_STATUS.BAD_REQUEST);
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new AppError('Public page URL must be a valid http:// or https:// URL', HTTP_STATUS.BAD_REQUEST);
  }
  if (parsed.username || parsed.password) {
    throw new AppError('Public page URL must not contain login credentials', HTTP_STATUS.BAD_REQUEST);
  }
  return parsed.toString();
}


function normalizeManagementPageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new AppError('Management page URL is required', HTTP_STATUS.BAD_REQUEST);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new AppError('Management page URL must be a valid http:// or https:// URL', HTTP_STATUS.BAD_REQUEST);
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new AppError('Management page URL must be a valid http:// or https:// URL', HTTP_STATUS.BAD_REQUEST);
  }
  if (parsed.username || parsed.password) {
    throw new AppError('Management page URL must not contain login credentials', HTTP_STATUS.BAD_REQUEST);
  }
  return parsed.toString();
}

async function getOwnedManualPublicPageResource(userId, resourceId) {
  const rows = await getResourceRowsForUser(userId, resourceId);
  if (rows.length === 0 || String(rows[0].user_id) !== String(userId)) {
    throw new AppError('Only the assigned user can manage the public page for this service', HTTP_STATUS.FORBIDDEN);
  }
  if (!rows[0].provisioned_id) {
    throw new AppError('Administrator-provided service URLs are read-only', HTTP_STATUS.FORBIDDEN);
  }
  const publishingConfig = await getPangolinConfig(rows[0].cluster_id);
  const clusterPublishingEnabled = Number(rows[0].allow_publishing ?? 1) === 1;
  if (publishingConfig.enabled && clusterPublishingEnabled) {
    throw new AppError('Manual public page links are only available when Pangolin publishing is disabled', HTTP_STATUS.FORBIDDEN);
  }
  return rows[0];
}

router.put('/resources/:id/public-page', async (req, res, next) => {
  try {
    const resource = await getOwnedManualPublicPageResource(req.user.id, req.params.id);
    const publicUrl = normalizeManualPublicUrl(req.body?.url);
    await run(
      'UPDATE resources SET manual_public_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [publicUrl, resource.id]
    );
    await logAudit(req, 'resource.public-page.save', `resource:${resource.id}`, publicUrl);
    res.json({ message: 'Public page saved', publicUrl });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id/public-page', async (req, res, next) => {
  try {
    const resource = await getOwnedManualPublicPageResource(req.user.id, req.params.id);
    await run(
      "UPDATE resources SET manual_public_url = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [resource.id]
    );
    await logAudit(req, 'resource.public-page.remove', `resource:${resource.id}`);
    res.json({ message: 'Public page removed' });
  } catch (err) {
    next(err);
  }
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
      const publishingConfig = await getPangolinConfig(row.cluster_id);
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
    await deleteBillingHistoryIfZeroCost(req.params.id);

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

/* ------------------------------------------------------ SERVICE IP ---- */
router.put('/resources/:id/service-ip', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    if (String(target.row.user_id) !== String(req.user.id)) {
      throw new AppError('Only the assigned user can manage the service IP', HTTP_STATUS.FORBIDDEN);
    }
    if (!target.row.provisioned_id) {
      throw new AppError('Administrator-provided service IP and SSH settings are read-only', HTTP_STATUS.FORBIDDEN);
    }
    if (String(target.type || '').toLowerCase() !== 'qemu') {
      throw new AppError('Manual service IPs are only available for supported QEMU VMs', HTTP_STATUS.BAD_REQUEST);
    }

    const manualIp = normalizeManualIpv4(req.body?.ip);
    const sshPort = normalizeSshPort(req.body?.sshPort);
    await run(
      'UPDATE resources SET manual_ip = ?, ssh_port = ?, resource_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [manualIp || null, sshPort, 'qemu', req.params.id]
    );

    await logAudit(
      req,
      manualIp ? 'resource.service_ip.update' : 'resource.service_ip.clear',
      `resource:${req.params.id}`,
      manualIp ? `${manualIp}:${sshPort}` : target.row.name || `VMID ${target.row.container_id}`
    );

    res.json({ manualIp, sshPort, message: manualIp ? 'Service IP saved' : 'Service IP removed' });
  } catch (err) {
    next(err);
  }
});

async function getSshConsoleCredential(resourceId) {
  const credential = await get(
    `SELECT id, label, username, secret_encrypted, COALESCE(is_ssh_console, 0) AS is_ssh_console
     FROM resource_credentials
     WHERE resource_id = ?
       AND COALESCE(purpose, 'general') != 'management'
       AND TRIM(COALESCE(username, '')) != ''
       AND secret_encrypted IS NOT NULL
     ORDER BY
       CASE WHEN COALESCE(is_ssh_console, 0) = 1 THEN 0 ELSE 1 END,
       CASE WHEN LOWER(COALESCE(label, '')) LIKE '%ssh%' OR LOWER(COALESCE(label, '')) LIKE '%console%' THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(username, ''))) = 'root' THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [resourceId]
  );

  if (!credential) return null;
  const password = decrypt(credential.secret_encrypted);
  if (!password) return null;
  return { username: String(credential.username || '').trim(), password };
}

/* ----------------------------------------------------------- CONSOLE ---- */
router.get('/resources/:id/console-readiness', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    const running = String(target.status || '').toLowerCase() === 'running';
    const manualIpEligible = !target.row.provisioned_id && String(target.type || '').toLowerCase() === 'qemu';
    const manualIp = manualIpEligible ? normalizeManualIpv4(target.row.manual_ip || '') : '';
    const mode = manualIp ? 'ssh' : 'proxmox';

    if (!running) {
      return res.json({ ready: false, powerReady: false, mode, phase: 'power' });
    }

    if (!manualIp) {
      return res.json({ ready: true, powerReady: true, mode, phase: 'ready' });
    }

    const sshCredential = await getSshConsoleCredential(req.params.id);
    if (!sshCredential) {
      return res.json({ ready: false, powerReady: true, mode, phase: 'credentials' });
    }

    const sshPort = normalizeSshPort(target.row.ssh_port);
    const probe = await testSshConnection({
      host: manualIp,
      port: sshPort,
      username: sshCredential.username,
      password: sshCredential.password,
      timeout: 5500
    });

    return res.json({
      ready: !!probe.ready,
      powerReady: true,
      mode,
      phase: probe.ready ? 'ready' : 'ssh'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resources/:id/console', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    const languageRow = await get('SELECT preferred_language FROM users WHERE id = ?', [req.user.id]);
    const language = languageRow?.preferred_language === 'de' ? 'de' : 'en';
    const manualIpEligible = !target.row.provisioned_id && String(target.type || '').toLowerCase() === 'qemu';
    const manualIp = manualIpEligible ? normalizeManualIpv4(target.row.manual_ip || '') : '';

    if (manualIp) {
      const sshCredential = await getSshConsoleCredential(req.params.id);
      if (!sshCredential) {
        throw new AppError(
          'Add SSH credentials with a username and password in the Credentials tab before opening the IP console',
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const sshPort = normalizeSshPort(target.row.ssh_port);
      const sessionToken = createConsoleSession({
        mode: 'ssh',
        host: manualIp,
        sshPort,
        username: sshCredential.username,
        password: sshCredential.password,
        language
      });

      await logAudit(req, 'console.open.ssh', `resource:${req.params.id}`, `${target.name} (${manualIp}:${sshPort})`);
      return res.json({
        mode: 'ssh',
        sessionToken,
        wsPath: `/api/console/ws?token=${sessionToken}`,
        target: `${manualIp}:${sshPort}`,
        canPasteUserPassword: true
      });
    }

    const caps = await getClusterCapabilities(target.row.cluster_id, target.clusterUrl, target.apiToken);
    if (!caps.canConsole) {
      throw new AppError('Console access is not permitted for this cluster token', HTTP_STATUS.FORBIDDEN);
    }

    const term = await createTermProxy(target.clusterUrl, target.apiToken, target.node, target.type, target.vmid);
    const autoLogin = target.type === 'lxc' ? await getRootConsoleCredential(req.params.id) : null;
    const sessionToken = createConsoleSession({
      mode: 'proxmox',
      clusterUrl: target.clusterUrl,
      apiToken: target.apiToken,
      node: target.node,
      type: target.type,
      vmid: target.vmid,
      port: term.port,
      ticket: term.ticket,
      language,
      pastePassword: autoLogin?.secret || ''
    });

    await logAudit(req, 'console.open', `resource:${req.params.id}`, `${target.name} (VMID ${target.vmid})`);

    res.json({
      mode: 'proxmox',
      sessionToken,
      user: term.user,
      ticket: term.ticket,
      wsPath: `/api/console/ws?token=${sessionToken}`,
      autoLogin,
      canPasteUserPassword: !!autoLogin?.secret
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

async function assertSelfCreatedResourceOwner(userId, resourceId) {
  const resource = await assertResourceAccess(userId, resourceId);
  if (!resource.provisioned_id || String(resource.provisioned_user_id || '') !== String(userId)) {
    throw new AppError('Only the creator of a self-service resource can change its access settings', HTTP_STATUS.FORBIDDEN);
  }
  return resource;
}

async function getManagementPageRecord(resourceId) {
  return get(
    `SELECT id, label, username, url, notes, created_by_role, created_at, updated_at,
            CASE WHEN secret_encrypted IS NOT NULL AND secret_encrypted != '' THEN 1 ELSE 0 END AS has_secret
     FROM resource_credentials
     WHERE resource_id = ? AND COALESCE(purpose, 'general') = 'management'
     ORDER BY id DESC
     LIMIT 1`,
    [resourceId]
  );
}

router.get('/resources/:id/management-page', async (req, res, next) => {
  try {
    const resource = await assertResourceAccess(req.user.id, req.params.id);
    const credential = await getManagementPageRecord(req.params.id);
    res.json({
      managementPage: {
        id: credential?.id || null,
        url: credential?.url || resource.admin_url || '',
        username: credential?.username || '',
        notes: credential?.notes || '',
        hasSecret: !!credential?.has_secret,
        fromAdmin: credential?.created_by_role === 'admin'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/management-page', async (req, res, next) => {
  try {
    const resource = await assertSelfCreatedResourceOwner(req.user.id, req.params.id);
    const url = normalizeManagementPageUrl(req.body?.url);
    const username = String(req.body?.username || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const secretProvided = req.body?.secret !== undefined && String(req.body.secret) !== '';
    const existing = await getManagementPageRecord(req.params.id);

    if (existing?.created_by_role === 'admin') {
      throw new AppError('Administrator-provided management access is read-only', HTTP_STATUS.FORBIDDEN);
    }

    if (existing) {
      const encryptedSecret = secretProvided
        ? encrypt(String(req.body.secret))
        : (await get('SELECT secret_encrypted FROM resource_credentials WHERE id = ?', [existing.id]))?.secret_encrypted;
      await run(
        `UPDATE resource_credentials
         SET label = ?, username = ?, secret_encrypted = ?, url = ?, notes = ?, purpose = 'management', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND resource_id = ?`,
        ['Management page', username, encryptedSecret || null, url, notes, existing.id, resource.id]
      );
    } else {
      await run(
        `INSERT INTO resource_credentials
         (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role, purpose)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 'management')`,
        [resource.id, 'Management page', username, secretProvided ? encrypt(String(req.body.secret)) : null, url, notes, req.user.id]
      );
    }

    await run('UPDATE resources SET admin_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [url, resource.id]);
    await logAudit(req, 'resource.management-page.save', `resource:${resource.id}`, url);
    const saved = await getManagementPageRecord(resource.id);
    res.json({
      message: 'Management page saved',
      managementPage: {
        id: saved?.id || null,
        url,
        username,
        notes,
        hasSecret: !!saved?.has_secret,
        fromAdmin: saved?.created_by_role === 'admin'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id/management-page', async (req, res, next) => {
  try {
    const resource = await assertSelfCreatedResourceOwner(req.user.id, req.params.id);
    const existing = await getManagementPageRecord(req.params.id);
    if (existing?.created_by_role === 'admin') {
      throw new AppError('Administrator-provided management access is read-only', HTTP_STATUS.FORBIDDEN);
    }
    await run("DELETE FROM resource_credentials WHERE resource_id = ? AND COALESCE(purpose, 'general') = 'management'", [resource.id]);
    await run("UPDATE resources SET admin_url = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [resource.id]);
    await logAudit(req, 'resource.management-page.remove', `resource:${resource.id}`);
    res.json({ message: 'Management page removed' });
  } catch (err) {
    next(err);
  }
});


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
    const resource = await assertResourceAccess(req.user.id, req.params.id);
    const selfCreatedOwner = !!resource.provisioned_id && String(resource.provisioned_user_id || '') === String(req.user.id);
    const rows = await all(
      `SELECT id, label, username, url, notes, created_by_role, COALESCE(purpose, 'general') AS purpose,
              COALESCE(is_ssh_console, 0) AS is_ssh_console, created_at, updated_at
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
        canManage: selfCreatedOwner && row.created_by_role !== 'admin',
        useForSshConsole: Number(row.is_ssh_console || 0) === 1
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
    const resource = await assertSelfCreatedResourceOwner(req.user.id, req.params.id);
    const { label, username, secret, url, notes, purpose: requestedPurpose, useForSshConsole } = req.body;
    const purpose = requestedPurpose === 'management' ? 'management' : 'general';
    const sshConsole = purpose === 'general' && useForSshConsole === true ? 1 : 0;
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

    if (sshConsole) {
      if (!String(username || '').trim() || !String(secret || '')) {
        throw new AppError('SSH console credentials require a username and password', HTTP_STATUS.BAD_REQUEST);
      }
      await run('UPDATE resource_credentials SET is_ssh_console = 0 WHERE resource_id = ?', [req.params.id]);
    }

    const result = await run(
      'INSERT INTO resource_credentials (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role, purpose, is_ssh_console) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, nextLabel, String(username || '').trim(), encrypt(secret || ''), nextUrl, String(notes || '').trim(), req.user.id, 'user', purpose, sshConsole]
    );

    await logAudit(req, 'credential.create', `resource:${req.params.id}`, nextLabel);
    res.status(HTTP_STATUS.CREATED).json({ id: result.lastID, message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    const resource = await assertSelfCreatedResourceOwner(req.user.id, req.params.id);
    const { label, username, secret, url, notes, purpose: requestedPurpose, useForSshConsole } = req.body;
    const cred = await get(
      'SELECT * FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    // Management-page credentials are shared between admin and authorized users.
    // Other admin-provided credentials stay read-only for users.
    if (cred.created_by_role === 'admin') {
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
    const nextUsername = String(username ?? cred.username ?? '').trim();
    const sshConsole = purpose === 'general' && useForSshConsole === true ? 1 : 0;

    if (sshConsole) {
      if (!nextUsername || !nextSecret) {
        throw new AppError('SSH console credentials require a username and password', HTTP_STATUS.BAD_REQUEST);
      }
      await run('UPDATE resource_credentials SET is_ssh_console = 0 WHERE resource_id = ? AND id != ?', [req.params.id, req.params.credId]);
    }

    await run(
      'UPDATE resource_credentials SET label = ?, username = ?, secret_encrypted = ?, url = ?, notes = ?, purpose = ?, is_ssh_console = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextLabel, nextUsername, nextSecret, String(url ?? cred.url ?? '').trim(), String(notes ?? cred.notes ?? '').trim(), purpose, sshConsole, req.params.credId]
    );

    await logAudit(req, 'credential.update', `resource:${req.params.id}`, nextLabel);
    res.json({ message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    const resource = await assertSelfCreatedResourceOwner(req.user.id, req.params.id);
    const cred = await get(
      'SELECT id, label, created_by_role FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    if (cred.created_by_role === 'admin') {
      throw new AppError('Admin-provided credentials cannot be deleted', HTTP_STATUS.FORBIDDEN);
    }

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
    const clusters = await all("SELECT * FROM proxmox_clusters WHERE allow_provisioning = 1");
    const options = [];
    for (const cluster of clusters) {
      const apiToken = decrypt(cluster.api_token);
      let caps = {};
      let unavailableReason = '';
      try {
        caps = await getClusterCapabilities(cluster.id, cluster.url, apiToken);
      } catch (_) {
        unavailableReason = 'Proxmox API capabilities could not be verified';
      }

      if (!unavailableReason && (!caps.canProvision || !caps.canManageFirewall || !caps.canVerifyFirewall)) {
        unavailableReason = 'The Proxmox API token is missing required self-service permissions';
      }
      if (!unavailableReason && (cluster.vmid_min === null || cluster.vmid_max === null)) {
        unavailableReason = 'Self-service VMID limits are not configured';
      }

      let firewallEnabled = false;
      if (!unavailableReason) {
        try {
          firewallEnabled = !!(await getClusterFirewallStatus(cluster.url, apiToken)).enabled;
          if (!firewallEnabled) unavailableReason = 'Proxmox datacenter firewall is disabled';
        } catch (_) {
          unavailableReason = 'Proxmox datacenter firewall status could not be verified';
        }
      }

      let profiles = [];
      if (!unavailableReason || caps.canProvision) {
        try { profiles = await syncClusterTemplates(cluster.id); }
        catch (_) {
          try { profiles = await ensureClusterTemplates(cluster.id); }
          catch (_) { profiles = []; }
        }
      }

      const maxDiskGb = Math.min(cluster.max_disk_gb || 20, 64);
      const templates = profiles
        .filter(item => Number(item.enabled) === 1 && Number(item.present) === 1)
        .filter(item => item.sourceType !== 'lxc-template' || caps.canClone)
        .filter(item => Math.max(Number(item.minDiskGb) || 4, 4) <= maxDiskGb)
        .map(item => ({
          id: item.id, volid: item.volid, name: item.displayName, displayName: item.displayName,
          osFamily: item.osFamily, osVersion: item.osVersion,
          description: item.description || '', sourceType: item.sourceType || 'archive',
          minDiskGb: Math.max(Number(item.minDiskGb) || 4, 4)
        }));
      if (!unavailableReason && templates.length === 0) unavailableReason = 'No approved container template is currently available';

      options.push({
        clusterId: cluster.id, clusterName: cluster.name, allowTypes: 'ct',
        available: !unavailableReason && firewallEnabled && templates.length > 0, unavailableReason,
        hasDefaultPassword: !!cluster.default_password_encrypted,
        maxCores: cluster.max_cores || 2, maxMemoryMb: cluster.max_memory_mb || 2048,
        maxDiskGb, templates
      });
    }
    res.json({ clusters: options, options });
  } catch (err) { next(err); }
});

router.get('/provisioning/jobs', async (req, res, next) => {
  try { res.json({ jobs: await listJobsForUser(req.user.id, Math.min(Number(req.query.limit) || 20, 50)) }); }
  catch (err) { next(err); }
});

router.get('/provisioning/jobs/:id', async (req, res, next) => {
  try {
    const job = await getProvisioningJob(req.params.id, req.user.id);
    if (!job) throw new AppError('Provisioning job not found', HTTP_STATUS.NOT_FOUND);
    res.json({ job });
  } catch (err) { next(err); }
});

router.post('/provisioning/create', async (req, res, next) => {
  try {
    const { clusterId, templateProfileId, hostname, cores, memoryMb, diskGb, rootPassword } = req.body;
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ? AND allow_provisioning = 1', [clusterId]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    const cleanHostname = String(hostname || '').trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(cleanHostname)) throw new AppError('Hostname is invalid', HTTP_STATUS.BAD_REQUEST);
    const profile = await get('SELECT * FROM template_profiles WHERE id = ? AND cluster_id = ? AND enabled = 1 AND present = 1', [templateProfileId, cluster.id]);
    if (!profile) throw new AppError('Template is not allowed', HTTP_STATUS.BAD_REQUEST);
    let password = rootPassword;
    if (!password && cluster.default_password_encrypted) password = decrypt(cluster.default_password_encrypted);
    if (!password || String(password).length < 8) throw new AppError('Root password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST);
    const safeCores = Math.min(Math.max(parseInt(cores, 10) || 1, 1), cluster.max_cores || 2);
    const safeMemory = Math.min(Math.max(parseInt(memoryMb, 10) || 512, 256), cluster.max_memory_mb || 2048);
    const minTemplateDisk = Math.max(Number(profile.min_disk_gb) || 4, 4);
    const maxClusterDisk = Math.min(cluster.max_disk_gb || 20, 64);
    if (minTemplateDisk > maxClusterDisk) throw new AppError('Template disk size exceeds the portal limit', HTTP_STATUS.BAD_REQUEST);
    const safeDisk = Math.min(Math.max(parseInt(diskGb, 10) || minTemplateDisk, minTemplateDisk), maxClusterDisk);
    const job = await createJob({ userId: req.user.id, clusterId: cluster.id, templateProfileId: profile.id, hostname: cleanHostname, cores: safeCores, memoryMb: safeMemory, diskGb: safeDisk, rootPassword: password });
    await logAudit(req, 'provisioning.queue', `job:${job.id}`, `${cleanHostname} · ${profile.display_name}`);
    res.status(HTTP_STATUS.ACCEPTED || 202).json({ message: 'Provisioning job queued', job });
  } catch (err) { next(err); }
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


router.get('/billing', async (req, res, next) => {
  try {
    res.json(await getBillingSummary({ userId: req.user.id, month: req.query.month }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
