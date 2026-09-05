import React, { useEffect, useState } from 'react';
import AvatarSettingsPanel from './AvatarSettingsPanel';
import AccountEmailSettingsPanel from './AccountEmailSettingsPanel';
import AccountPasswordSettingsPanel from './AccountPasswordSettingsPanel';
import NotificationSettingsPanel from './NotificationSettingsPanel';
import { useTheme } from './ThemeButton';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';

function ToggleRow({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="settings-toggle-clean">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <button
        type="button"
        className={`toggle-clean ${checked ? 'active' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
      >
        <span />
      </button>
    </label>
  );
}

export default function AdminAccountSettings({ language, onLanguageChange }) {
  const { theme, setTheme } = useTheme();
  const [infra, setInfra] = useState({ notifyClusterDown: false, notifyNodeDown: false, notifyPangolinDown: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminApi.getInfrastructureNotificationPreferences()
      .then((response) => {
        if (active) setInfra(response.data?.preferences || infra);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, 'Infrastructure notifications could not be loaded.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveInfra = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await adminApi.updateInfrastructureNotificationPreferences(infra);
      setInfra(response.data?.preferences || infra);
      setNotice('Administrator notifications saved.');
    } catch (err) {
      setError(getErrorMessage(err, 'Administrator notifications could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <SectionCard title="Profile" subtitle="Your administrator account details">
        <AvatarSettingsPanel language={language} />
        <div className="settings-component-separator" />
        <AccountEmailSettingsPanel language={language} />
        <div className="settings-component-separator" />
        <AccountPasswordSettingsPanel language={language} />
      </SectionCard>

      <SectionCard title="Appearance & language" subtitle="Personal display preferences for this account">
        <div className="settings-choice-grid">
          <div className="settings-choice-block">
            <span className="settings-choice-label">Appearance</span>
            <div className="segmented-clean">
              <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
              <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
            </div>
          </div>
          <div className="settings-choice-block">
            <span className="settings-choice-label">Language</span>
            <div className="segmented-clean">
              <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => onLanguageChange('en')}>English</button>
              <button type="button" className={language === 'de' ? 'active' : ''} onClick={() => onLanguageChange('de')}>Deutsch</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Service notifications" subtitle="The same service notification options available to portal users">
        <NotificationSettingsPanel language={language} />
      </SectionCard>

      <SectionCard title="Administrator notifications" subtitle="Additional infrastructure-wide alerts only administrators receive">
        {loading ? <div className="page-state-clean">Loading notification preferences…</div> : (
          <div className="settings-toggle-list-clean">
            <ToggleRow
              label="Cluster unavailable"
              hint="Notify me when an entire configured Proxmox cluster can no longer be reached."
              checked={infra.notifyClusterDown}
              onChange={(value) => setInfra((current) => ({ ...current, notifyClusterDown: value }))}
              disabled={saving}
            />
            <ToggleRow
              label="Node unavailable"
              hint="Notify me when an individual Proxmox node goes offline."
              checked={infra.notifyNodeDown}
              onChange={(value) => setInfra((current) => ({ ...current, notifyNodeDown: value }))}
              disabled={saving}
            />
            <ToggleRow
              label="Pangolin unavailable"
              hint="Notify me when public publishing or the Pangolin connection is unavailable."
              checked={infra.notifyPangolinDown}
              onChange={(value) => setInfra((current) => ({ ...current, notifyPangolinDown: value }))}
              disabled={saving}
            />
            <div className="form-actions left">
              <button type="button" className="btn-primary" onClick={saveInfra} disabled={saving}>{saving ? 'Saving…' : 'Save administrator notifications'}</button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
