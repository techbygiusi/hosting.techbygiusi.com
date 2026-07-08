const axios = require('axios');
const https = require('https');
const WebSocket = require('ws');

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


const COMMUNITY_SCRIPTS_REPO = 'community-scripts/ProxmoxVE';
const COMMUNITY_SCRIPTS_BRANCH = 'main';
const COMMUNITY_SCRIPTS_CT_API = `https://api.github.com/repos/${COMMUNITY_SCRIPTS_REPO}/contents/ct?ref=${COMMUNITY_SCRIPTS_BRANCH}`;
const COMMUNITY_SCRIPTS_RAW = `https://raw.githubusercontent.com/${COMMUNITY_SCRIPTS_REPO}/${COMMUNITY_SCRIPTS_BRANCH}/ct`;
const COMMUNITY_SCRIPT_CACHE_MS = 30 * 60 * 1000;
let communityScriptCache = { time: 0, items: [] };

const COMMUNITY_SCRIPT_DENY = [
  /vpn/i, /wireguard/i, /openvpn/i, /tailscale/i, /headscale/i, /zerotier/i,
  /firewall/i, /router/i, /gateway/i, /proxy/i, /dnsmasq/i,
  /proxmox/i, /pve/i, /pbs/i, /backup/i, /cleanup/i, /clean/i, /kernel/i,
  /microcode/i, /post[-_]?install/i, /tools?/i, /monitoring/i, /grafana/i,
  /prometheus/i, /zabbix/i, /wazuh/i, /crowdsec/i, /authentik/i, /vault/i
];

const COMMUNITY_SCRIPT_FALLBACK = [
  'adguard', 'actualbudget', 'audiobookshelf', 'bookstack', 'changedetection',
  'dashy', 'dozzle', 'filebrowser', 'gitea', 'homeassistant', 'homepage',
  'immich', 'jellyfin', 'mealie', 'n8n', 'nextcloud', 'paperless-ngx',
  'photoprism', 'plex', 'portainer', 'vaultwarden'
].map(slug => ({
  id: slug,
  slug,
  name: titleFromSlug(slug),
  path: `ct/${slug}.sh`,
  url: `${COMMUNITY_SCRIPTS_RAW}/${slug}.sh`,
  source: 'fallback'
}));

function titleFromSlug(slug) {
  return String(slug || '')
    .replace(/\.sh$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isAllowedCommunityScriptName(name) {
  const raw = String(name || '').toLowerCase();
  if (!raw.endsWith('.sh')) return false;
  const slug = raw.replace(/\.sh$/i, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return false;
  return !COMMUNITY_SCRIPT_DENY.some(pattern => pattern.test(slug));
}

async function getCommunityScripts(force = false) {
  const now = Date.now();
  if (!force && communityScriptCache.items.length > 0 && now - communityScriptCache.time < COMMUNITY_SCRIPT_CACHE_MS) {
    return communityScriptCache.items;
  }

  try {
    const response = await axios.get(COMMUNITY_SCRIPTS_CT_API, {
      httpsAgent,
      timeout: 10000,
      headers: { 'User-Agent': 'hosting-portal' },
      validateStatus: () => true
    });
    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      throw new Error(`GitHub returned HTTP ${response.status}`);
    }

    const items = response.data
      .filter(item => item && item.type === 'file' && isAllowedCommunityScriptName(item.name))
      .map(item => {
        const slug = String(item.name).replace(/\.sh$/i, '');
        return {
          id: slug,
          slug,
          name: titleFromSlug(slug),
          path: item.path || `ct/${item.name}`,
          url: item.download_url || `${COMMUNITY_SCRIPTS_RAW}/${item.name}`,
          source: 'github'
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    communityScriptCache = { time: now, items: items.length ? items : COMMUNITY_SCRIPT_FALLBACK };
    return communityScriptCache.items;
  } catch (_) {
    communityScriptCache = { time: now, items: COMMUNITY_SCRIPT_FALLBACK };
    return communityScriptCache.items;
  }
}

async function getCommunityScript(slug) {
  const id = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || COMMUNITY_SCRIPT_DENY.some(pattern => pattern.test(id))) {
    return null;
  }
  const scripts = await getCommunityScripts();
  return scripts.find(item => item.id === id || item.slug === id) || null;
}

function consoleInputFrame(input) {
  const bytes = Buffer.byteLength(input, 'utf8');
  return `0:${bytes}:${input}`;
}

function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, `'"'"'`)}'`;
}

async function createNodeTermProxy(clusterUrl, apiToken, node) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.post(`/api2/json/nodes/${node}/termproxy`, {});
  ensureSuccess(response, 'Proxmox Node-Konsole konnte nicht geöffnet werden:');
  const data = response.data?.data || {};
  return { ticket: data.ticket, port: data.port, user: data.user || 'root@pam' };
}

async function sendNodeShellCommand(clusterUrl, apiToken, node, command) {
  const { ticket, port, user } = await createNodeTermProxy(clusterUrl, apiToken, node);
  const base = clusterUrl.replace(/^http/i, 'ws');
  const target = `${base}/api2/json/nodes/${node}/vncwebsocket?port=${encodeURIComponent(port)}&vncticket=${encodeURIComponent(ticket)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target, ['binary'], {
      rejectUnauthorized: false,
      headers: { Authorization: `PVEAPIToken=${apiToken}` }
    });
    const timer = setTimeout(() => {
      try { ws.close(); } catch (_) { /* noop */ }
      reject(new Error('Timed out while starting Proxmox node command'));
    }, 15000);

    ws.on('open', () => {
      ws.send(`${user}:${ticket}\n`);
      setTimeout(() => {
        ws.send('1:120:40:');
        ws.send(consoleInputFrame(`${command}\r`));
        setTimeout(() => {
          clearTimeout(timer);
          try { ws.close(); } catch (_) { /* noop */ }
          resolve({ node });
        }, 1400);
      }, 500);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function getCommunityScriptUrl(script) {
  const url = script?.url || `${COMMUNITY_SCRIPTS_RAW}/${script.slug}.sh`;
  if (!/^https:\/\/raw\.githubusercontent\.com\/community-scripts\/ProxmoxVE\//.test(url)) {
    throw new Error('Community script URL is not allowed');
  }
  return url;
}

function buildCommunityScriptCommand(script) {
  const url = getCommunityScriptUrl(script);
  const safeName = String(script?.name || script?.slug || 'Community Script').replace(/[\r\n]+/g, ' ').trim();
  const inner = [
    `export TERM=xterm-256color`,
    `stty cols __PORTAL_COLS__ rows __PORTAL_ROWS__ >/dev/null 2>&1 || true`,
    `printf '\\033[2J\\033[H'`,
    `echo ${shellQuote(`Hosting Portal startet ${safeName}.`)}`,
    `echo ${shellQuote('Folge den Abfragen im Terminal. Drücke Enter, wenn du die Standardwerte des Scripts verwenden möchtest.')}`,
    `echo`,
    `bash -c "$(curl -fsSL ${shellQuote(url)})"`,
    `status=$?`,
    `echo`,
    `if [ "$status" -eq 0 ]; then echo ${shellQuote('Hosting Portal: Script beendet.')}; else echo ${shellQuote('Hosting Portal: Script mit Fehler beendet. Die Session wird beendet, sobald die Proxmox-Konsole schließt.')}; fi`,
    `sleep 2`,
    `exit "$status"`
  ].join('; ');
  return `exec bash -lc ${shellQuote(inner)}`;
}

async function runCommunityScriptOnNode(clusterUrl, apiToken, node, script) {
  const url = getCommunityScriptUrl(script);
  const logPath = `/var/log/hosting-portal-community-${String(script.slug || 'script').replace(/[^a-z0-9-]/gi, '-')}-${Date.now()}.log`;
  const inner = `printf '\n%.0s' {1..80} | bash -c "$(curl -fsSL ${shellQuote(url)})"`;
  const command = `nohup bash -lc ${shellQuote(inner)} > ${shellQuote(logPath)} 2>&1 & echo ${shellQuote(`Hosting Portal started ${script.name}. Log: ${logPath}`)}`;
  await sendNodeShellCommand(clusterUrl, apiToken, node, command);
  return { node, logPath };
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


function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentOf(value, max) {
  const used = safeNumber(value);
  const total = safeNumber(max);
  if (!total) return 0;
  return Math.min(Math.max((used / total) * 100, 0), 100);
}

function normalizeTemperatureValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > -50 && value < 150 ? value : null;
  }

  if (typeof value === 'string') {
    const match = value.trim().match(/(-?\d+(?:\.\d+)?)\s*(?:°?\s*c|celsius)?/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > -50 && parsed < 150 ? parsed : null;
  }

  return null;
}

function buildTemperatureSummary(values, source = 'proxmox') {
  const clean = (values || [])
    .map(normalizeTemperatureValue)
    .filter(value => value !== null);

  if (!clean.length) return null;

  const max = Math.max(...clean);
  const avg = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  return {
    current: avg,
    max,
    count: clean.length,
    source
  };
}

function mergeTemperatureSummaries(...summaries) {
  const values = [];
  let source = '';

  summaries.filter(Boolean).forEach(summary => {
    if (summary.current !== undefined && summary.current !== null) values.push(summary.current);
    if (summary.max !== undefined && summary.max !== null) values.push(summary.max);
    if (!source && summary.source) source = summary.source;
  });

  return buildTemperatureSummary(values, source || 'proxmox');
}

function collectSensorTemperatures(value, list = [], trustedThermalState = false, parentKey = '') {
  if (value === null || value === undefined) return list;

  const keyName = String(parentKey || '').toLowerCase();
  const isTemperatureContext = trustedThermalState || /(temp|thermal|temperature|core|package|cpu|tctl|tdie|composite)/i.test(keyName);
  const isSensorReadingKey = /(temp|thermal|temperature)/i.test(keyName) && !/(crit|max|high|alarm|label|offset|lowest|highest|limit)/i.test(keyName);

  if (typeof value !== 'object') {
    const parsed = normalizeTemperatureValue(value);
    if (parsed !== null && (trustedThermalState || isSensorReadingKey || (isTemperatureContext && typeof value === 'string' && /(?:°?\s*c|celsius)/i.test(value)))) {
      list.push(parsed);
    }
    return list;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectSensorTemperatures(item, list, trustedThermalState, parentKey));
    return list;
  }

  Object.entries(value).forEach(([key, entry]) => {
    const childKey = String(key || '').toLowerCase();
    const childTrusted = trustedThermalState || /thermalstate|thermal_state/.test(childKey);

    if (entry && typeof entry === 'object') {
      const candidates = [entry.input, entry.value, entry.current, entry.temp, entry.temperature, entry.reading];
      candidates.forEach(candidate => {
        const parsed = normalizeTemperatureValue(candidate);
        if (parsed !== null && (childTrusted || /(temp|thermal|temperature|current|input|value|reading)/i.test(childKey))) {
          list.push(parsed);
        }
      });
    }

    collectSensorTemperatures(entry, list, childTrusted, childKey);
  });

  return list;
}

function extractStatusTemperatures(status) {
  const values = [];
  collectSensorTemperatures(status?.thermalstate, values, true, 'thermalstate');
  collectSensorTemperatures(status?.thermal_state, values, true, 'thermal_state');
  collectSensorTemperatures(status?.sensors, values, false, 'sensors');
  return buildTemperatureSummary(values, 'node-status');
}

async function getNodeSensors(client, node) {
  const endpoints = [
    `/api2/json/nodes/${node}/sensors`,
    `/api2/json/nodes/${node}/hardware/sensors`
  ];

  for (const endpoint of endpoints) {
    const response = await client.get(endpoint);
    if (response.status < 200 || response.status >= 300) continue;
    const values = collectSensorTemperatures(response.data?.data || [], [], false, 'sensors');
    const summary = buildTemperatureSummary(values, endpoint.includes('hardware') ? 'hardware-sensors' : 'sensors');
    if (summary) return summary;
  }

  return null;
}

async function getNodeStorageSummary(client, node) {
  const response = await client.get(`/api2/json/nodes/${node}/storage`);
  if (response.status < 200 || response.status >= 300) return { used: 0, total: 0, items: [] };

  const items = (response.data?.data || [])
    .filter(item => item && item.storage)
    .filter(item => item.enabled !== 0 && item.active !== 0 && item.status !== 'disabled')
    .map(item => {
      const total = safeNumber(item.total || item.maxdisk || 0);
      const used = safeNumber(item.used || item.disk || 0);
      return {
        storage: item.storage,
        type: item.type || '',
        shared: item.shared === true || item.shared === 1 || item.shared === '1',
        used,
        total,
        percent: percentOf(used, total)
      };
    })
    .filter(item => item.total > 0)
    .sort((a, b) => b.percent - a.percent);

  return {
    used: items.reduce((sum, item) => sum + item.used, 0),
    total: items.reduce((sum, item) => sum + item.total, 0),
    items
  };
}

function isSharedStorageItem(item) {
  const type = String(item?.type || '').toLowerCase();
  return item?.shared === true || item?.shared === 1 || item?.shared === '1' ||
    ['rbd', 'cephfs', 'nfs', 'cifs', 'pbs', 'iscsi', 'iscsidirect', 'glusterfs', 'zfs over iscsi'].includes(type);
}

function summarizeClusterStorage(nodes) {
  const unique = new Map();

  (nodes || []).forEach(node => {
    (node.storages || []).forEach(item => {
      const total = safeNumber(item.total);
      if (!item || !item.storage || total <= 0) return;

      const storageKey = isSharedStorageItem(item)
        ? `shared:${item.storage}:${item.type || ''}`
        : `node:${node.node}:${item.storage}:${item.type || ''}`;

      if (!unique.has(storageKey)) {
        unique.set(storageKey, item);
        return;
      }

      const existing = unique.get(storageKey);
      if (safeNumber(item.total) > safeNumber(existing.total)) unique.set(storageKey, item);
    });
  });

  const items = Array.from(unique.values());
  const used = items.reduce((sum, item) => sum + safeNumber(item.used), 0);
  const total = items.reduce((sum, item) => sum + safeNumber(item.total), 0);

  return {
    used,
    total,
    percent: percentOf(used, total),
    items
  };
}

async function getNodeStatusSummary(client, nodeResource) {
  const nodeName = nodeResource.node;
  const isOnline = nodeResource.status === 'online';
  let status = {};
  let storage = { used: 0, total: 0, items: [] };
  let sensors = null;

  if (isOnline) {
    const [statusResult, storageResult, sensorResult] = await Promise.allSettled([
      client.get(`/api2/json/nodes/${nodeName}/status`),
      getNodeStorageSummary(client, nodeName),
      getNodeSensors(client, nodeName)
    ]);

    if (statusResult.status === 'fulfilled' && statusResult.value.status >= 200 && statusResult.value.status < 300) {
      status = statusResult.value.data?.data || {};
    }
    if (storageResult.status === 'fulfilled') storage = storageResult.value;
    if (sensorResult.status === 'fulfilled') sensors = sensorResult.value;

    const statusTemperatures = extractStatusTemperatures(status);
    if (statusTemperatures) sensors = mergeTemperatureSummaries(statusTemperatures, sensors);
  }

  const memory = status.memory || {};
  const rootfs = status.rootfs || {};
  const cpuinfo = status.cpuinfo || {};
  const cpu = safeNumber(status.cpu, safeNumber(nodeResource.cpu));
  const maxcpu = safeNumber(cpuinfo.cpus, safeNumber(nodeResource.maxcpu));
  const mem = safeNumber(memory.used, safeNumber(nodeResource.mem));
  const maxmem = safeNumber(memory.total, safeNumber(nodeResource.maxmem));
  const rootUsed = safeNumber(rootfs.used, safeNumber(nodeResource.disk));
  const rootTotal = safeNumber(rootfs.total, safeNumber(nodeResource.maxdisk));
  const uptime = safeNumber(status.uptime, safeNumber(nodeResource.uptime));

  return {
    node: nodeName,
    status: nodeResource.status || 'unknown',
    cpu,
    maxcpu,
    cpuPercent: Math.min(Math.max(cpu * 100, 0), 100),
    loadavg: Array.isArray(status.loadavg) ? status.loadavg.map(value => String(value)) : [],
    mem,
    maxmem,
    memPercent: percentOf(mem, maxmem),
    rootUsed,
    rootTotal,
    rootPercent: percentOf(rootUsed, rootTotal),
    storageUsed: storage.used,
    storageTotal: storage.total,
    storagePercent: percentOf(storage.used, storage.total),
    storages: storage.items.slice(0, 4),
    uptime,
    temperature: sensors
  };
}

async function getClusterDashboardStats(clusterUrl, apiToken) {
  const client = createProxmoxClient(clusterUrl, apiToken);
  const response = await client.get('/api2/json/cluster/resources?type=node');
  ensureSuccess(response, 'Proxmox Node-Status konnte nicht geladen werden:');

  const nodeResources = (response.data?.data || [])
    .filter(item => item.type === 'node' && item.node)
    .sort((a, b) => String(a.node).localeCompare(String(b.node), undefined, { numeric: true }));

  const settled = await Promise.allSettled(nodeResources.map(item => getNodeStatusSummary(client, item)));
  const nodes = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const fallback = nodeResources[index] || {};
    return {
      node: fallback.node || 'unknown',
      status: fallback.status || 'unknown',
      cpu: safeNumber(fallback.cpu),
      maxcpu: safeNumber(fallback.maxcpu),
      cpuPercent: Math.min(Math.max(safeNumber(fallback.cpu) * 100, 0), 100),
      loadavg: [],
      mem: safeNumber(fallback.mem),
      maxmem: safeNumber(fallback.maxmem),
      memPercent: percentOf(fallback.mem, fallback.maxmem),
      rootUsed: safeNumber(fallback.disk),
      rootTotal: safeNumber(fallback.maxdisk),
      rootPercent: percentOf(fallback.disk, fallback.maxdisk),
      storageUsed: 0,
      storageTotal: 0,
      storagePercent: 0,
      storages: [],
      uptime: safeNumber(fallback.uptime),
      temperature: null,
      error: result.reason?.message || 'Node status unavailable'
    };
  });

  const totals = nodes.reduce((acc, node) => {
    acc.nodes += 1;
    if (node.status === 'online') acc.online += 1;
    acc.cpuPercentSum += safeNumber(node.cpuPercent);
    acc.cpuSamples += node.status === 'online' ? 1 : 0;
    acc.mem += safeNumber(node.mem);
    acc.maxmem += safeNumber(node.maxmem);
    acc.rootUsed += safeNumber(node.rootUsed);
    acc.rootTotal += safeNumber(node.rootTotal);
    return acc;
  }, { nodes: 0, online: 0, cpuPercentSum: 0, cpuSamples: 0, mem: 0, maxmem: 0, rootUsed: 0, rootTotal: 0 });

  const clusterStorage = summarizeClusterStorage(nodes);

  return {
    nodes,
    totals: {
      nodes: totals.nodes,
      online: totals.online,
      cpuPercent: totals.cpuSamples ? totals.cpuPercentSum / totals.cpuSamples : 0,
      mem: totals.mem,
      maxmem: totals.maxmem,
      memPercent: percentOf(totals.mem, totals.maxmem),
      rootUsed: totals.rootUsed,
      rootTotal: totals.rootTotal,
      rootPercent: percentOf(totals.rootUsed, totals.rootTotal),
      storageUsed: clusterStorage.used,
      storageTotal: clusterStorage.total,
      storagePercent: clusterStorage.percent
    }
  };
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
  createNodeTermProxy,
  getOnlineNodes,
  getClusterDashboardStats,
  getNodeTemplates,
  getNodeIsos,
  getNodeStorages,
  getNextVmidInRange,
  createLxcContainer,
  createQemuVm,
  destroyProxmoxResource,
  getCommunityScripts,
  getCommunityScript,
  buildCommunityScriptCommand,
  runCommunityScriptOnNode,
  POWER_ACTIONS
};
