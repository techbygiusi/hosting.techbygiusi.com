import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';
import { readStoredLanguage } from './LanguageSwitch';

const TEXT = {
  en: {
    addTitle: 'Publish service', editTitle: 'Edit public access', loading: 'Loading publishing settings...',
    unavailable: 'Public publishing is not available. Ask an administrator to configure Pangolin.',
    noIp: 'This service has no reachable IPv4 address yet.', protocol: 'Protocol', subdomain: 'Subdomain',
    targetPort: 'Service port', publicPort: 'Public port', backendProtocol: 'Backend protocol',
    preview: 'Public address', autoIp: 'Target IP is selected automatically from your own service:',
    ranges: 'Allowed ports', save: 'Publish', update: 'Save changes', saving: 'Saving...', cancel: 'Cancel',
    remove: 'Remove public access', removeConfirm: 'Remove public access for this service?',
    saveFailed: 'Public access could not be saved.', removeFailed: 'Public access could not be removed.',
    subdomainHint: 'Lowercase letters, numbers and hyphens only.', rawHint: 'For TCP/UDP the selected port is used externally and internally.',
    security: 'You cannot enter another IP address. The portal always publishes this service only.', disabled: 'Disabled by administrator'
  },
  de: {
    addTitle: 'Dienst veröffentlichen', editTitle: 'Öffentlichen Zugriff bearbeiten', loading: 'Veröffentlichungseinstellungen werden geladen...',
    unavailable: 'Die Veröffentlichung ist nicht verfügbar. Ein Administrator muss Pangolin konfigurieren.',
    noIp: 'Für diesen Dienst ist noch keine erreichbare IPv4-Adresse bekannt.', protocol: 'Protokoll', subdomain: 'Subdomain',
    targetPort: 'Dienst-Port', publicPort: 'Öffentlicher Port', backendProtocol: 'Backend-Protokoll',
    preview: 'Öffentliche Adresse', autoIp: 'Die Ziel-IP wird automatisch von deinem eigenen Dienst übernommen:',
    ranges: 'Erlaubte Ports', save: 'Veröffentlichen', update: 'Änderungen speichern', saving: 'Speichert...', cancel: 'Abbrechen',
    remove: 'Öffentlichen Zugriff entfernen', removeConfirm: 'Öffentlichen Zugriff für diesen Dienst entfernen?',
    saveFailed: 'Der öffentliche Zugriff konnte nicht gespeichert werden.', removeFailed: 'Der öffentliche Zugriff konnte nicht entfernt werden.',
    subdomainHint: 'Nur Kleinbuchstaben, Zahlen und Bindestriche.', rawHint: 'Bei TCP/UDP wird der gewählte Port extern und intern verwendet.',
    security: 'Du kannst keine andere IP-Adresse eintragen. Das Portal veröffentlicht immer nur diesen Dienst.', disabled: 'Vom Administrator deaktiviert'
  }
};

export default function PublicPageModal({ resource, onClose, onSaved }) {
  const language = readStoredLanguage() === 'de' ? 'de' : 'en';
  const text = TEXT[language];
  const existing = resource?.publication || null;
  const [options, setOptions] = useState(null);
  const [protocol, setProtocol] = useState(existing?.protocol || 'http');
  const [subdomain, setSubdomain] = useState(existing?.subdomain || slugify(resource?.name || 'service'));
  const [targetPort, setTargetPort] = useState(String(existing?.targetPort || 80));
  const [publicPort, setPublicPort] = useState(String(existing?.publicPort || existing?.targetPort || 25565));
  const [targetMethod, setTargetMethod] = useState(existing?.targetMethod || 'http');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    userApi.getPublishingOptions()
      .then((response) => {
        if (!active) return;
        const publishing = response.data.publishing || {};
        setOptions(publishing);
        if (!existing?.targetMethod && publishing.defaultTargetMethod) setTargetMethod(publishing.defaultTargetMethod);
      })
      .catch((err) => active && setError(getErrorMessage(err, text.unavailable)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [existing?.targetMethod, text.unavailable]);

  const protocolOptions = useMemo(() => ['http', 'tcp', 'udp'].map((key) => ({
    key,
    enabled: !!options?.protocols?.[key]?.enabled,
    ports: options?.protocols?.[key]?.allowedPorts || ''
  })), [options]);

  const preview = protocol === 'http'
    ? (subdomain && options?.baseDomain ? `https://${subdomain}.${options.baseDomain}` : '')
    : (options?.baseDomain && publicPort ? `${protocol}://${options.baseDomain}:${publicPort}` : '');

  const switchProtocol = (next) => {
    const entry = protocolOptions.find((item) => item.key === next);
    if (!entry?.enabled) return;
    setProtocol(next);
    setError('');
    if (next === 'http' && (!targetPort || Number(targetPort) === Number(publicPort))) setTargetPort('80');
    if (next !== 'http') {
      const rawPort = existing?.protocol === next ? (existing.publicPort || existing.targetPort) : 25565;
      setPublicPort(String(rawPort));
      setTargetPort(String(rawPort));
    }
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError('');
      await userApi.savePublication(resource.id, {
        protocol,
        subdomain: protocol === 'http' ? subdomain.trim().toLowerCase() : undefined,
        targetPort: Number(targetPort),
        publicPort: protocol === 'http' ? undefined : Number(publicPort),
        targetMethod: protocol === 'http' ? targetMethod : undefined
      });
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing || !window.confirm(text.removeConfirm)) return;
    try {
      setBusy(true);
      setError('');
      await userApi.deletePublication(resource.id);
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(getErrorMessage(err, text.removeFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existing ? text.editTitle : text.addTitle}
      onClose={onClose}
      className="public-page-modal-card publishing-modal-card"
      disableBackdropClose={busy}
    >
      {loading ? <p className="loading">{text.loading}</p> : (
        <form className="publishing-form" onSubmit={save} noValidate>
          {error && <div className="alert alert-danger">{error}</div>}
          {!options?.enabled && <div className="alert alert-warning">{text.unavailable}</div>}
          {!resource?.primaryIp && <div className="alert alert-warning">{text.noIp}</div>}

          <div className="publishing-security-note">
            <strong>{text.autoIp}</strong>
            <code>{resource?.primaryIp || '—'}</code>
            <small>{text.security}</small>
          </div>

          <fieldset className="publishing-protocol-fieldset" disabled={busy || !options?.enabled}>
            <legend>{text.protocol}</legend>
            <div className="publishing-protocol-selector">
              {protocolOptions.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`${protocol === entry.key ? 'active' : ''} ${entry.enabled ? '' : 'disabled'}`}
                  onClick={() => switchProtocol(entry.key)}
                  disabled={!entry.enabled}
                >
                  <strong>{entry.key.toUpperCase()}</strong>
                  <small>{entry.enabled ? `${text.ranges}: ${entry.ports || '—'}` : text.disabled}</small>
                </button>
              ))}
            </div>
          </fieldset>

          {protocol === 'http' ? (
            <div className="publishing-fields-grid">
              <label className="form-group publishing-subdomain-field">
                <span>{text.subdomain}</span>
                <div className="subdomain-input-row">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(event) => setSubdomain(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    maxLength="63"
                    autoFocus
                    disabled={busy || !options?.enabled}
                  />
                  <span>.{options?.baseDomain || 'example.com'}</span>
                </div>
                <small>{text.subdomainHint}</small>
              </label>
              <label className="form-group">
                <span>{text.targetPort}</span>
                <input type="number" min="1" max="65535" value={targetPort} onChange={(event) => setTargetPort(event.target.value)} disabled={busy || !options?.enabled} />
                <small>{text.ranges}: {options?.protocols?.http?.allowedPorts || '—'}</small>
              </label>
              <label className="form-group">
                <span>{text.backendProtocol}</span>
                <select value={targetMethod} onChange={(event) => setTargetMethod(event.target.value)} disabled={busy || !options?.enabled}>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="h2c">h2c</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="publishing-fields-grid">
              <label className="form-group">
                <span>{text.publicPort}</span>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={publicPort}
                  onChange={(event) => { setPublicPort(event.target.value); setTargetPort(event.target.value); }}
                  disabled={busy || !options?.enabled}
                />
                <small>{text.ranges}: {options?.protocols?.[protocol]?.allowedPorts || '—'}</small>
              </label>
              <div className="publishing-raw-hint"><p>{text.rawHint}</p></div>
            </div>
          )}

          {preview && (
            <div className="publishing-preview">
              <span>{text.preview}</span>
              <strong>{preview}</strong>
            </div>
          )}

          <div className="form-actions public-page-form-actions publishing-actions">
            {existing && <button type="button" className="btn-danger" onClick={remove} disabled={busy}>{text.remove}</button>}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{text.cancel}</button>
            <button type="submit" className="btn-primary" disabled={busy || !options?.enabled || !resource?.primaryIp}>
              {busy ? text.saving : existing ? text.update : text.save}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function slugify(value) {
  return String(value || 'service')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'service';
}
