import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage, translateMessage } from '../services/api';

function rangeProgress(value, min, max) {
  const current = Number(value);
  const low = Number(min);
  const high = Number(max);
  if (!Number.isFinite(current) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return '100%';
  }
  const percent = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);
  return `${percent}%`;
}

function rangeStyle(value, min, max) {
  return { '--range-progress': rangeProgress(value, min, max) };
}

/**
 * Template-only self-service LXC creation. Clusters, approved templates and
 * resource limits are loaded from /user/provisioning/options. VMID, IP and
 * firewall isolation are applied by the backend.
 */
export default function CreateMachineModal({ options, onClose, onCreated }) {
  const firstAvailableCluster = options.find(item => item.available !== false);
  const [clusterId, setClusterId] = useState(firstAvailableCluster ? String(firstAvailableCluster.clusterId) : '');
  const [form, setForm] = useState({
    hostname: '', template: '', cores: 1, memoryMb: 1024, diskGb: 8, rootPassword: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const cluster = useMemo(
    () => options.find(item => String(item.clusterId) === String(clusterId)),
    [options, clusterId]
  );

  const setField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleClusterChange = (value) => {
    setClusterId(value);
    setForm(prev => ({ ...prev, template: '' }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!cluster) { setError('Bitte einen Cluster auswählen.'); return; }
    if (cluster.available === false) {
      setError(translateMessage(cluster.unavailableReason || 'Self-service is temporarily unavailable'));
      return;
    }
    if (!form.template) { setError('Bitte ein Template auswählen.'); return; }
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(form.hostname)) {
      setError('Hostname: nur Kleinbuchstaben, Zahlen und Bindestriche.');
      return;
    }
    if (!cluster.hasDefaultPassword && form.rootPassword.length < 8) {
      setError('Das Root-Passwort muss mindestens 8 Zeichen lang sein.');
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
          <p>Dein Container <strong>{form.hostname}</strong> wird gerade erstellt, abgesichert und gestartet.</p>
          <div className="resource-meta">
            <span>Typ</span><span>Container (LXC)</span>
            <span>VMID</span><span>{result.vmid}</span>
            <span>IP-Adresse</span><span>{result.ip}</span>
            <span>Node</span><span>{result.node}</span>
            <span>Netzwerk</span><span>Internet-only isoliert</span>
          </div>
          <p className="hint-text">Der Fortschritt ist unter Details → Aufgaben & Logs sichtbar. Benutzername: root. Das verwendete Root-Passwort wurde automatisch unter Zugangsdaten gespeichert.</p>
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
        {cluster?.available === false && !error && (
          <div className="alert alert-danger">{translateMessage(cluster.unavailableReason || 'Self-service is temporarily unavailable')}</div>
        )}

        <label className="form-group">
          <span>Cluster</span>
          <select value={clusterId} onChange={event => handleClusterChange(event.target.value)}>
            <option value="">Bitte auswählen</option>
            {options.map(item => (
              <option key={item.clusterId} value={item.clusterId} disabled={item.available === false}>
                {item.clusterName}{item.available === false ? ' · nicht verfügbar' : ''}
              </option>
            ))}
          </select>
        </label>

        {cluster && cluster.available !== false && (
          <div className="provisioning-source-card">
            <div className="provisioning-mode-content">
              <label className="form-group">
                <span>Hostname</span>
                <input type="text" value={form.hostname} onChange={event => setField('hostname', event.target.value.toLowerCase())} placeholder="meine-app" autoComplete="off" />
              </label>
              <label className="form-group">
                <span>Template</span>
                <select value={form.template} onChange={event => setField('template', event.target.value)} disabled={(cluster.templates || []).length === 0}>
                  <option value="" disabled hidden>Template auswählen</option>
                  {(cluster.templates || []).map(template => (
                    <option key={template.volid} value={template.volid}>{template.name}</option>
                  ))}
                </select>
                {(cluster.templates || []).length === 0 && (
                  <small className="hint-text">Für diesen Cluster wurden keine verwendbaren CT-Templates gefunden.</small>
                )}
              </label>

              {form.template && (
                <>
                  <div className="slider-grid">
                    <label className="form-group">
                      <span>CPU-Kerne · {form.cores}</span>
                      <input className="resource-range" type="range" min="1" max={cluster.maxCores} value={form.cores} style={rangeStyle(form.cores, 1, cluster.maxCores)} onChange={event => setField('cores', Number(event.target.value))} />
                    </label>
                    <label className="form-group">
                      <span>RAM · {form.memoryMb} MB</span>
                      <input className="resource-range" type="range" min="256" max={cluster.maxMemoryMb} step="256" value={form.memoryMb} style={rangeStyle(form.memoryMb, 256, cluster.maxMemoryMb)} onChange={event => setField('memoryMb', Number(event.target.value))} />
                    </label>
                    <label className="form-group">
                      <span>Festplatte · {form.diskGb} GB</span>
                      <input className="resource-range" type="range" min="4" max={Math.min(cluster.maxDiskGb || 32, 32)} value={Math.min(form.diskGb, Math.min(cluster.maxDiskGb || 32, 32))} style={rangeStyle(Math.min(form.diskGb, Math.min(cluster.maxDiskGb || 32, 32)), 4, Math.min(cluster.maxDiskGb || 32, 32))} onChange={event => setField('diskGb', Number(event.target.value))} />
                    </label>
                  </div>

                  <label className="form-group">
                    <span>Root-Passwort</span>
                    <input type="password" value={form.rootPassword} onChange={event => setField('rootPassword', event.target.value)} placeholder={cluster.hasDefaultPassword ? 'Leer lassen für Cluster-Standard' : 'Mindestens 8 Zeichen'} autoComplete="new-password" />
                  </label>
                  <p className="hint-text">VMID und IP-Adresse werden automatisch vergeben. Die Proxmox-Datacenter-Firewall bleibt aktiv; der Container erhält vor dem ersten Start eigene Regeln, die Zugriffe auf Hosts, andere Gäste sowie private und lokale Netze sperren.</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn-primary" disabled={busy || !cluster || cluster.available === false || (cluster.templates || []).length === 0}>{busy ? 'Wird abgesichert...' : 'Container erstellen'}</button>
        </div>
      </form>
    </Modal>
  );
}
