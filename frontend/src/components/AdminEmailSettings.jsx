import React, { useEffect, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';

export default function AdminEmailSettings() {
  const [form, setForm] = useState({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getSettings();
      const settings = response.data?.settings || {};
      setForm({
        smtpHost: settings.smtp_host || '',
        smtpPort: settings.smtp_port || '587',
        smtpUser: settings.smtp_user || '',
        smtpPassword: settings.smtp_password || ''
      });
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP settings could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    setError('');
    setNotice('');
    try {
      await adminApi.updateSettings(form);
      setNotice('SMTP settings saved.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP settings could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setError('');
    setNotice('');
    try {
      const response = await adminApi.testSmtp(form);
      setNotice(response.data?.message || 'SMTP connection successful.');
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP connection test failed.'));
    } finally {
      setBusy('');
    }
  };

  const sendTestMail = async () => {
    setBusy('mail');
    setError('');
    setNotice('');
    try {
      await adminApi.sendTestMail();
      setNotice('Test email sent to your administrator account.');
    } catch (err) {
      setError(getErrorMessage(err, 'The test email could not be sent.'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <SectionCard>
        {loading ? <div className="page-state-clean">Loading SMTP settings…</div> : (
          <form className="clean-form-grid compact two-up" onSubmit={save}>
            <label><span>SMTP host</span><input value={form.smtpHost} onChange={(event) => update('smtpHost', event.target.value)} placeholder="smtp.example.com" /></label>
            <label><span>SMTP port</span><input value={form.smtpPort} onChange={(event) => update('smtpPort', event.target.value)} placeholder="587" /></label>
            <label><span>SMTP user</span><input type="email" value={form.smtpUser} onChange={(event) => update('smtpUser', event.target.value)} placeholder="noreply@example.com" /></label>
            <label><span>SMTP password</span><input type="password" value={form.smtpPassword} onChange={(event) => update('smtpPassword', event.target.value)} placeholder="Leave hidden value unchanged to keep the password" /></label>
            <div className="form-actions left span-full">
              <button type="button" className="btn-secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
              <button type="submit" className="btn-primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save SMTP'}</button>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Test delivery" subtitle="Send one real message using the stored configuration">
        <div className="action-description-row">
          <div>
            <strong>Send a test email to me</strong>
            <p>This uses the administrator account currently signed in.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={sendTestMail} disabled={!!busy || loading}>{busy === 'mail' ? 'Sending…' : 'Send test email'}</button>
        </div>
      </SectionCard>
    </div>
  );
}
