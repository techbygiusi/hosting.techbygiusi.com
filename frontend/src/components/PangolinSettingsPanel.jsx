import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';

const DEFAULTS = {
  enabled: false,
  apiUrl: 'https://pangolin-api.example.com/v1',
  apiKey: '',
  apiKeyConfigured: false,
  orgId: '',
  siteId: '',
  domainId: '',
  baseDomain: '',
  httpEnabled: true,
  tcpEnabled: false,
  udpEnabled: false,
  allowedHttpPorts: '80,443,3000-9999',
  allowedTcpPorts: '',
  allowedUdpPorts: '',
  defaultTargetMethod: 'http',
  reservedSubdomains: 'www,api,admin,pangolin,pangolin-api,portal'
};

export default function PangolinSettingsPanel({ onSuccess, onError }) {
  const [form, setForm] = useState(DEFAULTS);
  const [sites, setSites] = useState([]);
  const [domains, setDomains] = useState([]);
  const [publicationCount, setPublicationCount] = useState(0);
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const onErrorRef = useRef(onError);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const selectedDomain = useMemo(
    () => domains.find((item) => String(item.id) === String(form.domainId)),
    [domains, form.domainId]
  );

  useEffect(() => {
    let active = true;
    Promise.all([adminApi.getPangolinSettings(), adminApi.getPangolinPublications()])
      .then(([settingsResponse, publicationsResponse]) => {
        if (!active) return;
        const loaded = settingsResponse.data.settings || {};
        const loadedPublications = publicationsResponse.data.publications || [];
        setForm({ ...DEFAULTS, ...loaded, apiKey: '' });
        setPublicationCount(Number(settingsResponse.data.publicationCount || loadedPublications.length || 0));
        setPublications(loadedPublications);
      })
      .catch((err) => onErrorRef.current?.(getErrorMessage(err, 'Pangolin-Einstellungen konnten nicht geladen werden.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const connectionPayload = () => ({
    apiUrl: form.apiUrl,
    apiKey: form.apiKey || (form.apiKeyConfigured ? '***hidden***' : ''),
    orgId: form.orgId,
    siteId: form.siteId,
    domainId: form.domainId,
    baseDomain: form.baseDomain,
    enabled: form.enabled,
    httpEnabled: form.httpEnabled,
    tcpEnabled: form.tcpEnabled,
    udpEnabled: form.udpEnabled,
    allowedHttpPorts: form.allowedHttpPorts,
    allowedTcpPorts: form.allowedTcpPorts,
    allowedUdpPorts: form.allowedUdpPorts,
    defaultTargetMethod: form.defaultTargetMethod,
    reservedSubdomains: form.reservedSubdomains
  });

  const discover = async () => {
    try {
      setBusy('discover');
      setResult(null);
      const response = await adminApi.discoverPangolin(connectionPayload());
      const nextSites = response.data.sites || [];
      const nextDomains = response.data.domains || [];
      setSites(nextSites);
      setDomains(nextDomains);
      setForm((current) => {
        const next = { ...current };
        if (!next.siteId && nextSites.length === 1) next.siteId = String(nextSites[0].id);
        if (!next.domainId && nextDomains.length === 1) {
          next.domainId = String(nextDomains[0].id);
          next.baseDomain = nextDomains[0].name || next.baseDomain;
        }
        return next;
      });
      setResult({ success: true, message: `${nextSites.length} Standort(e) und ${nextDomains.length} Domain(s) geladen.` });
    } catch (err) {
      setResult({ success: false, message: getErrorMessage(err, 'Pangolin-Daten konnten nicht geladen werden.') });
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    try {
      setBusy('test');
      setResult(null);
      const response = await adminApi.testPangolin(connectionPayload());
      setSites(response.data.sites || sites);
      setDomains(response.data.domains || domains);
      setResult({ success: true, message: response.data.message || 'Pangolin-Verbindung erfolgreich.' });
    } catch (err) {
      setResult({ success: false, message: getErrorMessage(err, 'Pangolin-Verbindung fehlgeschlagen.') });
    } finally {
      setBusy('');
    }
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy('save');
      setResult(null);
      const response = await adminApi.updatePangolinSettings(connectionPayload());
      const saved = response.data.settings || {};
      setForm((current) => ({
        ...current,
        ...saved,
        apiKey: '',
        apiKeyConfigured: saved.apiKeyConfigured ?? current.apiKeyConfigured
      }));
      setResult({ success: true, message: 'Pangolin-Einstellungen wurden gespeichert.' });
      onSuccess?.('Pangolin-Einstellungen wurden gespeichert.');
    } catch (err) {
      const message = getErrorMessage(err, 'Pangolin-Einstellungen konnten nicht gespeichert werden.');
      setResult({ success: false, message });
      onError?.(message);
    } finally {
      setBusy('');
    }
  };

  const removePublication = async (publication) => {
    if (!window.confirm(`Veröffentlichung für ${publication.resourceName} wirklich entfernen?`)) return;
    try {
      setBusy(`remove-${publication.resourceId}`);
      setResult(null);
      await adminApi.deletePangolinPublication(publication.resourceId);
      setPublications((items) => items.filter((item) => item.resourceId !== publication.resourceId));
      setPublicationCount((count) => Math.max(0, count - 1));
      setResult({ success: true, message: 'Veröffentlichung wurde entfernt.' });
    } catch (err) {
      setResult({ success: false, message: getErrorMessage(err, 'Veröffentlichung konnte nicht entfernt werden.') });
    } finally {
      setBusy('');
    }
  };

  const chooseDomain = (domainId) => {
    const domain = domains.find((item) => String(item.id) === String(domainId));
    setForm((current) => ({
      ...current,
      domainId,
      baseDomain: domain?.name || current.baseDomain
    }));
  };

  if (loading) {
    return <section className="panel-card pangolin-settings-panel"><p className="loading">Pangolin-Einstellungen werden geladen...</p></section>;
  }

  return (
    <section className="panel-card pangolin-settings-panel">
      <div className="panel-header pangolin-panel-header">
        <div>
          <p className="section-eyebrow">PUBLIC ACCESS</p>
          <h2>Pangolin-Veröffentlichung</h2>
          <p>Veröffentlicht Benutzer-Dienste serverseitig über die Pangolin Integration API. Der API-Schlüssel bleibt verschlüsselt im Backend.</p>
        </div>
        <span className={`status-badge ${form.enabled ? 'status-running' : 'status-stopped'}`}>{form.enabled ? 'Aktiv' : 'Deaktiviert'}</span>
      </div>

      <form className="pangolin-settings-form" onSubmit={save}>
        <label className="settings-toggle-card full-width">
          <span>
            <strong>Veröffentlichung im Benutzerportal aktivieren</strong>
            <small>Benutzer können ausschließlich die automatisch ermittelte IP ihres eigenen Dienstes veröffentlichen.</small>
          </span>
          <input type="checkbox" checked={!!form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
        </label>

        <div className="pangolin-settings-grid">
          <label className="form-group">
            <span>Integration API URL</span>
            <input type="url" value={form.apiUrl} onChange={(event) => update('apiUrl', event.target.value)} placeholder="https://pangolin-api.example.com/v1" />
          </label>
          <label className="form-group">
            <span>Organization API Key</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(event) => update('apiKey', event.target.value)}
              placeholder={form.apiKeyConfigured ? 'Gespeichert – leer lassen zum Beibehalten' : 'API-Schlüssel einfügen'}
              autoComplete="new-password"
            />
          </label>
          <label className="form-group">
            <span>Organization ID</span>
            <input type="text" value={form.orgId} onChange={(event) => update('orgId', event.target.value)} placeholder="org-id" />
          </label>
          <div className="form-group pangolin-discovery-action">
            <span>Standorte und Domains</span>
            <button type="button" className="btn-secondary" onClick={discover} disabled={!!busy}>
              {busy === 'discover' ? 'Wird geladen...' : 'Aus Pangolin laden'}
            </button>
          </div>
          <label className="form-group">
            <span>Newt-Standort</span>
            {sites.length ? (
              <select value={form.siteId} onChange={(event) => update('siteId', event.target.value)}>
                <option value="">Standort wählen</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.type ? ` (${site.type})` : ''}</option>)}
              </select>
            ) : (
              <input type="number" min="1" value={form.siteId} onChange={(event) => update('siteId', event.target.value)} placeholder="Site ID" />
            )}
          </label>
          <label className="form-group">
            <span>Pangolin-Domain</span>
            {domains.length ? (
              <select value={form.domainId} onChange={(event) => chooseDomain(event.target.value)}>
                <option value="">Domain wählen</option>
                {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
              </select>
            ) : (
              <input type="text" value={form.domainId} onChange={(event) => update('domainId', event.target.value)} placeholder="Domain ID" />
            )}
          </label>
          <label className="form-group">
            <span>Basisdomain für Benutzer</span>
            <input type="text" value={form.baseDomain} onChange={(event) => update('baseDomain', event.target.value)} placeholder="apps.example.com" />
            {selectedDomain?.name && <small>Ausgewählt: {selectedDomain.name}</small>}
          </label>
          <label className="form-group">
            <span>Standard-Backendprotokoll</span>
            <select value={form.defaultTargetMethod} onChange={(event) => update('defaultTargetMethod', event.target.value)}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="h2c">h2c</option>
            </select>
          </label>
          <label className="form-group full-width">
            <span>Reservierte Subdomains</span>
            <input type="text" value={form.reservedSubdomains} onChange={(event) => update('reservedSubdomains', event.target.value)} placeholder="www,api,admin,portal" />
            <small>Kommagetrennt. Diese Namen können Benutzer nicht anlegen.</small>
          </label>
        </div>

        <div className="pangolin-protocol-grid">
          <ProtocolPolicy
            title="HTTP / HTTPS"
            description="Öffentliche Webadresse mit automatischem TLS-Zertifikat. Der Bereich gilt für den internen Zielport."
            enabled={form.httpEnabled}
            onEnabled={(value) => update('httpEnabled', value)}
            ports={form.allowedHttpPorts}
            onPorts={(value) => update('allowedHttpPorts', value)}
            placeholder="80,443,3000-9999"
          />
          <ProtocolPolicy
            title="TCP (vorbereitet)"
            description="Rohe TCP-Freigaben. Der gewählte Port wird als öffentlicher und interner Port verwendet."
            enabled={form.tcpEnabled}
            onEnabled={(value) => update('tcpEnabled', value)}
            ports={form.allowedTcpPorts}
            onPorts={(value) => update('allowedTcpPorts', value)}
            placeholder="25565,30000-30100"
          />
          <ProtocolPolicy
            title="UDP (vorbereitet)"
            description="Rohe UDP-Freigaben. Nur bewusst freigeben und auf kleine Portbereiche begrenzen."
            enabled={form.udpEnabled}
            onEnabled={(value) => update('udpEnabled', value)}
            ports={form.allowedUdpPorts}
            onPorts={(value) => update('allowedUdpPorts', value)}
            placeholder="19132,30000-30100"
          />
        </div>

        <div className="pangolin-settings-footer">
          <div className="pangolin-settings-meta">
            <strong>{publicationCount}</strong>
            <span>verwaltete Veröffentlichung(en)</span>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Test läuft...' : 'Verbindung testen'}</button>
            <button type="submit" className="btn-primary" disabled={!!busy}>{busy === 'save' ? 'Speichert...' : 'Pangolin speichern'}</button>
          </div>
        </div>
      </form>

      <div className="pangolin-publication-admin-list">
        <div className="settings-section-header">
          <h3>Verwaltete Veröffentlichungen</h3>
          <p>Administratoren können bestehende Freigaben prüfen und im Notfall vollständig aus Pangolin entfernen.</p>
        </div>
        {publications.length === 0 ? (
          <p className="hint-text">Noch keine Dienste veröffentlicht.</p>
        ) : (
          <div className="pangolin-publication-grid">
            {publications.map((publication) => (
              <article key={publication.id} className="pangolin-publication-card">
                <div className="pangolin-publication-title">
                  <div>
                    <span>{publication.protocol?.toUpperCase()} · {publication.clusterName} · {publication.containerId}</span>
                    <strong>{publication.resourceName}</strong>
                  </div>
                  <span className={`status-badge ${publication.status === 'active' ? 'status-running' : 'status-stopped'}`}>{publication.status}</span>
                </div>
                <dl>
                  <div><dt>Benutzer</dt><dd>{publication.userName} · {publication.userEmail}</dd></div>
                  <div><dt>Ziel</dt><dd>Port {publication.targetPort}{publication.targetMethod ? ` · ${publication.targetMethod}` : ''}</dd></div>
                  <div><dt>Öffentlich</dt><dd>{publication.publicUrl || `Port ${publication.publicPort}`}</dd></div>
                </dl>
                {publication.lastError && <small className="power-error">{publication.lastError}</small>}
                <div className="form-actions">
                  {publication.publicUrl?.startsWith('http') && <a className="btn-secondary" href={publication.publicUrl} target="_blank" rel="noreferrer">Öffnen</a>}
                  <button type="button" className="btn-danger" onClick={() => removePublication(publication)} disabled={!!busy}>
                    {busy === `remove-${publication.resourceId}` ? 'Entfernt...' : 'Freigabe entfernen'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {result && <div className={`test-result ${result.success ? 'success' : 'error'}`}>{result.message}</div>}
    </section>
  );
}

function ProtocolPolicy({ title, description, enabled, onEnabled, ports, onPorts, placeholder }) {
  return (
    <article className={`pangolin-protocol-card ${enabled ? 'enabled' : ''}`}>
      <label className="pangolin-protocol-toggle">
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <input type="checkbox" checked={!!enabled} onChange={(event) => onEnabled(event.target.checked)} />
      </label>
      <label className="form-group">
        <span>Erlaubte Ports / Bereiche</span>
        <input type="text" value={ports} onChange={(event) => onPorts(event.target.value)} placeholder={placeholder} disabled={!enabled} />
        <small>Beispiel: 80,443,8000-8999</small>
      </label>
    </article>
  );
}
