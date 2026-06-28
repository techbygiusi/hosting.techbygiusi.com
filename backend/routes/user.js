const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { HTTP_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');
const { getAllContainers, getContainerIps } = require('../services/proxmoxService');

router.get('/profile', async (req, res, next) => {
  try {
    const user = await get(
      'SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      throw new AppError('Name is required', HTTP_STATUS.BAD_REQUEST);
    }

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

router.get('/containers', async (req, res, next) => {
  try {
    const assignments = await all(`
      SELECT ca.*, pc.url, pc.api_token, pc.name as cluster_name
      FROM container_assignments ca
      JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
      WHERE ca.assigned_to_type = 'user' AND ca.assigned_to_id = ?
    `, [req.user.id]);

    const containers = [];

    for (const assignment of assignments) {
      try {
        const allContainers = await getAllContainers(assignment.url, assignment.api_token);
        const container = allContainers.find(c => String(c.vmid) === String(assignment.container_id));

        if (container) {
          const ips = await getContainerIps(
            assignment.url,
            assignment.api_token,
            container.node,
            container.type,
            container.vmid
          );

          containers.push({
            id: container.vmid,
            name: container.name,
            type: container.type,
            status: container.status,
            node: container.node,
            cpu: container.cpus || 0,
            maxcpu: container.maxcpu || 0,
            mem: container.mem || 0,
            maxmem: container.maxmem || 0,
            disk: container.disk || 0,
            maxdisk: container.maxdisk || 0,
            ips,
            clusterId: assignment.cluster_id,
            clusterName: assignment.cluster_name,
            clusterUrl: assignment.url,
            webUiUrl: `${assignment.url.replace(':8006', '')}:8006/?console=${container.type}_${container.node}_${container.vmid}`
          });
        }
      } catch (error) {
        console.error(`Error fetching container ${assignment.container_id}:`, error.message);
      }
    }

    res.json({ containers });
  } catch (err) {
    next(err);
  }
});

router.get('/containers/:id', async (req, res, next) => {
  try {
    const containerId = req.params.id;

    const assignment = await get(`
      SELECT ca.*, pc.url, pc.api_token
      FROM container_assignments ca
      JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
      WHERE ca.container_id = ? AND ca.assigned_to_type = 'user' AND ca.assigned_to_id = ?
      LIMIT 1
    `, [containerId, req.user.id]);

    if (!assignment) {
      throw new AppError('Container not accessible', HTTP_STATUS.FORBIDDEN);
    }

    const allContainers = await getAllContainers(assignment.url, assignment.api_token);
    const container = allContainers.find(c => String(c.vmid) === String(containerId));

    if (!container) {
      throw new AppError('Container not found', HTTP_STATUS.NOT_FOUND);
    }

    const ips = await getContainerIps(
      assignment.url,
      assignment.api_token,
      container.node,
      container.type,
      container.vmid
    );

    res.json({
      container: {
        id: container.vmid,
        name: container.name,
        type: container.type,
        status: container.status,
        node: container.node,
        cpu: container.cpus || 0,
        maxcpu: container.maxcpu || 0,
        mem: container.mem || 0,
        maxmem: container.maxmem || 0,
        disk: container.disk || 0,
        maxdisk: container.maxdisk || 0,
        ips,
        uptime: container.uptime || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current and new password required', HTTP_STATUS.BAD_REQUEST);
    }
    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const passwordMatch = await bcryptjs.compare(currentPassword, user.password_hash);

    if (!passwordMatch) {
      throw new AppError('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED);
    }

    const newPasswordHash = await bcryptjs.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newPasswordHash, req.user.id]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
