const crypto = require('crypto');
const WebSocket = require('ws');

/**
 * Console flow:
 * 1. Client POSTs /api/user/resources/:id/console (JWT-protected).
 *    Backend verifies access, calls Proxmox termproxy, stores a one-time
 *    session and returns a random session token (NOT the Proxmox ticket).
 * 2. Client opens ws(s)://<portal>/api/console/ws?token=<sessionToken>.
 *    Backend validates the token, opens a WSS connection to Proxmox
 *    (Authorization header with the API token stays server-side) and pipes
 *    both directions transparently. The frontend speaks the termproxy
 *    protocol (auth line, resize messages) directly through the pipe.
 */

const SESSION_TTL_MS = 30 * 1000; // one-time token must be used within 30s
const sessions = new Map();

function createConsoleSession(data) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ...data, createdAt: Date.now() });

  // Garbage-collect expired sessions
  setTimeout(() => sessions.delete(token), SESSION_TTL_MS + 1000).unref?.();
  return token;
}

function consumeConsoleSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  sessions.delete(token); // one-time use
  if (Date.now() - session.createdAt > SESSION_TTL_MS) return null;
  return session;
}

/**
 * Attach the WebSocket upgrade handler to the HTTP server.
 */
function attachConsoleProxy(server) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    let token = '';
    try {
      const url = new URL(request.url, 'http://localhost');
      pathname = url.pathname;
      token = url.searchParams.get('token') || '';
    } catch (_) {
      socket.destroy();
      return;
    }

    if (pathname !== '/api/console/ws') {
      socket.destroy();
      return;
    }

    const session = consumeConsoleSession(token);
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      bridgeToProxmox(clientWs, session);
    });
  });

  console.log('✓ Console WebSocket proxy attached at /api/console/ws');
}

function bridgeToProxmox(clientWs, session) {
  const { clusterUrl, apiToken, node, type, vmid, port, ticket } = session;
  const kind = type === 'lxc' ? 'lxc' : 'qemu';
  const base = clusterUrl.replace(/^http/i, 'ws');
  const endpoint = `/api2/json/nodes/${node}/${kind}/${vmid}/vncwebsocket`;
  const target = `${base}${endpoint}?port=${encodeURIComponent(port)}&vncticket=${encodeURIComponent(ticket)}`;

  const upstream = new WebSocket(target, ['binary'], {
    rejectUnauthorized: false,
    headers: { Authorization: `PVEAPIToken=${apiToken}` }
  });

  const closeBoth = () => {
    try { clientWs.close(); } catch (_) { /* noop */ }
    try { upstream.close(); } catch (_) { /* noop */ }
  };

  const pendingClientMessages = [];

  // Register the client message handler immediately. The browser can send the
  // termproxy auth line as soon as the portal WebSocket opens, while the
  // upstream Proxmox WebSocket may still be connecting. Queueing prevents the
  // ticket from being dropped, which otherwise makes Proxmox log
  // "failed reading ticket: timed out".
  clientWs.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
      return;
    }
    pendingClientMessages.push(data);
  });

  upstream.on('open', () => {
    while (pendingClientMessages.length > 0 && upstream.readyState === WebSocket.OPEN) {
      upstream.send(pendingClientMessages.shift());
    }
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
  });

  upstream.on('close', closeBoth);
  upstream.on('error', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send('\r\n[Portal] Verbindung zu Proxmox fehlgeschlagen.\r\n');
    }
    closeBoth();
  });

  clientWs.on('close', closeBoth);
  clientWs.on('error', closeBoth);
}

module.exports = { createConsoleSession, attachConsoleProxy };
