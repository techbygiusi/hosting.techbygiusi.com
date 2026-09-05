import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';

const EMPTY_FORM = {
  id: null,
  label: '',
  username: '',
  secret: '',
  url: '',
  notes: '',
  purpose: 'general',
  useForSshConsole: false
};

export default function AdminResourceCredentials({ resourceId, adminUrl = '' }) {
  const [credentials, setCredentials] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [revealed, setRevealed] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!resourceId) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getResourceCredentials(resourceId);
      setCredentials(response.data?.credentials || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Credentials could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setForm(EMPTY_FORM);
    setRevealed({});
    load();
  }, [resourceId]);

  const editing = useMemo(() => credentials.find((item) => String(item.id) === String(form.id)) || null, [credentials, form.id]);

  const startEdit = (credential) => {
    setError('');
    setNotice('');
    setForm({
      id: credential.id,
      label: credential.label || '',
      username: credential.username || '',
      secret: '',
      url: credential.url || '',
      notes: credential.notes || '',
      purpose: credential.purpose || 'general',
      useForSshConsole: !!credential.useForSshConsole
    });
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, url: '' });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        label: form.label,
        username: form.username,
        url: form.url,
        notes: form.notes,
        purpose: form.purpose || 'general',
        useForSshConsole: !!form.useForSshConsole
      };
      if (form.secret) payload.secret = form.secret;
      if (!form.id && form.useForSshConsole && !form.secret) payload.secret = form.secret;

      if (form.id) await adminApi.updateResourceCredential(resourceId, form.id, payload);
      else await adminApi.createResourceCredential(resourceId, payload);

      setNotice(form.id ? 'Credentials updated.' : 'Credentials added.');
      resetForm();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Credentials could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const getSecret = async (credential) => {
    if (Object.prototype.hasOwnProperty.call(revealed, credential.id)) return revealed[credential.id];
    const response = await adminApi.revealResourceCredential(resourceId, credential.id);
    const secret = response.data?.secret || '';
    setRevealed((current) => ({ ...current, [credential.id]: secret }));
    return secret;
  };

  const toggleReveal = async (credential) => {
    if (Object.prototype.hasOwnProperty.call(revealed, credential.id)) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      return;
    }
    setError('');
    try {
      await getSecret(credential);
    } catch (err) {
      setError(getErrorMessage(err, 'Password could not be revealed.'));
    }
  };

  const copyText = async (value, fallback = 'Value') => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      setNotice(`${fallback} copied.`);
    } catch (_) {
      setError(`${fallback} could not be copied.`);
    }
  };

  const copyPassword = async (credential) => {
    setError('');
    try {
      const secret = await getSecret(credential);
      await copyText(secret, 'Password');
    } catch (err) {
      setError(getErrorMessage(err, 'Password could not be copied.'));
    }
  };

  const remove = async (credential) => {
    if (!window.confirm(`Delete ${credential.label || 'these credentials'}?`)) return;
    setError('');
    setNotice('');
    try {
      await adminApi.deleteResourceCredential(resourceId, credential.id);
      if (String(form.id) === String(credential.id)) resetForm();
      setNotice('Credentials deleted.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Credentials could not be deleted.'));
    }
  };

  return (
    <SectionCard title="Access credentials">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <div className="admin-resource-credentials-layout">
        <div className="admin-resource-credential-list">
          {loading ? <span className="muted-table-value">Loading credentials…</span> : null}
          {!loading && !credentials.length ? <span className="muted-table-value">No credentials configured yet.</span> : null}
          {credentials.map((credential) => (
            <article className="admin-resource-credential-row" key={credential.id}>
              <div className="admin-resource-credential-main">
                <div>
                  <strong>{credential.label}</strong>
                  <span>{credential.fromAdmin ? 'Administrator credential' : 'User credential'}</span>
                </div>
                <div className="admin-resource-credential-badges">
                  {credential.useForSshConsole ? <span className="status-badge success">SSH</span> : null}
                  <span className={`status-badge ${credential.fromAdmin ? 'neutral' : 'warning'}`}>{credential.fromAdmin ? 'Admin' : 'User'}</span>
                </div>
              </div>
              {credential.url ? <a href={credential.url} target="_blank" rel="noreferrer" className="admin-resource-credential-url">{credential.url}</a> : null}
              {credential.notes ? <p>{credential.notes}</p> : null}
              <div className="admin-resource-credential-details">
                <div><span>Username</span><strong>{credential.username || '—'}</strong></div>
                <div>
                  <span>Password</span>
                  <code>{credential.canReveal === false
                    ? 'Private user credential'
                    : (Object.prototype.hasOwnProperty.call(revealed, credential.id) ? (revealed[credential.id] || '—') : '••••••••')}</code>
                </div>
              </div>
              <div className="admin-resource-credential-actions">
                {credential.canReveal !== false ? <button type="button" className="btn-secondary btn-small" onClick={() => toggleReveal(credential)}>{Object.prototype.hasOwnProperty.call(revealed, credential.id) ? 'Hide password' : 'Show password'}</button> : null}
                {credential.username ? <button type="button" className="btn-secondary btn-small" onClick={() => copyText(credential.username, 'Username')}>Copy username</button> : null}
                {credential.canReveal !== false ? <button type="button" className="btn-secondary btn-small" onClick={() => copyPassword(credential)}>Copy password</button> : null}
                {credential.canManage ? <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(credential)}>Edit</button> : null}
                {credential.canManage ? <button type="button" className="btn-danger btn-small" onClick={() => remove(credential)}>Delete</button> : null}
              </div>
            </article>
          ))}
        </div>

        <form className="clean-form-grid compact admin-resource-credential-form" onSubmit={save}>
          <div className="span-full admin-resource-credential-form-head">
            <strong>{editing ? 'Edit credentials' : 'Add credentials'}</strong>
            {editing ? <button type="button" className="btn-secondary btn-small" onClick={resetForm}>Cancel edit</button> : null}
          </div>
          <label><span>Label</span><input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="SSH / Application login" required /></label>
          <label><span>Username</span><input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /></label>
          <label><span>Password {editing ? '(leave empty to keep existing)' : ''}</span><input type="password" value={form.secret} onChange={(event) => setForm((current) => ({ ...current, secret: event.target.value }))} /></label>
          <label><span>URL</span><input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder={adminUrl || 'https://example.com'} /></label>
          <label className="span-full"><span>Notes</span><textarea rows="3" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          <label className="admin-resource-ssh-choice span-full">
            <input type="checkbox" checked={!!form.useForSshConsole} onChange={(event) => setForm((current) => ({ ...current, useForSshConsole: event.target.checked }))} />
            <span><strong>Use for SSH console</strong><small>This username and password will be used for the browser SSH console.</small></span>
          </label>
          <div className="form-actions left span-full">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save credentials' : 'Add credentials'}</button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
