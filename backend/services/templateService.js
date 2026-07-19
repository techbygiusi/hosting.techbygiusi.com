const { get, run, all } = require('../config/database');
const { decrypt } = require('./cryptoService');
const { getOnlineNodes, getNodeTemplates } = require('./proxmoxService');

function parseAllowedTemplates(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function cleanVersion(value) {
  return String(value || '').replace(/[_-]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

function inferTemplateMetadata(volid) {
  const file = String(volid || '').split('/').pop() || String(volid || '');
  const lower = file.toLowerCase();
  let osFamily = 'Linux';
  let osVersion = '';
  if (lower.includes('debian')) {
    osFamily = 'Debian';
    osVersion = cleanVersion((lower.match(/debian[-_]?([0-9]+(?:[._-][0-9]+)?)/) || [])[1]);
  } else if (lower.includes('ubuntu')) {
    osFamily = 'Ubuntu';
    osVersion = cleanVersion((lower.match(/ubuntu[-_]?([0-9]+(?:[._-][0-9]+)?)/) || [])[1]);
  }
  let profileType = 'base';
  if (lower.includes('docker')) profileType = 'docker';
  else if (lower.includes('nginx')) profileType = 'nginx';
  const profileSuffix = profileType === 'docker' ? ' with Docker' : profileType === 'nginx' ? ' with Nginx' : '';
  const displayName = `${osFamily}${osVersion ? ` ${osVersion}` : ''}${profileSuffix}`;
  return { displayName, osFamily, osVersion, profileType };
}

async function syncClusterTemplates(clusterId) {
  const cluster = await get('SELECT * FROM proxmox_clusters WHERE id = ?', [clusterId]);
  if (!cluster) throw new Error('Cluster not found');
  const token = decrypt(cluster.api_token);
  const nodes = await getOnlineNodes(cluster.url, token);
  if (!nodes.length) throw new Error('No online node available');
  const storage = cluster.template_storage || 'local';
  const live = await getNodeTemplates(cluster.url, token, nodes[0].node, storage);
  const allowed = new Set(parseAllowedTemplates(cluster.allowed_templates));
  await run('UPDATE template_profiles SET present = 0, updated_at = CURRENT_TIMESTAMP WHERE cluster_id = ?', [clusterId]);
  for (const item of live) {
    const inferred = inferTemplateMetadata(item.volid);
    await run(`
      INSERT INTO template_profiles
        (cluster_id, volid, storage, display_name, os_family, os_version, profile_type, enabled, present)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(cluster_id, volid) DO UPDATE SET
        storage = excluded.storage,
        present = 1,
        updated_at = CURRENT_TIMESTAMP
    `, [clusterId, item.volid, storage, inferred.displayName, inferred.osFamily, inferred.osVersion, inferred.profileType, allowed.has(item.volid) ? 1 : 0]);
  }
  return listClusterTemplates(clusterId);
}

async function ensureClusterTemplates(clusterId) {
  const count = await get('SELECT COUNT(*) AS count FROM template_profiles WHERE cluster_id = ?', [clusterId]);
  if (!Number(count?.count || 0)) {
    try { await syncClusterTemplates(clusterId); } catch (_) { /* cluster may be temporarily offline */ }
  }
  return listClusterTemplates(clusterId);
}

async function listClusterTemplates(clusterId) {
  return all(`
    SELECT id, cluster_id AS clusterId, volid, storage, display_name AS displayName,
      os_family AS osFamily, os_version AS osVersion, profile_type AS profileType,
      description, tags, enabled, present, created_at AS createdAt, updated_at AS updatedAt
    FROM template_profiles
    WHERE cluster_id = ?
    ORDER BY present DESC, enabled DESC, display_name COLLATE NOCASE
  `, [clusterId]);
}

module.exports = { inferTemplateMetadata, syncClusterTemplates, ensureClusterTemplates, listClusterTemplates };
