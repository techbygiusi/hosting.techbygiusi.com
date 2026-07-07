const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { adminMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ROLES } = require('../config/constants');
const { getClusterResources, testConnection, getCapabilities, getOnlineNodes, getNodeTemplates, getNodeIsos, getNodeStorages, getClusterDashboardStats } = require('../services/proxmoxService');
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
      cg.name as group_name,
      pm.id as provisioned_id,
      pm.ip as provisioned_ip,
      pm.user_id as provisioned_user_id
    FROM resources r
    JOIN proxmox_clusters pc ON r.cluster_id = pc.id
    JOIN users u ON r.user_id = u.id
    LEFT JOIN customer_groups cg ON r.group_id = cg.id
    LEFT JOIN provisioned_machines pm ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
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
             allow_provisioning, allow_types, vmid_min, vmid_max, ip_start, ip_end, ip_prefix,
             gateway, bridge, storage, template_storage, iso_storage, max_cores, max_memory_mb, max_disk_gb
      FROM proxmox_clusters ORDER BY created_at DESC
    `);
    res.json({ clusters });
  } catch (err) {
    next(err);
  }
});

router.get('/cluster-stats', async (req, res, next) => {
  try {
    const clusters = await all('SELECT id, name, url, api_token FROM proxmox_clusters ORDER BY created_at DESC');
    const settled = await Promise.allSettled(clusters.map(async (cluster) => {
      const stats = await getClusterDashboardStats(normalizeUrl(cluster.url), decrypt(cluster.api_token));
      return {
        id: cluster.id,
        name: cluster.name,
        url: cluster.url,
        ...stats
      };
    }));

    const clusterStats = settled.map((result, index) => {
      const cluster = clusters[index];
      if (result.status === 'fulfilled') return result.value;
      return {
        id: cluster.id,
        name: cluster.name,
        url: cluster.url,
        nodes: [],
        totals: { nodes: 0, online: 0, cpuPercent: 0, mem: 0, maxmem: 0, memPercent: 0, rootUsed: 0, rootTotal: 0, rootPercent: 0, storageUsed: 0, storageTotal: 0, storagePercent: 0 },
        error: result.reason?.message || 'Cluster status unavailable'
      };
    });

    res.json({ clusters: clusterStats });
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

    const allowProvisioning = req.body.allowProvisioning ? 1 : 0;

    const result = await run(
      'INSERT INTO proxmox_clusters (name, url, api_token, allow_provisioning) VALUES (?, ?, ?, ?)',
      [String(name).trim(), normalizedUrl, encrypt(String(apiToken).trim()), allowProvisioning]
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

/**
 * Provisioning config is separated from the base cluster form.
 * It lives under Settings and is edited via PUT /clusters/:id/provisioning.
 */
function safeParseList(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeNodeCredentialInput(item = {}) {
  const node = String(item.node || item.nodeName || '').trim();
  const username = String(item.username || 'root').trim() || 'root';
  const secret = item.secret !== undefined ? String(item.secret || '') : undefined;
  if (!node) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(node)) {
    throw new AppError('Node name is invalid', HTTP_STATUS.BAD_REQUEST);
  }
  return { node, username, secret };
}

function normalizeProvisioning(body, existing = {}) {
  const toInt = (value, fallback = null) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
  };
  const isIp = (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(value || '').trim());

  const allowProvisioning = (body.allowProvisioning ?? existing.allow_provisioning) ? 1 : 0;
  // Self-service is intentionally limited to LXC containers. VM creation
  // remains an admin-only task in Proxmox.
  const allowTypes = 'ct';

  const vmidMin = toInt(body.vmidMin ?? existing.vmid_min);
  const vmidMax = toInt(body.vmidMax ?? existing.vmid_max);
  const ipStart = body.ipStart ?? existing.ip_start;
  const ipEnd = body.ipEnd ?? existing.ip_end;
  const gateway = body.gateway ?? existing.gateway;

  if (allowProvisioning) {
    if (!vmidMin || !vmidMax || vmidMin < 100 || vmidMax < vmidMin) {
      throw new AppError('VMID range is invalid', HTTP_STATUS.BAD_REQUEST);
    }
    if (!isIp(ipStart) || !isIp(ipEnd) || !isIp(gateway)) {
      throw new AppError('IP range or gateway is invalid', HTTP_STATUS.BAD_REQUEST);
    }
  }

  const toJsonList = (value, fallbackJson) => {
    if (value === undefined) return fallbackJson ?? null;
    if (!Array.isArray(value)) return fallbackJson ?? null;
    const clean = value.map(v => String(v)).filter(Boolean);
    return clean.length ? JSON.stringify(clean) : null;
  };

  return {
    allowProvisioning,
    allowTypes,
    vmidMin,
    vmidMax,
    ipStart: isIp(ipStart) ? String(ipStart).trim() : null,
    ipEnd: isIp(ipEnd) ? String(ipEnd).trim() : null,
    ipPrefix: Math.min(Math.max(toInt(body.ipPrefix ?? existing.ip_prefix, 24), 8), 32),
    gateway: isIp(gateway) ? String(gateway).trim() : null,
    bridge: String(body.bridge ?? existing.bridge ?? 'vmbr0').trim(),
    storage: String(body.storage ?? existing.storage ?? 'local').trim(),
    templateStorage: String(body.templateStorage ?? existing.template_storage ?? 'local').trim(),
    isoStorage: String(existing.iso_storage ?? 'local').trim(),
    allowedTemplates: toJsonList(body.allowedTemplates, existing.allowed_templates ?? null),
    allowedIsos: null,
    maxCores: Math.min(Math.max(toInt(body.maxCores ?? existing.max_cores, 2), 1), 64),
    maxMemoryMb: Math.min(Math.max(toInt(body.maxMemoryMb ?? existing.max_memory_mb, 2048), 256), 262144),
    maxDiskGb: Math.min(Math.max(toInt(body.maxDiskGb ?? existing.max_disk_gb, 20), 4), 4096)
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

    // The base form only edits name/url/token and the self-service toggle.
    // Detailed provisioning config is managed under Settings.
    const allowProvisioning = req.body.allowProvisioning !== undefined
      ? (req.body.allowProvisioning ? 1 : 0)
      : cluster.allow_provisioning;

    await run(
      'UPDATE proxmox_clusters SET name = ?, url = ?, api_token = ?, allow_provisioning = ? WHERE id = ?',
      [nextName, nextUrl, encrypt(nextToken), allowProvisioning, clusterId]
    );

    await logAudit(req, 'cluster.update', `cluster:${clusterId}`, nextName);
    res.json({ cluster: { id: Number(clusterId), name: nextName, url: nextUrl } });
  } catch (err) {
    next(err);
  }
});

/**
 * Full provisioning config for a cluster (Settings → Self-Service).
 */
router.get('/clusters/:id/provisioning', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    res.json({
      provisioning: {
        allowProvisioning: !!cluster.allow_provisioning,
        allowTypes: 'ct',
        vmidMin: cluster.vmid_min ?? '',
        vmidMax: cluster.vmid_max ?? '',
        ipStart: cluster.ip_start || '',
        ipEnd: cluster.ip_end || '',
        ipPrefix: cluster.ip_prefix ?? 24,
        gateway: cluster.gateway || '',
        bridge: cluster.bridge || 'vmbr0',
        storage: cluster.storage || 'local',
        templateStorage: cluster.template_storage || 'local',
        isoStorage: cluster.iso_storage || 'local',
        allowedTemplates: safeParseList(cluster.allowed_templates),
        allowedIsos: safeParseList(cluster.allowed_isos),
        maxCores: cluster.max_cores ?? 2,
        maxMemoryMb: cluster.max_memory_mb ?? 2048,
        maxDiskGb: cluster.max_disk_gb ?? 20
      }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/clusters/:id/provisioning', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const provisioning = normalizeProvisioning(req.body, cluster);

    if (provisioning.allowProvisioning) {
      const apiToken = decrypt(cluster.api_token);
      const nodes = await getOnlineNodes(cluster.url, apiToken);
      if (nodes.length === 0) throw new AppError('No online node available', HTTP_STATUS.BAD_REQUEST);
      const liveStorages = await getNodeStorages(cluster.url, apiToken, nodes[0].node);
      const liveStorageNames = liveStorages.map(item => item.storage);
      if (!liveStorageNames.includes(provisioning.storage)) {
        throw new AppError('Disk storage is not available on the selected Proxmox node', HTTP_STATUS.BAD_REQUEST);
      }
    }

    await run(
      `UPDATE proxmox_clusters SET
        allow_provisioning = ?, allow_types = ?, vmid_min = ?, vmid_max = ?, ip_start = ?, ip_end = ?, ip_prefix = ?,
        gateway = ?, bridge = ?, storage = ?, template_storage = ?, iso_storage = ?, allowed_templates = ?, allowed_isos = ?, max_cores = ?, max_memory_mb = ?, max_disk_gb = ?
      WHERE id = ?`,
      [
        provisioning.allowProvisioning, provisioning.allowTypes, provisioning.vmidMin, provisioning.vmidMax,
        provisioning.ipStart, provisioning.ipEnd, provisioning.ipPrefix,
        provisioning.gateway, provisioning.bridge, provisioning.storage,
        provisioning.templateStorage, provisioning.isoStorage,
        provisioning.allowedTemplates, provisioning.allowedIsos,
        provisioning.maxCores, provisioning.maxMemoryMb, provisioning.maxDiskGb,
        req.params.id
      ]
    );

    // Optional default root password for newly provisioned machines
    if (req.body.defaultPassword !== undefined && req.body.defaultPassword !== '') {
      await run('UPDATE proxmox_clusters SET default_password_encrypted = ? WHERE id = ?',
        [encrypt(String(req.body.defaultPassword)), req.params.id]);
    }

    await logAudit(req, 'cluster.provisioning', `cluster:${req.params.id}`, cluster.name);
    res.json({ message: 'Provisioning updated' });
  } catch (err) {
    next(err);
  }
});

router.get('/clusters/:id/node-credentials', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const storedRows = await all(
      'SELECT node_name, username, secret_encrypted FROM proxmox_node_credentials WHERE cluster_id = ? ORDER BY node_name',
      [req.params.id]
    );
    const byNode = new Map(storedRows.map(row => [row.node_name, row]));

    let nodeNames = storedRows.map(row => row.node_name);
    try {
      const apiToken = decrypt(cluster.api_token);
      const liveNodes = await getOnlineNodes(cluster.url, apiToken);
      nodeNames = Array.from(new Set([...liveNodes.map(item => item.node), ...nodeNames])).sort((a, b) => a.localeCompare(b));
    } catch (_) {
      nodeNames = Array.from(new Set(nodeNames)).sort((a, b) => a.localeCompare(b));
    }

    res.json({
      credentials: nodeNames.map(node => {
        const row = byNode.get(node);
        return {
          node,
          username: row?.username || 'root',
          hasSecret: !!row?.secret_encrypted,
          secret: ''
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

router.put('/clusters/:id/node-credentials', async (req, res, next) => {
  try {
    const cluster = await get('SELECT id, name FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const credentials = Array.isArray(req.body.credentials) ? req.body.credentials : [];
    for (const raw of credentials) {
      const item = normalizeNodeCredentialInput(raw);
      if (!item) continue;

      const existing = await get(
        'SELECT * FROM proxmox_node_credentials WHERE cluster_id = ? AND node_name = ?',
        [req.params.id, item.node]
      );

      const wantsDelete = item.secret === '' && !item.username && !existing?.secret_encrypted;
      if (wantsDelete) continue;

      if (existing) {
        const nextSecret = item.secret !== undefined && item.secret !== ''
          ? encrypt(item.secret)
          : existing.secret_encrypted;
        await run(
          'UPDATE proxmox_node_credentials SET username = ?, secret_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE cluster_id = ? AND node_name = ?',
          [item.username, nextSecret, req.params.id, item.node]
        );
      } else if (item.secret) {
        await run(
          'INSERT INTO proxmox_node_credentials (cluster_id, node_name, username, secret_encrypted) VALUES (?, ?, ?, ?)',
          [req.params.id, item.node, item.username, encrypt(item.secret)]
        );
      }
    }

    await logAudit(req, 'cluster.node-credentials', `cluster:${req.params.id}`, cluster.name);
    res.json({ message: 'Node credentials saved' });
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

    const storage = req.query.storage || cluster.template_storage || 'local';
    const templates = await getNodeTemplates(cluster.url, apiToken, nodes[0].node, storage);
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

router.get('/clusters/:id/isos', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const apiToken = decrypt(cluster.api_token);
    const nodes = await getOnlineNodes(cluster.url, apiToken);
    if (nodes.length === 0) return res.json({ isos: [] });

    const storage = req.query.storage || cluster.iso_storage || 'local';
    const isos = await getNodeIsos(cluster.url, apiToken, nodes[0].node, storage);
    res.json({ isos });
  } catch (err) {
    next(err);
  }
});

/**
 * Storages of the first online node, optionally filtered by content type.
 * Used in the Settings provisioning form to populate storage dropdowns.
 */
router.get('/clusters/:id/storages', async (req, res, next) => {
  try {
    const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) throw new AppError('Cluster not found', HTTP_STATUS.NOT_FOUND);

    const apiToken = decrypt(cluster.api_token);
    const nodes = await getOnlineNodes(cluster.url, apiToken);
    if (nodes.length === 0) return res.json({ storages: [] });

    const storages = await getNodeStorages(cluster.url, apiToken, nodes[0].node, req.query.content || null);
    res.json({ storages });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------- ADMIN CREDENTIAL VAULT -- */
router.get('/credentials', async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT ac.id, ac.label, ac.username, ac.url, ac.notes, ac.cluster_id, ac.user_id,
             ac.created_at, ac.updated_at,
             pc.name as cluster_name, u.name as user_name, u.email as user_email
      FROM admin_credentials ac
      LEFT JOIN proxmox_clusters pc ON ac.cluster_id = pc.id
      LEFT JOIN users u ON ac.user_id = u.id
      ORDER BY ac.label
    `);
    res.json({ credentials: rows.map(row => ({ ...row, hasSecret: true })) });
  } catch (err) {
    next(err);
  }
});

router.get('/credentials/:id/reveal', async (req, res, next) => {
  try {
    const cred = await get('SELECT id, label, secret_encrypted FROM admin_credentials WHERE id = ?', [req.params.id]);
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);

    await logAudit(req, 'admin.credential.reveal', `credential:${cred.id}`, cred.label);
    res.json({ secret: decrypt(cred.secret_encrypted) });
  } catch (err) {
    next(err);
  }
});

router.post('/credentials', async (req, res, next) => {
  try {
    const { label, username, secret, url, notes, clusterId, userId } = req.body;
    if (!label || !String(label).trim()) {
      throw new AppError('Label is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await run(
      'INSERT INTO admin_credentials (label, username, secret_encrypted, url, notes, cluster_id, user_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [String(label).trim(), String(username || '').trim(), encrypt(secret || ''), String(url || '').trim(), String(notes || '').trim(), clusterId || null, userId || null, req.user.id]
    );

    await logAudit(req, 'admin.credential.create', `credential:${result.lastID}`, String(label).trim());
    res.status(HTTP_STATUS.CREATED).json({ id: result.lastID, message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.put('/credentials/:id', async (req, res, next) => {
  try {
    const cred = await get('SELECT * FROM admin_credentials WHERE id = ?', [req.params.id]);
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);

    const { label, username, secret, url, notes, clusterId, userId } = req.body;
    const nextLabel = String(label ?? cred.label).trim();
    if (!nextLabel) throw new AppError('Label is required', HTTP_STATUS.BAD_REQUEST);

    const nextSecret = secret !== undefined && secret !== '' ? encrypt(secret) : cred.secret_encrypted;

    await run(
      'UPDATE admin_credentials SET label = ?, username = ?, secret_encrypted = ?, url = ?, notes = ?, cluster_id = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        nextLabel, String(username ?? cred.username ?? '').trim(), nextSecret,
        String(url ?? cred.url ?? '').trim(), String(notes ?? cred.notes ?? '').trim(),
        clusterId !== undefined ? (clusterId || null) : cred.cluster_id,
        userId !== undefined ? (userId || null) : cred.user_id,
        req.params.id
      ]
    );

    await logAudit(req, 'admin.credential.update', `credential:${req.params.id}`, nextLabel);
    res.json({ message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.delete('/credentials/:id', async (req, res, next) => {
  try {
    const cred = await get('SELECT id, label FROM admin_credentials WHERE id = ?', [req.params.id]);
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);

    await run('DELETE FROM admin_credentials WHERE id = ?', [req.params.id]);
    await logAudit(req, 'admin.credential.delete', `credential:${req.params.id}`, cred.label);
    res.json({ message: 'Credential deleted' });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- ADMIN → RESOURCE-ATTACHED CREDENTIALS ------ */
/**
 * The admin can attach credentials directly to a user's resource. These show
 * up in the user's resource credential list. Rules:
 * - Admin sees all credentials of a resource, but may only edit/delete the
 *   ones the admin created (created_by_role = 'admin').
 * - User-created credentials (created_by_role = 'user') are NEVER touched or
 *   deleted by the admin.
 * - The user themselves may keep or delete admin-provided credentials.
 */
router.get('/resources/:id/credentials', async (req, res, next) => {
  try {
    const resource = await get('SELECT id FROM resources WHERE id = ?', [req.params.id]);
    if (!resource) throw new AppError('Resource not found', HTTP_STATUS.NOT_FOUND);

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
        canManage: row.created_by_role === 'admin' || row.purpose === 'management'
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get('/resources/:id/credentials/:credId/reveal', async (req, res, next) => {
  try {
    const cred = await get(
      "SELECT id, label, secret_encrypted, created_by_role, COALESCE(purpose, 'general') AS purpose FROM resource_credentials WHERE id = ? AND resource_id = ?",
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    if (cred.created_by_role !== 'admin' && cred.purpose !== 'management') {
      throw new AppError('This credential belongs to the user and cannot be viewed', HTTP_STATUS.FORBIDDEN);
    }

    await logAudit(req, 'admin.resource_credential.reveal', `resource:${req.params.id}`, cred.label);
    res.json({ secret: decrypt(cred.secret_encrypted) });
  } catch (err) {
    next(err);
  }
});

router.post('/resources/:id/credentials', async (req, res, next) => {
  try {
    const resource = await get('SELECT id, name, admin_url FROM resources WHERE id = ?', [req.params.id]);
    if (!resource) throw new AppError('Resource not found', HTTP_STATUS.NOT_FOUND);

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
        await logAudit(req, 'admin.resource_credential.update', `resource:${req.params.id}`, `${resource.name}: ${nextLabel}`);
        return res.json({ id: existing.id, message: 'Credential saved' });
      }
    }

    const result = await run(
      "INSERT INTO resource_credentials (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', ?)",
      [req.params.id, nextLabel, String(username || '').trim(), encrypt(secret || ''), nextUrl, String(notes || '').trim(), req.user.id, purpose]
    );

    await logAudit(req, 'admin.resource_credential.create', `resource:${req.params.id}`, `${resource.name}: ${nextLabel}`);
    res.status(HTTP_STATUS.CREATED).json({ id: result.lastID, message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.put('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    const cred = await get(
      'SELECT * FROM resource_credentials WHERE id = ? AND resource_id = ?',
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    if (cred.created_by_role !== 'admin' && cred.purpose !== 'management') {
      throw new AppError('This credential belongs to the user and cannot be edited', HTTP_STATUS.FORBIDDEN);
    }

    const { label, username, secret, url, notes, purpose: requestedPurpose } = req.body;
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

    await logAudit(req, 'admin.resource_credential.update', `resource:${req.params.id}`, nextLabel);
    res.json({ message: 'Credential saved' });
  } catch (err) {
    next(err);
  }
});

router.delete('/resources/:id/credentials/:credId', async (req, res, next) => {
  try {
    const cred = await get(
      "SELECT id, label, created_by_role, COALESCE(purpose, 'general') AS purpose FROM resource_credentials WHERE id = ? AND resource_id = ?",
      [req.params.credId, req.params.id]
    );
    if (!cred) throw new AppError('Credential not found', HTTP_STATUS.NOT_FOUND);
    // Shared management credentials may be removed by admin or authorized users.
    if (cred.created_by_role !== 'admin' && cred.purpose !== 'management') {
      throw new AppError('This credential belongs to the user and cannot be deleted', HTTP_STATUS.FORBIDDEN);
    }

    await run('DELETE FROM resource_credentials WHERE id = ?', [req.params.credId]);
    await logAudit(req, 'admin.resource_credential.delete', `resource:${req.params.id}`, cred.label);
    res.json({ message: 'Credential deleted' });
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const where = [];
    const params = [];

    if (search) {
      where.push('(action LIKE ? OR target LIKE ? OR details LIKE ? OR user_email LIKE ? OR ip LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRow = await get(`SELECT COUNT(*) AS total FROM audit_log ${whereSql}`, params);
    const total = Number(countRow?.total || 0);
    const entries = await all(
      `SELECT id, user_id, user_email, action, target, details, ip, created_at
       FROM audit_log ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      entries,
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
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
