import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import ThemeButton from '../components/ThemeButton';
import LanguageSwitch, { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';

const initialAdmin = { name: '', email: '', password: '' };
const initialCluster = { name: '', url: '', apiToken: '' };
const initialSmtp = { smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '' };

export default function Setup() {
  const navigate = useNavigate();
  const { setup } = useAuth();
  const [admin, setAdmin] = useState(initialAdmin);
  const [cluster, setCluster] = useState(initialCluster);
  const [smtp, setSmtp] = useState(initialSmtp);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(readStoredLanguage());

  const update = (setter) => (field) => (event) => setter((current) => ({ ...current, [field]: event.target.value }));

  const testProxmox = async () => {
    setTesting('proxmox');
    setError('');
    setMessage('');
    try {
      const response = await authApi.setupTestProxmox(cluster);
      setMessage(response.data?.message || 'Proxmox connection successful.');
    } catch (err) {
      setError(getErrorMessage(err, 'The Proxmox connection test failed.'));
    } finally {
      setTesting('');
    }
  };

  const testSmtp = async () => {
    setTesting('smtp');
    setError('');
    setMessage('');
    try {
      const response = await authApi.setupTestSmtp(smtp);
      setMessage(response.data?.message || 'SMTP connection successful.');
    } catch (err) {
      setError(getErrorMessage(err, 'The SMTP connection test failed.'));
    } finally {
      setTesting('');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const user = await setup(admin, cluster, smtp);
      navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message || 'Setup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout setup-layout">
      <section className="auth-panel auth-panel-brand">
        <div className="auth-panel-toolbar">
          <LanguageSwitch value={language} onChange={(value) => { setLanguage(value); storeLanguage(value); }} />
          <ThemeButton />
        </div>
        <BrandLogo />
        <div className="auth-panel-copy">
          <p className="eyebrow-clean">First-time setup</p>
          <h1>Build the portal foundation.</h1>
          <p>Create the first administrator, connect your first Proxmox cluster and configure email delivery.</p>
        </div>
      </section>

      <section className="auth-panel auth-panel-form wide">
        <div className="auth-card-clean wide">
          <div className="auth-card-head">
            <h2>Initial configuration</h2>
            <p>Everything stays on one page so the setup feels clear and fast.</p>
          </div>

          {error ? <div className="inline-notice danger">{error}</div> : null}
          {message ? <div className="inline-notice success">{message}</div> : null}

          <form className="setup-grid" onSubmit={submit}>
            <div className="setup-section">
              <h3>Administrator</h3>
              <label><span>Name</span><input value={admin.name} onChange={update(setAdmin)('name')} required /></label>
              <label><span>Email</span><input type="email" value={admin.email} onChange={update(setAdmin)('email')} required /></label>
              <label><span>Password</span><input type="password" value={admin.password} onChange={update(setAdmin)('password')} required /></label>
            </div>

            <div className="setup-section">
              <h3>Proxmox cluster</h3>
              <label><span>Cluster name</span><input value={cluster.name} onChange={update(setCluster)('name')} required /></label>
              <label><span>URL</span><input value={cluster.url} onChange={update(setCluster)('url')} placeholder="https://proxmox.example.com:8006" required /></label>
              <label><span>API token</span><textarea value={cluster.apiToken} onChange={update(setCluster)('apiToken')} rows="4" required /></label>
              <button type="button" className="btn-secondary" onClick={testProxmox} disabled={testing === 'proxmox'}>{testing === 'proxmox' ? 'Testing…' : 'Test Proxmox connection'}</button>
            </div>

            <div className="setup-section">
              <h3>SMTP</h3>
              <label><span>SMTP host</span><input value={smtp.smtpHost} onChange={update(setSmtp)('smtpHost')} required /></label>
              <label><span>SMTP port</span><input value={smtp.smtpPort} onChange={update(setSmtp)('smtpPort')} required /></label>
              <label><span>SMTP user</span><input value={smtp.smtpUser} onChange={update(setSmtp)('smtpUser')} required /></label>
              <label><span>SMTP password</span><input type="password" value={smtp.smtpPassword} onChange={update(setSmtp)('smtpPassword')} required /></label>
              <button type="button" className="btn-secondary" onClick={testSmtp} disabled={testing === 'smtp'}>{testing === 'smtp' ? 'Testing…' : 'Test SMTP connection'}</button>
            </div>

            <div className="setup-actions">
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Finishing setup…' : 'Finish setup'}</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
