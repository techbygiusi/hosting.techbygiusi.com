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
      u.name as user_name,
      u.email as user_email,
      cg.name as group_name,
      pm.id as provisioned_id,
      pm.ip as provisioned_ip,
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

/* ----------------------------------------------------------- PROFILE ---- */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await get(
      'SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    const groups = await all(`
      SELECT cg.id, cg.name FROM customer_groups cg
      JOIN user_groups ug ON ug.group_id = cg.id
      WHERE ug.user_id = ?
    `, [req.user.id]);

    res.json({ user: { ...user, groups } });
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
      'SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------- RESOURCES ---- */
router.get('/resources', async (req, res, next) => {
  try {
    const rows = await getResourceRowsForUser(req.user.id);
    const resources = (await enrichResources(rows)).map(resource => ({ ...resource, adminUrl: '' }));

    // Attach capabilities per cluster so the UI knows which actions to show
    const clusterIds = [...new Set(rows.map(row => row.cluster_id))];
    const capsByCluster = {};
    for (const clusterId of clusterIds) {
      const row = rows.find(item => item.cluster_id === clusterId);
      capsByCluster[clusterId] = await getClusterCapabilities(clusterId, row.cluster_url, decrypt(row.api_token));
    }

    res.json({
      resources: resources.map(resource => ({
        ...resource,
        canDelete: !!resource.canDelete && String(resource.userId) === String(req.user.id) && !!capsByCluster[resource.clusterId]?.canProvision,
        capabilities: capsByCluster[resource.clusterId] || { readOnly: true }
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get('/resources/:id', async (req, res, next) => {
  try {
    const rows = await getResourceRowsForUser(req.user.id, req.params.id);
    if (rows.length === 0) throw new AppError('Resource not accessible', HTTP_STATUS.FORBIDDEN);

    const resources = (await enrichResources(rows)).map(resource => ({ ...resource, adminUrl: '' }));
    const caps = await getClusterCapabilities(rows[0].cluster_id, rows[0].cluster_url, decrypt(rows[0].api_token));
    res.json({ resource: { ...resources[0], canDelete: !!resources[0].canDelete && String(resources[0].userId) === String(req.user.id) && !!caps.canProvision, capabilities: caps } });
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
    const tasks = await getVmTasks(target.clusterUrl, target.apiToken, target.node, target.vmid);
    res.json({ tasks, node: target.node });
  } catch (err) {
    next(err);
  }
});

router.get('/resources/:id/tasks/:upid/log', async (req, res, next) => {
  try {
    const target = await getAccessibleResource(req.user.id, req.params.id);
    const upid = String(req.params.upid || '');

    // Only allow reading logs of tasks belonging to this VMID
    if (!upid.includes(`:${target.vmid}:`) && !upid.includes(`:${String(target.vmid).padStart(8, '0')}`)) {
      const tasks = await getVmTasks(target.clusterUrl, target.apiToken, target.node, target.vmid, 100);
      if (!tasks.some(task => task.upid === upid)) {
        throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
      }
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
      'SELECT id, label, username, url, notes, created_by_role, created_at, updated_at FROM resource_credentials WHERE resource_id = ? ORDER BY label',
      [req.params.id]
    );
    res.json({ credentials: rows.map(row => ({ ...row, hasSecret: true, fromAdmin: row.created_by_role === 'admin' })) });
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
    await assertResourceAccess(req.user.id, req.params.id);
    const { label, username, secret, url, notes } = req.body;

    if (!label || !String(label).trim()) {
      throw new AppError('Label is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await run(
      'INSERT INTO resource_credentials (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, String(label).trim(), String(username || '').trim(), encrypt(secret || ''), String(url || '').trim(), String(notes || '').trim(), req.user.id, 'user']
    );

    await logAudit(req, 'credential.create', `resource:${req.params.id}`, String(label).trim());
    res.status(HTTP_STATUS.CREATED).json({ id: result.lastID, message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    await assertResourceAccess(req.user.id, req.params.id);
    const { label, username, secret, url, notes } = req.body;
    const cred = await get(
      'SELECT * FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    // Users may keep or delete admin-provided credentials, but not edit them.
    if (cred.created_by_role === 'admin') {
      throw new AppError('Admin-provided credentials cannot be edited', HTTP_STATUS.FORBIDDEN);
    }
    const nextLabel = String(label ?? cred.label).trim();
    if (!nextLabel) throw new AppError('Label is required', HTTP_STATUS.BAD_REQUEST);

    const nextSecret = secret !== undefined && secret !== '' ? encrypt(secret) : cred.secret_encrypted;

    await run(
      'UPDATE resource_credentials SET label = ?, username = ?, secret_encrypted = ?, url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextLabel, String(username ?? cred.username ?? '').trim(), nextSecret, String(url ?? cred.url ?? '').trim(), String(notes ?? cred.notes ?? '').trim(), req.params.credId]
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
      if (!caps.canProvision) continue;

      const allowTypes = 'ct';
      let templates = [];

      const parseList = (json) => { try { const p = JSON.parse(json || '[]'); return Array.isArray(p) ? p : []; } catch (_) { return []; } };
      const allowedTemplates = parseList(cluster.allowed_templates);

      try {
        const nodes = await getOnlineNodes(cluster.url, apiToken);
        if (nodes.length > 0) {
          const node = nodes[0].node;
          templates = await getNodeTemplates(cluster.url, apiToken, node, cluster.template_storage || 'local');
          // If the admin picked a subset, only expose those; otherwise show all found
          if (allowedTemplates.length > 0) {
            templates = templates.filter(t => allowedTemplates.includes(t.volid));
          }
        }
      } catch (_) { /* templates/isos optional */ }

      options.push({
        clusterId: cluster.id,
        clusterName: cluster.name,
        allowTypes,
        hasDefaultPassword: !!cluster.default_password_encrypted,
        maxCores: cluster.max_cores || 2,
        maxMemoryMb: cluster.max_memory_mb || 2048,
        maxDiskGb: cluster.max_disk_gb || 20,
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

    // CT needs a root password. Use the cluster default password if configured
    // and none was provided.
    let password = rootPassword;
    if (!password && cluster.default_password_encrypted) {
      password = decrypt(cluster.default_password_encrypted);
    }
    if (!password || String(password).length < 8) {
      throw new AppError('Root password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST);
    }

    const safeCores = Math.min(Math.max(parseInt(cores, 10) || 1, 1), cluster.max_cores || 2);
    const safeMemory = Math.min(Math.max(parseInt(memoryMb, 10) || 512, 256), cluster.max_memory_mb || 2048);
    const safeDisk = Math.min(Math.max(parseInt(diskGb, 10) || 8, 4), cluster.max_disk_gb || 20);

    const apiToken = decrypt(cluster.api_token);
    const caps = await getClusterCapabilities(cluster.id, cluster.url, apiToken);
    if (!caps.canProvision) {
      throw new AppError('Provisioning is not permitted for this cluster token', HTTP_STATUS.FORBIDDEN);
    }

    // Allocate VMID within the admin range and a free IP within the pool
    const reserved = await all('SELECT vmid FROM provisioned_machines WHERE cluster_id = ?', [cluster.id]);
    const vmid = await getNextVmidInRange(cluster.url, apiToken, cluster.vmid_min, cluster.vmid_max, reserved.map(row => row.vmid));

    const usedIps = new Set(
      (await all('SELECT ip FROM provisioned_machines WHERE cluster_id = ? AND ip IS NOT NULL', [cluster.id]))
        .map(row => stripCidr(row.ip))
        .filter(Boolean)
    );

    // Also scan live LXC interfaces so the next-free-IP logic respects
    // containers that were created outside this portal.
    const liveResources = await getAllContainers(cluster.url, apiToken).catch(() => []);
    for (const item of liveResources.filter(resource => resource.type === 'lxc')) {
      const ips = await getContainerIps(cluster.url, apiToken, item.node, item.type, item.vmid).catch(() => []);
      ips.forEach(entry => {
        const ipv4 = stripCidr(entry.ipv4 || entry.ip || '');
        if (ipv4) usedIps.add(ipv4);
      });
    }

    const ip = allocateIp(cluster.ip_start, cluster.ip_end, usedIps);
    if (!ip) throw new AppError('No free IP address available in the configured range', HTTP_STATUS.BAD_REQUEST);

    const nodes = await getOnlineNodes(cluster.url, apiToken);
    if (nodes.length === 0) throw new AppError('No online node available', HTTP_STATUS.BAD_REQUEST);
    const node = nodes[0].node;

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
      gateway: cluster.gateway
    });

    await run(
      'INSERT INTO provisioned_machines (cluster_id, vmid, ip, hostname, user_id) VALUES (?, ?, ?, ?, ?)',
      [cluster.id, vmid, ip, cleanHostname, req.user.id]
    );

    // Register as portal resource owned by the requesting user
    const resourceResult = await run(
      'INSERT INTO resources (name, container_id, cluster_id, user_id, web_url, public_url, admin_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanHostname, String(vmid), cluster.id, req.user.id, '', '', '']
    );

    await run(
      'INSERT INTO resource_credentials (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [resourceResult.lastID, 'Root-Passwort', 'root', encrypt(password), '', 'Beim Self-Service-Erstellen gespeichert.', req.user.id, 'user']
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
      upid: createResult.upid
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
