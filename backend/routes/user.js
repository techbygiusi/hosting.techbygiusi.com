const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { HTTP_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');
const { getAllContainers, getContainerIps } = require('../services/proxmoxService');

/**
 * Get user profile
 */
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

/**
 * Update user profile
 */
router.put('/profile', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      throw new AppError('Name is required', HTTP_STATUS.BAD_REQUEST);
    }

    await run(
      'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, req.user.id]
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

/**
 * Get user's containers (from assigned groups and direct assignments)
 */
router.get('/containers', async (req, res, next) => {
  try {
    // Get user's groups
    const userGroups = await all(
      'SELECT group_id FROM user_groups WHERE user_id = ?',
      [req.user.id]
    );

    const groupIds = userGroups.map(ug => ug.group_id);

    // Get assignments for user's groups and direct assignments
    let assignmentQuery = `
      SELECT DISTINCT ca.*, pc.url, pc.api_token, pc.name as cluster_name
      FROM container_assignments ca
      JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
      WHERE (
        (ca.assigned_to_type = 'user' AND ca.assigned_to_id = ?)
        OR (ca.assigned_to_type = 'group' AND ca.assigned_to_id IN (${groupIds.length ? groupIds.map(() => '?').join(',') : 'NULL'}))
      )
    `;

    const params = [req.user.id, ...groupIds];
    const assignments = await all(assignmentQuery, params);

    // Fetch container details from Proxmox
    const containers = [];

    for (const assignment of assignments) {
      try {
        const allContainers = await getAllContainers(assignment.url, assignment.api_token);
        const container = allContainers.find(c => c.vmid == assignment.container_id);

        if (container) {
          // Get additional details
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
        // Continue with other containers even if one fails
      }
    }

    res.json({ containers });
  } catch (err) {
    next(err);
  }
});

/**
 * Get single container details
 */
router.get('/containers/:id', async (req, res, next) => {
  try {
    const containerId = req.params.id;

    // Check if user has access to this container
    const userGroups = await all(
      'SELECT group_id FROM user_groups WHERE user_id = ?',
      [req.user.id]
    );

    const groupIds = userGroups.map(ug => ug.group_id);

    let accessQuery = `
      SELECT ca.*, pc.url, pc.api_token
      FROM container_assignments ca
      JOIN proxmox_clusters pc ON ca.cluster_id = pc.id
      WHERE ca.container_id = ? AND (
        (ca.assigned_to_type = 'user' AND ca.assigned_to_id = ?)
        OR (ca.assigned_to_type = 'group' AND ca.assigned_to_id IN (${groupIds.length ? groupIds.map(() => '?').join(',') : 'NULL'}))
      )
      LIMIT 1
    `;

    const params = [containerId, req.user.id, ...groupIds];
    const assignment = await get(accessQuery, params);

    if (!assignment) {
      throw new AppError('Container not accessible', HTTP_STATUS.FORBIDDEN);
    }

    // Fetch from Proxmox
    const allContainers = await getAllContainers(assignment.url, assignment.api_token);
    const container = allContainers.find(c => c.vmid == containerId);

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

module.exports = router;
