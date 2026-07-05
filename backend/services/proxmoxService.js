const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const VM_DISK_KEY = /^(ide|sata|scsi|virtio)\d+$/;
const LXC_DISK_KEY = /^(rootfs|mp\d+)$/;

function createProxmoxClient(baseURL, token) {
  return axios.create({
    baseURL,
    headers: {
      Authorization: `PVEAPIToken=${token}`,
      'Content-Type': 'application/json'
    },
    httpsAgent,
    timeout: 10000,
    validateStatus: () => true
  });
}

function ensureSuccess(response, fallbackMessage) {
  if (response.status >= 200 && response.status < 300) return;
  throw new Error(`${fallbackMessage} HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
}

function parseSizeToBytes(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)([kmgtpe]?i?b?)?$/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = (match[2] || '').toLowerCase().replace('ib', '').replace('b', '');
  const powers = { '': 0, k: 1, m: 2, g: 3, t: 4, p: 5, e: 6 };
  return Math.round(amount * Math.pow(1024, powers[unit] || 0));
}

function parseDiskDefinition(key, value) {
  const parts = String(value || '').split(',').map(part => part.trim()).filter(Boolean);
  const first = parts.shift() || '';
  const options = {};

  for (const part of parts) {
    const index = part.indexOf('=');
    if (index === -1) {
      options[part] = true;
    } else {
      options[part.slice(0, index)] = part.slice(index + 1);
    }
  }

  if (options.media === 'cdrom' || first.includes('cloudinit')) return null;

  const storage = first.includes(':') ? first.split(':')[0] : '';
  const volume = first.includes(':') ? first.slice(first.indexOf(':') + 1) : first;
  const size = parseSizeToBytes(options.size);

  return {
    id: key,
    name: key === 'rootfs' ? 'Root-Disk' : key.toUpperCase(),
    storage,
    volume,
    used: null,
    maxdisk: size,
    source: 'config'
  };
}

function normalizeClusterResource(item) {
  return {
    ...item,
    vmid: item.vmid,
    id: String(item.vmid),
    name: item.name || item.id || `${item.type || 'vm'}-${item.vmid}`,
    type: item.type,
    node: item.node || '',
    status: item.status || 'unknown',
    cpu: Number(item.cpu || 0),
    maxcpu: Number(item.maxcpu || 0),
    mem: Number(item.mem || 0),
    maxmem: Number(item.maxmem || 0),
    disk: Number(item.disk || 0),
    maxdisk: Number(item.maxdisk || 0),
    uptime: Number(item.uptime || 0)
  };
}

async function getClusterResources(clusterUrl, apiToken) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get('/api2/json/cluster/resources?type=vm');
  ensureSuccess(response, 'Proxmox Ressourcenabfrage fehlgeschlagen:');

  const resources = response.data?.data || [];
  if (!Array.isArray(resources)) {
    throw new Error('Proxmox hat eine unerwartete Antwort geliefert.');
  }

  return resources
    .filter(item => item.type === 'lxc' || item.type === 'qemu')
    .map(normalizeClusterResource)
    .sort((a, b) => Number(a.vmid) - Number(b.vmid));
}

async function getAllContainers(clusterUrl, apiToken) {
  return getClusterResources(clusterUrl, apiToken);
}

async function getContainerDetails(clusterUrl, apiToken, node, type, vmid) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const endpoint = type === 'lxc'
    ? `/api2/json/nodes/${node}/lxc/${vmid}/status/current`
    : `/api2/json/nodes/${node}/qemu/${vmid}/status/current`;

  const response = await client.get(endpoint);
  ensureSuccess(response, 'Proxmox Detailabfrage fehlgeschlagen:');
  return response.data?.data || {};
}

async function getVmConfigDisks(client, node, type, vmid) {
  const endpoint = type === 'lxc'
    ? `/api2/json/nodes/${node}/lxc/${vmid}/config`
    : `/api2/json/nodes/${node}/qemu/${vmid}/config`;

  const response = await client.get(endpoint);
  if (response.status < 200 || response.status >= 300) return [];

  const config = response.data?.data || {};
  const matcher = type === 'lxc' ? LXC_DISK_KEY : VM_DISK_KEY;

  return Object.entries(config)
    .filter(([key]) => matcher.test(key))
    .map(([key, value]) => parseDiskDefinition(key, value))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

async function getQemuGuestFilesystems(client, node, vmid) {
  const response = await client.get(`/api2/json/nodes/${node}/qemu/${vmid}/agent/get-fsinfo`);
  if (response.status < 200 || response.status >= 300) return [];

  const payload = response.data?.data?.result || response.data?.data || [];
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item, index) => {
      const maxdisk = Number(item['total-bytes'] || item.totalBytes || 0);
      const used = Number(item['used-bytes'] || item.usedBytes || 0);
      if (!maxdisk) return null;
      return {
        id: item.mountpoint || item.name || `fs-${index}`,
        name: item.mountpoint || item.name || `Dateisystem ${index + 1}`,
        storage: item.type || '',
        volume: Array.isArray(item.disk) ? item.disk.map(disk => disk.dev || disk.serial || '').filter(Boolean).join(', ') : '',
        used,
        maxdisk,
        source: 'guest-agent'
      };
    })
    .filter(Boolean);
}

async function getResourceDiskDetails(clusterUrl, apiToken, resource) {
  if (!resource?.node || !resource?.vmid || !resource?.type) {
    return { disks: [], filesystems: [], disk: Number(resource?.disk || 0), maxdisk: Number(resource?.maxdisk || 0) };
  }

  const client = createProxmoxClient(clusterUrl, apiToken);
  const type = resource.type;
  const vmid = resource.vmid;
  const node = resource.node;
  const disks = await getVmConfigDisks(client, node, type, vmid);
  const liveDisk = Number(resource.disk || 0);
  const liveMaxDisk = Number(resource.maxdisk || 0);

  if (type === 'qemu') {
    const filesystems = await getQemuGuestFilesystems(client, node, vmid);
    const configuredTotal = disks.reduce((sum, disk) => sum + Number(disk.maxdisk || 0), 0);
    const fsUsed = filesystems.reduce((sum, disk) => sum + Number(disk.used || 0), 0);
    const fsTotal = filesystems.reduce((sum, disk) => sum + Number(disk.maxdisk || 0), 0);

    return {
      disks,
      filesystems,
      disk: fsUsed || liveDisk,
      maxdisk: fsTotal || configuredTotal || liveMaxDisk
    };
  }

  const normalizedDisks = disks.map((disk, index) => {
    const shouldUseLiveValues = index === 0 && liveMaxDisk;
    return {
      ...disk,
      used: shouldUseLiveValues ? liveDisk : null,
      maxdisk: disk.maxdisk || (shouldUseLiveValues ? liveMaxDisk : 0)
    };
  });

  return {
    disks: normalizedDisks,
    filesystems: [],
    disk: liveDisk,
    maxdisk: liveMaxDisk || normalizedDisks.reduce((sum, disk) => sum + Number(disk.maxdisk || 0), 0)
  };
}

function stripCidrAddress(value) {
  return String(value || '').split('/')[0].trim();
}

function isUsableIpv4(value) {
  const ip = stripCidrAddress(value);
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  if (parts.some(part => part < 0 || part > 255)) return false;
  if (parts[0] === 127 || parts[0] === 0) return false;
  if (parts[0] === 169 && parts[1] === 254) return false;
  if (ip === '255.255.255.255') return false;
  return true;
}

function isUsableIpv6(value) {
  const ip = stripCidrAddress(value).toLowerCase();
  if (!ip || ip === '::1' || ip.startsWith('fe80:')) return false;
  return ip.includes(':');
}

function parseKeyValueOptions(value) {
  const options = {};
  String(value || '').split(',').map(part => part.trim()).filter(Boolean).forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) options[part] = true;
    else options[part.slice(0, index)] = part.slice(index + 1);
  });
  return options;
}

function parseLxcNetworkConfig(key, value) {
  const options = parseKeyValueOptions(value);
  const ipv4 = isUsableIpv4(options.ip) ? stripCidrAddress(options.ip) : '';
  const ipv6 = isUsableIpv6(options.ip6) ? stripCidrAddress(options.ip6) : '';
  if (!ipv4 && !ipv6) return null;
  return {
    interface: options.name || key,
    ipv4,
    ipv6,
    source: 'config'
  };
}

function normalizeInterfaceIp(name, iface) {
  const interfaceName = iface?.name || name;
  const ipv4 = isUsableIpv4(iface?.inet) ? stripCidrAddress(iface.inet) : '';
  const ipv6 = isUsableIpv6(iface?.inet6) ? stripCidrAddress(iface.inet6) : '';
  if (!ipv4 && !ipv6) return null;
  return {
    interface: interfaceName,
    ipv4,
    ipv6,
    source: 'live'
  };
}

function mergeIpEntries(...groups) {
  const seen = new Set();
  return groups.flat().filter((entry) => {
    if (!entry) return false;
    const key = `${entry.interface}|${entry.ipv4 || ''}|${entry.ipv6 || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    const aEth = /^(eth0|net0)$/i.test(a.interface || '') ? 0 : 1;
    const bEth = /^(eth0|net0)$/i.test(b.interface || '') ? 0 : 1;
    if (aEth !== bEth) return aEth - bEth;
    const aStatic = a.source === 'config' ? 0 : 1;
    const bStatic = b.source === 'config' ? 0 : 1;
    if (aStatic !== bStatic) return aStatic - bStatic;
    return String(a.interface || '').localeCompare(String(b.interface || ''), undefined, { numeric: true });
  });
}

async function getLxcConfigIps(client, node, vmid) {
  const response = await client.get(`/api2/json/nodes/${node}/lxc/${vmid}/config`);
  if (response.status < 200 || response.status >= 300) return [];
  const config = response.data?.data || {};
  return Object.entries(config)
    .filter(([key]) => /^net\d+$/.test(key))
    .map(([key, value]) => parseLxcNetworkConfig(key, value))
    .filter(Boolean);
}

async function getLxcLiveIps(client, node, vmid) {
  const response = await client.get(`/api2/json/nodes/${node}/lxc/${vmid}/interfaces`);
  if (response.status < 200 || response.status >= 300) return [];
  const interfaces = response.data?.data || {};
  return Object.entries(interfaces)
    .map(([name, iface]) => normalizeInterfaceIp(name, iface))
    .filter(Boolean);
}

async function getContainerIps(clusterUrl, apiToken, node, type, vmid) {
  try {
    if (type !== 'lxc') return [];

    const client = createProxmoxClient(clusterUrl, apiToken);
    const [configIps, liveIps] = await Promise.all([
      getLxcConfigIps(client, node, vmid).catch(() => []),
      getLxcLiveIps(client, node, vmid).catch(() => [])
    ]);

    // Prefer static LXC config because it is visible in Proxmox even when the
    // container has not fully reported guest interfaces yet. Loopback and
    // link-local addresses are filtered out before the UI sees them.
    return mergeIpEntries(configIps, liveIps);
  } catch (error) {
    return [];
  }
}

async function testConnection(clusterUrl, apiToken) {
  try {
    const resources = await getClusterResources(clusterUrl, apiToken);
    return {
      success: true,
      message: `Verbindung erfolgreich. ${resources.length} Ressourcen gefunden.`
    };
  } catch (error) {
    return {
      success: false,
      message: `Verbindung fehlgeschlagen: ${error.message}`
    };
  }
}

/* ------------------------------------------------------------------ v2.0 */

const POWER_ACTIONS = ['start', 'stop', 'shutdown', 'reboot'];

/**
 * Start / stop / shutdown / reboot a VM or container. Returns the task UPID.
 */
async function powerAction(clusterUrl, apiToken, node, type, vmid, action) {
  if (!POWER_ACTIONS.includes(action)) {
    throw new Error(`Unsupported power action: ${action}`);
  }
  const client = createProxmoxClient(clusterUrl, apiToken);
  const kind = type === 'lxc' ? 'lxc' : 'qemu';
  const response = await client.post(`/api2/json/nodes/${node}/${kind}/${vmid}/status/${action}`, {});
  ensureSuccess(response, `Proxmox ${action} fehlgeschlagen:`);
  return { upid: response.data?.data || '' };
}

/**
 * Recent tasks for a specific VM/CT on its node.
 */
async function getVmTasks(clusterUrl, apiToken, node, vmid, limit = 30) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get(`/api2/json/nodes/${node}/tasks?vmid=${vmid}&limit=${limit}`);
  ensureSuccess(response, 'Proxmox Task-Abfrage fehlgeschlagen:');
  const tasks = response.data?.data || [];
  return tasks.map(task => ({
    upid: task.upid,
    type: task.type,
    status: task.status || (task.endtime ? 'unknown' : 'running'),
    user: task.user,
    starttime: task.starttime,
    endtime: task.endtime || null
  }));
}

/**
 * Log lines of a single task (UPID).
 */
async function getTaskLog(clusterUrl, apiToken, node, upid, start = 0, limit = 500) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get(
    `/api2/json/nodes/${node}/tasks/${encodeURIComponent(upid)}/log?start=${start}&limit=${limit}`
  );
  ensureSuccess(response, 'Proxmox Log-Abfrage fehlgeschlagen:');
  const lines = response.data?.data || [];
  return lines.map(line => ({ n: line.n, t: line.t }));
}

async function getTaskStatus(clusterUrl, apiToken, node, upid) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get(`/api2/json/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`);
  ensureSuccess(response, 'Proxmox Task-Status fehlgeschlagen:');
  return response.data?.data || {};
}

/**
 * Read the permissions of the configured API token and derive portal capabilities.
 * Read-only tokens automatically hide power/console/provisioning in the UI.
 */
async function getCapabilities(clusterUrl, apiToken) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get('/api2/json/access/permissions');

  if (response.status < 200 || response.status >= 300) {
    // Older Proxmox or restricted token: assume read-only, portal stays usable
    return { readOnly: true, canPower: false, canConsole: false, canProvision: false, privileges: [] };
  }

  const perms = response.data?.data || {};
  const privileges = new Set();
  for (const path of Object.keys(perms)) {
    for (const priv of Object.keys(perms[path] || {})) {
      if (perms[path][priv]) privileges.add(priv);
    }
  }

  const canPower = privileges.has('VM.PowerMgmt');
  const canConsole = privileges.has('VM.Console');
  const canProvision = privileges.has('VM.Allocate');

  return {
    readOnly: !canPower && !canConsole && !canProvision,
    canPower,
    canConsole,
    canProvision,
    privileges: Array.from(privileges).sort()
  };
}

/**
 * Create a termproxy session (xterm.js console) for a VM/CT.
 * Returns ticket, port and user needed to open the websocket.
 */
async function createTermProxy(clusterUrl, apiToken, node, type, vmid) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const kind = type === 'lxc' ? 'lxc' : 'qemu';
  const response = await client.post(`/api2/json/nodes/${node}/${kind}/${vmid}/termproxy`, {});
  ensureSuccess(response, 'Konsole konnte nicht geöffnet werden:');
  const data = response.data?.data || {};
  return { ticket: data.ticket, port: data.port, user: data.user };
}

/**
 * List online cluster nodes sorted by free memory (best target first).
 */
async function getOnlineNodes(clusterUrl, apiToken) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get('/api2/json/cluster/resources?type=node');
  ensureSuccess(response, 'Proxmox Node-Abfrage fehlgeschlagen:');
  const nodes = (response.data?.data || [])
    .filter(item => item.type === 'node' && item.status === 'online')
    .map(item => ({
      node: item.node,
      freeMem: Number(item.maxmem || 0) - Number(item.mem || 0)
    }))
    .sort((a, b) => b.freeMem - a.freeMem);
  return nodes;
}

/**
/**
 * LXC templates available on a template storage of a node.
 */
async function getNodeTemplates(clusterUrl, apiToken, node, storage) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get(`/api2/json/nodes/${node}/storage/${storage}/content?content=vztmpl`);
  if (response.status < 200 || response.status >= 300) return [];
  return (response.data?.data || []).map(item => ({
    volid: item.volid,
    name: String(item.volid || '').split('/').pop()
  }));
}

/**
 * ISO images available on a storage of a node (for VM provisioning).
 */
async function getNodeIsos(clusterUrl, apiToken, node, storage) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get(`/api2/json/nodes/${node}/storage/${storage}/content?content=iso`);
  if (response.status < 200 || response.status >= 300) return [];
  return (response.data?.data || []).map(item => ({
    volid: item.volid,
    name: String(item.volid || '').split('/').pop()
  }));
}

/**
 * Storages of a node, optionally filtered by a content type (iso, vztmpl, images, rootdir).
 */
async function getNodeStorages(clusterUrl, apiToken, node, contentType = null) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get(`/api2/json/nodes/${node}/storage`);
  if (response.status < 200 || response.status >= 300) return [];
  return (response.data?.data || [])
    .filter(item => item && item.storage)
    .filter(item => item.enabled !== 0 && item.active !== 0 && item.status !== 'disabled')
    .filter(item => !contentType || String(item.content || '').split(',').map(value => value.trim()).includes(contentType))
    .map(item => ({
      storage: item.storage,
      content: item.content,
      type: item.type,
      active: item.active,
      enabled: item.enabled
    }));
}

/**
 * Next free VMID within the admin-configured range, checked against live cluster IDs.
 */
async function getNextVmidInRange(clusterUrl, apiToken, min, max, reservedIds = []) {
  const resources = await getClusterResources(clusterUrl, apiToken);
  const used = new Set(resources.map(item => Number(item.vmid)));
  reservedIds.forEach(id => used.add(Number(id)));

  for (let vmid = Number(min); vmid <= Number(max); vmid += 1) {
    if (!used.has(vmid)) return vmid;
  }
  throw new Error('Keine freie VMID im konfigurierten Bereich verfügbar.');
}

/**
 * Create an LXC container and return the task UPID.
 */
async function createLxcContainer(clusterUrl, apiToken, node, options) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const payload = {
    vmid: options.vmid,
    hostname: options.hostname,
    ostemplate: options.ostemplate,
    storage: options.storage,
    rootfs: `${options.storage}:${options.diskGb}`,
    cores: options.cores,
    memory: options.memoryMb,
    swap: 0,
    password: options.password,
    unprivileged: 1,
    features: 'nesting=1',
    net0: `name=eth0,bridge=${options.bridge},ip=${options.ip}/${options.ipPrefix},gw=${options.gateway},firewall=1`,
    start: 1
  };

  const response = await client.post(`/api2/json/nodes/${node}/lxc`, payload);
  ensureSuccess(response, 'Container konnte nicht erstellt werden:');
  return { upid: response.data?.data || '', node };
}

/**
 * Destroy a VM or LXC and return the task UPID. Used only for user-owned
 * self-service machines after the backend has verified ownership.
 */
async function destroyProxmoxResource(clusterUrl, apiToken, node, type, vmid) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const kind = type === 'lxc' ? 'lxc' : 'qemu';
  const params = type === 'lxc'
    ? { purge: 1, force: 1 }
    : { purge: 1, 'destroy-unreferenced-disks': 1, skiplock: 1 };

  const response = await client.delete(`/api2/json/nodes/${node}/${kind}/${vmid}`, { params });
  ensureSuccess(response, 'Maschine konnte nicht gelöscht werden:');
  return { upid: response.data?.data || '', node };
}

/**
 * Create an empty QEMU VM booting from an ISO and return the task UPID.
 * Network is configured but the guest OS must be installed via the console.
 */
async function createQemuVm(clusterUrl, apiToken, node, options) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const payload = {
    vmid: options.vmid,
    name: options.hostname,
    cores: options.cores,
    sockets: 1,
    memory: options.memoryMb,
    scsihw: 'virtio-scsi-single',
    scsi0: `${options.storage}:${options.diskGb},iothread=1`,
    ide2: `${options.iso},media=cdrom`,
    net0: `virtio,bridge=${options.bridge},firewall=1`,
    ostype: 'l26',
    boot: 'order=ide2;scsi0',
    agent: 1
  };

  const response = await client.post(`/api2/json/nodes/${node}/qemu`, payload);
  ensureSuccess(response, 'VM konnte nicht erstellt werden:');
  return { upid: response.data?.data || '', node };
}

module.exports = {
  getAllContainers,
  getClusterResources,
  getContainerDetails,
  getContainerIps,
  getResourceDiskDetails,
  testConnection,
  createProxmoxClient,
  powerAction,
  getVmTasks,
  getTaskLog,
  getTaskStatus,
  getCapabilities,
  createTermProxy,
  getOnlineNodes,
  getNodeTemplates,
  getNodeIsos,
  getNodeStorages,
  getNextVmidInRange,
  createLxcContainer,
  createQemuVm,
  destroyProxmoxResource,
  POWER_ACTIONS
};
