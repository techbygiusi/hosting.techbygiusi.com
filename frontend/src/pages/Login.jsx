import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, getErrorMessage } from '../services/api';
import BrandLogo, { BrandMark } from '../components/BrandLogo';
import ThemeButton from '../components/ThemeButton';
import LanguageSwitch, { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';

export default function Login() {
  const navigate = useNavigate();
  const { login, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState('');
  const [localError, setLocalError] = useState('');
  const [language, setLanguage] = useState(readStoredLanguage());
  const error = localError || authError || '';

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
    <div className="login-page-v4">
      <header className="login-toolbar-v4">
        <div className="login-toolbar-brand"><BrandMark size={34} /><strong>Hosting</strong></div>
        <div className="login-toolbar-controls">
          <LanguageSwitch value={language} onChange={(value) => { setLanguage(value); storeLanguage(value); }} />
          <ThemeButton />
        </div>
      </header>

      <main className="login-shell-v4">
        <section className="login-brand-panel-v4">
          <BrandLogo />
          <div className="login-brand-copy-v4">
            <h1>Your services.<br />One portal.</h1>
            <div className="login-feature-pills-v4">
              <span>Services</span><span>Console</span><span>Wiki</span><span>Self-Service</span>
            </div>
          </div>
        </section>

        <section className="login-form-panel-v4">
          <div className="login-form-card-v4">
            <div className="auth-card-head"><h2>Sign in</h2><p>Continue to Hosting by TechByGiusi.</p></div>
            {error ? <div className="inline-notice danger">{error}</div> : null}
            {forgotSent ? <div className="inline-notice success">{forgotSent}</div> : null}

            {!forgotOpen ? (
              <form className="clean-form-grid" onSubmit={submit}>
                <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
                <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
                <button type="submit" className="btn-primary login-submit-v4" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                <button type="button" className="login-text-button-v4" onClick={() => { setForgotEmail(email); setForgotOpen(true); }}>Forgot your password?</button>
              </form>
            ) : (
              <form className="clean-form-grid" onSubmit={sendReset}>
                <div className="login-reset-head-v4"><strong>Reset password</strong><span>We will send a reset link to your email address.</span></div>
                <label><span>Email</span><input type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
                <button type="submit" className="btn-primary" disabled={forgotBusy}>{forgotBusy ? 'Sending…' : 'Send reset link'}</button>
                <button type="button" className="btn-secondary" onClick={() => setForgotOpen(false)}>Back to sign in</button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
