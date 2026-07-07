import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 768px)').matches;
}

/**
 * Self-service LXC creation. Options (clusters, templates and limits) come
 * from /user/provisioning/options. VMID and IP are allocated by the backend.
 */
export default function CreateMachineModal({ options, onClose, onCreated }) {
  const [clusterId, setClusterId] = useState(options.length === 1 ? String(options[0].clusterId) : '');
  const [form, setForm] = useState({
    hostname: '', template: '', communityScript: '', cores: 1, memoryMb: 1024, diskGb: 8, rootPassword: ''
  });
  const [provisioningMode, setProvisioningMode] = useState('template');
  const [communityScripts, setCommunityScripts] = useState([]);
  const [scriptSearch, setScriptSearch] = useState('');
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const cluster = useMemo(
    () => options.find(item => String(item.clusterId) === String(clusterId)),
    [options, clusterId]
  );

  const selectedCommunityScript = useMemo(
    () => communityScripts.find(item => item.id === form.communityScript),
    [communityScripts, form.communityScript]
  );
  const filteredCommunityScripts = useMemo(() => {
    const q = scriptSearch.trim().toLowerCase();
    const list = communityScripts || [];
    if (!q) return list.slice(0, 80);
    return list.filter(item => `${item.name} ${item.slug}`.toLowerCase().includes(q)).slice(0, 80);
  }, [communityScripts, scriptSearch]);

  useEffect(() => {
    let cancelled = false;
    setScriptsLoading(true);
    userApi.getCommunityScripts()
      .then(res => { if (!cancelled) setCommunityScripts(res.data.scripts || []); })
      .catch(() => { if (!cancelled) setCommunityScripts([]); })
      .finally(() => { if (!cancelled) setScriptsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  useEffect(() => {
    if (!cluster) return;
    if ((cluster.templates || []).length === 0) setProvisioningMode('community');
  }, [cluster]);

  const handleClusterChange = (value) => {
    const selected = options.find(item => String(item.clusterId) === String(value));
    setClusterId(value);
    setProvisioningMode((selected?.templates || []).length === 0 ? 'community' : 'template');
    setForm(prev => ({ ...prev, template: '', communityScript: '' }));
    setError('');
  };

  const chooseProvisioningMode = (mode) => {
    setProvisioningMode(mode);
    setForm(prev => ({ ...prev, template: '', communityScript: '' }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!cluster) { setError('Bitte einen Cluster auswählen.'); return; }
    if (!isDesktopViewport()) { setError('Container-Erstellung ist nur auf Desktop verfügbar.'); return; }
    const useTemplate = provisioningMode === 'template';
    const useCommunityScript = provisioningMode === 'community';
    if (useTemplate && !form.template) { setError('Bitte ein Template auswählen.'); return; }
    if (useCommunityScript && !form.communityScript) { setError('Bitte ein Community Script auswählen.'); return; }
    if (useTemplate && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(form.hostname)) {
      setError('Hostname: nur Kleinbuchstaben, Zahlen und Bindestriche.');
      return;
    }
    if (useTemplate && !cluster.hasDefaultPassword && form.rootPassword.length < 8) {
      setError('Das Root-Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (useCommunityScript) {
      const url = `/provisioning-console?clusterId=${encodeURIComponent(cluster.clusterId)}&script=${encodeURIComponent(form.communityScript)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      onClose?.();
      return;
    }

    try {
      setBusy(true);
      setError('');
      const res = await userApi.createMachine({
        clusterId: cluster.clusterId,
        type: 'ct',
        hostname: form.hostname,
        template: form.template,
        communityScript: '',
        cores: form.cores,
        memoryMb: form.memoryMb,
        diskGb: form.diskGb,
        rootPassword: form.rootPassword
      });
      setResult(res.data);
      onCreated?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Container konnte nicht erstellt werden.'));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Container wird erstellt" onClose={onClose}>
        <div className="create-result">
          {result.type === 'community-script' ? (
            <>
              <p>Das Community Script <strong>{result.script || selectedCommunityScript?.name}</strong> wurde auf Proxmox gestartet.</p>
              <div className="resource-meta">
                <span>Typ</span><span>Community Script</span>
                <span>Node</span><span>{result.node}</span>
                <span>Log</span><span>{result.logPath}</span>
              </div>
              <p className="hint-text">Das Script erstellt den Container mit seinen eigenen Standardwerten. Sobald der neue LXC erkannt wird, wird er automatisch in deine Dienste übernommen.</p>
            </>
          ) : (
            <>
              <p>Dein Container <strong>{form.hostname}</strong> wird gerade erstellt und gestartet.</p>
              <div className="resource-meta">
                <span>Typ</span><span>Container (LXC)</span>
                <span>VMID</span><span>{result.vmid}</span>
                <span>IP-Adresse</span><span>{result.ip}</span>
                <span>Node</span><span>{result.node}</span>
              </div>
              <p className="hint-text">Der Fortschritt ist unter Details → Aufgaben & Logs sichtbar. Login: root mit dem gewählten Passwort.</p>
            </>
          )}
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={onClose}>Fertig</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Neuen Container erstellen" onClose={onClose}>
      <form className="form-stack" onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}

        <label className="form-group">
          <span>Cluster</span>
          <select value={clusterId} onChange={event => handleClusterChange(event.target.value)}>
            <option value="">Bitte auswählen</option>
            {options.map(item => <option key={item.clusterId} value={item.clusterId}>{item.clusterName}</option>)}
          </select>
        </label>

        {cluster && (
          <div className="provisioning-source-card">
            <div className="provisioning-mode-switch" role="tablist" aria-label="Bereitstellungsart">
              <button
                type="button"
                className={provisioningMode === 'template' ? 'active' : ''}
                onClick={() => chooseProvisioningMode('template')}
                disabled={(cluster.templates || []).length === 0}
              >
                Template
              </button>
              <button
                type="button"
                className={provisioningMode === 'community' ? 'active' : ''}
                onClick={() => chooseProvisioningMode('community')}
              >
                Community Script
              </button>
            </div>

            {provisioningMode === 'template' && (
              <div className="provisioning-mode-content">
                <label className="form-group">
                  <span>Hostname</span>
                  <input type="text" value={form.hostname} onChange={event => setField('hostname', event.target.value.toLowerCase())} placeholder="meine-app" autoComplete="off" />
                </label>
                <label className="form-group">
                  <span>Template</span>
                  <select value={form.template} onChange={event => setField('template', event.target.value)}>
                    <option value="" disabled hidden>Template auswählen</option>
                    {(cluster.templates || []).map(template => (
                      <option key={template.volid} value={template.volid}>{template.name}</option>
                    ))}
                  </select>
                  {(cluster.templates || []).length === 0 && (
                    <small className="hint-text">Keine Templates gefunden. Verwende stattdessen ein Community Script.</small>
                  )}
                </label>

                {form.template && (
                  <>
                    <div className="slider-grid">
                      <label className="form-group">
                        <span>CPU-Kerne · {form.cores}</span>
                        <input type="range" min="1" max={cluster.maxCores} value={form.cores} onChange={event => setField('cores', Number(event.target.value))} />
                      </label>
                      <label className="form-group">
                        <span>RAM · {form.memoryMb} MB</span>
                        <input type="range" min="256" max={cluster.maxMemoryMb} step="256" value={form.memoryMb} onChange={event => setField('memoryMb', Number(event.target.value))} />
                      </label>
                      <label className="form-group">
                        <span>Festplatte · {form.diskGb} GB</span>
                        <input type="range" min="4" max={cluster.maxDiskGb} value={form.diskGb} onChange={event => setField('diskGb', Number(event.target.value))} />
                      </label>
                    </div>

                    <label className="form-group">
                      <span>Root-Passwort</span>
                      <input type="password" value={form.rootPassword} onChange={event => setField('rootPassword', event.target.value)} placeholder={cluster.hasDefaultPassword ? 'Leer lassen für Cluster-Standard' : 'Mindestens 8 Zeichen'} autoComplete="new-password" />
                    </label>
                    <p className="hint-text">VMID und die nächste freie IP-Adresse werden automatisch aus dem freigegebenen Bereich vergeben.</p>
                  </>
                )}
              </div>
            )}

            {provisioningMode === 'community' && (
              <div className="provisioning-mode-content community-script-picker">
                <label className="form-group">
                  <span>Community Script suchen</span>
                  <input type="search" value={scriptSearch} onChange={event => setScriptSearch(event.target.value)} placeholder="z. B. Jellyfin" autoComplete="off" />
                </label>
                <label className="form-group">
                  <span>Community Script</span>
                  <select value={form.communityScript} onChange={event => setField('communityScript', event.target.value)} disabled={scriptsLoading}>
                    <option value="" disabled hidden>Community Script auswählen</option>
                    {filteredCommunityScripts.map(script => (
                      <option key={script.id} value={script.id}>{script.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Wird gestartet...' : provisioningMode === 'community' ? 'Community Script starten' : 'Container erstellen'}</button>
        </div>
      </form>
    </Modal>
  );
}
