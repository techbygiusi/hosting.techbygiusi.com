import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import ThemeButton from '../components/ThemeButton';
import LanguageSwitch, { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';

function FeatureList() {
  const items = [
    'Unified dashboard for services, infrastructure and documentation',
    'Fast full-width layouts for desktop and a cleaner mobile navigation',
    'Built-in console, wiki and self-service provisioning'
  ];

  return (
    <ul className="auth-feature-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState('');
  const [localError, setLocalError] = useState('');
  const [language, setLanguage] = useState(readStoredLanguage());

  const error = localError || authError || '';
  const forgotPlaceholder = useMemo(() => email || forgotEmail, [email, forgotEmail]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      const user = await login(email, password);
      navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setLocalError(err.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async (event) => {
    event.preventDefault();
    setForgotBusy(true);
    setForgotSent('');
    setLocalError('');
    try {
      const target = forgotEmail || email;
      const response = await authApi.forgotPassword(target, language);
      setForgotSent(response.data?.message || 'If the account exists, a reset link was sent.');
    } catch (err) {
      setLocalError(getErrorMessage(err, 'The reset email could not be sent.'));
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-panel auth-panel-brand">
        <div className="auth-panel-toolbar">
          <LanguageSwitch value={language} onChange={(value) => { setLanguage(value); storeLanguage(value); }} />
          <ThemeButton />
        </div>
        <BrandLogo />
        <div className="auth-panel-copy">
          <p className="eyebrow-clean">Hosting by TechByGiusi</p>
          <h1>Your services. Everywhere.</h1>
          <p>
            Manage your self-hosted services, infrastructure and documentation in one clean portal.
          </p>
          <FeatureList />
        </div>
      </section>

      <section className="auth-panel auth-panel-form">
        <div className="auth-card-clean">
          <div className="auth-card-head">
            <h2>Sign in</h2>
            <p>Use your portal account to continue.</p>
          </div>

          {error ? <div className="inline-notice danger">{error}</div> : null}
          {forgotSent ? <div className="inline-notice success">{forgotSent}</div> : null}

          <form className="clean-form-grid" onSubmit={submit}>
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>

          <div className="auth-divider"><span>Forgot your password?</span></div>

          <form className="clean-form-grid compact" onSubmit={sendReset}>
            <label>
              <span>Reset email</span>
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                placeholder={forgotPlaceholder || 'you@example.com'}
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={forgotBusy}>{forgotBusy ? 'Sending…' : 'Send reset link'}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
