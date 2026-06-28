const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { adminMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ROLES } = require('../config/constants');
const { getAllContainers, testConnection } = require('../services/proxmoxService');
const { testSmtpConnection, initializeEmailService, encryptString } = require('../services/emailService');

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
    const { name, role, password } = req.body;

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    if (role) validateRole(role);
    if (password) validatePassword(password, false);

    if (name) {
      await run('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [String(name).trim(), userId]);
    }

    if (role) {
      await run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role, userId]);
    }

    if (password) {
      const passwordHash = await bcryptjs.hash(password, 10);
      await run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, userId]);
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
    const clusters = await all('SELECT id, name, url, created_at FROM proxmox_clusters ORDER BY created_at DESC');
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

    const result = await run(
      'INSERT INTO proxmox_clusters (name, url, api_token) VALUES (?, ?, ?)',
      [String(name).trim(), normalizedUrl, String(apiToken).trim()]
    );

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

    const containers = await getAllContainers(cluster.url, cluster.api_token);
    res.json({ containers });
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
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;
    validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword }, true);

    const result = await testSmtpConnection(
      String(smtpHost).trim(),
      String(smtpPort).trim(),
      String(smtpUser).trim(),
      smtpPassword
    );
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/settings/test-proxmox', async (req, res, next) => {
  try {
    const { url, apiToken } = req.body;
    const result = await testConnection(normalizeUrl(url), String(apiToken || '').trim());
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
