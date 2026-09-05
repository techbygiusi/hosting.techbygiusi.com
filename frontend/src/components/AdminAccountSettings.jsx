import React, { useEffect, useState } from 'react';
import AvatarSettingsPanel from './AvatarSettingsPanel';
import AccountEmailSettingsPanel from './AccountEmailSettingsPanel';
import AccountPasswordSettingsPanel from './AccountPasswordSettingsPanel';
import NotificationSettingsPanel from './NotificationSettingsPanel';
import { useTheme } from './ThemeButton';
import { adminApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';
import PreferenceSlider from './PreferenceSlider';

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
    <div className="settings-layout-clean settings-grid-compact admin-settings-grid-v7">
      {error ? <div className="settings-grid-span"><InlineNotice tone="danger">{error}</InlineNotice></div> : null}
      {notice ? <div className="settings-grid-span"><InlineNotice tone="success">{notice}</InlineNotice></div> : null}

      <div className="settings-pair-row settings-grid-span">
        <SectionCard title="Appearance & language" className="settings-compact-card settings-preferences-card">
          <div className="settings-choice-grid settings-slider-grid">
            <div className="settings-choice-block">
              <span className="settings-choice-label">Appearance</span>
              <PreferenceSlider
                value={theme}
                ariaLabel="Appearance"
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' }
                ]}
              />
            </div>
            <div className="settings-choice-block">
              <span className="settings-choice-label">Language</span>
              <PreferenceSlider
                value={language}
                ariaLabel="Language"
                onChange={onLanguageChange}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'Deutsch' }
                ]}
              />
            </div>
          </div>
        </SectionCard>
        <SectionCard className="settings-compact-card"><AvatarSettingsPanel language={language} /></SectionCard>
      </div>

      <div className="settings-pair-row settings-grid-span">
        <SectionCard className="settings-compact-card"><AccountEmailSettingsPanel language={language} /></SectionCard>
        <SectionCard className="settings-compact-card"><AccountPasswordSettingsPanel language={language} /></SectionCard>
      </div>

      <div className="settings-pair-row settings-grid-span settings-pair-notifications">
        <SectionCard title="Service notifications" className="settings-compact-card"><NotificationSettingsPanel language={language} /></SectionCard>
        <SectionCard title="Administrator notifications" className="settings-compact-card">
          {loading ? <div className="page-state-clean compact-state">Loading notification preferences…</div> : (
            <div className="settings-toggle-list-clean admin-notification-list-v7">
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
                hint="Notify me when public publishing or a cluster-specific Pangolin connection is unavailable."
                checked={infra.notifyPangolinDown}
                onChange={(value) => setInfra((current) => ({ ...current, notifyPangolinDown: value }))}
                disabled={saving}
              />
              <div className="form-actions left">
                <button type="button" className="btn-primary" onClick={saveInfra} disabled={saving}>{saving ? 'Saving…' : 'Save notifications'}</button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
