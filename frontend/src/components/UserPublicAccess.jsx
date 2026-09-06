import React, { useEffect, useMemo, useState } from 'react';
import { CopyIcon, GlobeIcon, LinkIcon, TrashIcon } from './Icons';
import { EmptyState, InlineNotice } from './UiBits';
import { getErrorMessage, userApi } from '../services/api';

const TEXT = {
  en: {
    service: 'Service',
    cluster: 'Cluster',
    baseDomain: 'Public domain',
    serviceIp: 'Service IP',
    loading: 'Loading public access…',
    noResources: 'No self-service services available',
    noResourcesText: 'Only services you created yourself can be published here.',
    unavailable: 'Public Access is disabled for this cluster.',
    unavailableHint: 'The administrator must enable Public Access and configure Pangolin for this cluster before new access can be created.',
    noIp: 'No service IP is available yet. Public Access can be created after the container has a reachable IPv4 address.',
    addTitle: 'Add public access',
    addText: 'The domain, connector and allowed ports are selected automatically from the service cluster.',
    website: 'Website',
    websiteText: 'Publish a web service with automatic HTTPS.',
    tcp: 'TCP',
    tcpText: 'Publish a raw TCP port.',
    udp: 'UDP',
    udpText: 'Publish a raw UDP port.',
    hostname: 'Hostname',
    hostnamePlaceholder: 'my-service',
    publicAddress: 'Public address',
    internalPort: 'Internal port',
    publicPort: 'Public port',
    backendProtocol: 'Backend protocol',
    allowedPorts: 'Allowed ports',
    create: 'Add public access',
    save: 'Save changes',
    saving: 'Saving…',
    cancel: 'Cancel edit',
    activeTitle: 'Active public access',
    activeText: 'All public endpoints configured for this service.',
    noAccess: 'No public access configured',
    noAccessText: 'Create a website, TCP or UDP endpoint above.',
    target: 'Internal target',
    public: 'Public endpoint',
    open: 'Open',
    copy: 'Copy',
    copied: 'Copied',
    edit: 'Edit',
    remove: 'Remove',
    removing: 'Removing…',
    removeConfirm: 'Remove this public access?',
    added: 'Public access created.',
    updated: 'Public access updated.',
    removed: 'Public access removed.',
    statusActive: 'Active',
    statusError: 'Error',
    protocolLocked: 'The protocol cannot be changed while editing an existing endpoint.'
  },
  de: {
    service: 'Service',
    cluster: 'Cluster',
    baseDomain: 'Öffentliche Domain',
    serviceIp: 'Service-IP',
    loading: 'Public Access wird geladen…',
    noResources: 'Keine Self-Service-Services verfügbar',
    noResourcesText: 'Hier können nur Services veröffentlicht werden, die du selbst erstellt hast.',
    unavailable: 'Public Access ist für diesen Cluster deaktiviert.',
    unavailableHint: 'Der Administrator muss Public Access aktivieren und Pangolin für diesen Cluster konfigurieren, bevor neue Zugänge erstellt werden können.',
    noIp: 'Für diesen Service ist noch keine Service-IP verfügbar. Public Access kann erstellt werden, sobald der Container eine erreichbare IPv4-Adresse hat.',
    addTitle: 'Public Access hinzufügen',
    addText: 'Domain, Connector und erlaubte Ports werden automatisch anhand des Clusters des Services ausgewählt.',
    website: 'Webseite',
    websiteText: 'Einen Webdienst mit automatischem HTTPS veröffentlichen.',
    tcp: 'TCP',
    tcpText: 'Einen TCP-Port veröffentlichen.',
    udp: 'UDP',
    udpText: 'Einen UDP-Port veröffentlichen.',
    hostname: 'Hostname',
    hostnamePlaceholder: 'mein-service',
    publicAddress: 'Öffentliche Adresse',
    internalPort: 'Interner Port',
    publicPort: 'Öffentlicher Port',
    backendProtocol: 'Backend-Protokoll',
    allowedPorts: 'Erlaubte Ports',
    create: 'Public Access hinzufügen',
    save: 'Änderungen speichern',
    saving: 'Wird gespeichert…',
    cancel: 'Bearbeiten abbrechen',
    activeTitle: 'Aktiver Public Access',
    activeText: 'Alle für diesen Service konfigurierten öffentlichen Endpunkte.',
    noAccess: 'Kein Public Access konfiguriert',
    noAccessText: 'Oben kann eine Webseite oder ein TCP-/UDP-Endpunkt erstellt werden.',
    target: 'Internes Ziel',
    public: 'Öffentlicher Endpunkt',
    open: 'Öffnen',
    copy: 'Kopieren',
    copied: 'Kopiert',
    edit: 'Bearbeiten',
    remove: 'Entfernen',
    removing: 'Wird entfernt…',
    removeConfirm: 'Diesen Public Access entfernen?',
    added: 'Public Access wurde erstellt.',
    updated: 'Public Access wurde aktualisiert.',
    removed: 'Public Access wurde entfernt.',
    statusActive: 'Aktiv',
    statusError: 'Fehler',
    protocolLocked: 'Das Protokoll kann beim Bearbeiten eines bestehenden Endpunkts nicht geändert werden.'
  }
};

function defaultForm(protocol = 'http', options = null) {
  return {
    protocol,
    subdomain: '',
    targetPort: protocol === 'http' ? '80' : '',
    publicPort: protocol === 'http' ? '443' : '',
    targetMethod: options?.defaultTargetMethod || 'http'
  };
}

function protocolLabel(protocol, text) {
  if (protocol === 'http') return text.website;
  return protocol.toUpperCase();
}

function publicPreview(form, baseDomain) {
  const subdomain = String(form.subdomain || '').trim().toLowerCase();
  if (!subdomain || !baseDomain) return '—';
  if (form.protocol === 'http') return `https://${subdomain}.${baseDomain}`;
  const port = String(form.publicPort || '').trim();
  return `${form.protocol}://${subdomain}.${baseDomain}${port ? `:${port}` : ''}`;
}

export default function UserPublicAccess({ resources = [], language = 'en', onResourceUpdate }) {
  const text = TEXT[language === 'de' ? 'de' : 'en'];
  const eligibleResources = useMemo(
    () => resources.filter((resource) => resource?.isSelfService && !resource?.adminManaged && resource?.canManageCredentials),
    [resources]
  );
  const [resourceId, setResourceId] = useState('');
  const [publishing, setPublishing] = useState(null);
  const [publications, setPublications] = useState([]);
  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const selectedResource = eligibleResources.find((resource) => String(resource.id) === String(resourceId)) || eligibleResources[0] || null;

  useEffect(() => {
    if (!eligibleResources.length) {
      setResourceId('');
      return;
    }
    if (!eligibleResources.some((resource) => String(resource.id) === String(resourceId))) {
      setResourceId(String(eligibleResources[0].id));
    }
  }, [eligibleResources, resourceId]);

  const loadSelected = async (id) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [optionsResponse, publicationsResponse] = await Promise.all([
        userApi.getPublishingOptions(id),
        userApi.getPublications(id)
      ]);
      const nextPublishing = optionsResponse.data?.publishing || null;
      const nextPublications = publicationsResponse.data?.publications || [];
      setPublishing(nextPublishing);
      setPublications(nextPublications);
      setEditingId(null);
      const firstProtocol = nextPublishing?.protocols?.http?.enabled
        ? 'http'
        : nextPublishing?.protocols?.tcp?.enabled
          ? 'tcp'
          : nextPublishing?.protocols?.udp?.enabled
            ? 'udp'
            : 'http';
      setForm(defaultForm(firstProtocol, nextPublishing));
    } catch (err) {
      setPublishing(null);
      setPublications([]);
      setError(getErrorMessage(err, 'Public Access could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedResource?.id) loadSelected(selectedResource.id);
  }, [selectedResource?.id]);

  const refreshResource = async () => {
    if (!selectedResource?.id || !onResourceUpdate) return;
    try {
      const response = await userApi.getResourceDetails(selectedResource.id);
      if (response.data?.resource) onResourceUpdate(response.data.resource);
    } catch (_) {
    }
  };

  const chooseProtocol = (protocol) => {
    if (editingId) return;
    if (!publishing?.protocols?.[protocol]?.enabled) return;
    setForm(defaultForm(protocol, publishing));
    setError('');
    setNotice('');
  };

  const startEdit = (publication) => {
    setEditingId(publication.id);
    setForm({
      protocol: publication.protocol || 'http',
      subdomain: publication.subdomain || '',
      targetPort: String(publication.targetPort || ''),
      publicPort: String(publication.publicPort || ''),
      targetMethod: publication.targetMethod || publishing?.defaultTargetMethod || 'http'
    });
    setError('');
    setNotice('');
    window.requestAnimationFrame(() => document.querySelector('.public-access-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(defaultForm(form.protocol, publishing));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedResource?.id) return;
    setBusy('save');
    setError('');
    setNotice('');
    const payload = {
      protocol: form.protocol,
      subdomain: String(form.subdomain || '').trim().toLowerCase(),
      targetPort: Number(form.targetPort),
      publicPort: form.protocol === 'http' ? 443 : Number(form.publicPort),
      targetMethod: form.protocol === 'http' ? form.targetMethod : ''
    };
    try {
      if (editingId) {
        await userApi.updatePublication(selectedResource.id, editingId, payload);
        setNotice(text.updated);
      } else {
        await userApi.createPublication(selectedResource.id, payload);
        setNotice(text.added);
      }
      await loadSelected(selectedResource.id);
      await refreshResource();
    } catch (err) {
      setError(getErrorMessage(err, 'Public Access could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  const removePublication = async (publication) => {
    if (!selectedResource?.id || !window.confirm(text.removeConfirm)) return;
    setBusy(`remove-${publication.id}`);
    setError('');
    setNotice('');
    try {
      await userApi.deletePublication(selectedResource.id, publication.id);
      setNotice(text.removed);
      await loadSelected(selectedResource.id);
      await refreshResource();
    } catch (err) {
      setError(getErrorMessage(err, 'Public Access could not be removed.'));
    } finally {
      setBusy('');
    }
  };

  const copyEndpoint = async (publication) => {
    const value = publication.publicUrl || '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(String(publication.id));
      window.setTimeout(() => setCopiedId(''), 1500);
    } catch (_) {
    }
  };

  if (!eligibleResources.length) {
    return <EmptyState title={text.noResources} text={text.noResourcesText} />;
  }

  const baseDomain = publishing?.baseDomain || '';
  const protocolOptions = [
    { key: 'http', label: text.website, description: text.websiteText },
    { key: 'tcp', label: text.tcp, description: text.tcpText },
    { key: 'udp', label: text.udp, description: text.udpText }
  ];
  const currentPolicy = publishing?.protocols?.[form.protocol]?.allowedPorts || '—';
  const canCreate = !!publishing?.enabled && !!selectedResource?.primaryIp;

  return (
    <div className="public-access-page">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <section className="public-access-resource-card">
        <label className="public-access-service-select">
          <span>{text.service}</span>
          <select value={selectedResource ? String(selectedResource.id) : ''} onChange={(event) => setResourceId(event.target.value)}>
            {eligibleResources.map((resource) => (
              <option key={resource.id} value={resource.id}>{resource.name}</option>
            ))}
          </select>
        </label>
        <div className="public-access-resource-meta"><span>{text.cluster}</span><strong>{selectedResource?.clusterName || '—'}</strong></div>
        <div className="public-access-resource-meta"><span>{text.baseDomain}</span><strong>{baseDomain || '—'}</strong></div>
        <div className="public-access-resource-meta"><span>{text.serviceIp}</span><strong>{selectedResource?.primaryIp || '—'}</strong></div>
      </section>

      {loading ? <div className="public-access-loading">{text.loading}</div> : null}

      {!loading && publishing && !publishing.enabled ? (
        <InlineNotice tone="warning"><strong>{text.unavailable}</strong> {text.unavailableHint}</InlineNotice>
      ) : null}
      {!loading && publishing?.enabled && !selectedResource?.primaryIp ? (
        <InlineNotice tone="warning">{text.noIp}</InlineNotice>
      ) : null}

      {!loading ? (
        <section className="public-access-form-card">
          <div className="public-access-section-head">
            <div>
              <h2>{text.addTitle}</h2>
              <p>{text.addText}</p>
            </div>
            {editingId ? <span className="public-access-edit-note">{text.protocolLocked}</span> : null}
          </div>

          <div className="public-access-protocol-picker">
            {protocolOptions.map((option) => {
              const enabled = !!publishing?.protocols?.[option.key]?.enabled;
              const active = form.protocol === option.key;
              return (
                <button
                  type="button"
                  key={option.key}
                  className={`public-access-protocol-option ${active ? 'active' : ''}`}
                  disabled={!enabled || !!editingId}
                  onClick={() => chooseProtocol(option.key)}
                >
                  <span>{option.key === 'http' ? <GlobeIcon size={18} /> : <LinkIcon size={18} />}</span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              );
            })}
          </div>

          <form className="public-access-form" onSubmit={submit}>
            <label className="public-access-hostname-field">
              <span>{text.hostname}</span>
              <div className="public-access-domain-input">
                <input
                  value={form.subdomain}
                  onChange={(event) => setForm((current) => ({ ...current, subdomain: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  placeholder={text.hostnamePlaceholder}
                  maxLength={63}
                  required
                  disabled={!canCreate}
                />
                <span>.{baseDomain || 'domain'}</span>
              </div>
            </label>

            <label>
              <span>{text.internalPort}</span>
              <input type="number" min="1" max="65535" value={form.targetPort} onChange={(event) => setForm((current) => ({ ...current, targetPort: event.target.value }))} required disabled={!canCreate} />
              <small>{text.allowedPorts}: {form.protocol === 'http' ? currentPolicy : '1-65535'}</small>
            </label>

            {form.protocol === 'http' ? (
              <label>
                <span>{text.backendProtocol}</span>
                <select value={form.targetMethod} onChange={(event) => setForm((current) => ({ ...current, targetMethod: event.target.value }))} disabled={!canCreate}>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="h2c">H2C</option>
                </select>
                <small>HTTPS → 443</small>
              </label>
            ) : (
              <label>
                <span>{text.publicPort}</span>
                <input type="number" min="1" max="65535" value={form.publicPort} onChange={(event) => setForm((current) => ({ ...current, publicPort: event.target.value }))} required disabled={!canCreate} />
                <small>{text.allowedPorts}: {currentPolicy}</small>
              </label>
            )}

            <div className="public-access-preview">
              <span>{text.publicAddress}</span>
              <strong>{publicPreview(form, baseDomain)}</strong>
            </div>

            <div className="public-access-form-actions">
              {editingId ? <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={!!busy}>{text.cancel}</button> : null}
              <button type="submit" className="btn-primary" disabled={!canCreate || !!busy}>{busy === 'save' ? text.saving : editingId ? text.save : text.create}</button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading ? (
        <section className="public-access-list-card">
          <div className="public-access-section-head">
            <div>
              <h2>{text.activeTitle}</h2>
              <p>{text.activeText}</p>
            </div>
            <span className="public-access-count">{publications.length}</span>
          </div>
          {publications.length ? (
            <div className="public-access-list">
              {publications.map((publication) => (
                <article className="public-access-row" key={publication.id}>
                  <div className="public-access-row-icon">{publication.protocol === 'http' ? <GlobeIcon size={18} /> : <LinkIcon size={18} />}</div>
                  <div className="public-access-row-main">
                    <div className="public-access-row-title">
                      <strong>{protocolLabel(publication.protocol, text)}</strong>
                      <span className={`status-badge ${publication.status === 'active' ? 'status-running' : 'status-stopped'}`}>{publication.status === 'active' ? text.statusActive : text.statusError}</span>
                    </div>
                    <span>{publication.publicUrl || '—'}</span>
                    {publication.lastError ? <small className="power-error">{publication.lastError}</small> : null}
                  </div>
                  <div className="public-access-row-target">
                    <span>{text.target}</span>
                    <strong>{selectedResource?.primaryIp || '—'}:{publication.targetPort}</strong>
                    {publication.protocol === 'http' && publication.targetMethod ? <small>{publication.targetMethod.toUpperCase()}</small> : null}
                  </div>
                  <div className="public-access-row-actions">
                    {publication.protocol === 'http' && publication.publicUrl ? <a className="btn-secondary" href={publication.publicUrl} target="_blank" rel="noreferrer">{text.open}</a> : null}
                    <button type="button" className="btn-secondary" onClick={() => copyEndpoint(publication)} disabled={!publication.publicUrl}>{copiedId === String(publication.id) ? text.copied : text.copy}</button>
                    {publishing?.enabled ? <button type="button" className="btn-secondary" onClick={() => startEdit(publication)} disabled={!!busy}>{text.edit}</button> : null}
                    <button type="button" className="btn-danger" onClick={() => removePublication(publication)} disabled={!!busy}>
                      {busy === `remove-${publication.id}` ? text.removing : text.remove}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title={text.noAccess} text={text.noAccessText} />}
        </section>
      ) : null}
    </div>
  );
}
