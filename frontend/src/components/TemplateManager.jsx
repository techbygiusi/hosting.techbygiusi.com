import React, { useEffect, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

export default function TemplateManager({ clusters = [] }) {
  const [clusterId, setClusterId] = useState(String(clusters[0]?.id || ''));
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!clusterId && clusters[0]) setClusterId(String(clusters[0].id));
  }, [clusters, clusterId]);

  const load = async (sync = false) => {
    if (!clusterId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = sync ? await adminApi.syncTemplates(clusterId) : await adminApi.getTemplates(clusterId);
      setTemplates(response.data?.templates || []);
      if (sync) setNotice('Templates refreshed from Proxmox.');
    } catch (err) {
      setError(getErrorMessage(err, 'Templates could not be loaded.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (clusterId) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  const updateField = (id, field, value) => {
    setTemplates((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const save = async (template) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await adminApi.updateTemplate(template.id, template);
      setNotice(`${template.displayName || template.name || 'Template'} saved.`);
      await load(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Template could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <SectionCard
        title="Templates"
        subtitle="Synchronize Proxmox LXC templates and decide how they appear in self-service"
        action={<button type="button" className="btn-primary" disabled={!clusterId || busy} onClick={() => load(true)}>{busy ? 'Loading…' : 'Sync from Proxmox'}</button>}
      >
        <div className="clean-form-grid compact template-filter-row">
          <label>
            <span>Cluster</span>
            <select value={clusterId} onChange={(event) => setClusterId(event.target.value)}>
              <option value="">Select cluster</option>
              {clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}
            </select>
          </label>
        </div>

        {!clusters.length ? <EmptyState title="No clusters configured" text="Add a Proxmox cluster before managing templates." /> : null}
        {!busy && clusterId && !templates.length ? <EmptyState title="No templates found" text="Use Sync from Proxmox to discover CT archives and prepared LXC templates." /> : null}

        <div className="template-card-grid-clean">
          {templates.map((item) => (
            <article key={item.id} className={`template-card-clean ${!item.present ? 'missing' : ''}`}>
              <div className="template-card-head-clean">
                <div>
                  <span className="template-source-clean">{item.storage || 'local'} · {item.volid}</span>
                  <h3>{item.displayName || item.name || item.volid}</h3>
                </div>
                <button
                  type="button"
                  className={`toggle-clean ${item.enabled ? 'active' : ''}`}
                  onClick={() => updateField(item.id, 'enabled', item.enabled ? 0 : 1)}
                  disabled={!item.present}
                  aria-label="Toggle self-service availability"
                ><span /></button>
              </div>

              <div className="template-badges-clean">
                <span className="pill pill-neutral">{item.sourceType === 'lxc-template' ? 'Prepared LXC template' : 'CT archive'}</span>
                {item.sourceType === 'lxc-template' ? <span className="pill pill-neutral">VMID {item.sourceVmid} · min {item.minDiskGb || 4} GB</span> : null}
                {!item.present ? <span className="status-badge danger">Missing in Proxmox</span> : null}
              </div>

              <div className="clean-form-grid compact two-up">
                <label className="span-full"><span>Display name</span><input value={item.displayName || ''} onChange={(event) => updateField(item.id, 'displayName', event.target.value)} /></label>
                <label><span>Operating system</span><input value={item.osFamily || ''} onChange={(event) => updateField(item.id, 'osFamily', event.target.value)} /></label>
                <label><span>Version</span><input value={item.osVersion || ''} onChange={(event) => updateField(item.id, 'osVersion', event.target.value)} /></label>
                <label className="span-full"><span>Description</span><textarea rows="3" value={item.description || ''} onChange={(event) => updateField(item.id, 'description', event.target.value)} /></label>
                <label className="span-full"><span>Additional tags</span><input value={item.tags || ''} onChange={(event) => updateField(item.id, 'tags', event.target.value)} placeholder="docker;customer" /></label>
              </div>

              <div className="form-actions left">
                <button type="button" className="btn-primary" onClick={() => save(item)} disabled={busy}>Save template</button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
