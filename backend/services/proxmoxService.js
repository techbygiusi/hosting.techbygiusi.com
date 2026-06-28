const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

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
  testConnection,
  createProxmoxClient
};
