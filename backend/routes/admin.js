const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { adminMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ROLES } = require('../config/constants');
const { sendEmail } = require('../services/emailService');
const { getAllContainers, testConnection } = require('../services/proxmoxService');

// Apply admin middleware to all admin routes
router.use(adminMiddleware);

// ==================== USERS ====================

/**
 * Get all users
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

/**
 * Create user
 */
router.post('/users', async (req, res, next) => {
  try {
    const { email, name, role = ROLES.USER } = req.body;

    if (!email || !name) {
      throw new AppError('Email and name are required', HTTP_STATUS.BAD_REQUEST);
    }

    if (!Object.values(ROLES).includes(role)) {
      throw new AppError('Invalid role', HTTP_STATUS.BAD_REQUEST);
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const saltRounds = 10;
    const password_hash = await bcryptjs.hash(tempPassword, saltRounds);

    const result = await run(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      [email, name, password_hash, role]
    );

    // Send welcome email with temp password
    await sendEmail(
      email,
      'Welcome to Hosting Portal',
      `Hi ${name},\n\nYour account has been created.\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nPlease change your password after first login.`
    );

    res.status(HTTP_STATUS.CREATED).json({
      user: {
        id: result.lastID,
        email,
        name,
        role
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update user
 */
router.put('/users/:id', async (req, res, next) => {
  try {
    const { name, role } = req.body;
    const userId = req.params.id;

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    if (name) {
      await run('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [name, userId]);
    }

    if (role && Object.values(ROLES).includes(role)) {
      await run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [role, userId]);
    }

    const updated = await get('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [userId]);
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete user
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    // Prevent deleting own account
    if (user.id === req.user.id) {
      throw new AppError('Cannot delete your own account', HTTP_STATUS.BAD_REQUEST);
    }

    await run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ==================== CUSTOMER GROUPS ====================

/**
 * Get all customer groups
 */
router.get('/groups', async (req, res, next) => {
  try {
    const groups = await all('SELECT * FROM customer_groups ORDER BY created_at DESC');
    
    // Get user counts for each group
    for (let group of groups) {
      const userCount = await get('SELECT COUNT(*) as count FROM user_groups WHERE group_id = ?', [group.id]);
      group.userCount = userCount?.count || 0;
    }

    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

/**
 * Create customer group
 */
router.post('/groups', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      throw new AppError('Group name is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await run('INSERT INTO customer_groups (name) VALUES (?)', [name]);

    res.status(HTTP_STATUS.CREATED).json({
      group: {
        id: result.lastID,
        name,
        userCount: 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete customer group
 */
router.delete('/groups/:id', async (req, res, next) => {
  try {
    const groupId = req.params.id;

    const group = await get('SELECT * FROM customer_groups WHERE id = ?', [groupId]);
    if (!group) {
      throw new AppError('Group not found', HTTP_STATUS.NOT_FOUND);
    }

    await run('DELETE FROM customer_groups WHERE id = ?', [groupId]);
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Add user to group
 */
router.post('/groups/:groupId/users/:userId', async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;

    const group = await get('SELECT * FROM customer_groups WHERE id = ?', [groupId]);
    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);

    if (!group || !user) {
      throw new AppError('Group or user not found', HTTP_STATUS.NOT_FOUND);
    }

    await run('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)', 
      [userId, groupId]);

    res.json({ message: 'User added to group' });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove user from group
 */
router.delete('/groups/:groupId/users/:userId', async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;

    await run('DELETE FROM user_groups WHERE user_id = ? AND group_id = ?', 
      [userId, groupId]);

    res.json({ message: 'User removed from group' });
  } catch (err) {
    next(err);
  }
});

// ==================== PROXMOX CLUSTERS ====================

/**
 * Get all Proxmox clusters
 */
router.get('/clusters', async (req, res, next) => {
  try {
    const clusters = await all('SELECT id, name, url, created_at FROM proxmox_clusters ORDER BY created_at DESC');
    res.json({ clusters });
  } catch (err) {
    next(err);
  }
});

/**
 * Add Proxmox cluster
 */
router.post('/clusters', async (req, res, next) => {
  try {
    const { name, url, apiToken } = req.body;

    if (!name || !url || !apiToken) {
      throw new AppError('Name, URL, and API token are required', HTTP_STATUS.BAD_REQUEST);
    }

    // Test connection first
    const testResult = await testConnection(url, apiToken);
    if (!testResult.success) {
      throw new AppError(`Failed to connect to Proxmox: ${testResult.message}`, HTTP_STATUS.BAD_REQUEST);
    }

    const result = await run(
      'INSERT INTO proxmox_clusters (name, url, api_token) VALUES (?, ?, ?)',
      [name, url, apiToken]
    );

    res.status(HTTP_STATUS.CREATED).json({
      cluster: {
        id: result.lastID,
        name,
        url
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete Proxmox cluster
 */
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

/**
 * Get all containers from a cluster
 */
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

// ==================== CONTAINER ASSIGNMENTS ====================

/**
 * Get all assignments
 */
router.get('/assignments', async (req, res, next) => {
  try {
    const assignments = await all(`
      SELECT 
        ca.*,
        pc.name as cluster_name,
        CASE 
          WHEN ca.assigned_to_type = 'user' THEN u.email
          WHEN ca.assigned_to_type = 'group' THEN cg.name
        END as assigned_to_name
      FROM container_assignments ca
      LEFT JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
      LEFT JOIN users u ON ca.assigned_to_type = 'user' AND ca.assigned_to_id = u.id
      LEFT JOIN customer_groups cg ON ca.assigned_to_type = 'group' AND ca.assigned_to_id = cg.id
      ORDER BY ca.created_at DESC
    `);

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
});

/**
 * Assign container to user/group
 */
router.post('/assignments', async (req, res, next) => {
  try {
    const { containerId, clusterId, assignedToType, assignedToId } = req.body;

    if (!containerId || !clusterId || !assignedToType || !assignedToId) {
      throw new AppError('Missing required fields', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await run(
      'INSERT INTO container_assignments (container_id, cluster_id, assigned_to_type, assigned_to_id) VALUES (?, ?, ?, ?)',
      [containerId, clusterId, assignedToType, assignedToId]
    );

    res.status(HTTP_STATUS.CREATED).json({
      assignment: {
        id: result.lastID,
        containerId,
        clusterId,
        assignedToType,
        assignedToId
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete assignment
 */
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

// ==================== SETTINGS ====================

/**
 * Get all settings
 */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await all('SELECT key, value FROM settings');
    const settingsObj = {};
    
    settings.forEach(s => {
      if (['smtp_password'].includes(s.key)) {
        settingsObj[s.key] = '***hidden***';
      } else {
        settingsObj[s.key] = s.value;
      }
    });

    res.json({ settings: settingsObj });
  } catch (err) {
    next(err);
  }
});

/**
 * Update settings
 */
router.put('/settings', async (req, res, next) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;

    if (smtpHost) {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_host', smtpHost]);
    }
    if (smtpPort) {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_port', smtpPort]);
    }
    if (smtpUser) {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_user', smtpUser]);
    }
    if (smtpPassword && smtpPassword !== '***hidden***') {
      const encrypted = Buffer.from(smtpPassword).toString('base64');
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_password', encrypted]);
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Test SMTP connection
 */
router.post('/settings/test-smtp', async (req, res, next) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;
    const { testSmtpConnection } = require('../services/emailService');

    const result = await testSmtpConnection(smtpHost, smtpPort, smtpUser, smtpPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Test Proxmox connection
 */
router.post('/settings/test-proxmox', async (req, res, next) => {
  try {
    const { url, apiToken } = req.body;
    const result = await testConnection(url, apiToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
