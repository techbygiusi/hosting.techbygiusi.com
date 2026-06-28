const axios = require('axios');
const https = require('https');

// Disable SSL validation for self-signed certificates (careful in production!)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Get all containers from a Proxmox cluster
 */
async function getAllContainers(clusterUrl, apiToken) {
  try {
    const client = createProxmoxClient(clusterUrl, apiToken);
    
    // Get nodes
    const nodesResponse = await client.get('/api2/json/nodes');
    const nodes = nodesResponse.data.data || [];

    let allContainers = [];

    // For each node, get LXCs and VMs
    for (const node of nodes) {
      const nodeName = node.node;

      // Get LXCs
      try {
        const lxcResponse = await client.get(`/api2/json/nodes/${nodeName}/lxc`);
        const lxcs = (lxcResponse.data.data || []).map(container => ({
          ...container,
          type: 'lxc',
          node: nodeName
        }));
        allContainers = allContainers.concat(lxcs);
      } catch (err) {
        console.warn(`Failed to get LXCs from node ${nodeName}:`, err.message);
      }

      // Get VMs (QEMU)
      try {
        const qemuResponse = await client.get(`/api2/json/nodes/${nodeName}/qemu`);
        const vms = (qemuResponse.data.data || []).map(container => ({
          ...container,
          type: 'qemu',
          node: nodeName
        }));
        allContainers = allContainers.concat(vms);
      } catch (err) {
        console.warn(`Failed to get VMs from node ${nodeName}:`, err.message);
      }
    }

    return allContainers;
  } catch (error) {
    console.error('Error fetching containers from Proxmox:', error.message);
    throw error;
  }
}

/**
 * Get container details
 */
async function getContainerDetails(clusterUrl, apiToken, node, type, vmid) {
  try {
    const client = createProxmoxClient(clusterUrl, apiToken);
    const endpoint = type === 'lxc' 
      ? `/api2/json/nodes/${node}/lxc/${vmid}/status/current`
      : `/api2/json/nodes/${node}/qemu/${vmid}/status/current`;

    const response = await client.get(endpoint);
    return response.data.data || {};
  } catch (error) {
    console.error(`Error fetching container details:`, error.message);
    throw error;
  }
}

/**
 * Get container IP addresses
 */
async function getContainerIps(clusterUrl, apiToken, node, type, vmid) {
  try {
    const client = createProxmoxClient(clusterUrl, apiToken);
    
    if (type === 'lxc') {
      const response = await client.get(`/api2/json/nodes/${node}/lxc/${vmid}/interfaces`);
      const interfaces = response.data.data || {};
      
      const ips = [];
      for (const [name, iface] of Object.entries(interfaces)) {
        if (iface.inet) {
          ips.push({
            interface: name,
            ipv4: iface.inet
          });
        }
        if (iface.inet6) {
          ips.push({
            interface: name,
            ipv6: iface.inet6
          });
        }
      }
      return ips;
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching container IPs:`, error.message);
    return [];
  }
}

/**
 * Test Proxmox connection
 */
async function testConnection(clusterUrl, apiToken) {
  try {
    const client = createProxmoxClient(clusterUrl, apiToken);
    const response = await client.get('/api2/json/cluster/resources');
    return {
      success: true,
      message: 'Connection successful'
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error.message}`
    };
  }
}

/**
 * Create Proxmox API client
 */
function createProxmoxClient(baseURL, token) {
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `PVEAPIToken=${token}`,
      'Content-Type': 'application/json'
    },
    httpsAgent,
    validateStatus: () => true // Don't throw on any status
  });
}

module.exports = {
  getAllContainers,
  getContainerDetails,
  getContainerIps,
  testConnection,
  createProxmoxClient
};
