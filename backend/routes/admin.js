const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { adminMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ROLES } = require('../config/constants');
const { getClusterResources, testConnection, getCapabilities, getOnlineNodes, getNodeTemplates } = require('../services/proxmoxService');
const { enrichResources } = require('../services/resourceService');
const { testSmtpConnection, initializeEmailService, encryptString, decryptString } = require('../services/emailService');
const { encrypt, decrypt } = require('../services/cryptoService');
const { logAudit } = require('../services/auditService');

router.use(adminMiddleware);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function validateRole(role) {
  if (!Object.values(ROLES).includes(role)) {
    throw new AppError('Invalid role', HTTP_STATUS.BAD_REQUEST);
  }
}

function validatePassword(password, required = true) {
  if (!password && !required) return;
  if (!password || String(password).length < 6) {
    throw new AppError('Password must be at least 6 characters', HTTP_STATUS.BAD_REQUEST);
  }
}

function validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword }, passwordRequired = true) {
  if (!smtpHost || !smtpPort || !smtpUser || (passwordRequired && !smtpPassword)) {
    throw new AppError('SMTP host, port, user, and password are required', HTTP_STATUS.BAD_REQUEST);
  }

  const parsedPort = Number(smtpPort);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new AppError('SMTP port is invalid', HTTP_STATUS.BAD_REQUEST);
  }
}

async function getStoredSmtpSettings() {
  const rows = await all(
    "SELECT key, value FROM settings WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password')"
  );

  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function resolveSmtpSettings(input, stored = {}) {
  const providedPassword = String(input.smtpPassword || '').trim();
  const shouldUseStoredPassword = !providedPassword || providedPassword === '***hidden***';

  return {
    smtpHost: String(input.smtpHost || stored.smtp_host || '').trim(),
    smtpPort: String(input.smtpPort || stored.smtp_port || '').trim(),
    smtpUser: String(input.smtpUser || stored.smtp_user || '').trim(),
    smtpPassword: shouldUseStoredPassword ? decryptString(stored.smtp_password || '') : input.smtpPassword
  };
}

function validateWebUrl(webUrl, label = 'Link') {
  if (!webUrl) return '';
  const normalized = String(webUrl).trim();
  if (!/^https?:\/\//i.test(normalized)) {
    throw new AppError(`${label} must start with http:// or https://`, HTTP_STATUS.BAD_REQUEST);
  }
  return normalized;
}

async function resolveClusterTestData(input) {
  const clusterId = input.clusterId || input.id;
  if (clusterId) {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [clusterId]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    return {
      url: normalizeUrl(input.url || cluster.url),
      apiToken: String(input.apiToken || decrypt(cluster.api_token) || '').trim()
    };
  }

  return {
    url: normalizeUrl(input.url),
    apiToken: String(input.apiToken || '').trim()
  };
}

async function getResourceRows(where = '', params = []) {
  return all(`
    SELECT
      r.*,
      pc.name as cluster_name,
      pc.url as cluster_url,
      pc.api_token,
      u.name as user_name,
      u.email as user_email,
      cg.name as group_name
    FROM resources r
    JOIN proxmox_clusters pc ON r.cluster_id = pc.id
    JOIN users u ON r.user_id = u.id
    LEFT JOIN customer_groups cg ON r.group_id = cg.id
    ${where}
    ORDER BY r.created_at DESC
  `, params);
}

router.get('/users', async (req, res, next) => {
  try {
    const users = await all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { email, name, password, role = ROLES.USER } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !name) {
      throw new AppError('Email and name are required', HTTP_STATUS.BAD_REQUEST);
    }

    validateRole(role);
    validatePassword(password, true);

    const passwordHash = await bcryptjs.hash(password, 10);
    const result = await run(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      [normalizedEmail, String(name).trim(), passwordHash, role]
    );

    res.status(HTTP_STATUS.CREATED).json({
      user: {
        id: result.lastID,
        email: normalizedEmail,
        name: String(name).trim(),
        role
      }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { email, name, role, password } = req.body;

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    if (role) validateRole(role);
    if (password) validatePassword(password, false);

    const updates = [];
    const params = [];

    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) throw new AppError('Email and name are required', HTTP_STATUS.BAD_REQUEST);
      updates.push('email = ?');
      params.push(normalizedEmail);
    }

    if (name !== undefined) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new AppError('Email and name are required', HTTP_STATUS.BAD_REQUEST);
      updates.push('name = ?');
      params.push(cleanName);
    }

    if (role) {
      updates.push('role = ?');
      params.push(role);
    }

    if (password) {
      const passwordHash = await bcryptjs.hash(password, 10);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);
      await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const updated = await get('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [userId]);
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);

    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.id === req.user.id) {
      throw new AppError('Cannot delete your own account', HTTP_STATUS.BAD_REQUEST);
    }

    await run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/clusters', async (req, res, next) => {
  try {
    const clusters = await all(`
      SELECT id, name, url, created_at,
             allow_provisioning, vmid_min, vmid_max, ip_start, ip_end, ip_prefix,
             gateway, bridge, storage, template_storage, max_cores, max_memory_mb, max_disk_gb
      FROM proxmox_clusters ORDER BY created_at DESC
    `);
    res.json({ clusters });
  } catch (err) {
    next(err);
  }
});

router.post('/clusters', async (req, res, next) => {
  try {
    const { name, url, apiToken } = req.body;
    const normalizedUrl = normalizeUrl(url);

    if (!name || !normalizedUrl || !apiToken) {
      throw new AppError('Name, URL, and API token are required', HTTP_STATUS.BAD_REQUEST);
    }

    const testResult = await testConnection(normalizedUrl, String(apiToken).trim());
    if (!testResult.success) {
      throw new AppError(`Failed to connect to Proxmox: ${testResult.message}`, HTTP_STATUS.BAD_REQUEST);
    }

    const provisioning = normalizeProvisioning(req.body);

    const result = await run(
      `INSERT INTO proxmox_clusters (
        name, url, api_token,
        allow_provisioning, vmid_min, vmid_max, ip_start, ip_end, ip_prefix,
        gateway, bridge, storage, template_storage, max_cores, max_memory_mb, max_disk_gb
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(), normalizedUrl, encrypt(String(apiToken).trim()),
        provisioning.allowProvisioning, provisioning.vmidMin, provisioning.vmidMax,
        provisioning.ipStart, provisioning.ipEnd, provisioning.ipPrefix,
        provisioning.gateway, provisioning.bridge, provisioning.storage,
        provisioning.templateStorage, provisioning.maxCores, provisioning.maxMemoryMb, provisioning.maxDiskGb
      ]
    );

    await logAudit(req, 'cluster.create', `cluster:${result.lastID}`, String(name).trim());

    res.status(HTTP_STATUS.CREATED).json({
      cluster: {
        id: result.lastID,
        name: String(name).trim(),
        url: normalizedUrl
      }
    });
  } catch (err) {
    next(err);
  }
});

function normalizeProvisioning(body) {
  const toInt = (value, fallback = null) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
  };
  const isIp = (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(value || '').trim());

  const allowProvisioning = body.allowProvisioning ? 1 : 0;
  const vmidMin = toInt(body.vmidMin);
  const vmidMax = toInt(body.vmidMax);

  if (allowProvisioning) {
    if (!vmidMin || !vmidMax || vmidMin < 100 || vmidMax < vmidMin) {
      throw new AppError('VMID range is invalid', HTTP_STATUS.BAD_REQUEST);
    }
    if (!isIp(body.ipStart) || !isIp(body.ipEnd) || !isIp(body.gateway)) {
      throw new AppError('IP range or gateway is invalid', HTTP_STATUS.BAD_REQUEST);
    }
  }

  return {
    allowProvisioning,
    vmidMin,
    vmidMax,
    ipStart: isIp(body.ipStart) ? String(body.ipStart).trim() : null,
    ipEnd: isIp(body.ipEnd) ? String(body.ipEnd).trim() : null,
    ipPrefix: Math.min(Math.max(toInt(body.ipPrefix, 24), 8), 32),
    gateway: isIp(body.gateway) ? String(body.gateway).trim() : null,
    bridge: String(body.bridge || 'vmbr0').trim(),
    storage: String(body.storage || 'local-lvm').trim(),
    templateStorage: String(body.templateStorage || 'local').trim(),
    maxCores: Math.min(Math.max(toInt(body.maxCores, 2), 1), 64),
    maxMemoryMb: Math.min(Math.max(toInt(body.maxMemoryMb, 2048), 256), 262144),
    maxDiskGb: Math.min(Math.max(toInt(body.maxDiskGb, 20), 4), 4096)
  };
}

router.put('/clusters/:id', async (req, res, next) => {
  try {
    const clusterId = req.params.id;
    const { name, url, apiToken } = req.body;
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [clusterId]);

    if (!cluster) {
      throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    }

    const nextName = String(name || cluster.name).trim();
    const nextUrl = normalizeUrl(url || cluster.url);
    const nextToken = String(apiToken || decrypt(cluster.api_token)).trim();

    if (!nextName || !nextUrl || !nextToken) {
      throw new AppError('Name, URL, and API token are required', HTTP_STATUS.BAD_REQUEST);
    }

    const testResult = await testConnection(nextUrl, nextToken);
    if (!testResult.success) {
      throw new AppError(`Failed to connect to Proxmox: ${testResult.message}`, HTTP_STATUS.BAD_REQUEST);
    }

    const provisioning = normalizeProvisioning({
      allowProvisioning: req.body.allowProvisioning ?? cluster.allow_provisioning,
      vmidMin: req.body.vmidMin ?? cluster.vmid_min,
      vmidMax: req.body.vmidMax ?? cluster.vmid_max,
      ipStart: req.body.ipStart ?? cluster.ip_start,
      ipEnd: req.body.ipEnd ?? cluster.ip_end,
      ipPrefix: req.body.ipPrefix ?? cluster.ip_prefix,
      gateway: req.body.gateway ?? cluster.gateway,
      bridge: req.body.bridge ?? cluster.bridge,
      storage: req.body.storage ?? cluster.storage,
      templateStorage: req.body.templateStorage ?? cluster.template_storage,
      maxCores: req.body.maxCores ?? cluster.max_cores,
      maxMemoryMb: req.body.maxMemoryMb ?? cluster.max_memory_mb,
      maxDiskGb: req.body.maxDiskGb ?? cluster.max_disk_gb
    });

    await run(
      `UPDATE proxmox_clusters SET
        name = ?, url = ?, api_token = ?,
        allow_provisioning = ?, vmid_min = ?, vmid_max = ?, ip_start = ?, ip_end = ?, ip_prefix = ?,
        gateway = ?, bridge = ?, storage = ?, template_storage = ?, max_cores = ?, max_memory_mb = ?, max_disk_gb = ?
      WHERE id = ?`,
      [
        nextName, nextUrl, encrypt(nextToken),
        provisioning.allowProvisioning, provisioning.vmidMin, provisioning.vmidMax,
        provisioning.ipStart, provisioning.ipEnd, provisioning.ipPrefix,
        provisioning.gateway, provisioning.bridge, provisioning.storage,
        provisioning.templateStorage, provisioning.maxCores, provisioning.maxMemoryMb, provisioning.maxDiskGb,
        clusterId
      ]
    );

    await logAudit(req, 'cluster.update', `cluster:${clusterId}`, nextName);
    res.json({ cluster: { id: Number(clusterId), name: nextName, url: nextUrl } });
  } catch (err) {
    next(err);
  }
});

router.delete('/clusters/:id', async (req, res, next) => {
  try {
    const clusterId = req.params.id;
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [clusterId]);

    if (!cluster) {
      throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    }

    await run('DELETE FROM proxmox_clusters WHERE id = ?', [clusterId]);
    res.json({ message: 'Cluster deleted successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/clusters/:id/containers', async (req, res, next) => {
  try {
    const clusterId = req.params.id;
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [clusterId]);

    if (!cluster) {
      throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    }

    const containers = await getClusterResources(cluster.url, decrypt(cluster.api_token));
    res.json({ containers });
  } catch (err) {
    next(err);
  }
});

/**
 * Live permissions of the configured API token – shows in the UI which
 * portal features (power, console, provisioning) the token allows.
 */
router.get('/clusters/:id/capabilities', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const capabilities = await getCapabilities(cluster.url, decrypt(cluster.api_token));
    res.json({ capabilities });
  } catch (err) {
    next(err);
  }
});

router.get('/clusters/:id/templates', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const apiToken = decrypt(cluster.api_token);
    const nodes = await getOnlineNodes(cluster.url, apiToken);
    if (nodes.length === 0) return res.json({ templates: [] });

    const templates = await getNodeTemplates(cluster.url, apiToken, nodes[0].node, cluster.template_storage || 'local');
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------- GROUPS -- */
router.get('/groups', async (req, res, next) => {
  try {
    const groups = await all(`
      SELECT cg.id, cg.name, cg.created_at,
        (SELECT COUNT(*) FROM user_groups ug WHERE ug.group_id = cg.id) as member_count,
        (SELECT COUNT(*) FROM resources r WHERE r.group_id = cg.id) as resource_count
      FROM customer_groups cg ORDER BY cg.name
    `);

    const memberships = await all(`
      SELECT ug.group_id, u.id, u.name, u.email
      FROM user_groups ug JOIN users u ON ug.user_id = u.id
    `);

    res.json({
      groups: groups.map(group => ({
        ...group,
        members: memberships.filter(member => member.group_id === group.id)
          .map(member => ({ id: member.id, name: member.name, email: member.email }))
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/groups', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError('Group name is required', HTTP_STATUS.BAD_REQUEST);

    const result = await run('INSERT INTO customer_groups (name) VALUES (?)', [name]);
    await logAudit(req, 'group.create', `group:${result.lastID}`, name);
    res.status(HTTP_STATUS.CREATED).json({ group: { id: result.lastID, name } });
  } catch (err) {
    next(err);
  }
});

router.put('/groups/:id', async (req, res, next) => {
  try {
    const group = await get('SELECT * FROM customer_groups WHERE id = ?', [req.params.id]);
    if (!group) throw new AppError('Group not found', HTTP_STATUS.NOT_FOUND);

    const name = String(req.body.name || group.name).trim();
    if (!name) throw new AppError('Group name is required', HTTP_STATUS.BAD_REQUEST);

    await run('UPDATE customer_groups SET name = ? WHERE id = ?', [name, req.params.id]);

    if (Array.isArray(req.body.memberIds)) {
      await run('DELETE FROM user_groups WHERE group_id = ?', [req.params.id]);
      for (const memberId of req.body.memberIds) {
        const user = await get('SELECT id FROM users WHERE id = ?', [memberId]);
        if (user) {
          await run('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)', [memberId, req.params.id]);
        }
      }
    }

    await logAudit(req, 'group.update', `group:${req.params.id}`, name);
    res.json({ group: { id: Number(req.params.id), name } });
  } catch (err) {
    next(err);
  }
});

router.delete('/groups/:id', async (req, res, next) => {
  try {
    const group = await get('SELECT * FROM customer_groups WHERE id = ?', [req.params.id]);
    if (!group) throw new AppError('Group not found', HTTP_STATUS.NOT_FOUND);

    await run('DELETE FROM customer_groups WHERE id = ?', [req.params.id]);
    await logAudit(req, 'group.delete', `group:${req.params.id}`, group.name);
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- AUDIT -- */
router.get('/audit', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const entries = await all(
      'SELECT id, user_id, user_email, action, target, details, ip, created_at FROM audit_log ORDER BY id DESC LIMIT ?',
      [limit]
    );
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

router.get('/resources', async (req, res, next) => {
  try {
    const rows = await getResourceRows();
    const resources = await enrichResources(rows);
    res.json({ resources });
  } catch (err) {
    next(err);
  }
});

router.post('/resources', async (req, res, next) => {
  try {
    const { name, containerId, clusterId, userId, groupId, webUrl, publicUrl, adminUrl } = req.body;

    if (!containerId || !clusterId || !userId) {
      throw new AppError('Resource, cluster, and user are required', HTTP_STATUS.BAD_REQUEST);
    }

    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [clusterId]);
    if (!cluster) {
      throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    }

    const user = await get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    let cleanGroupId = null;
    if (groupId) {
      const group = await get('SELECT id FROM customer_groups WHERE id = ?', [groupId]);
      if (!group) throw new AppError('Group not found', HTTP_STATUS.NOT_FOUND);
      cleanGroupId = group.id;
    }

    let resourceName = String(name || '').trim();
    try {
      const containers = await getClusterResources(cluster.url, decrypt(cluster.api_token));
      const selected = containers.find(item => String(item.vmid) === String(containerId));
      if (!selected) {
        throw new AppError('Selected Proxmox resource was not found', HTTP_STATUS.BAD_REQUEST);
      }
      if (!resourceName) resourceName = selected.name || `Ressource ${containerId}`;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (!resourceName) resourceName = `Ressource ${containerId}`;
    }

    const cleanPublicUrl = validateWebUrl(publicUrl || webUrl, 'Public link');
    const cleanAdminUrl = validateWebUrl(adminUrl, 'Admin link');

    const result = await run(
      'INSERT INTO resources (name, container_id, cluster_id, user_id, group_id, web_url, public_url, admin_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [resourceName, String(containerId), clusterId, userId, cleanGroupId, cleanPublicUrl, cleanPublicUrl, cleanAdminUrl]
    );

    await logAudit(req, 'resource.create', `resource:${result.lastID}`, resourceName);

    const rows = await getResourceRows('WHERE r.id = ?', [result.lastID]);
    const resources = await enrichResources(rows);
    res.status(HTTP_STATUS.CREATED).json({ resource: resources[0] });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id', async (req, res, next) => {
  try {
    const resourceId = req.params.id;
    const { name, containerId, clusterId, userId, groupId, webUrl, publicUrl, adminUrl } = req.body;
    const resource = await get('SELECT * FROM resources WHERE id = ?', [resourceId]);

    if (!resource) {
      throw new AppError('Resource not found', HTTP_STATUS.NOT_FOUND);
    }

    const nextClusterId = clusterId || resource.cluster_id;
    const nextContainerId = String(containerId || resource.container_id);
    const nextUserId = userId || resource.user_id;

    let nextGroupId = resource.group_id;
    if (groupId !== undefined) {
      if (groupId === null || groupId === '' || groupId === 0) {
        nextGroupId = null;
      } else {
        const group = await get('SELECT id FROM customer_groups WHERE id = ?', [groupId]);
        if (!group) throw new AppError('Group not found', HTTP_STATUS.NOT_FOUND);
        nextGroupId = group.id;
      }
    }

    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [nextClusterId]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const user = await get('SELECT id FROM users WHERE id = ?', [nextUserId]);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    let nextName = String(name || resource.name || '').trim();
    if (!nextName) nextName = `Ressource ${nextContainerId}`;

    const cleanPublicUrl = validateWebUrl(publicUrl ?? webUrl ?? resource.public_url ?? resource.web_url, 'Public link');
    const cleanAdminUrl = validateWebUrl(adminUrl ?? resource.admin_url, 'Admin link');

    await run(
      'UPDATE resources SET name = ?, container_id = ?, cluster_id = ?, user_id = ?, group_id = ?, web_url = ?, public_url = ?, admin_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextName, nextContainerId, nextClusterId, nextUserId, nextGroupId, cleanPublicUrl, cleanPublicUrl, cleanAdminUrl, resourceId]
    );

    await logAudit(req, 'resource.update', `resource:${resourceId}`, nextName);

    const rows = await getResourceRows('WHERE r.id = ?', [resourceId]);
    const resources = await enrichResources(rows);
    res.json({ resource: resources[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id', async (req, res, next) => {
  try {
    const resourceId = req.params.id;
    const resource = await get('SELECT * FROM resources WHERE id = ?', [resourceId]);

    if (!resource) {
      throw new AppError('Resource not found', HTTP_STATUS.NOT_FOUND);
    }

    await run('DELETE FROM resources WHERE id = ?', [resourceId]);
    res.json({ message: 'Resource deleted successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/assignments', async (req, res, next) => {
  try {
    const assignments = await all(`
      SELECT
        ca.*,
        pc.name as cluster_name,
        u.email as assigned_to_name,
        u.name as assigned_user_name
      FROM container_assignments ca
      LEFT JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
      LEFT JOIN users u ON ca.assigned_to_id = u.id
      WHERE ca.assigned_to_type = 'user'
      ORDER BY ca.created_at DESC
    `);

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
});

router.post('/assignments', async (req, res, next) => {
  try {
    const { containerId, clusterId, assignedToId } = req.body;

    if (!containerId || !clusterId || !assignedToId) {
      throw new AppError('Missing required fields', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT id FROM users WHERE id = ?', [assignedToId]);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const cluster = await get('SELECT id FROM proxmox_clusters WHERE id = ?', [clusterId]);
    if (!cluster) {
      throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);
    }

    const result = await run(
      'INSERT INTO container_assignments (container_id, cluster_id, assigned_to_type, assigned_to_id) VALUES (?, ?, ?, ?)',
      [String(containerId), clusterId, 'user', assignedToId]
    );

    res.status(HTTP_STATUS.CREATED).json({
      assignment: {
        id: result.lastID,
        containerId: String(containerId),
        clusterId,
        assignedToType: 'user',
        assignedToId
      }
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/assignments/:id', async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    const assignment = await get('SELECT * FROM container_assignments WHERE id = ?', [assignmentId]);

    if (!assignment) {
      throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
    }

    await run('DELETE FROM container_assignments WHERE id = ?', [assignmentId]);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await all('SELECT key, value FROM settings');
    const settingsObj = {};

    settings.forEach(setting => {
      settingsObj[setting.key] = setting.key === 'smtp_password' ? '***hidden***' : setting.value;
    });

    res.json({ settings: settingsObj });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;
    const currentPassword = await get('SELECT value FROM settings WHERE key = ?', ['smtp_password']);
    const passwordRequired = !currentPassword?.value || (smtpPassword && smtpPassword !== '***hidden***');

    validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword }, passwordRequired);

    await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_host', String(smtpHost).trim()]);
    await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_port', String(smtpPort).trim()]);
    await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_user', String(smtpUser).trim()]);

    if (smtpPassword && smtpPassword !== '***hidden***') {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_password', encryptString(smtpPassword)]);
    }

    await initializeEmailService();
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/test-smtp', async (req, res, next) => {
  try {
    const storedSmtp = await getStoredSmtpSettings();
    const smtp = resolveSmtpSettings(req.body, storedSmtp);
    validateSmtp(smtp, true);

    const result = await testSmtpConnection(
      smtp.smtpHost,
      smtp.smtpPort,
      smtp.smtpUser,
      smtp.smtpPassword
    );
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/settings/test-proxmox', async (req, res, next) => {
  try {
    const { url, apiToken } = await resolveClusterTestData(req.body);
    const result = await testConnection(url, apiToken);
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
