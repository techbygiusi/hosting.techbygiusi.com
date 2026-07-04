import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';

/**
 * Self-service LXC creation. Available clusters, templates and limits come
 * from /user/provisioning/options – the admin defines VMID/IP ranges per
 * cluster; VMID and IP are allocated automatically by the backend.
 */
export default function CreateMachineModal({ options, onClose, onCreated }) {
  const [form, setForm] = useState({
    clusterId: options.length === 1 ? String(options[0].clusterId) : '',
    hostname: '',
    template: '',
    cores: 1,
    memoryMb: 1024,
    diskGb: 8,
    rootPassword: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const cluster = useMemo(
    () => options.find(item => String(item.clusterId) === String(form.clusterId)),
    [options, form.clusterId]
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
    if (form.rootPassword.length < 8) {
      setError('Das Root-Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    try {
      setBusy(true);
      setError('');
      const res = await userApi.createMachine({
        clusterId: cluster.clusterId,
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
      setError(getErrorMessage(err, 'Maschine konnte nicht erstellt werden.'));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Maschine wird erstellt" onClose={onClose}>
        <div className="create-result">
          <p>Deine Maschine <strong>{form.hostname}</strong> wird gerade erstellt und gestartet.</p>
          <div className="resource-meta">
            <span>VMID</span><span>{result.vmid}</span>
            <span>IP-Adresse</span><span>{result.ip}</span>
            <span>Node</span><span>{result.node}</span>
          </div>
          <p className="hint-text">Der Fortschritt ist unter Details → Aufgaben &amp; Logs sichtbar. Login: root mit dem gewählten Passwort.</p>
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={onClose}>Fertig</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Neue Maschine erstellen" onClose={onClose}>
      <form className="form-stack" onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}

        <label className="form-group">
          <span>Cluster</span>
          <select value={form.clusterId} onChange={event => { setField('clusterId', event.target.value); setField('template', ''); }}>
            <option value="">Bitte auswählen</option>
            {options.map(item => <option key={item.clusterId} value={item.clusterId}>{item.clusterName}</option>)}
          </select>
        </label>

        <label className="form-group">
          <span>Hostname</span>
          <input type="text" value={form.hostname} onChange={event => setField('hostname', event.target.value.toLowerCase())} placeholder="meine-app" autoComplete="off" />
        </label>

        <label className="form-group">
          <span>Template</span>
          <select value={form.template} onChange={event => setField('template', event.target.value)} disabled={!cluster}>
            <option value="">Bitte auswählen</option>
            {(cluster?.templates || []).map(template => (
              <option key={template.volid} value={template.volid}>{template.name}</option>
            ))}
          </select>
          {cluster && (cluster.templates || []).length === 0 && (
            <small className="hint-text">Keine Templates gefunden – bitte den Admin kontaktieren.</small>
          )}
        </label>

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

        <label className="form-group">
          <span>Root-Passwort</span>
          <input type="password" value={form.rootPassword} onChange={event => setField('rootPassword', event.target.value)} placeholder="Mindestens 8 Zeichen" autoComplete="new-password" />
        </label>

        <p className="hint-text">VMID und IP-Adresse werden automatisch aus dem freigegebenen Bereich vergeben.</p>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Wird erstellt...' : 'Maschine erstellen'}</button>
        </div>
      </form>
    </Modal>
  );
}
