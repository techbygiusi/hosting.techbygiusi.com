const { getClusterResources, getResourceDiskDetails } = require('./proxmoxService');

function normalizeResourceRow(row, liveResource = null, error = null, diskInfo = null) {
  const liveName = liveResource?.name || liveResource?.id || liveResource?.vmid;
  const disks = Array.isArray(diskInfo?.disks) ? diskInfo.disks : [];
  const filesystems = Array.isArray(diskInfo?.filesystems) ? diskInfo.filesystems : [];

  return {
    id: row.id,
    name: row.name || liveName || `Ressource ${row.container_id}`,
    containerId: String(row.container_id),
    vmid: liveResource?.vmid || row.container_id,
    type: liveResource?.type || row.container_type || 'unbekannt',
    status: liveResource?.status || 'unknown',
    node: liveResource?.node || row.node || '',
    cpu: Number(liveResource?.cpu || 0),
    maxcpu: Number(liveResource?.maxcpu || 0),
    mem: Number(liveResource?.mem || 0),
    maxmem: Number(liveResource?.maxmem || 0),
    disk: Number(diskInfo?.disk ?? liveResource?.disk ?? 0),
    maxdisk: Number(diskInfo?.maxdisk ?? liveResource?.maxdisk ?? 0),
    disks,
    filesystems,
    uptime: Number(liveResource?.uptime || 0),
    clusterId: row.cluster_id,
    clusterName: row.cluster_name || '',
    userId: row.user_id,
    userName: row.user_name || '',
    userEmail: row.user_email || '',
    webUrl: row.web_url || '',
    monitorError: error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function enrichResources(rows) {
  const grouped = rows.reduce((acc, row) => {
    const key = String(row.cluster_id);
    if (!acc[key]) {
      acc[key] = {
        clusterUrl: row.cluster_url,
        apiToken: row.api_token,
        rows: []
      };
    }
    acc[key].rows.push(row);
    return acc;
  }, {});

  const result = [];

  for (const group of Object.values(grouped)) {
    let liveResources = [];
    let clusterError = null;

    try {
      liveResources = await getClusterResources(group.clusterUrl, group.apiToken);
    } catch (err) {
      clusterError = err.message || 'Monitoring konnte nicht geladen werden.';
    }

    for (const row of group.rows) {
      const liveResource = liveResources.find(item => String(item.vmid) === String(row.container_id));
      let diskInfo = null;
      let rowError = clusterError;

      if (liveResource && !clusterError) {
        try {
          diskInfo = await getResourceDiskDetails(group.clusterUrl, group.apiToken, liveResource);
        } catch (err) {
          rowError = err.message || 'Disk-Informationen konnten nicht geladen werden.';
        }
      }

      result.push(normalizeResourceRow(row, liveResource, rowError, diskInfo));
    }
  }

  return result;
}

module.exports = {
  enrichResources
};
