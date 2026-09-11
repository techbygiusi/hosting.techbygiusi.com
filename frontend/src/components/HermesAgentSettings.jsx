import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';
import { CopyIcon, LinkIcon, LockIcon, TerminalIcon, BookIcon, ServerIcon } from './Icons';
import { copyTextToClipboard } from '../utils/clipboard';

const PERMISSIONS = [
  { key: 'overviewRead', icon: ServerIcon, en: ['Portal overview', 'Read portal totals and general status information.'], de: ['Portal-Übersicht', 'Portal-Summen und allgemeine Statusinformationen lesen.'] },
  { key: 'servicesRead', icon: ServerIcon, en: ['Read services', 'Read assigned services, owners, addresses and configured service links.'], de: ['Services lesen', 'Zugewiesene Services, Besitzer, Adressen und konfigurierte Service-Links lesen.'] },
  { key: 'clustersRead', icon: ServerIcon, en: ['Read clusters', 'Read connected cluster names, locations and feature status.'], de: ['Cluster lesen', 'Verbundene Cluster, Standorte und aktivierte Funktionen lesen.'] },
  { key: 'wikiRead', icon: BookIcon, en: ['Read wiki', 'Read folders and wiki articles in all available languages.'], de: ['Wiki lesen', 'Ordner und Wiki-Artikel in allen vorhandenen Sprachen lesen.'] },
  { key: 'wikiWrite', icon: BookIcon, en: ['Edit wiki', 'Create and edit wiki articles. Deleting articles is not granted.'], de: ['Wiki bearbeiten', 'Wiki-Artikel erstellen und bearbeiten. Löschen wird nicht freigegeben.'] },
  { key: 'logsRead', icon: ServerIcon, en: ['Read audit logs', 'Read recent portal audit log entries.'], de: ['Audit-Logs lesen', 'Aktuelle Einträge des Portal-Audit-Logs lesen.'] },
  { key: 'credentialsRead', icon: LockIcon, en: ['Read credentials', 'Read credentials available to the administrator. Self-service user credentials stay private.'], de: ['Zugangsdaten lesen', 'Für den Administrator verfügbare Zugangsdaten lesen. Self-Service-Benutzerdaten bleiben privat.'] },
  { key: 'sshAccess', icon: TerminalIcon, en: ['Run SSH commands', 'Run commands on services with administrator-accessible SSH credentials.'], de: ['SSH-Befehle ausführen', 'Befehle auf Services mit für den Administrator verfügbaren SSH-Zugangsdaten ausführen.'] }
];

const EMPTY = {
  enabled: false,
  name: 'Hermes Agent',
  apiUrl: 'http://127.0.0.1:8642/v1',
  apiKey: '',
  apiKeyConfigured: false,
  model: 'hermes-agent',
  command: '',
  permissions: {},
  portalToken: '',
  portalApiUrl: '',
  connectionCommand: ''
};

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" className={`toggle-clean ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}>
      <span />
    </button>
  );
}

export default function HermesAgentSettings({ language = 'en' }) {
  const de = language === 'de';
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getHermesSettings();
      setForm({ ...EMPTY, ...(response.data?.settings || {}) });
    } catch (err) {
      setError(getErrorMessage(err, de ? 'Hermes-Agent-Einstellungen konnten nicht geladen werden.' : 'Hermes Agent settings could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updatePermission = (key, value) => setForm((current) => ({ ...current, permissions: { ...(current.permissions || {}), [key]: value } }));

  const save = async (event) => {
    event?.preventDefault?.();
    setBusy('save'); setError(''); setNotice('');
    try {
      const response = await adminApi.updateHermesSettings({
        enabled: form.enabled,
        name: form.name,
        apiUrl: form.apiUrl,
        apiKey: form.apiKey,
        model: form.model,
        command: form.command,
        permissions: form.permissions
      });
      setForm((current) => ({ ...current, ...(response.data?.settings || {}), apiKey: '' }));
      setNotice(de ? 'Hermes-Agent-Einstellungen gespeichert.' : 'Hermes Agent settings saved.');
      window.dispatchEvent(new CustomEvent('hermes-config-changed'));
    } catch (err) {
      setError(getErrorMessage(err, de ? 'Hermes-Agent-Einstellungen konnten nicht gespeichert werden.' : 'Hermes Agent settings could not be saved.'));
    } finally { setBusy(''); }
  };

  const test = async () => {
    setBusy('test'); setError(''); setNotice('');
    try {
      const response = await adminApi.testHermesConnection({ apiUrl: form.apiUrl, apiKey: form.apiKey });
      const models = response.data?.models || [];
      setNotice(`${de ? 'Hermes Agent ist erreichbar.' : 'Hermes Agent is reachable.'}${models.length ? ` ${de ? 'Modelle' : 'Models'}: ${models.join(', ')}` : ''}`);
    } catch (err) {
      setError(getErrorMessage(err, de ? 'Verbindung zum Hermes Agent fehlgeschlagen.' : 'Hermes Agent connection failed.'));
    } finally { setBusy(''); }
  };

  const rotate = async () => {
    if (!window.confirm(de ? 'Portal-Zugriffstoken wirklich neu erzeugen? Der bisherige Hermes-Zugriff funktioniert danach nicht mehr.' : 'Regenerate the Portal access token? Existing Hermes access will stop working.')) return;
    setBusy('token'); setError(''); setNotice('');
    try {
      const response = await adminApi.regenerateHermesPortalToken();
      setForm((current) => ({ ...current, portalToken: response.data?.portalToken || '', connectionCommand: response.data?.connectionCommand || current.connectionCommand }));
      setNotice(de ? 'Portal-Zugriffstoken wurde neu erzeugt.' : 'Portal access token regenerated.');
      window.dispatchEvent(new CustomEvent('hermes-config-changed'));
    } catch (err) {
      setError(getErrorMessage(err, de ? 'Token konnte nicht erneuert werden.' : 'Token could not be regenerated.'));
    } finally { setBusy(''); }
  };

  const copyCommand = async () => {
    const ok = await copyTextToClipboard(form.connectionCommand || '');
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const enabledCount = useMemo(() => Object.values(form.permissions || {}).filter(Boolean).length, [form.permissions]);

  return (
    <div className="hermes-settings-page settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <SectionCard
        title={de ? 'Hermes Agent verbinden' : 'Connect Hermes Agent'}
        subtitle={de ? 'Verbindet das Portal mit dem OpenAI-kompatiblen Hermes API Server.' : 'Connect the portal to the OpenAI-compatible Hermes API server.'}
        action={<span className={`status-badge ${form.enabled ? 'success' : 'neutral'}`}>{form.enabled ? (de ? 'Aktiv' : 'Enabled') : (de ? 'Deaktiviert' : 'Disabled')}</span>}
      >
        {loading ? <div className="page-state-clean compact-state">{de ? 'Hermes-Agent-Einstellungen werden geladen…' : 'Loading Hermes Agent settings…'}</div> : (
          <form className="clean-form-grid two-up hermes-connection-grid" onSubmit={save}>
            <div className="settings-toggle-clean span-full">
              <span><strong>{de ? 'Hermes Agent aktivieren' : 'Enable Hermes Agent'}</strong><small>{de ? 'Aktiviert den Desktop-Chat und die tokenbasierte Portal-API für den Agent.' : 'Enables desktop chat and the token-authenticated Portal API for the agent.'}</small></span>
              <Toggle checked={!!form.enabled} onChange={(value) => update('enabled', value)} label="Hermes Agent" />
            </div>
            <label><span>{de ? 'Agent-Name' : 'Agent name'}</span><input value={form.name || ''} onChange={(event) => update('name', event.target.value)} placeholder="Hermes Agent" /></label>
            <label><span>{de ? 'Modell' : 'Model'}</span><input value={form.model || ''} onChange={(event) => update('model', event.target.value)} placeholder="hermes-agent" /></label>
            <label className="span-full"><span>Hermes API URL</span><input value={form.apiUrl || ''} onChange={(event) => update('apiUrl', event.target.value)} placeholder="http://hermes-host:8642/v1" /></label>
            <label className="span-full"><span>Hermes API Key</span><input type="password" value={form.apiKey || ''} onChange={(event) => update('apiKey', event.target.value)} placeholder={form.apiKeyConfigured ? (de ? 'Gespeichert – leer lassen zum Beibehalten' : 'Stored – leave blank to keep it') : 'API_SERVER_KEY'} /></label>
            <div className="form-actions left span-full">
              <button type="button" className="btn-secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? (de ? 'Teste…' : 'Testing…') : (de ? 'Verbindung testen' : 'Test connection')}</button>
              <button type="submit" className="btn-primary" disabled={!!busy}>{busy === 'save' ? (de ? 'Speichert…' : 'Saving…') : (de ? 'Hermes speichern' : 'Save Hermes')}</button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title={de ? 'Agent-Anweisung' : 'Agent command'} subtitle={de ? 'Dieser Text wird dem Agent bei jeder Portal-Unterhaltung als zusätzlicher Kontext mitgegeben.' : 'This text is added as context whenever the portal starts a Hermes conversation.'}>
        <label className="hermes-command-field"><span>{de ? 'Portal-Anweisung' : 'Portal instruction'}</span><textarea rows="9" value={form.command || ''} onChange={(event) => update('command', event.target.value)} /></label>
      </SectionCard>

      <SectionCard title={de ? 'Berechtigungen' : 'Permissions'} subtitle={`${enabledCount} ${de ? 'Berechtigungen aktiviert' : 'permissions enabled'}`}>
        <div className="hermes-permission-grid">
          {PERMISSIONS.map((permission) => {
            const Icon = permission.icon;
            const [title, hint] = permission[de ? 'de' : 'en'];
            const checked = !!form.permissions?.[permission.key];
            return (
              <div className={`hermes-permission-card ${checked ? 'enabled' : ''}`} key={permission.key}>
                <span className="hermes-permission-icon"><Icon size={18} /></span>
                <span className="hermes-permission-copy"><strong>{title}</strong><small>{hint}</small></span>
                <Toggle checked={checked} onChange={(value) => updatePermission(permission.key, value)} label={title} />
              </div>
            );
          })}
        </div>
        <div className="hermes-permission-note"><LockIcon size={16} /><span>{de ? 'Self-Service-Zugangsdaten und SSH-Zugriff bleiben unabhängig von diesen Schaltern privat beim Service-Besitzer.' : 'Self-service credentials and SSH access remain private to the service owner regardless of these switches.'}</span></div>
      </SectionCard>

      <SectionCard
        title={de ? 'Verbindungs-Command' : 'Connection command'}
        subtitle={de ? 'Diesen fertigen Text einmal an deinen Hermes Agent senden. Er enthält die Portal-Verbindung und die Anweisung, sie dauerhaft zu speichern.' : 'Send this prepared text to your Hermes Agent once. It contains the Portal connection and tells Hermes to store it for future sessions.'}
        action={<button type="button" className="btn-secondary" onClick={copyCommand}><CopyIcon size={16} />{copied ? (de ? 'Kopiert' : 'Copied') : (de ? 'Command kopieren' : 'Copy command')}</button>}
      >
        <div className="hermes-endpoint-row"><LinkIcon size={17} /><div><span>Portal Agent API</span><strong>{form.portalApiUrl || '—'}</strong></div></div>
        <textarea className="hermes-connection-command" readOnly rows="12" value={form.connectionCommand || ''} />
        <div className="hermes-token-actions">
          <span>{de ? 'Der Portal-Token ist im Command enthalten und wird verschlüsselt im Portal gespeichert.' : 'The Portal token is included in the command and stored encrypted by the portal.'}</span>
          <button type="button" className="btn-secondary" onClick={rotate} disabled={!!busy}>{busy === 'token' ? (de ? 'Erneuert…' : 'Regenerating…') : (de ? 'Portal-Token erneuern' : 'Regenerate Portal token')}</button>
        </div>
      </SectionCard>
    </div>
  );
}
