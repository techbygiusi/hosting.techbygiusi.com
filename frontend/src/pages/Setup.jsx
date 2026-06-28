import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, getErrorMessage, translateMessage } from '../services/api';
import '../styles/globals.css';

const STEP_ADMIN = 1;
const STEP_PROXMOX = 2;
const STEP_SMTP = 3;

export default function Setup() {
  const navigate = useNavigate();
  const { setup, setupStatus } = useAuth();

  const [step, setStep] = useState(STEP_ADMIN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testProxmoxLoading, setTestProxmoxLoading] = useState(false);
  const [testSmtpLoading, setTestSmtpLoading] = useState(false);
  const [proxmoxTestResult, setProxmoxTestResult] = useState(null);
  const [smtpTestResult, setSmtpTestResult] = useState(null);

  const adminConfigured = Boolean(setupStatus?.adminConfigured);
  const proxmoxConfigured = Boolean(setupStatus?.proxmoxConfigured);
  const smtpConfigured = Boolean(setupStatus?.smtpConfigured);

  const [adminData, setAdminData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [proxmoxData, setProxmoxData] = useState({
    name: 'Standard Proxmox',
    url: '',
    apiToken: ''
  });

  const [smtpData, setSMTPData] = useState({
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: ''
  });

  const firstOpenStep = useMemo(() => {
    if (!adminConfigured) return STEP_ADMIN;
    if (!proxmoxConfigured) return STEP_PROXMOX;
    return STEP_SMTP;
  }, [adminConfigured, proxmoxConfigured]);

  useEffect(() => {
    setStep(firstOpenStep);
  }, [firstOpenStep]);

  const handleAdminChange = (e) => {
    const { name, value } = e.target;
    setAdminData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleProxmoxChange = (e) => {
    const { name, value } = e.target;
    setProxmoxData(prev => ({ ...prev, [name]: value }));
    setProxmoxTestResult(null);
    setError('');
  };

  const handleSMTPChange = (e) => {
    const { name, value } = e.target;
    setSMTPData(prev => ({ ...prev, [name]: value }));
    setSmtpTestResult(null);
    setError('');
  };

  const validateAdminData = () => {
    if (adminConfigured) return true;

    if (!adminData.name || !adminData.email || !adminData.password) {
      setError('Bitte Name, E-Mail-Adresse und Passwort für den Administrator eingeben.');
      return false;
    }
    if (adminData.password !== adminData.confirmPassword) {
      setError('Die Administrator-Passwörter stimmen nicht überein.');
      return false;
    }
    if (adminData.password.length < 6) {
      setError('Das Administrator-Passwort muss mindestens 6 Zeichen lang sein.');
      return false;
    }
    return true;
  };

  const validateProxmoxData = () => {
    if (proxmoxConfigured) return true;

    if (!proxmoxData.name || !proxmoxData.url || !proxmoxData.apiToken) {
      setError('Bitte Proxmox-Name, URL und API-Token eingeben.');
      return false;
    }
    if (!/^https?:\/\//i.test(proxmoxData.url)) {
      setError('Die Proxmox-URL muss mit http:// oder https:// beginnen.');
      return false;
    }
    return true;
  };

  const validateSMTPData = () => {
    if (smtpConfigured) return true;

    if (!smtpData.smtpHost || !smtpData.smtpPort || !smtpData.smtpUser || !smtpData.smtpPassword) {
      setError('Bitte SMTP-Host, Port, Benutzer und Passwort eingeben.');
      return false;
    }
    return true;
  };

  const handleTestProxmox = async () => {
    if (!validateProxmoxData()) return;

    try {
      setTestProxmoxLoading(true);
      setError('');
      const result = await authApi.setupTestProxmox({
        proxmoxName: proxmoxData.name,
        proxmoxUrl: proxmoxData.url,
        proxmoxApiToken: proxmoxData.apiToken
      });
      setProxmoxTestResult(result.data);
    } catch (err) {
      setProxmoxTestResult({
        success: false,
        message: getErrorMessage(err, 'Verbindungstest fehlgeschlagen.')
      });
    } finally {
      setTestProxmoxLoading(false);
    }
  };

  const handleTestSMTP = async () => {
    if (!validateSMTPData()) return;

    try {
      setTestSmtpLoading(true);
      setError('');
      const result = await authApi.setupTestSmtp(smtpData);
      setSmtpTestResult(result.data);
    } catch (err) {
      setSmtpTestResult({
        success: false,
        message: getErrorMessage(err, 'Verbindungstest fehlgeschlagen.')
      });
    } finally {
      setTestSmtpLoading(false);
    }
  };

  const canLeaveProxmoxStep = () => {
    if (proxmoxConfigured) return true;
    if (!validateProxmoxData()) return false;
    if (!proxmoxTestResult?.success) {
      setError('Bitte die Proxmox-Verbindung erfolgreich testen, bevor du fortfährst.');
      return false;
    }
    return true;
  };

  const canLeaveSMTPStep = () => {
    if (smtpConfigured) return true;
    if (!validateSMTPData()) return false;
    if (!smtpTestResult?.success) {
      setError('Bitte die SMTP-Verbindung erfolgreich testen, bevor du die Einrichtung abschließt.');
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    setError('');

    if (step === STEP_ADMIN) {
      if (validateAdminData()) setStep(STEP_PROXMOX);
      return;
    }

    if (step === STEP_PROXMOX) {
      if (canLeaveProxmoxStep()) setStep(STEP_SMTP);
      return;
    }

    await handleSubmit();
  };

  const handleSubmit = async () => {
    if (!validateAdminData() || !canLeaveProxmoxStep() || !canLeaveSMTPStep()) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      const user = await setup(adminData, proxmoxData, smtpData);
      navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Erstkonfiguration fehlgeschlagen.'));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === STEP_SMTP) {
      setStep(STEP_PROXMOX);
    } else if (step === STEP_PROXMOX) {
      setStep(STEP_ADMIN);
    }
  };

  const renderStatusPill = (configured) => (
    <span className={`setup-pill ${configured ? 'done' : 'open'}`}>
      {configured ? 'Gespeichert' : 'Erforderlich'}
    </span>
  );

  return (
    <div className="setup-shell">
      <div className="setup-card setup-card-wide">
        <div className="setup-header">
          <p className="eyebrow">Erstkonfiguration</p>
          <h1>Hosting Portal</h1>
          <p>Schließe die drei Einrichtungsschritte ab, bevor das Portal geöffnet wird.</p>
        </div>

        <div className="setup-tabs" aria-label="Fortschritt der Einrichtung">
          <button type="button" className={`setup-tab ${step === STEP_ADMIN ? 'active' : ''} ${adminConfigured ? 'complete' : ''}`} onClick={() => setStep(STEP_ADMIN)}>
            <span>1</span>
            Administrator
            {renderStatusPill(adminConfigured)}
          </button>
          <button type="button" className={`setup-tab ${step === STEP_PROXMOX ? 'active' : ''} ${proxmoxConfigured ? 'complete' : ''}`} onClick={() => setStep(STEP_PROXMOX)}>
            <span>2</span>
            Proxmox API
            {renderStatusPill(proxmoxConfigured)}
          </button>
          <button type="button" className={`setup-tab ${step === STEP_SMTP ? 'active' : ''} ${smtpConfigured ? 'complete' : ''}`} onClick={() => setStep(STEP_SMTP)}>
            <span>3</span>
            SMTP-Mail
            {renderStatusPill(smtpConfigured)}
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="setup-content">
          {step === STEP_ADMIN && (
            <section className="setup-panel">
              <div className="setup-panel-title">
                <h2>Administrator anlegen</h2>
                <p>Dieses Konto wird der erste Administrator des Portals.</p>
              </div>

              {adminConfigured ? (
                <div className="alert alert-success">Administrator ist bereits vorhanden. Weiter mit Proxmox und SMTP.</div>
              ) : (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Vollständiger Name</label>
                    <input type="text" name="name" value={adminData.name} onChange={handleAdminChange} placeholder="Administrator" />
                  </div>
                  <div className="form-group">
                    <label>E-Mail</label>
                    <input type="email" name="email" value={adminData.email} onChange={handleAdminChange} placeholder="admin@example.com" />
                  </div>
                  <div className="form-group">
                    <label>Passwort</label>
                    <input type="password" name="password" value={adminData.password} onChange={handleAdminChange} placeholder="Mindestens 6 Zeichen" />
                  </div>
                  <div className="form-group">
                    <label>Passwort bestätigen</label>
                    <input type="password" name="confirmPassword" value={adminData.confirmPassword} onChange={handleAdminChange} placeholder="Passwort wiederholen" />
                  </div>
                </div>
              )}
            </section>
          )}

          {step === STEP_PROXMOX && (
            <section className="setup-panel">
              <div className="setup-panel-title">
                <h2>Proxmox API</h2>
                <p>Verbinde das Portal mit deinem Proxmox-Cluster, bevor Benutzer ihre zugewiesenen Systeme sehen.</p>
              </div>

              {proxmoxConfigured ? (
                <div className="alert alert-success">Proxmox API ist bereits konfiguriert.</div>
              ) : (
                <>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Cluster-Name</label>
                      <input type="text" name="name" value={proxmoxData.name} onChange={handleProxmoxChange} placeholder="Home Lab" />
                    </div>
                    <div className="form-group">
                      <label>Proxmox URL</label>
                      <input type="text" name="url" value={proxmoxData.url} onChange={handleProxmoxChange} placeholder="https://10.10.0.10:8006" />
                    </div>
                    <div className="form-group full-width">
                      <label>API-Token</label>
                      <input type="password" name="apiToken" value={proxmoxData.apiToken} onChange={handleProxmoxChange} placeholder="user@pam!tokenid=secret" />
                    </div>
                  </div>

                  <button className="btn-secondary full-button" type="button" onClick={handleTestProxmox} disabled={testProxmoxLoading}>
                    {testProxmoxLoading ? 'Proxmox wird getestet...' : 'Proxmox-Verbindung testen'}
                  </button>

                  {proxmoxTestResult && (
                    <div className={`test-result ${proxmoxTestResult.success ? 'success' : 'error'}`}>{translateMessage(proxmoxTestResult.message)}</div>
                  )}
                </>
              )}
            </section>
          )}

          {step === STEP_SMTP && (
            <section className="setup-panel">
              <div className="setup-panel-title">
                <h2>SMTP-Mail</h2>
                <p>Speichere die SMTP-Daten und teste sie, damit System-Mails später zuverlässig funktionieren.</p>
              </div>

              {smtpConfigured ? (
                <div className="alert alert-success">SMTP ist bereits konfiguriert.</div>
              ) : (
                <>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>SMTP-Host</label>
                      <input type="text" name="smtpHost" value={smtpData.smtpHost} onChange={handleSMTPChange} placeholder="smtp.example.com" />
                    </div>
                    <div className="form-group">
                      <label>SMTP-Port</label>
                      <input type="text" name="smtpPort" value={smtpData.smtpPort} onChange={handleSMTPChange} placeholder="587" />
                    </div>
                    <div className="form-group">
                      <label>SMTP-Benutzer</label>
                      <input type="email" name="smtpUser" value={smtpData.smtpUser} onChange={handleSMTPChange} placeholder="noreply@example.com" />
                    </div>
                    <div className="form-group">
                      <label>SMTP-Passwort</label>
                      <input type="password" name="smtpPassword" value={smtpData.smtpPassword} onChange={handleSMTPChange} placeholder="SMTP-Passwort" />
                    </div>
                  </div>

                  <button className="btn-secondary full-button" type="button" onClick={handleTestSMTP} disabled={testSmtpLoading}>
                    {testSmtpLoading ? 'SMTP wird getestet...' : 'SMTP-Verbindung testen'}
                  </button>

                  {smtpTestResult && (
                    <div className={`test-result ${smtpTestResult.success ? 'success' : 'error'}`}>{translateMessage(smtpTestResult.message)}</div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        <div className="setup-actions">
          {step > STEP_ADMIN && (
            <button className="btn-secondary" type="button" onClick={goBack} disabled={loading}>
              Zurück
            </button>
          )}
          <button className="btn-primary" type="button" onClick={handleNext} disabled={loading}>
            {loading ? 'Speichert...' : step === STEP_SMTP ? 'Einrichtung abschließen' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
