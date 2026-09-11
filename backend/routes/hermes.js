const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { get, all } = require('../config/database');
const { decrypt } = require('../services/cryptoService');
const { logAudit } = require('../services/auditService');
const { getHermesConfig } = require('../services/hermesService');
const { listFolders, listArticles, getArticleById, createArticle, updateArticle } = require('../services/wikiService');
const { executeSshCommand } = require('../services/consoleService');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

router.use(async (req, res, next) => {
  try {
    const config = await getHermesConfig();
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() || '';
    if (!config.enabled || !config.portalToken || !safeEqual(token, config.portalToken)) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid Hermes Portal token' });
    }
    req.hermes = config;
    req.user = { id: null, email: 'hermes-agent', role: 'agent' };
    next();
  } catch (err) {
    next(err);
  }
});

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.hermes?.permissions?.[permission]) {
      return res.status(403).json({ error: 'Forbidden', message: `Hermes permission ${permission} is disabled` });
    }
    next();
  };
}

router.get('/capabilities', (req, res) => {
  const p = req.hermes.permissions || {};
  const endpoints = [];
  if (p.overviewRead) endpoints.push({ method: 'GET', path: '/context', capability: 'overviewRead' });
  if (p.servicesRead) endpoints.push({ method: 'GET', path: '/services', capability: 'servicesRead' });
  if (p.clustersRead) endpoints.push({ method: 'GET', path: '/clusters', capability: 'clustersRead' });
  if (p.wikiRead) endpoints.push({ method: 'GET', path: '/wiki', capability: 'wikiRead' }, { method: 'GET', path: '/wiki/articles/:id', capability: 'wikiRead' });
  if (p.wikiWrite) endpoints.push({ method: 'POST', path: '/wiki/articles', capability: 'wikiWrite' }, { method: 'PUT', path: '/wiki/articles/:id', capability: 'wikiWrite' });
  if (p.logsRead) endpoints.push({ method: 'GET', path: '/logs?limit=100', capability: 'logsRead' });
  if (p.credentialsRead) endpoints.push({ method: 'GET', path: '/credentials', capability: 'credentialsRead', note: 'Self-service user credentials stay private.' });
  if (p.sshAccess) endpoints.push({ method: 'POST', path: '/services/:id/ssh', capability: 'sshAccess', body: { command: 'uptime' }, note: 'Only administrator-accessible SSH credentials are used.' });
  res.json({
    agent: req.hermes.name,
    permissions: p,
    endpoints,
    rules: [
      'Use only endpoints listed in this response.',
      'Do not expose bearer tokens or stored secrets unless the administrator explicitly asks for that exact secret.',
      'Self-service user credentials and SSH access remain private to the service owner.'
    ]
  });
});

router.get('/context', requirePermission('overviewRead'), async (req, res, next) => {
  try {
    const [services, clusters, users, articles] = await Promise.all([
      get('SELECT COUNT(*) AS count FROM resources'),
      get('SELECT COUNT(*) AS count FROM proxmox_clusters'),
      get('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['user']),
      get('SELECT COUNT(*) AS count FROM wiki_articles')
    ]);
    res.json({ services: services?.count || 0, clusters: clusters?.count || 0, users: users?.count || 0, wikiArticles: articles?.count || 0 });
  } catch (err) { next(err); }
});

router.get('/services', requirePermission('servicesRead'), async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT r.id, r.name, r.container_id AS containerId, r.resource_type AS resourceType,
             r.cluster_id AS clusterId, pc.name AS clusterName,
             r.user_id AS userId, u.name AS userName, u.email AS userEmail,
             r.group_id AS groupId, cg.name AS groupName,
             COALESCE(r.manual_ip, pm.ip) AS ip, r.ssh_port AS sshPort,
             r.web_url AS webUrl, r.public_url AS publicUrl, r.admin_url AS adminUrl,
             CASE WHEN pm.id IS NOT NULL AND r.user_id IS NOT NULL AND CAST(pm.user_id AS TEXT) = CAST(r.user_id AS TEXT) THEN 1 ELSE 0 END AS selfService
      FROM resources r
      JOIN proxmox_clusters pc ON pc.id = r.cluster_id
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN customer_groups cg ON cg.id = r.group_id
      LEFT JOIN provisioned_machines pm ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
      ORDER BY r.name COLLATE NOCASE ASC
    `);
    res.json({ services: rows.map((row) => ({ ...row, selfService: Number(row.selfService || 0) === 1 })) });
  } catch (err) { next(err); }
});

router.get('/clusters', requirePermission('clustersRead'), async (req, res, next) => {
  try {
    const rows = await all(`SELECT id, name, url, location_label AS location, COALESCE(allow_provisioning,0) AS selfService, COALESCE(allow_publishing,1) AS publicAccess FROM proxmox_clusters ORDER BY name COLLATE NOCASE ASC`);
    res.json({ clusters: rows.map((row) => ({ ...row, selfService: Number(row.selfService) === 1, publicAccess: Number(row.publicAccess) === 1 })) });
  } catch (err) { next(err); }
});

router.get('/wiki', requirePermission('wikiRead'), async (req, res, next) => {
  try {
    const [folders, articles] = await Promise.all([listFolders(), listArticles()]);
    res.json({ folders, articles });
  } catch (err) { next(err); }
});

router.get('/wiki/articles/:id', requirePermission('wikiRead'), async (req, res, next) => {
  try {
    const article = await getArticleById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not Found', message: 'Wiki article not found' });
    res.json({ article });
  } catch (err) { next(err); }
});

router.post('/wiki/articles', requirePermission('wikiWrite'), async (req, res, next) => {
  try {
    const translations = req.body?.translations || req.body?.titles || {};
    const articleId = await createArticle({ folderId: req.body?.folderId || null, slug: req.body?.slug, titles: translations });
    await logAudit(req, 'hermes.wiki.create', `wiki:${articleId}`);
    res.status(201).json({ article: await getArticleById(articleId) });
  } catch (err) { next(err); }
});

router.put('/wiki/articles/:id', requirePermission('wikiWrite'), async (req, res, next) => {
  try {
    await updateArticle(req.params.id, {
      folderId: req.body?.folderId,
      slug: req.body?.slug,
      position: req.body?.position,
      translations: req.body?.translations,
      updatedBy: null
    });
    await logAudit(req, 'hermes.wiki.update', `wiki:${req.params.id}`);
    res.json({ article: await getArticleById(req.params.id) });
  } catch (err) { next(err); }
});

router.get('/logs', requirePermission('logsRead'), async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(250, Number(req.query.limit) || 100));
    const rows = await all(`SELECT id, user_email AS userEmail, action, target, details, ip, created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT ?`, [limit]);
    res.json({ logs: rows });
  } catch (err) { next(err); }
});

router.get('/credentials', requirePermission('credentialsRead'), async (req, res, next) => {
  try {
    const adminCredentials = await all(`SELECT id, label, username, secret_encrypted, url, notes, cluster_id AS clusterId, user_id AS userId FROM admin_credentials ORDER BY label COLLATE NOCASE ASC`);
    const resourceCredentials = await all(`
      SELECT rc.id, rc.resource_id AS resourceId, rc.label, rc.username, rc.secret_encrypted, rc.url, rc.notes,
             rc.created_by_role AS createdByRole, COALESCE(rc.purpose,'general') AS purpose,
             COALESCE(rc.is_ssh_console,0) AS isSshConsole, r.name AS resourceName,
             CASE WHEN pm.id IS NOT NULL AND r.user_id IS NOT NULL AND CAST(pm.user_id AS TEXT) = CAST(r.user_id AS TEXT) THEN 1 ELSE 0 END AS selfService
      FROM resource_credentials rc
      JOIN resources r ON r.id = rc.resource_id
      LEFT JOIN provisioned_machines pm ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
      ORDER BY r.name COLLATE NOCASE ASC, rc.label COLLATE NOCASE ASC
    `);
    res.json({
      adminCredentials: adminCredentials.map((row) => ({ ...row, secret: decrypt(row.secret_encrypted), secret_encrypted: undefined })),
      resourceCredentials: resourceCredentials
        .filter((row) => Number(row.selfService || 0) !== 1)
        .map((row) => ({ ...row, isSshConsole: Number(row.isSshConsole || 0) === 1, selfService: undefined, secret: decrypt(row.secret_encrypted), secret_encrypted: undefined }))
    });
  } catch (err) { next(err); }
});

router.post('/services/:id/ssh', requirePermission('sshAccess'), async (req, res, next) => {
  try {
    const command = String(req.body?.command || '').trim();
    if (!command) return res.status(400).json({ error: 'Bad Request', message: 'SSH command is required' });
    if (command.length > 4000) return res.status(400).json({ error: 'Bad Request', message: 'SSH command is too long' });

    const resource = await get(`
      SELECT r.id, r.name, COALESCE(r.manual_ip, pm.ip) AS ip, COALESCE(r.ssh_port,22) AS sshPort,
             CASE WHEN pm.id IS NOT NULL AND r.user_id IS NOT NULL AND CAST(pm.user_id AS TEXT) = CAST(r.user_id AS TEXT) THEN 1 ELSE 0 END AS selfService
      FROM resources r
      LEFT JOIN provisioned_machines pm ON pm.cluster_id = r.cluster_id AND CAST(pm.vmid AS TEXT) = CAST(r.container_id AS TEXT)
      WHERE r.id = ?
    `, [req.params.id]);
    if (!resource) return res.status(404).json({ error: 'Not Found', message: 'Service not found' });
    if (Number(resource.selfService || 0) === 1) return res.status(403).json({ error: 'Forbidden', message: 'Self-service SSH access is private to the service owner' });
    if (!resource.ip) return res.status(409).json({ error: 'Conflict', message: 'No SSH target IP is stored for this service' });

    const credential = await get(`
      SELECT username, secret_encrypted
      FROM resource_credentials
      WHERE resource_id = ? AND username IS NOT NULL AND secret_encrypted IS NOT NULL
      ORDER BY COALESCE(is_ssh_console,0) DESC,
               CASE WHEN LOWER(COALESCE(label,'')) LIKE '%ssh%' OR LOWER(COALESCE(label,'')) LIKE '%console%' THEN 0 ELSE 1 END,
               id ASC
      LIMIT 1
    `, [resource.id]);
    if (!credential?.username || !credential?.secret_encrypted) return res.status(409).json({ error: 'Conflict', message: 'No administrator-accessible SSH credentials are configured for this service' });

    const result = await executeSshCommand({
      host: resource.ip,
      port: Number(resource.sshPort || 22),
      username: credential.username,
      password: decrypt(credential.secret_encrypted),
      command,
      timeout: 30000
    });
    await logAudit(req, 'hermes.ssh.command', `resource:${resource.id}`, `${resource.name} (${resource.ip})`);
    res.json({ service: { id: resource.id, name: resource.name, ip: resource.ip }, ...result });
  } catch (err) { next(err); }
});

module.exports = router;
