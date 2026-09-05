import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import ThemeButton from '../components/ThemeButton';
import { InlineNotice } from '../components/UiBits';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const tokenMissing = useMemo(() => !token, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await authApi.resetPassword(token, password);
      setSuccess(response.data?.message || 'Password reset successfully.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(getErrorMessage(err, 'The password could not be reset.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout reset-layout">
      <section className="auth-panel auth-panel-brand">
        <div className="auth-panel-toolbar right-only">
          <ThemeButton />
        </div>
        <BrandLogo />
        <div className="auth-panel-copy">
          <p className="eyebrow-clean">Account recovery</p>
          <h1>Set a new password.</h1>
          <p>Choose a strong password and return to the portal.</p>
        </div>
      </section>

      <section className="auth-panel auth-panel-form">
        <div className="auth-card-clean">
          <div className="auth-card-head">
            <h2>Reset password</h2>
            <p>The link from your email opens this page with a secure token.</p>
          </div>
          {tokenMissing ? <InlineNotice tone="danger">The reset token is missing.</InlineNotice> : null}
          {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
          {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
          <form className="clean-form-grid" onSubmit={submit}>
            <label>
              <span>New password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={tokenMissing} autoComplete="new-password" />
            </label>
            <button type="submit" className="btn-primary" disabled={busy || tokenMissing}>{busy ? 'Saving…' : 'Save password'}</button>
          </form>
          <div className="auth-inline-links">
            <Link to="/login">Back to login</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
