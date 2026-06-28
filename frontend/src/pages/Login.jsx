import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/globals.css';

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
      setError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const user = await login(email, password);
      
      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <style>{`
        .login-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0066cc 0%, #004fa3 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-md);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }
        
        .login-card {
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          padding: var(--spacing-lg);
          max-width: 400px;
          width: 100%;
          animation: slideUp 0.3s ease-in-out;
        }
        
        .login-header {
          text-align: center;
          margin-bottom: var(--spacing-lg);
        }
        
        .login-header h1 {
          color: var(--color-primary);
          font-size: var(--font-size-2xl);
          margin-bottom: var(--spacing-sm);
        }
        
        .login-header p {
          color: var(--color-text-light);
          margin: 0;
        }
        
        .form-group {
          margin-bottom: var(--spacing-md);
        }
        
        .form-group label {
          display: block;
          margin-bottom: var(--spacing-sm);
          font-weight: 500;
          color: var(--color-text);
        }
        
        .form-group input {
          width: 100%;
          padding: var(--spacing-sm) var(--spacing-md);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--font-size-base);
          transition: var(--transition);
          min-height: 44px;
        }
        
        .form-group input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
        }
        
        .alert {
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-md);
          background: rgba(220, 53, 69, 0.1);
          color: #721c24;
          border: 1px solid #dc3545;
        }
        
        .login-button {
          width: 100%;
          padding: var(--spacing-md);
          background: var(--color-primary);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 500;
          font-size: var(--font-size-base);
          cursor: pointer;
          transition: var(--transition);
          min-height: 44px;
          margin-top: var(--spacing-md);
        }
        
        .login-button:hover:not(:disabled) {
          background: var(--color-primary-dark);
          box-shadow: var(--shadow-md);
        }
        
        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .login-footer {
          text-align: center;
          margin-top: var(--spacing-lg);
          color: var(--color-text-light);
          font-size: var(--font-size-sm);
        }
        
        .login-footer a {
          color: var(--color-primary);
          text-decoration: none;
        }
        
        .login-footer a:hover {
          text-decoration: underline;
        }
      `}</style>

      <div className="login-card">
        <div className="login-header">
          <h1>🚀 Hosting Portal</h1>
          <p>Sign In</p>
        </div>

        {error && (
          <div className="alert">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="your@example.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Your password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            <a href="/forgot-password">Forgot your password?</a>
          </p>
        </div>
      </div>
    </div>
  );
}
