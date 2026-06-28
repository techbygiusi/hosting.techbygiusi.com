import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../services/api';
import '../styles/globals.css';

export default function Setup() {
  const navigate = useNavigate();
  const { setup } = useAuth();

  const [step, setStep] = useState(1); // 1: Admin, 2: SMTP, 3: Proxmox
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testSmtpLoading, setTestSmtpLoading] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);

  const [adminData, setAdminData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [smtpData, setSMTPData] = useState({
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: ''
  });

  const handleAdminChange = (e) => {
    const { name, value } = e.target;
    setAdminData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSMTPChange = (e) => {
    const { name, value } = e.target;
    setSMTPData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const validateAdminData = () => {
    if (!adminData.name || !adminData.email || !adminData.password) {
      setError('All fields are required');
      return false;
    }
    if (adminData.password !== adminData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (adminData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (step === 1) {
      if (validateAdminData()) {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      await handleSubmit();
    }
  };

  const handleTestSMTP = async () => {
    try {
      setTestSmtpLoading(true);
      const result = await adminApi.testSmtp(smtpData);
      setSmtpTestResult(result.data);
    } catch (err) {
      setSmtpTestResult({
        success: false,
        message: err.response?.data?.message || err.message
      });
    } finally {
      setTestSmtpLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');
      
      await setup(adminData, smtpData);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-container">
      <style>{`
        .setup-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0066cc 0%, #004fa3 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-md);
        }
        
        .setup-card {
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          padding: var(--spacing-lg);
          max-width: 450px;
          width: 100%;
          animation: slideUp 0.3s ease-in-out;
        }
        
        .setup-header {
          text-align: center;
          margin-bottom: var(--spacing-lg);
        }
        
        .setup-header h1 {
          color: var(--color-primary);
          font-size: var(--font-size-2xl);
          margin-bottom: var(--spacing-sm);
        }
        
        .setup-header p {
          color: var(--color-text-light);
          margin: 0;
        }
        
        .setup-progress {
          display: flex;
          justify-content: space-between;
          margin-bottom: var(--spacing-lg);
          gap: var(--spacing-md);
        }
        
        .progress-item {
          flex: 1;
          height: 4px;
          background: var(--color-border);
          border-radius: 2px;
          transition: var(--transition);
        }
        
        .progress-item.active {
          background: var(--color-primary);
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
        
        .form-group input,
        .form-group select {
          width: 100%;
          padding: var(--spacing-sm) var(--spacing-md);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--font-size-base);
          transition: var(--transition);
        }
        
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
        }
        
        .alert {
          margin-bottom: var(--spacing-md);
        }
        
        .button-group {
          display: flex;
          gap: var(--spacing-md);
          margin-top: var(--spacing-lg);
        }
        
        .button-group button {
          flex: 1;
          padding: var(--spacing-md);
          border: none;
          border-radius: var(--radius-md);
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
          font-size: var(--font-size-base);
        }
        
        .btn-primary {
          background: var(--color-primary);
          color: white;
        }
        
        .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-dark);
          box-shadow: var(--shadow-md);
        }
        
        .btn-secondary {
          background: var(--color-border);
          color: var(--color-text);
        }
        
        .btn-secondary:hover:not(:disabled) {
          background: #ccc;
        }
        
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .step-content {
          animation: fadeIn 0.3s ease-in-out;
        }
        
        .test-result {
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-top: var(--spacing-md);
          text-align: center;
        }
        
        .test-result.success {
          background: rgba(40, 167, 69, 0.1);
          color: #155724;
          border: 1px solid #28a745;
        }
        
        .test-result.error {
          background: rgba(220, 53, 69, 0.1);
          color: #721c24;
          border: 1px solid #dc3545;
        }
      `}</style>

      <div className="setup-card">
        <div className="setup-header">
          <h1>🚀 Hosting Portal</h1>
          <p>Initial Setup</p>
        </div>

        <div className="setup-progress">
          <div className={`progress-item ${step >= 1 ? 'active' : ''}`}></div>
          <div className={`progress-item ${step >= 2 ? 'active' : ''}`}></div>
          <div className={`progress-item ${step >= 3 ? 'active' : ''}`}></div>
        </div>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <div className="step-content">
          {step === 1 && (
            <>
              <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>
                Create Admin Account
              </h2>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={adminData.name}
                  onChange={handleAdminChange}
                  placeholder="e.g., John Doe"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={adminData.email}
                  onChange={handleAdminChange}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={adminData.password}
                  onChange={handleAdminChange}
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={adminData.confirmPassword}
                  onChange={handleAdminChange}
                  placeholder="Confirm your password"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>
                SMTP Configuration
              </h2>
              <p style={{ color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
                For sending password reset emails
              </p>
              <div className="form-group">
                <label>SMTP Host</label>
                <input
                  type="text"
                  name="smtpHost"
                  value={smtpData.smtpHost}
                  onChange={handleSMTPChange}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="form-group">
                <label>SMTP Port</label>
                <input
                  type="text"
                  name="smtpPort"
                  value={smtpData.smtpPort}
                  onChange={handleSMTPChange}
                  placeholder="587"
                />
              </div>
              <div className="form-group">
                <label>SMTP User</label>
                <input
                  type="email"
                  name="smtpUser"
                  value={smtpData.smtpUser}
                  onChange={handleSMTPChange}
                  placeholder="your-email@gmail.com"
                />
              </div>
              <div className="form-group">
                <label>SMTP Password</label>
                <input
                  type="password"
                  name="smtpPassword"
                  value={smtpData.smtpPassword}
                  onChange={handleSMTPChange}
                  placeholder="Your SMTP password"
                />
              </div>
              <button
                className="btn-secondary"
                onClick={handleTestSMTP}
                disabled={testSmtpLoading || !smtpData.smtpHost}
                style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
              >
                {testSmtpLoading ? 'Testing...' : 'Test SMTP Connection'}
              </button>
              {smtpTestResult && (
                <div className={`test-result ${smtpTestResult.success ? 'success' : 'error'}`}>
                  {smtpTestResult.message}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>
                Review & Complete
              </h2>
              <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <strong>Admin Email:</strong> {adminData.email}
                </div>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <strong>Admin Name:</strong> {adminData.name}
                </div>
                <div>
                  <strong>SMTP Host:</strong> {smtpData.smtpHost || 'Not configured'}
                </div>
              </div>
              <p style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
                Click "Complete Setup" to finalize the configuration. You can update these settings later from the admin panel.
              </p>
            </>
          )}
        </div>

        <div className="button-group">
          {step > 1 && (
            <button
              className="btn-secondary"
              onClick={() => setStep(step - 1)}
              disabled={loading}
            >
              Back
            </button>
          )}
          <button
            className="btn-primary"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? 'Please wait...' : step === 3 ? 'Complete Setup' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
