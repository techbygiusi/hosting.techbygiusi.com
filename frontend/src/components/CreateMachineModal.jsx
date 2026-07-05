import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';

/**
 * Self-service LXC creation. Options (clusters, templates and limits) come
 * from /user/provisioning/options. VMID and IP are allocated by the backend.
 */
export default function CreateMachineModal({ options, onClose, onCreated }) {
  const [clusterId, setClusterId] = useState(options.length === 1 ? String(options[0].clusterId) : '');
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!cluster) { setError('Bitte einen Cluster auswählen.'); return; }
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(form.hostname)) {
      setError('Hostname: nur Kleinbuchstaben, Zahlen und Bindestriche.');
      return;
    }
    if (!form.template) { setError('Bitte ein Template auswählen.'); return; }
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
          <p>Dein Container <strong>{form.hostname}</strong> wird gerade erstellt und gestartet.</p>
          <div className="resource-meta">
            <span>Typ</span><span>Container (LXC)</span>
            <span>VMID</span><span>{result.vmid}</span>
            <span>IP-Adresse</span><span>{result.ip}</span>
            <span>Node</span><span>{result.node}</span>
          </div>
          <p className="hint-text">Der Fortschritt ist unter Details → Aufgaben & Logs sichtbar. Login: root mit dem gewählten Passwort.</p>
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
          <select value={clusterId} onChange={event => { setClusterId(event.target.value); setField('template', ''); }}>
            <option value="">Bitte auswählen</option>
            {options.map(item => <option key={item.clusterId} value={item.clusterId}>{item.clusterName}</option>)}
          </select>
        </label>

        {cluster && <p className="hint-text">Typ: Container (LXC)</p>}

        <label className="form-group">
          <span>Hostname</span>
          <input type="text" value={form.hostname} onChange={event => setField('hostname', event.target.value.toLowerCase())} placeholder="meine-app" autoComplete="off" />
        </label>

        {cluster && (
          <label className="form-group">
            <span>Template</span>
            <select value={form.template} onChange={event => setField('template', event.target.value)}>
              <option value="">Bitte auswählen</option>
              {(cluster.templates || []).map(template => (
                <option key={template.volid} value={template.volid}>{template.name}</option>
              ))}
            </select>
            {(cluster.templates || []).length === 0 && (
              <small className="hint-text">Keine Templates gefunden – bitte den Admin kontaktieren.</small>
            )}
          </label>
        )}

        {cluster && (
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
        )}

        {cluster && (
          <label className="form-group">
            <span>Root-Passwort</span>
            <input type="password" value={form.rootPassword} onChange={event => setField('rootPassword', event.target.value)} placeholder={cluster.hasDefaultPassword ? 'Leer lassen für Cluster-Standard' : 'Mindestens 8 Zeichen'} autoComplete="new-password" />
          </label>
        )}

        {cluster && (
          <p className="hint-text">VMID und die nächste freie IP-Adresse werden automatisch aus dem freigegebenen Bereich vergeben.</p>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Wird erstellt...' : 'Container erstellen'}</button>
        </div>
      </form>
    </Modal>
  );
}
