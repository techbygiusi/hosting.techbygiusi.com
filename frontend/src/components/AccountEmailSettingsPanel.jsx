import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const COPY = {
  en: {
    title: 'Email address',
    intro: 'Change the email address used to sign in to the portal and receive account notifications.',
    current: 'Current email',
    next: 'New email',
    save: 'Change email',
    saving: 'Saving...',
    required: 'Enter a new email address.',
    invalid: 'Enter a valid email address.',
    same: 'The new email address is the same as the current one.',
    updated: 'Your email address was updated. Use the new address the next time you sign in.',
    failed: 'The email address could not be changed.'
  },
  de: {
    title: 'E-Mail-Adresse',
    intro: 'Ändere die E-Mail-Adresse, mit der du dich am Portal anmeldest und Kontobenachrichtigungen erhältst.',
    current: 'Aktuelle E-Mail',
    next: 'Neue E-Mail',
    save: 'E-Mail ändern',
    saving: 'Wird gespeichert...',
    required: 'Bitte eine neue E-Mail-Adresse eingeben.',
    invalid: 'Bitte eine gültige E-Mail-Adresse eingeben.',
    same: 'Die neue E-Mail-Adresse entspricht der aktuellen Adresse.',
    updated: 'Deine E-Mail-Adresse wurde geändert. Verwende sie bei der nächsten Anmeldung.',
    failed: 'Die E-Mail-Adresse konnte nicht geändert werden.'
  }
};

export default function AccountEmailSettingsPanel({ language = 'en' }) {
  const { user, changeEmail } = useAuth();
  const text = COPY[language] || COPY.en;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setEmail('');
  }, [user?.email]);

  const submit = async (event) => {
    event.preventDefault();
    const normalized = String(email || '').trim().toLowerCase();
    setError('');
    setSuccess('');

    if (!normalized) {
      setError(text.required);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError(text.invalid);
      return;
    }
    if (normalized === String(user?.email || '').trim().toLowerCase()) {
      setError(text.same);
      return;
    }

    try {
      setBusy(true);
      await changeEmail(normalized);
      setEmail('');
      setSuccess(text.updated);
    } catch (err) {
      setError(err?.message || text.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section-card settings-email-card" aria-labelledby="account-email-settings-title">
      <div className="settings-section-heading">
        <h3 id="account-email-settings-title">{text.title}</h3>
        <p>{text.intro}</p>
      </div>
      <form className="settings-email-form" onSubmit={submit}>
        <div className="settings-email-grid">
          <label className="form-group">
            <span>{text.current}</span>
            <input type="email" value={user?.email || ''} readOnly disabled />
          </label>
          <label className="form-group">
            <span>{text.next}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setError(''); setSuccess(''); }}
              autoComplete="email"
              disabled={busy}
            />
          </label>
        </div>
        {error && <div className="alert alert-danger settings-password-message">{error}</div>}
        {success && <div className="alert alert-success settings-password-message">{success}</div>}
        <div className="settings-password-actions">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? text.saving : text.save}</button>
        </div>
      </form>
    </section>
  );
}
