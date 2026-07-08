import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <label className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <span className="toggle-text">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className={`toggle-switch ${checked ? 'is-on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="toggle-knob" aria-hidden="true"></span>
      </span>
    </label>
  );
}

export default function NotificationSettingsModal({ onClose }) {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    userApi.getNotificationPreferences()
      .then(res => setPrefs(res.data.preferences))
      .catch(err => setError(getErrorMessage(err, 'Einstellungen konnten nicht geladen werden.')))
      .finally(() => setLoading(false));
  }, []);

  const setPref = (key, value) => {
    setSaved(false);
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      await userApi.updateNotificationPreferences(prefs);
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Benachrichtigungen" onClose={onClose}>
      <p className="modal-intro">
        Lege fest, worüber du per E-Mail informiert werden möchtest. Die Überwachung
        prüft deine Dienste regelmäßig im Hintergrund.
      </p>

      {error && <div className="alert alert-danger">{error}</div>}
      {saved && <div className="alert alert-success">Einstellungen gespeichert.</div>}

      {loading || !prefs ? (
        <div className="loading"><span className="spinner"></span><span>Lädt...</span></div>
      ) : (
        <div className="toggle-stack">
          <ToggleRow
            label="Dienst offline"
            description="E-Mail, wenn einer deiner Dienste nicht mehr läuft."
            checked={prefs.notifyResourceDown}
            onChange={(v) => setPref('notifyResourceDown', v)}
            disabled={saving}
          />
          <ToggleRow
            label="Dienst wieder online"
            description="E-Mail, sobald ein ausgefallener Dienst wieder läuft."
            checked={prefs.notifyResourceRecovered}
            onChange={(v) => setPref('notifyResourceRecovered', v)}
            disabled={saving}
          />
          <ToggleRow
            label="Wartungsankündigungen"
            description="E-Mail, wenn eine Wartung geplant oder angekündigt wird."
            checked={prefs.notifyMaintenance}
            onChange={(v) => setPref('notifyMaintenance', v)}
            disabled={saving}
          />
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Schließen</button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading || !prefs}>
          {saving ? 'Speichert...' : 'Speichern'}
        </button>
      </div>
    </Modal>
  );
}
