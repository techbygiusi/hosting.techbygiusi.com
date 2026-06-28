import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/globals.css';
import ThemeButton from '../components/ThemeButton';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Bitte E-Mail-Adresse und Passwort eingeben.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const user = await login(email, password);
      navigate(user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-theme-action"><ThemeButton /></div>
      <section className="auth-card login-card">
        <header className="auth-header">
          <p className="eyebrow">Hosting Portal</p>
          <h1>Anmelden</h1>
        </header>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="form-group" htmlFor="email">
            <span>E-Mail-Adresse</span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="name@example.com"
              disabled={loading}
              autoComplete="email"
            />
          </label>

          <label className="form-group" htmlFor="password">
            <span>Passwort</span>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Dein Passwort"
              disabled={loading}
              autoComplete="current-password"
            />
          </label>

          <button type="submit" className="btn-primary full-button" disabled={loading}>
            {loading ? 'Anmeldung läuft...' : 'Anmelden'}
          </button>
        </form>
      </section>
    </main>
  );
}
