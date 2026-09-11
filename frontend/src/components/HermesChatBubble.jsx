import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { ChatIcon, CloseIcon, SendIcon } from './Icons';

export default function HermesChatBubble({ language = 'en' }) {
  const de = language === 'de';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({ loaded: false, enabled: false, configured: false, name: 'Hermes Agent' });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      adminApi.getHermesSettings().then((response) => {
        if (!mounted) return;
        const settings = response.data?.settings || {};
        setStatus({ loaded: true, enabled: !!settings.enabled, configured: !!settings.apiKeyConfigured && !!settings.apiUrl, name: settings.name || 'Hermes Agent' });
      }).catch(() => { if (mounted) setStatus((current) => ({ ...current, loaded: true })); });
    };
    refresh();
    window.addEventListener('hermes-config-changed', refresh);
    return () => { mounted = false; window.removeEventListener('hermes-config-changed', refresh); };
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, open]);

  const ready = status.enabled && status.configured;
  const placeholder = useMemo(() => ready ? (de ? 'Frage zum Portal stellen…' : 'Ask about the portal…') : (de ? 'Hermes zuerst konfigurieren' : 'Configure Hermes first'), [ready, de]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !ready) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true); setError('');
    try {
      const response = await adminApi.sendHermesChat(next);
      setMessages((current) => [...current, { role: 'assistant', content: response.data?.message || (de ? 'Keine Antwort erhalten.' : 'No response received.') }]);
    } catch (err) {
      setError(getErrorMessage(err, de ? 'Hermes Agent konnte nicht antworten.' : 'Hermes Agent could not respond.'));
    } finally { setBusy(false); }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className={`hermes-chat-shell ${open ? 'open' : ''}`}>
      {open ? (
        <section className="hermes-chat-panel" aria-label="Hermes Agent chat">
          <header className="hermes-chat-header">
            <div><span className={`hermes-chat-status ${ready ? 'online' : ''}`} /><div><strong>{status.name}</strong><small>{ready ? (de ? 'Verbunden' : 'Connected') : (de ? 'Nicht bereit' : 'Not ready')}</small></div></div>
            <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label={de ? 'Chat schließen' : 'Close chat'}><CloseIcon size={18} /></button>
          </header>
          <div className="hermes-chat-messages" ref={listRef}>
            {!messages.length ? <div className="hermes-chat-empty"><ChatIcon size={22} /><strong>{de ? 'Wie kann ich helfen?' : 'How can I help?'}</strong><span>{ready ? (de ? 'Frage nach Services, Wiki, Logs oder anderen freigegebenen Portal-Daten.' : 'Ask about services, wiki, logs, or other permitted Portal data.') : (de ? 'Aktiviere und verbinde Hermes Agent zuerst im Menü „Hermes Agent“.' : 'Enable and connect Hermes Agent first from the “Hermes Agent” menu.')}</span></div> : null}
            {messages.map((message, index) => <div className={`hermes-chat-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.content}</span></div>)}
            {busy ? <div className="hermes-chat-message assistant pending"><span>{de ? 'Hermes arbeitet…' : 'Hermes is working…'}</span></div> : null}
            {error ? <div className="hermes-chat-error">{error}</div> : null}
          </div>
          <div className="hermes-chat-compose">
            <textarea rows="2" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} disabled={!ready || busy} />
            <button type="button" className="hermes-chat-send" onClick={send} disabled={!ready || busy || !input.trim()} aria-label={de ? 'Senden' : 'Send'}><SendIcon size={18} /></button>
          </div>
        </section>
      ) : null}
      <button type="button" className="hermes-chat-fab" onClick={() => setOpen((value) => !value)} aria-label={de ? 'Hermes Chat öffnen' : 'Open Hermes chat'} title="Hermes Agent">
        <ChatIcon size={22} />
        {ready ? <span className="hermes-chat-fab-dot" /> : null}
      </button>
    </div>
  );
}
