import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { userApi, getErrorMessage } from '../services/api';

/**
 * In-browser console for a resource. The backend relays the websocket to
 * Proxmox (termproxy) – the API token never reaches the browser.
 *
 * Proxmox termproxy protocol (client side):
 * - after open: send "<user>:<ticket>\n"
 * - input:  "0:<byteLength>:<data>"
 * - resize: "1:<cols>:<rows>:"
 * - ping:   "2"
 */
export default function TerminalView({ resourceId, resourceName }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting | open | closed | error
  const [message, setMessage] = useState('');
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let ws = null;
    let pingTimer = null;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: document.body.classList.contains('theme-dark')
        ? { background: '#111418', foreground: '#E6E6E6', cursor: '#C2CEA7' }
        : { background: '#1b1e23', foreground: '#e8e8e8', cursor: '#7A876F' }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const sendResize = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(`1:${term.cols}:${term.rows}:`);
      }
    };

    const onWindowResize = () => {
      try { fit.fit(); sendResize(); } catch (_) { /* noop */ }
    };
    window.addEventListener('resize', onWindowResize);

    (async () => {
      try {
        const res = await userApi.openConsole(resourceId);
        if (disposed) return;

        const { wsPath, user, ticket } = res.data;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${window.location.host}${wsPath}`);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          setStatus('open');
          ws.send(`${user}:${ticket}\n`);
          setTimeout(() => { fit.fit(); sendResize(); }, 150);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('2');
          }, 30 * 1000);
        };

        ws.onmessage = (event) => {
          const data = typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data);
          term.write(data);
        };

        ws.onclose = () => {
          setStatus('closed');
          term.write('\r\n\x1b[90m[Verbindung beendet]\x1b[0m\r\n');
        };

        ws.onerror = () => {
          setStatus('error');
          setMessage('Verbindung zur Konsole fehlgeschlagen.');
        };

        term.onData((input) => {
          if (ws.readyState === WebSocket.OPEN) {
            const bytes = new TextEncoder().encode(input);
            ws.send(`0:${bytes.length}:${input}`);
          }
        });
      } catch (err) {
        setStatus('error');
        setMessage(getErrorMessage(err, 'Konsole konnte nicht geöffnet werden.'));
      }
    })();

    return () => {
      disposed = true;
      window.removeEventListener('resize', onWindowResize);
      if (pingTimer) clearInterval(pingTimer);
      try { ws?.close(); } catch (_) { /* noop */ }
      term.dispose();
    };
  }, [resourceId, reconnectKey]);

  return (
    <div className="terminal-wrapper">
      <div className="terminal-toolbar">
        <span className={`terminal-status terminal-status-${status}`}>
          {status === 'connecting' && 'Verbinden...'}
          {status === 'open' && `Verbunden · ${resourceName}`}
          {status === 'closed' && 'Getrennt'}
          {status === 'error' && (message || 'Fehler')}
        </span>
        {(status === 'closed' || status === 'error') && (
          <button type="button" className="btn-secondary btn-small" onClick={() => { setStatus('connecting'); setMessage(''); setReconnectKey(key => key + 1); }}>
            Neu verbinden
          </button>
        )}
      </div>
      <div ref={containerRef} className="terminal-container"></div>
    </div>
  );
}
