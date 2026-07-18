import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';
import { readStoredLanguage } from './LanguageSwitch';

const TEXT = {
  en: {
    title: 'Manage public access', loading: 'Loading publishing settings...',
    unavailable: 'Public publishing is not available. Ask an administrator to configure Pangolin.',
    clusterDisabled: 'Publishing is disabled for this cluster. Existing access remains online and can still be removed.',
    noIp: 'This service has no reachable IPv4 address yet.', protocol: 'Protocol', subdomain: 'Subdomain',
    targetPort: 'Service port', publicPort: 'Public port', backendProtocol: 'Backend protocol',
    backendProtocolHint: 'Protocol Pangolin uses to connect to the service.',
    preview: 'Public address', autoIp: 'Target IP is selected automatically from your own service:',
    ranges: 'Allowed ports', add: 'Add access', update: 'Save changes', saving: 'Saving...', close: 'Close',
    cancelEdit: 'Cancel editing', edit: 'Edit', remove: 'Remove', removing: 'Removing...', open: 'Open',
    removeConfirm: (address) => `Remove public access ${address || ''}?`,
    saveFailed: 'Public access could not be saved.', removeFailed: 'Public access could not be removed.',
    subdomainHint: 'Lowercase letters, numbers and hyphens only.', subdomainRequired: 'Enter a subdomain.',
    security: 'You cannot enter another IP address. The portal always publishes this service only.',
    disabled: 'Disabled by administrator', existingTitle: 'Published access', noPublications: 'No public access has been configured yet.',
    addTitle: 'Add public access', editTitle: 'Edit public access', target: 'Target', publicAddress: 'Public address',
    saved: 'Public access was saved.', removed: 'Public access was removed.',
    multipleHint: 'You can add several HTTP, TCP and UDP publications for this service and use them in parallel.',
    protocolLocked: 'The protocol stays fixed while editing. Create another publication to use a different protocol.'
  },
  de: {
    title: 'Öffentliche Zugriffe verwalten', loading: 'Veröffentlichungseinstellungen werden geladen...',
    unavailable: 'Die Veröffentlichung ist nicht verfügbar. Ein Administrator muss Pangolin konfigurieren.',
    clusterDisabled: 'Die Veröffentlichung ist für diesen Cluster deaktiviert. Bestehende Zugriffe bleiben online und können weiterhin entfernt werden.',
    noIp: 'Für diesen Dienst ist noch keine erreichbare IPv4-Adresse bekannt.', protocol: 'Protokoll', subdomain: 'Subdomain',
    targetPort: 'Dienst-Port', publicPort: 'Öffentlicher Port', backendProtocol: 'Backend-Protokoll',
    backendProtocolHint: 'Protokoll, mit dem Pangolin den Dienst erreicht.',
    preview: 'Öffentliche Adresse', autoIp: 'Die Ziel-IP wird automatisch von deinem eigenen Dienst übernommen:',
    ranges: 'Erlaubte Ports', add: 'Zugriff hinzufügen', update: 'Änderungen speichern', saving: 'Speichert...', close: 'Schließen',
    cancelEdit: 'Bearbeitung abbrechen', edit: 'Bearbeiten', remove: 'Entfernen', removing: 'Entfernt...', open: 'Öffnen',
    removeConfirm: (address) => `Öffentlichen Zugriff ${address || ''} entfernen?`,
    saveFailed: 'Der öffentliche Zugriff konnte nicht gespeichert werden.', removeFailed: 'Der öffentliche Zugriff konnte nicht entfernt werden.',
    subdomainHint: 'Nur Kleinbuchstaben, Zahlen und Bindestriche.', subdomainRequired: 'Bitte gib eine Subdomain ein.',
    security: 'Du kannst keine andere IP-Adresse eintragen. Das Portal veröffentlicht immer nur diesen Dienst.',
    disabled: 'Vom Administrator deaktiviert', existingTitle: 'Veröffentlichte Zugriffe', noPublications: 'Es wurde noch kein öffentlicher Zugriff eingerichtet.',
    addTitle: 'Öffentlichen Zugriff hinzufügen', editTitle: 'Öffentlichen Zugriff bearbeiten', target: 'Ziel', publicAddress: 'Öffentliche Adresse',
    saved: 'Der öffentliche Zugriff wurde gespeichert.', removed: 'Der öffentliche Zugriff wurde entfernt.',
    multipleHint: 'Du kannst für diesen Dienst mehrere HTTP-, TCP- und UDP-Freigaben anlegen und parallel verwenden.',
    protocolLocked: 'Das Protokoll bleibt beim Bearbeiten unverändert. Lege für ein anderes Protokoll eine weitere Freigabe an.'
  }
};

export default function PublicPageModal({ resource, onClose, onSaved, language: languageProp }) {
  const language = languageProp === 'de' || languageProp === 'en'
    ? languageProp
    : (readStoredLanguage() === 'de' ? 'de' : 'en');
  const text = TEXT[language];
  const initialPublications = Array.isArray(resource?.publications)
    ? resource.publications
    : (resource?.publication ? [resource.publication] : []);

  const [options, setOptions] = useState(null);
  const [primaryIp, setPrimaryIp] = useState(resource?.primaryIp || '');
  const [publications, setPublications] = useState(initialPublications);
  const [editingId, setEditingId] = useState(null);
  const [protocol, setProtocol] = useState('http');
  const [subdomain, setSubdomain] = useState(slugify(resource?.name || 'service'));
  const [targetPort, setTargetPort] = useState('80');
  const [publicPort, setPublicPort] = useState('');
  const [targetMethod, setTargetMethod] = useState('http');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      userApi.getPublishingOptions(resource?.id),
      userApi.getPublications(resource?.id)
    ])
      .then(([optionsResponse, publicationsResponse]) => {
        if (!active) return;
        const publishing = optionsResponse.data.publishing || {};
        const currentPublications = publicationsResponse.data.publications || [];
        setOptions(publishing);
        setPrimaryIp(publicationsResponse.data.primaryIp || resource?.primaryIp || '');
        setPublications(currentPublications);
        const firstProtocol = getFirstEnabledProtocol(publishing);
        setProtocol(firstProtocol);
        setSubdomain(getSuggestedSubdomain(resource?.name, firstProtocol, currentPublications));
        setTargetMethod(publishing.defaultTargetMethod || 'http');
        setDefaultPorts(firstProtocol, publishing, setTargetPort, setPublicPort);
      })
      .catch((err) => active && setError(getErrorMessage(err, text.unavailable)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [resource?.id, resource?.name, resource?.primaryIp, text.unavailable]);

  const protocolOptions = useMemo(() => ['http', 'tcp', 'udp'].map((key) => ({
    key,
    enabled: !!options?.protocols?.[key]?.enabled,
    ports: options?.protocols?.[key]?.allowedPorts || ''
  })), [options]);

  const rawPortBounds = useMemo(
    () => getPortPolicyBounds(options?.protocols?.[protocol]?.allowedPorts),
    [options, protocol]
  );

  const preview = subdomain && options?.baseDomain
    ? (protocol === 'http'
      ? `https://${subdomain}.${options.baseDomain}`
      : `${protocol}://${subdomain}.${options.baseDomain}:${publicPort}`)
    : '';

  const resetForm = (currentPublications = publications, preferredProtocol = null) => {
    const nextProtocol = preferredProtocol && options?.protocols?.[preferredProtocol]?.enabled
      ? preferredProtocol
      : getFirstEnabledProtocol(options);
    setEditingId(null);
    setProtocol(nextProtocol);
    setSubdomain(getSuggestedSubdomain(resource?.name, nextProtocol, currentPublications));
    setTargetMethod(options?.defaultTargetMethod || 'http');
    setDefaultPorts(nextProtocol, options, setTargetPort, setPublicPort);
    setError('');
  };

  const beginEdit = (publication) => {
    setEditingId(publication.id);
    setProtocol(publication.protocol || 'http');
    setSubdomain(publication.subdomain || slugify(resource?.name || 'service'));
    setTargetPort(String(publication.targetPort || 80));
    setPublicPort(String(publication.publicPort || publication.targetPort || ''));
    setTargetMethod(publication.targetMethod || options?.defaultTargetMethod || 'http');
    setError('');
    setNotice('');
  };

  const switchProtocol = (next) => {
    if (editingId) return;
    const entry = protocolOptions.find((item) => item.key === next);
    if (!entry?.enabled) return;
    setProtocol(next);
    setSubdomain(getSuggestedSubdomain(resource?.name, next, publications));
    setDefaultPorts(next, options, setTargetPort, setPublicPort);
    setError('');
    setNotice('');
  };

  const reloadPublications = async () => {
    const response = await userApi.getPublications(resource.id);
    const currentPublications = response.data.publications || [];
    setPublications(currentPublications);
    return currentPublications;
  };

  const save = async (event) => {
    event.preventDefault();
    const normalizedSubdomain = subdomain.trim().toLowerCase();
    if (!normalizedSubdomain) {
      setError(text.subdomainRequired);
      return;
    }

    const payload = {
      protocol,
      subdomain: normalizedSubdomain,
      targetPort: Number(targetPort),
      publicPort: protocol === 'http' ? undefined : Number(publicPort),
      targetMethod: protocol === 'http' ? targetMethod : undefined
    };

    try {
      setBusy('save');
      setError('');
      setNotice('');
      if (editingId) {
        await userApi.updatePublication(resource.id, editingId, payload);
      } else {
        await userApi.createPublication(resource.id, payload);
      }
      const currentPublications = await reloadPublications();
      await onSaved?.();
      setNotice(text.saved);
      resetForm(currentPublications, protocol);
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setBusy('');
    }
  };

  const remove = async (publication) => {
    if (!window.confirm(text.removeConfirm(publication.publicUrl))) return;
    try {
      setBusy(`remove-${publication.id}`);
      setError('');
      setNotice('');
      await userApi.deletePublication(resource.id, publication.id);
      const currentPublications = publications.filter((item) => item.id !== publication.id);
      setPublications(currentPublications);
      await onSaved?.();
      if (editingId === publication.id) resetForm(currentPublications, protocol);
      setNotice(text.removed);
    } catch (err) {
      setError(getErrorMessage(err, text.removeFailed));
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      title={text.title}
      onClose={onClose}
      className="public-page-modal-card publishing-modal-card publishing-manager-modal-card"
      disableBackdropClose={!!busy}
      closeLabel={text.close}
    >
      {loading ? <p className="loading">{text.loading}</p> : (
        <div className="publishing-manager-content">
          {error && <div className="alert alert-danger">{error}</div>}
          {notice && <div className="alert alert-success">{notice}</div>}
          {!options?.enabled && <div className="alert alert-warning">{options?.clusterEnabled === false ? text.clusterDisabled : text.unavailable}</div>}
          {!primaryIp && <div className="alert alert-warning">{text.noIp}</div>}

          <div className="publishing-security-note">
            <strong>{text.autoIp}</strong>
            <code>{primaryIp || '—'}</code>
            <small>{text.security}</small>
          </div>

          <section className="publishing-existing-section">
            <div className="publishing-section-heading">
              <div>
                <h3>{text.existingTitle}</h3>
                <p>{text.multipleHint}</p>
              </div>
              <span className="publishing-count-badge">{publications.length}</span>
            </div>

            {publications.length === 0 ? (
              <p className="hint-text publishing-empty-state">{text.noPublications}</p>
            ) : (
              <div className="publishing-existing-list">
                {publications.map((publication) => (
                  <article key={publication.id} className={`publishing-existing-card ${editingId === publication.id ? 'editing' : ''}`}>
                    <div className="publishing-existing-card-main">
                      <span className="publishing-protocol-badge">{String(publication.protocol || '').toUpperCase()}</span>
                      <div>
                        <strong>{publication.publicUrl || '—'}</strong>
                        <small>{text.target}: {formatTarget(publication, primaryIp)}</small>
                      </div>
                    </div>
                    <div className="publishing-existing-card-actions">
                      {publication.protocol === 'http' && publication.publicUrl && (
                        <a className="btn-secondary btn-small" href={publication.publicUrl} target="_blank" rel="noreferrer">{text.open}</a>
                      )}
                      <button type="button" className="btn-secondary btn-small" onClick={() => beginEdit(publication)} disabled={!!busy}>{text.edit}</button>
                      <button type="button" className="btn-danger btn-small" onClick={() => remove(publication)} disabled={!!busy}>
                        {busy === `remove-${publication.id}` ? text.removing : text.remove}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <form className="publishing-form publishing-manager-form" onSubmit={save} noValidate>
            <div className="publishing-section-heading publishing-form-heading">
              <div>
                <h3>{editingId ? text.editTitle : text.addTitle}</h3>
                {editingId && <p>{text.protocolLocked}</p>}
              </div>
            </div>

            <fieldset className="publishing-protocol-fieldset" disabled={!!busy || !options?.enabled}>
              <legend>{text.protocol}</legend>
              <div className="publishing-protocol-selector">
                {protocolOptions.map((entry) => {
                  const locked = !!editingId && protocol !== entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      className={`${protocol === entry.key ? 'active' : ''} ${entry.enabled && !locked ? '' : 'disabled'}`}
                      onClick={() => switchProtocol(entry.key)}
                      disabled={!entry.enabled || locked}
                    >
                      <strong>{entry.key.toUpperCase()}</strong>
                      <small>{entry.enabled ? `${text.ranges}: ${entry.ports || '—'}` : text.disabled}</small>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="publishing-fields-grid publishing-subdomain-fields-grid">
              <label className="form-group publishing-subdomain-field">
                <span>{text.subdomain}</span>
                <div className="subdomain-input-row">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(event) => setSubdomain(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    maxLength="63"
                    required
                    disabled={!!busy || !options?.enabled}
                  />
                  <span>.{options?.baseDomain || 'example.com'}</span>
                </div>
                <small>{text.subdomainHint}</small>
              </label>
            </div>

            {protocol === 'http' ? (
              <div className="publishing-fields-grid publishing-http-fields-grid">
                <label className="form-group publishing-control-field">
                  <span>{text.targetPort}</span>
                  <input type="number" min="1" max="65535" value={targetPort} onChange={(event) => setTargetPort(event.target.value)} disabled={!!busy || !options?.enabled} />
                  <small>{text.ranges}: {options?.protocols?.http?.allowedPorts || '—'}</small>
                </label>
                <label className="form-group publishing-control-field">
                  <span>{text.backendProtocol}</span>
                  <select value={targetMethod} onChange={(event) => setTargetMethod(event.target.value)} disabled={!!busy || !options?.enabled}>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="h2c">h2c</option>
                  </select>
                  <small>{text.backendProtocolHint}</small>
                </label>
              </div>
            ) : (
              <div className="publishing-fields-grid publishing-raw-fields-grid">
                <label className="form-group">
                  <span>{text.publicPort}</span>
                  <input
                    type="number"
                    min={rawPortBounds.min}
                    max={rawPortBounds.max}
                    value={publicPort}
                    onChange={(event) => { setPublicPort(event.target.value); setTargetPort(event.target.value); }}
                    disabled={!!busy || !options?.enabled}
                  />
                  <small>{text.ranges}: {options?.protocols?.[protocol]?.allowedPorts || '—'}</small>
                </label>
              </div>
            )}

            {preview && (
              <div className="publishing-preview">
                <span>{text.preview}</span>
                <strong>{preview}</strong>
              </div>
            )}

            <div className="form-actions public-page-form-actions publishing-actions">
              {editingId && <button type="button" className="btn-secondary" onClick={() => resetForm(publications, protocol)} disabled={!!busy}>{text.cancelEdit}</button>}
              <button type="button" className="btn-secondary" onClick={onClose} disabled={!!busy}>{text.close}</button>
              <button type="submit" className="btn-primary" disabled={!!busy || !options?.enabled || !primaryIp}>
                {busy === 'save' ? text.saving : editingId ? text.update : text.add}
              </button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}

function formatTarget(publication, ip) {
  const method = publication.protocol === 'http' ? `${publication.targetMethod || 'http'}://` : `${publication.protocol}://`;
  return `${method}${ip || '—'}:${publication.targetPort || '—'}`;
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

function getSuggestedSubdomain(resourceName, protocol, publications) {
  const base = slugify(resourceName || 'service');
  if (protocol !== 'http') return base;
  const used = new Set((publications || [])
    .filter((item) => item.protocol === 'http')
    .map((item) => String(item.subdomain || '').toLowerCase()));
  if (!used.has(base)) return base;
  for (let number = 2; number < 1000; number += 1) {
    const suffix = `-${number}`;
    const candidate = `${base.slice(0, 63 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 56)}-${Date.now().toString().slice(-6)}`;
}

function getFirstEnabledProtocol(options) {
  return ['http', 'tcp', 'udp'].find((key) => options?.protocols?.[key]?.enabled) || 'http';
}

function setDefaultPorts(protocol, options, setTargetPort, setPublicPort) {
  const firstAllowedPort = getFirstAllowedPort(options?.protocols?.[protocol]?.allowedPorts);
  if (protocol === 'http') {
    setTargetPort(String(firstAllowedPort || 80));
    setPublicPort('');
  } else {
    const value = String(firstAllowedPort || '');
    setTargetPort(value);
    setPublicPort(value);
  }
}

function parsePortPolicy(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
      if (!match) return null;
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      if (start < 1 || end > 65535 || start > end) return null;
      return { start, end };
    })
    .filter(Boolean);
}

function getFirstAllowedPort(policy) {
  const ranges = parsePortPolicy(policy);
  return ranges.length ? Math.min(...ranges.map((range) => range.start)) : '';
}

function getPortPolicyBounds(policy) {
  const ranges = parsePortPolicy(policy);
  if (!ranges.length) return { min: 1, max: 65535 };
  return {
    min: Math.min(...ranges.map((range) => range.start)),
    max: Math.max(...ranges.map((range) => range.end))
  };
}
