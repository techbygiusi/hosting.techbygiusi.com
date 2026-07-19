const { get, run, all } = require('../config/database');
const { encrypt, decrypt } = require('./cryptoService');
const {
  getAllContainers, getContainerIps, getCapabilities, getClusterFirewallStatus,
  getClusterNodeAddresses, getOnlineNodes, getNodeTemplates, getNodeStorages,
  getNextVmidInRange, createLxcContainer
} = require('./proxmoxService');

let workerRunning = false;

function stripCidr(ip) { return String(ip || '').split('/')[0].trim(); }
function ipToLong(ip) {
  const parts = String(ip || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}
function longToIp(value) {
  const num = Number(value) >>> 0;
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
}
function allocateIp(start, end, used) {
  const first = ipToLong(start); const last = ipToLong(end);
  if (first === null || last === null || first > last) return null;
  for (let value = first; value <= last; value += 1) {
    const ip = longToIp(value);
    if (!used.has(ip)) return ip;
  }
  return null;
}

async function addEvent(jobId, phase, messageEn, messageDe, technicalMessage = '', level = 'info', progress = null) {
  await run(`INSERT INTO provisioning_job_events (job_id, level, phase, message_en, message_de, technical_message)
    VALUES (?, ?, ?, ?, ?, ?)`, [jobId, level, phase, messageEn, messageDe, technicalMessage || '']);
  if (progress !== null) {
    await run('UPDATE provisioning_jobs SET phase = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [phase, progress, jobId]);
  }
}

async function getJob(jobId, userId = null) {
  const params = [jobId];
  let filter = 'j.id = ?';
  if (userId !== null) { filter += ' AND j.user_id = ?'; params.push(userId); }
  const job = await get(`
    SELECT j.*, c.name AS cluster_name, tp.display_name AS template_name, tp.profile_type
    FROM provisioning_jobs j
    JOIN proxmox_clusters c ON c.id = j.cluster_id
    LEFT JOIN template_profiles tp ON tp.id = j.template_profile_id
    WHERE ${filter}
  `, params);
  if (!job) return null;
  const events = await all(`SELECT id, level, phase, message_en, message_de, created_at
    FROM provisioning_job_events WHERE job_id = ? ORDER BY id ASC`, [jobId]);
  return {
    id: job.id, status: job.status, phase: job.phase, progress: job.progress,
    hostname: job.hostname, cores: job.requested_cores, memoryMb: job.requested_memory_mb,
    diskGb: job.requested_disk_gb, vmid: job.vmid, ip: job.ip, node: job.node,
    resourceId: job.resource_id, error: job.error_message, clusterName: job.cluster_name,
    templateName: job.template_name, profileType: job.profile_type,
    createdAt: job.created_at, startedAt: job.started_at, finishedAt: job.finished_at,
    events: events.map(e => ({ id: e.id, level: e.level, phase: e.phase, messageEn: e.message_en, messageDe: e.message_de, createdAt: e.created_at }))
  };
}

async function listJobsForUser(userId, limit = 20) {
  const rows = await all(`SELECT id FROM provisioning_jobs WHERE user_id = ? ORDER BY id DESC LIMIT ?`, [userId, limit]);
  return Promise.all(rows.map(row => getJob(row.id, userId)));
}

async function createJob({ userId, clusterId, templateProfileId, hostname, cores, memoryMb, diskGb, rootPassword }) {
  const result = await run(`INSERT INTO provisioning_jobs
    (user_id, cluster_id, template_profile_id, hostname, requested_cores, requested_memory_mb, requested_disk_gb, root_password_encrypted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [userId, clusterId, templateProfileId, hostname, cores, memoryMb, diskGb, encrypt(rootPassword)]);
  await addEvent(result.lastID, 'queued', 'Provisioning job queued.', 'Bereitstellungsauftrag wurde eingereiht.', '', 'info', 0);
  queueWorker();
  return getJob(result.lastID, userId);
}

function queueWorker() {
  if (workerRunning) return;
  workerRunning = true;
  setImmediate(processQueue);
}

async function processQueue() {
  try {
    let job;
    while ((job = await get(`SELECT * FROM provisioning_jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1`))) {
      await run(`UPDATE provisioning_jobs SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [job.id]);
      try { await executeJob(job.id); }
      catch (error) {
        const message = String(error?.message || 'Provisioning failed').slice(0, 500);
        await addEvent(job.id, 'failed', 'Provisioning failed.', 'Bereitstellung fehlgeschlagen.', message, 'error', 100);
        await run(`UPDATE provisioning_jobs SET status = 'failed', phase = 'failed', progress = 100, error_message = ?, root_password_encrypted = '', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [message, job.id]);
      }
    }
  } finally {
    workerRunning = false;
    const pending = await get(`SELECT id FROM provisioning_jobs WHERE status = 'queued' LIMIT 1`);
    if (pending) queueWorker();
  }
}

async function executeJob(jobId) {
  const job = await get(`SELECT j.*, u.email AS user_email, c.*, tp.volid, tp.display_name, tp.profile_type, tp.tags, tp.enabled, tp.present
    FROM provisioning_jobs j
    JOIN users u ON u.id = j.user_id
    JOIN proxmox_clusters c ON c.id = j.cluster_id
    LEFT JOIN template_profiles tp ON tp.id = j.template_profile_id
    WHERE j.id = ?`, [jobId]);
  if (!job || !job.volid || !job.enabled || !job.present) throw new Error('The selected template is no longer available');
  const apiToken = decrypt(job.api_token);
  const password = decrypt(job.root_password_encrypted);

  await addEvent(jobId, 'validate', 'Checking limits and cluster permissions…', 'Limits und Cluster-Berechtigungen werden geprüft…', '', 'info', 8);
  const caps = await getCapabilities(job.url, apiToken);
  if (!caps.canProvision || !caps.canManageFirewall || !caps.canVerifyFirewall) throw new Error('Required Proxmox permissions are missing');
  const firewall = await getClusterFirewallStatus(job.url, apiToken);
  if (!firewall.enabled) throw new Error('Proxmox datacenter firewall is disabled');

  await addEvent(jobId, 'reserve', 'Reserving VMID and IP address…', 'VMID und IP-Adresse werden reserviert…', '', 'info', 18);
  const reservedMachines = await all('SELECT vmid FROM provisioned_machines WHERE cluster_id = ?', [job.cluster_id]);
  const reservedJobs = await all(`SELECT vmid FROM provisioning_jobs WHERE cluster_id = ? AND id != ? AND status IN ('queued','running') AND vmid IS NOT NULL`, [job.cluster_id, jobId]);
  const vmid = await getNextVmidInRange(job.url, apiToken, job.vmid_min, job.vmid_max, [...reservedMachines, ...reservedJobs].map(r => r.vmid));
  const usedIps = new Set((await all('SELECT ip FROM provisioned_machines WHERE cluster_id = ? AND ip IS NOT NULL', [job.cluster_id])).map(r => stripCidr(r.ip)).filter(Boolean));
  const activeJobIps = await all(`SELECT ip FROM provisioning_jobs WHERE cluster_id = ? AND id != ? AND status IN ('queued','running') AND ip IS NOT NULL`, [job.cluster_id, jobId]);
  activeJobIps.forEach(r => usedIps.add(stripCidr(r.ip)));
  const lateralDestinations = new Set();
  const liveResources = await getAllContainers(job.url, apiToken).catch(() => []);
  for (const item of liveResources) {
    const ips = await getContainerIps(job.url, apiToken, item.node, item.type, item.vmid).catch(() => []);
    ips.forEach(entry => { const ipv4 = stripCidr(entry.ipv4 || entry.ip || ''); if (ipv4) { usedIps.add(ipv4); lateralDestinations.add(ipv4); } });
  }
  (await getClusterNodeAddresses(job.url, apiToken).catch(() => [])).forEach(address => lateralDestinations.add(address));
  const ip = allocateIp(job.ip_start, job.ip_end, usedIps);
  if (!ip) throw new Error('No free IP address available in the configured range');
  const nodes = await getOnlineNodes(job.url, apiToken);
  if (!nodes.length) throw new Error('No online node available');
  const node = nodes[0].node;
  await run('UPDATE provisioning_jobs SET vmid = ?, ip = ?, node = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [vmid, ip, node, jobId]);
  await addEvent(jobId, 'reserve', `Reserved VMID ${vmid} and IP ${ip}.`, `VMID ${vmid} und IP ${ip} wurden reserviert.`, `node=${node} vmid=${vmid} ip=${ip}`, 'info', 28);

  const templates = await getNodeTemplates(job.url, apiToken, node, job.template_storage || 'local');
  if (!templates.some(item => item.volid === job.volid)) throw new Error('Template is no longer present on Proxmox');
  const storages = await getNodeStorages(job.url, apiToken, node);
  const storageNames = storages.map(item => item.storage);
  const selectedStorage = storageNames.includes(job.storage || 'local') ? (job.storage || 'local') : storageNames[0];
  if (!selectedStorage) throw new Error('No usable storage found');

  const progressMap = {
    create: [42, 'Creating the LXC container…', 'LXC-Container wird erstellt…', `template=${job.volid}`],
    filesystem: [55, 'Preparing the container filesystem…', 'Container-Dateisystem wird vorbereitet…', `storage=${selectedStorage} disk=${job.requested_disk_gb}G`],
    firewall: [68, 'Applying firewall isolation…', 'Firewall-Isolation wird eingerichtet…', `blocked_destinations=${lateralDestinations.size}`],
    start: [80, 'Starting the container…', 'Container wird gestartet…', `node=${node} vmid=${vmid}`]
  };
  await createLxcContainer(job.url, apiToken, node, {
    vmid, hostname: job.hostname, ostemplate: job.volid, storage: selectedStorage,
    diskGb: job.requested_disk_gb, cores: job.requested_cores, memoryMb: job.requested_memory_mb,
    password, bridge: job.bridge || 'vmbr0', ip, ipPrefix: job.ip_prefix || 24,
    gateway: job.gateway, tags: job.tags || '', profileType: job.profile_type || 'base', blockedDestinations: Array.from(lateralDestinations),
    onProgress: async phase => {
      const item = progressMap[phase];
      if (item) await addEvent(jobId, phase, item[1], item[2], item[3] || '', 'info', item[0]);
    }
  });

  const profileLabel = job.profile_type === 'docker' ? 'Docker' : job.profile_type === 'nginx' ? 'Nginx' : job.display_name;
  await addEvent(jobId, 'verify', `Verifying ${profileLabel} container state…`, `${profileLabel}-Containerstatus wird geprüft…`, '', 'info', 88);
  await run('INSERT INTO provisioned_machines (cluster_id, vmid, ip, hostname, source_template, user_id) VALUES (?, ?, ?, ?, ?, ?)', [job.cluster_id, vmid, ip, job.hostname, job.volid, job.user_id]);
  const resourceResult = await run(`INSERT INTO resources (name, container_id, cluster_id, user_id, web_url, public_url, admin_url, resource_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [job.hostname, String(vmid), job.cluster_id, job.user_id, '', '', '', 'lxc']);
  await run(`INSERT INTO resource_credentials
    (resource_id, label, username, secret_encrypted, url, notes, created_by, created_by_role, purpose)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [resourceResult.lastID, 'Root-Passwort', 'root', encrypt(password), '', 'Automatisch beim Erstellen des Containers gespeichert.', job.user_id, 'user', 'general']);
  await run(`INSERT INTO audit_log (user_id, user_email, action, target, details, ip) VALUES (?, ?, ?, ?, ?, '')`, [job.user_id, job.user_email, 'machine.create', `resource:${resourceResult.lastID}`, `LXC ${job.hostname} (VMID ${vmid}, ${ip}, ${job.display_name})`]);
  await addEvent(jobId, 'complete', 'Container is ready.', 'Container ist bereit.', `resource_id=${resourceResult.lastID} node=${node} vmid=${vmid}`, 'success', 100);
  await run(`UPDATE provisioning_jobs SET status = 'success', phase = 'complete', progress = 100, resource_id = ?, finished_at = CURRENT_TIMESTAMP, root_password_encrypted = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [resourceResult.lastID, jobId]);
}

async function resumeProvisioningJobs() {
  try {
    await run(`UPDATE provisioning_jobs SET status = 'failed', phase = 'failed', progress = 100, error_message = 'Backend restarted during provisioning', root_password_encrypted = '', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE status = 'running'`);
    queueWorker();
  } catch (err) {
    console.error('Provisioning job recovery failed:', err.message);
  }
}

module.exports = { createJob, getJob, listJobsForUser, queueWorker, resumeProvisioningJobs };
