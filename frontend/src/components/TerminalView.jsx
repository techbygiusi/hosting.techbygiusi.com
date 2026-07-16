import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { userApi, getErrorMessage } from '../services/api';
import { readStoredLanguage } from './LanguageSwitch';
import { translatePortalText } from '../i18n';

/**
 * In-browser console for an assigned resource. The backend relays the
 * websocket to Proxmox, so the API token never reaches the browser.
 */
function terminalText(value) {
  return translatePortalText(value, readStoredLanguage());
}

export default function TerminalView({ resourceId, resourceName, fullscreen = false }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [message, setMessage] = useState('');
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let ws = null;
    let pingTimer = null;
    const autoLoginWakeTimers = [];

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
        const res = await userApi.openConsole(resourceId);
        if (disposed) return;

        const { wsPath, user, ticket, autoLogin } = res.data;
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
          suppressTerminalReplies: !!(autoLogin?.username && autoLogin?.secret)
        };
        const stripAnsi = (value) => String(value || '')
          .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
          .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
          .replace(/\x1b[@-_]/g, '');
        const normalizeConsoleText = (value) => stripAnsi(value)
          .replace(/\r/g, '\n')
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
        const stripTerminalStatusReplies = (value) => String(value || '')
          .replace(/\x1b\[(?:\?|>|!)*[0-9;]*R/g, '')
          .replace(/\x1b\[(?:\?|>|!)*[0-9;]*[cn]/g, '');
        const readVisibleTerminalTail = () => {
          try {
            const active = term.buffer.active;
            const cursorLine = active.baseY + active.cursorY;
            const firstLine = Math.max(0, cursorLine - 10);
            const lines = [];
            for (let index = firstLine; index <= cursorLine; index += 1) {
              const line = active.getLine(index);
              if (line) lines.push(line.translateToString(true));
            }
            return lines.join('\n');
          } catch (_) {
            return '';
          }
        };
        const maybeSendAutoLogin = (chunk, replaceBuffer = false) => {
          if (!autoLoginState.enabled || autoLoginState.sentSecret) return;
          const normalized = normalizeConsoleText(chunk);
          autoLoginState.buffer = replaceBuffer
            ? normalized.slice(-2000)
            : (autoLoginState.buffer + normalized).slice(-2000);
          const visible = autoLoginState.buffer;
          if (!autoLoginState.sentUsername && /(?:^|\n)[^\n]{0,120}(?:login|username)\s*:\s*$/i.test(visible)) {
            autoLoginState.sentUsername = true;
            autoLoginState.buffer = '';
            // Clear the current getty input line before submitting the stored
            // username, regardless of whether the terminal had focus before.
            setTimeout(() => sendConsoleInput(`\x15${autoLoginState.username}\r`), 180);
            return;
          }
          if (autoLoginState.sentUsername && !autoLoginState.sentSecret && /(?:^|\n)[^\n]{0,120}password\s*:\s*$/i.test(visible)) {
            autoLoginState.sentSecret = true;
            autoLoginState.buffer = '';
            setTimeout(() => {
              sendConsoleInput(`\x15${autoLoginState.secret}\r`);
              // Keep filtering xterm device-status replies briefly while the
              // login program validates the submitted password.
              setTimeout(() => { autoLoginState.suppressTerminalReplies = false; }, 1500);
            }, 180);
          }
        };
        const inspectRenderedPrompt = () => {
          maybeSendAutoLogin(readVisibleTerminalTail(), true);
        };
        const wakeAutoLoginPrompt = () => {
          if (!autoLoginState.enabled || autoLoginState.sentUsername || disposed) return;
          inspectRenderedPrompt();
          if (!autoLoginState.sentUsername) sendConsoleInput('\r');
        };

        ws.onopen = () => {
          setStatus('open');
          ws.send(`${user}:${ticket}\n`);
          fitAndResize();
          setTimeout(fitAndResize, 150);
          setTimeout(fitAndResize, 700);
          setTimeout(fitAndResize, 1500);
          if (autoLoginState.enabled) {
            // Some getty sessions do not emit a fresh prompt until they
            // receive the first carriage return. Probe automatically so the
            // user never has to click the terminal and press Enter first.
            [900, 2200, 4500].forEach(delay => {
              autoLoginWakeTimers.push(setTimeout(wakeAutoLoginPrompt, delay));
            });
          }
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('2');
          }, 30 * 1000);
        };

        ws.onmessage = (event) => {
          const data = typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data);
          maybeSendAutoLogin(data);
          term.write(data, inspectRenderedPrompt);
        };

        ws.onclose = () => {
          setStatus('closed');
          term.write(`\r\n\x1b[90m${terminalText('[Verbindung beendet]')}\x1b[0m\r\n`);
        };

        ws.onerror = () => {
          setStatus('error');
          setMessage(terminalText('Verbindung zur Konsole fehlgeschlagen.'));
        };

        term.onData((input) => {
          const outgoing = autoLoginState.suppressTerminalReplies
            ? stripTerminalStatusReplies(input)
            : input;
          if (outgoing) sendConsoleInput(outgoing);
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
      autoLoginWakeTimers.forEach(timer => clearTimeout(timer));
      try { ws?.close(); } catch (_) { /* noop */ }
      term.dispose();
    };
  }, [resourceId, reconnectKey, fullscreen]);

  return (
    <div className={fullscreen ? 'terminal-wrapper terminal-wrapper-fullscreen' : 'terminal-wrapper'}>
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
