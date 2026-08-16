import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const COPY = {
  en: {
    title: 'Password',
    intro: 'Change the password used to sign in to your portal account.',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    changePassword: 'Change password',
    changingPassword: 'Changing password...',
    passwordChanged: 'Your password was changed successfully.',
    passwordRequired: 'Enter your current password and a new password.',
    passwordTooShort: 'The new password must be at least 8 characters long.',
    passwordMismatch: 'The new passwords do not match.',
    passwordChangeFailed: 'The password could not be changed.'
  },
  de: {
    title: 'Passwort',
    intro: 'Ändere das Passwort, mit dem du dich an deinem Portal-Konto anmeldest.',
    currentPassword: 'Aktuelles Passwort',
    newPassword: 'Neues Passwort',
    confirmPassword: 'Neues Passwort bestätigen',
    changePassword: 'Passwort ändern',
    changingPassword: 'Passwort wird geändert...',
    passwordChanged: 'Dein Passwort wurde erfolgreich geändert.',
    passwordRequired: 'Bitte das aktuelle und ein neues Passwort eingeben.',
    passwordTooShort: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.',
    passwordMismatch: 'Die neuen Passwörter stimmen nicht überein.',
    passwordChangeFailed: 'Das Passwort konnte nicht geändert werden.'
  }
};

export default function AccountPasswordSettingsPanel({ language = 'en' }) {
  const { changePassword } = useAuth();
  const text = COPY[language] || COPY.en;
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError(text.passwordRequired);
      return;
    }
    if (form.newPassword.length < 8) {
      setError(text.passwordTooShort);
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError(text.passwordMismatch);
      return;
    }

    try {
      setBusy(true);
      await changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess(text.passwordChanged);
    } catch (err) {
      setError(err?.message || text.passwordChangeFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section-card settings-password-card" aria-labelledby="account-password-settings-title">
      <div className="settings-section-header">
        <div>
          <h3 id="account-password-settings-title">{text.title}</h3>
          <p>{text.intro}</p>
        </div>
      </div>
      <form className="settings-password-form" onSubmit={submit}>
        <div className="settings-password-grid">
          <label className="form-group">
            <span>{text.currentPassword}</span>
            <input type="password" value={form.currentPassword} onChange={event => updateField('currentPassword', event.target.value)} autoComplete="current-password" disabled={busy} />
          </label>
          <label className="form-group">
            <span>{text.newPassword}</span>
            <input type="password" value={form.newPassword} onChange={event => updateField('newPassword', event.target.value)} autoComplete="new-password" minLength="8" disabled={busy} />
          </label>
          <label className="form-group">
            <span>{text.confirmPassword}</span>
            <input type="password" value={form.confirmPassword} onChange={event => updateField('confirmPassword', event.target.value)} autoComplete="new-password" minLength="8" disabled={busy} />
          </label>
        </div>
        {error && <div className="alert alert-danger settings-password-message">{error}</div>}
        {success && <div className="alert alert-success settings-password-message">{success}</div>}
        <div className="settings-password-actions">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? text.changingPassword : text.changePassword}</button>
        </div>
      </form>
    </section>
  );
}
