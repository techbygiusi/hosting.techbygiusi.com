import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, authApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard, StatCard } from './UiBits';

export default function HostingPortalSettings() {
  const [state, setState] = useState({ setupRequired: false, users: [], clusters: [], settings: {} });
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [setupRes, usersRes, clustersRes, settingsRes] = await Promise.all([
        authApi.setupRequired(),
        adminApi.getUsers(),
        adminApi.getClusters(),
        adminApi.getSettings()
      ]);
      const clusters = clustersRes.data?.clusters || [];
      setState({
        setupRequired: Boolean(setupRes.data?.setupRequired),
        users: usersRes.data?.users || [],
        clusters,
        settings: settingsRes.data?.settings || {}
      });
      setSelectedCluster((current) => current || String(clusters[0]?.id || ''));
    } catch (err) {
      setError(getErrorMessage(err, 'Portal configuration could not be checked.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const adminCount = useMemo(() => state.users.filter((item) => item.role === 'admin').length, [state.users]);
  const smtpConfigured = Boolean(state.settings.smtp_host && state.settings.smtp_user);

  const testCluster = async () => {
    if (!selectedCluster) return;
    setTesting('cluster');
    setError('');
    setNotice('');
    try {
      const response = await adminApi.testProxmox({ clusterId: selectedCluster });
      setNotice(response.data?.message || 'Proxmox connection successful.');
    } catch (err) {
      setError(getErrorMessage(err, 'Proxmox connection test failed.'));
    } finally {
      setTesting('');
    }
  };

  const testSmtp = async () => {
    setTesting('smtp');
    setError('');
    setNotice('');
    try {
      const response = await adminApi.testSmtp({
        smtpHost: state.settings.smtp_host || '',
        smtpPort: state.settings.smtp_port || '',
        smtpUser: state.settings.smtp_user || '',
        smtpPassword: state.settings.smtp_password || '***hidden***'
      });
      setNotice(response.data?.message || 'SMTP connection successful.');
    } catch (err) {
      setError(getErrorMessage(err, 'SMTP connection test failed.'));
    } finally {
      setTesting('');
    }
  };

  if (loading) return <SectionCard><div className="page-state-clean">Checking portal configuration…</div></SectionCard>;

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <div className="dashboard-grid-full portal-health-grid">
        <StatCard label="Administrators" value={adminCount} hint="Accounts with portal-wide access" tone={adminCount > 0 ? 'success' : 'danger'} />
        <StatCard label="Proxmox clusters" value={state.clusters.length} hint="Connected infrastructure backends" tone={state.clusters.length > 0 ? 'success' : 'danger'} />
        <StatCard label="SMTP" value={smtpConfigured ? 'Ready' : 'Missing'} hint="Mail delivery configuration" tone={smtpConfigured ? 'success' : 'danger'} />
        <StatCard label="Setup" value={state.setupRequired ? 'Required' : 'Complete'} hint="Initial portal configuration" tone={state.setupRequired ? 'warning' : 'success'} />
      </div>

      <SectionCard title="Portal health" subtitle="Quickly verify the connections the portal depends on" action={<button type="button" className="btn-secondary" onClick={load}>Refresh</button>}>
        <div className="portal-health-checks">
          <div className="health-check-card">
            <div>
              <strong>Proxmox API</strong>
              <p>Test one of the configured clusters with its stored API token.</p>
            </div>
            <div className="health-check-actions">
              <select value={selectedCluster} onChange={(event) => setSelectedCluster(event.target.value)}>
                <option value="">Select cluster</option>
                {state.clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}
              </select>
              <button type="button" className="btn-secondary" onClick={testCluster} disabled={!selectedCluster || testing === 'cluster'}>{testing === 'cluster' ? 'Testing…' : 'Test cluster'}</button>
            </div>
          </div>

          <div className="health-check-card">
            <div>
              <strong>SMTP delivery</strong>
              <p>Use the currently saved SMTP configuration for a connection test.</p>
            </div>
            <div className="health-check-actions">
              <button type="button" className="btn-secondary" onClick={testSmtp} disabled={!smtpConfigured || testing === 'smtp'}>{testing === 'smtp' ? 'Testing…' : 'Test SMTP'}</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Portal routing" subtitle="Dedicated configuration areas have their own navigation entries now">
        <div className="portal-routing-grid">
          <div><strong>Email</strong><span>SMTP delivery and test mails</span></div>
          <div><strong>Self-Service</strong><span>Provisioning ranges, limits and templates</span></div>
          <div><strong>Pangolin</strong><span>Public publishing and remote access</span></div>
          <div><strong>Maintenance</strong><span>Scheduled maintenance announcements</span></div>
          <div><strong>Settings</strong><span>Only your personal profile, appearance, language and notifications</span></div>
        </div>
      </SectionCard>
    </div>
  );
}
