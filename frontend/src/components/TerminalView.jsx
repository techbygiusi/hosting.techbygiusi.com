import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { userApi, getErrorMessage } from '../services/api';
import { readStoredLanguage } from './LanguageSwitch';
import { translatePortalText } from '../i18n';

/**
 * In-browser console for a resource. The backend relays the websocket to
 * Proxmox (termproxy) - the API token never reaches the browser.
 *
 * Proxmox termproxy protocol (client side):
 * - after open: send "<user>:<ticket>\n"
 * - input:  "0:<byteLength>:<data>"
 * - resize: "1:<cols>:<rows>:"
 * - ping:   "2"
 */
function terminalText(value) {
  return translatePortalText(value, readStoredLanguage());
}

export default function TerminalView({ resourceId, resourceName, fullscreen = false, sessionInfo = null, autoCloseOnDisconnect = false, disableReconnect = false, onDisconnect = null }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting | open | closed | error
  const [message, setMessage] = useState('');
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let ws = null;
    let pingTimer = null;
    let scriptCloseTriggered = false;

    const getResponsiveFontSize = () => {
      if (!fullscreen) return 14;
      const width = containerRef.current?.clientWidth || window.innerWidth || 1200;
      const height = containerRef.current?.clientHeight || window.innerHeight || 720;
      const byWidth = width / 100 / 0.62;
      const byHeight = height / 34 / 1.25;
      return Math.max(14, Math.min(22, Math.floor(Math.min(byWidth, byHeight))));
    };

    const term = new Terminal({
      cursorBlink: true,
      fontSize: getResponsiveFontSize(),
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      lineHeight: fullscreen ? 1.16 : 1,
      scrollback: 5000,
      theme: document.body.classList.contains('theme-dark')
        ? { background: '#111418', foreground: '#E6E6E6', cursor: '#c2cea7' }
        : { background: '#1b1e23', foreground: '#e8e8e8', cursor: '#7a876f' }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const updateTerminalFit = () => {
      if (disposed) return;
      try {
        const nextFontSize = getResponsiveFontSize();
        if (Math.abs((term.options.fontSize || 14) - nextFontSize) >= 1) {
          term.options.fontSize = nextFontSize;
        }
        fit.fit();
      } catch (_) { /* noop */ }
    };

    const sendResize = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(`1:${term.cols}:${term.rows}:`);
      }
    };

    const fitAndResize = () => {
      updateTerminalFit();
      sendResize();
    };

    const onWindowResize = () => fitAndResize();
    window.addEventListener('resize', onWindowResize);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => fitAndResize());
      resizeObserver.observe(containerRef.current);
    }

    (async () => {
      try {
        const res = sessionInfo ? { data: sessionInfo } : await userApi.openConsole(resourceId);
        if (disposed) return;

        const { wsPath, user, ticket, autoLogin, bootstrapCommand } = res.data;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${window.location.host}${wsPath}`);
        ws.binaryType = 'arraybuffer';

        const sendConsoleInput = (input) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const bytes = new TextEncoder().encode(input);
            ws.send(`0:${bytes.length}:${input}`);
          }
        };

        const autoLoginState = {
          enabled: !!(autoLogin?.username && autoLogin?.secret),
          username: autoLogin?.username || 'root',
          secret: autoLogin?.secret || '',
          buffer: '',
          sentUsername: false,
          sentSecret: false,
          bootstrapSent: false
        };

        const sendBootstrapCommand = () => {
          if (!bootstrapCommand || autoLoginState.bootstrapSent) return;
          autoLoginState.bootstrapSent = true;
          setTimeout(fitAndResize, 100);
          setTimeout(fitAndResize, 450);
          setTimeout(() => {
            fitAndResize();
            const cols = Math.max(80, term.cols || 120);
            const rows = Math.max(24, term.rows || 40);
            const command = String(bootstrapCommand)
              .replace(/__PORTAL_COLS__/g, String(cols))
              .replace(/__PORTAL_ROWS__/g, String(rows));
            sendConsoleInput(`${command}\r`);
            setTimeout(fitAndResize, 450);
            setTimeout(fitAndResize, 1200);
            setTimeout(fitAndResize, 2500);
          }, 950);
        };

        ws.onopen = () => {
          setStatus('open');
          ws.send(`${user}:${ticket}\n`);
          setTimeout(fitAndResize, 150);
          setTimeout(fitAndResize, 700);
          setTimeout(fitAndResize, 1500);
          if (bootstrapCommand && !autoLoginState.enabled) {
            setTimeout(sendBootstrapCommand, 1200);
          }
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('2');
          }, 30 * 1000);
        };

        const stripAnsi = (value) => String(value || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
        const closeCommunityScriptTerminal = () => {
          if (!autoCloseOnDisconnect || scriptCloseTriggered) return;
          scriptCloseTriggered = true;
          setStatus('closed');
          try {
            sendConsoleInput('exit\r');
            setTimeout(() => sendConsoleInput('exit\r'), 180);
          } catch (_) { /* noop */ }
          setTimeout(() => {
            try { ws?.close(1000, 'community-script-ended'); } catch (_) { /* noop */ }
            if (typeof onDisconnect === 'function') onDisconnect();
          }, 900);
        };
        const didCommunityScriptAbort = (chunk) => {
          if (!autoCloseOnDisconnect) return false;
          const visible = stripAnsi(chunk);
          return /(?:User\s+exited\s+script|Script\s+abgebrochen|Abbruch|abgebrochen)/i.test(visible);
        };
        const maybeSendAutoLogin = (chunk) => {
          if (!autoLoginState.enabled || autoLoginState.sentSecret) return;
          autoLoginState.buffer = (autoLoginState.buffer + stripAnsi(chunk)).slice(-1200);
          const visible = autoLoginState.buffer;
          if (!autoLoginState.sentUsername && /(?:^|[\r\n])[^\r\n]{0,80}(?:login|username)\s*:\s*$/i.test(visible)) {
            autoLoginState.sentUsername = true;
            setTimeout(() => sendConsoleInput(`${autoLoginState.username}\r`), 180);
            return;
          }
          if (autoLoginState.sentUsername && !autoLoginState.sentSecret && /password\s*:\s*$/i.test(visible)) {
            autoLoginState.sentSecret = true;
            setTimeout(() => {
              sendConsoleInput(`${autoLoginState.secret}\r`);
              if (bootstrapCommand) sendBootstrapCommand();
            }, 180);
          }
        };

        ws.onmessage = (event) => {
          const data = typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data);
          term.write(data);
          maybeSendAutoLogin(data);
          if (didCommunityScriptAbort(data)) {
            term.write(`\r\n\x1b[90m${terminalText('[Hosting Portal: Script abgebrochen. Terminal wird geschlossen...]')}\x1b[0m\r\n`);
            closeCommunityScriptTerminal();
          }
        };

        ws.onclose = () => {
          setStatus('closed');
          if (autoCloseOnDisconnect) {
            if (!scriptCloseTriggered) {
              term.write(`\r\n\x1b[90m${terminalText('[Script-/Terminal-Session beendet.]')}\x1b[0m\r\n`);
            }
            return;
          }
          term.write(`\r\n\x1b[90m${terminalText('[Verbindung beendet]')}\x1b[0m\r\n`);
        };

        ws.onerror = () => {
          setStatus('error');
          setMessage(terminalText('Verbindung zur Konsole fehlgeschlagen.'));
        };

        term.onData((input) => {
          if (!scriptCloseTriggered) sendConsoleInput(input);
        });
      } catch (err) {
        setStatus('error');
        setMessage(getErrorMessage(err, 'Konsole konnte nicht geöffnet werden.'));
      }
    })();

    return () => {
      disposed = true;
      window.removeEventListener('resize', onWindowResize);
      try { resizeObserver?.disconnect(); } catch (_) { /* noop */ }
      if (pingTimer) clearInterval(pingTimer);
      try { ws?.close(); } catch (_) { /* noop */ }
      term.dispose();
    };
  }, [resourceId, reconnectKey, sessionInfo, autoCloseOnDisconnect, onDisconnect]);

  return (
    <div className={fullscreen ? 'terminal-wrapper terminal-wrapper-fullscreen' : 'terminal-wrapper'}>
      <div className="terminal-toolbar">
        <span className={`terminal-status terminal-status-${status}`}>
          {status === 'connecting' && 'Verbinden...'}
          {status === 'open' && `Verbunden · ${resourceName}`}
          {status === 'closed' && 'Getrennt'}
          {status === 'error' && (message || 'Fehler')}
        </span>
        {!disableReconnect && (status === 'closed' || status === 'error') && (
          <button type="button" className="btn-secondary btn-small" onClick={() => { setStatus('connecting'); setMessage(''); setReconnectKey(key => key + 1); }}>
            Neu verbinden
          </button>
        )}
      </div>
      <div ref={containerRef} className="terminal-container"></div>
    </div>
  );
}
