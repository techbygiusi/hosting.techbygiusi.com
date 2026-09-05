import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

const emptyForm = {
  allowProvisioning: false,
  vmidMin: '',
  vmidMax: '',
  ipStart: '',
  ipEnd: '',
  ipPrefix: '24',
  gateway: '',
  bridge: 'vmbr0',
  storage: 'local',
  templateStorage: 'local',
  allowedTemplates: [],
  maxCores: '2',
  maxMemoryMb: '2048',
  maxDiskGb: '20'
};

export default function SelfServiceSettings({ clusters = [] }) {
  const [clusterId, setClusterId] = useState(String(clusters[0]?.id || ''));
  const [form, setForm] = useState(emptyForm);
  const [storages, setStorages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [caps, setCaps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!clusterId && clusters[0]) setClusterId(String(clusters[0].id));
  }, [clusters, clusterId]);

  useEffect(() => {
    if (!clusterId) {
      setForm(emptyForm);
      setStorages([]);
      setTemplates([]);
      setCaps(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    setNotice('');

    Promise.all([
      adminApi.getClusterProvisioning(clusterId),
      adminApi.getClusterCapabilities(clusterId).catch(() => ({ data: { capabilities: null } })),
      adminApi.getClusterStorages(clusterId).catch(() => ({ data: { storages: [] } }))
    ]).then(([provisioningRes, capsRes, storageRes]) => {
      if (!active) return;
      const p = provisioningRes.data?.provisioning || {};
      setForm({
        allowProvisioning: Boolean(p.allowProvisioning),
        vmidMin: p.vmidMin ?? '',
        vmidMax: p.vmidMax ?? '',
        ipStart: p.ipStart || '',
        ipEnd: p.ipEnd || '',
        ipPrefix: String(p.ipPrefix ?? 24),
        gateway: p.gateway || '',
        bridge: p.bridge || 'vmbr0',
        storage: p.storage || 'local',
        templateStorage: p.templateStorage || 'local',
        allowedTemplates: Array.isArray(p.allowedTemplates) ? p.allowedTemplates : [],
        maxCores: String(p.maxCores ?? 2),
        maxMemoryMb: String(p.maxMemoryMb ?? 2048),
        maxDiskGb: String(p.maxDiskGb ?? 20)
      });
      setCaps(capsRes.data?.capabilities || null);
      setStorages(storageRes.data?.storages || []);
    }).catch((err) => {
      if (active) setError(getErrorMessage(err, 'Self-service configuration could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [clusterId]);

  const selectedCluster = useMemo(() => clusters.find((item) => String(item.id) === String(clusterId)), [clusters, clusterId]);
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const loadTemplates = async () => {
    if (!clusterId) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getClusterTemplates(clusterId, form.templateStorage);
      const found = response.data?.templates || [];
      setTemplates(found);
      if (!form.allowedTemplates.length && found.length) {
        setField('allowedTemplates', found.map((item) => item.volid));
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Templates could not be loaded from Proxmox.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleTemplate = (volid) => {
    setForm((current) => {
      const next = new Set(current.allowedTemplates || []);
      if (next.has(volid)) next.delete(volid); else next.add(volid);
      return { ...current, allowedTemplates: [...next] };
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await adminApi.updateClusterProvisioning(clusterId, form);
      if (response.data?.activationWarning) {
        setNotice(`Saved, but self-service remains disabled: ${response.data.activationWarning}`);
        setField('allowProvisioning', false);
      } else {
        setNotice('Self-service configuration saved.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Self-service configuration could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      <SectionCard title="Self-Service provisioning" subtitle="LXC container creation limits and network allocation per cluster">
        <div className="clean-form-grid compact">
          <label>
            <span>Cluster</span>
            <select value={clusterId} onChange={(event) => setClusterId(event.target.value)}>
              <option value="">Select cluster</option>
              {clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}
            </select>
          </label>
        </div>

        {!clusters.length ? <EmptyState title="No clusters configured" text="Add a Proxmox cluster before enabling self-service." /> : null}
        {clusterId && caps && !caps.canProvision ? <InlineNotice tone="danger">The API token for {selectedCluster?.name || 'this cluster'} is missing the provisioning permissions required for self-service.</InlineNotice> : null}
        {clusterId && caps?.canProvision && !caps?.canManageFirewall ? <InlineNotice tone="danger">VM.Config.Network is missing. The required network isolation cannot be created safely.</InlineNotice> : null}
        {clusterId && caps?.canProvision && caps?.canManageFirewall && !caps?.canVerifyFirewall ? <InlineNotice tone="danger">Sys.Audit is missing. The datacenter firewall status cannot be verified safely.</InlineNotice> : null}

        {clusterId && !loading ? (
          <form className="clean-form-grid compact two-up self-service-form" onSubmit={save}>
            <label className="settings-toggle-clean span-full">
              <span><strong>Enable self-service</strong><small>Allow users assigned to this cluster to create approved LXC containers.</small></span>
              <button type="button" className={`toggle-clean ${form.allowProvisioning ? 'active' : ''}`} onClick={() => setField('allowProvisioning', !form.allowProvisioning)}><span /></button>
            </label>

            <label><span>VMID from</span><input type="number" min="100" value={form.vmidMin} onChange={(event) => setField('vmidMin', event.target.value)} /></label>
            <label><span>VMID to</span><input type="number" min="100" value={form.vmidMax} onChange={(event) => setField('vmidMax', event.target.value)} /></label>
            <label><span>IP from</span><input value={form.ipStart} onChange={(event) => setField('ipStart', event.target.value)} placeholder="10.0.10.100" /></label>
            <label><span>IP to</span><input value={form.ipEnd} onChange={(event) => setField('ipEnd', event.target.value)} placeholder="10.0.10.150" /></label>
            <label><span>Prefix (CIDR)</span><input type="number" min="8" max="32" value={form.ipPrefix} onChange={(event) => setField('ipPrefix', event.target.value)} /></label>
            <label><span>Gateway</span><input value={form.gateway} onChange={(event) => setField('gateway', event.target.value)} /></label>
            <label><span>Bridge</span><input value={form.bridge} onChange={(event) => setField('bridge', event.target.value)} /></label>
            <label>
              <span>Disk storage</span>
              <select value={form.storage} onChange={(event) => setField('storage', event.target.value)}>
                {storages.length ? storages.map((storage) => <option key={storage.storage} value={storage.storage}>{storage.storage}{storage.type ? ` · ${storage.type}` : ''}</option>) : <option value={form.storage}>{form.storage || 'local'}</option>}
              </select>
            </label>
            <label><span>Template storage</span><input value={form.templateStorage} onChange={(event) => setField('templateStorage', event.target.value)} /></label>
            <label><span>Maximum CPU cores</span><input type="number" min="1" value={form.maxCores} onChange={(event) => setField('maxCores', event.target.value)} /></label>
            <label><span>Maximum memory (MB)</span><input type="number" min="256" step="256" value={form.maxMemoryMb} onChange={(event) => setField('maxMemoryMb', event.target.value)} /></label>
            <label><span>Maximum disk (GB)</span><input type="number" min="4" max="64" value={form.maxDiskGb} onChange={(event) => setField('maxDiskGb', event.target.value)} /></label>

            <div className="span-full self-service-template-loader">
              <div>
                <strong>Allowed templates</strong>
                <p>Load the selected storage and choose which CT templates users may deploy.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={loadTemplates} disabled={loading}>Load templates</button>
            </div>

            {templates.length ? (
              <div className="span-full selectable-template-list">
                {templates.map((template) => {
                  const checked = (form.allowedTemplates || []).includes(template.volid);
                  return (
                    <button type="button" key={template.volid} className={`selectable-template ${checked ? 'selected' : ''}`} onClick={() => toggleTemplate(template.volid)}>
                      <span className="selectable-template-check">{checked ? '✓' : ''}</span>
                      <span><strong>{template.name || template.volid}</strong><small>{template.volid}</small></span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="form-actions left span-full">
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save self-service settings'}</button>
            </div>
          </form>
        ) : null}

        {clusterId && loading ? <div className="page-state-clean">Loading cluster configuration…</div> : null}
      </SectionCard>
    </div>
  );
}
