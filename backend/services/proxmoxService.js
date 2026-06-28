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

async function getContainerIps(clusterUrl, apiToken, node, type, vmid) {
  try {
    const client = createProxmoxClient(clusterUrl, apiToken);

    if (type === 'lxc') {
      const response = await client.get(`/api2/json/nodes/${node}/lxc/${vmid}/interfaces`);
      if (response.status < 200 || response.status >= 300) return [];
      const interfaces = response.data?.data || {};

      const ips = [];
      for (const [name, iface] of Object.entries(interfaces)) {
        if (iface.inet) ips.push({ interface: name, ipv4: iface.inet });
        if (iface.inet6) ips.push({ interface: name, ipv6: iface.inet6 });
      }
      return ips;
    }

    return [];
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

module.exports = {
  getAllContainers,
  getClusterResources,
  getContainerDetails,
  getContainerIps,
  getResourceDiskDetails,
  testConnection,
  createProxmoxClient
};
