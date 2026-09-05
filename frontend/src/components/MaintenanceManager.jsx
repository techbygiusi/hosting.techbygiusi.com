import React, { useEffect, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function freshForm() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    message: '',
    severity: 'info',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    notifyUsers: true
  };
}

export default function MaintenanceManager() {
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getMaintenanceWindows();
      setWindows(response.data?.windows || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Maintenance windows could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => setEditor({ mode: 'create', data: freshForm() });
  const openEdit = (item) => setEditor({
    mode: 'edit',
    data: {
      ...item,
      startsAt: toLocalInput(item.starts_at || item.startsAt),
      endsAt: toLocalInput(item.ends_at || item.endsAt),
      notifyUsers: Boolean(item.notify_users ?? item.notifyUsers)
    }
  });

  const save = async (event) => {
    event.preventDefault();
    if (!editor) return;
    const data = editor.data;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        title: String(data.title || '').trim(),
        message: String(data.message || '').trim(),
        severity: data.severity || 'info',
        startsAt: new Date(data.startsAt).toISOString(),
        endsAt: new Date(data.endsAt).toISOString(),
        notifyUsers: Boolean(data.notifyUsers)
      };
      if (editor.mode === 'edit') await adminApi.updateMaintenanceWindow(data.id, payload);
      else await adminApi.createMaintenanceWindow(payload);
      setNotice(editor.mode === 'edit' ? 'Maintenance window updated.' : 'Maintenance window created.');
      setEditor(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Maintenance window could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete maintenance window “${item.title}”?`)) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.deleteMaintenanceWindow(item.id);
      if (editor?.data?.id === item.id) setEditor(null);
      setNotice('Maintenance window deleted.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Maintenance window could not be deleted.'));
    } finally {
      setBusy(false);
    }
  };

  if (editor) {
    return (
      <div className="settings-layout-clean maintenance-editor-replacement">
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        <div className="subpage-back-row">
          <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>← Back to maintenance</button>
        </div>
        <SectionCard title={editor.mode === 'edit' ? 'Edit maintenance' : 'Plan maintenance'}>
          <form className="clean-form-grid compact admin-editor-form" onSubmit={save}>
            <label><span>Title</span><input value={editor.data.title || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, title: event.target.value } }))} required /></label>
            <label className="span-full"><span>Description</span><textarea rows="5" value={editor.data.message || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, message: event.target.value } }))} /></label>
            <label><span>Severity</span><select value={editor.data.severity || 'info'} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, severity: event.target.value } }))}><option value="info">Information</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
            <label><span>Notify users</span><select value={editor.data.notifyUsers ? 'yes' : 'no'} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, notifyUsers: event.target.value === 'yes' } }))}><option value="yes">Yes</option><option value="no">No</option></select></label>
            <label><span>Starts</span><input type="datetime-local" value={editor.data.startsAt || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, startsAt: event.target.value } }))} required /></label>
            <label><span>Ends</span><input type="datetime-local" value={editor.data.endsAt || ''} onChange={(event) => setEditor((current) => ({ ...current, data: { ...current.data, endsAt: event.target.value } }))} required /></label>
            <div className="form-actions left span-full">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save maintenance'}</button>
            </div>
          </form>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="settings-layout-clean">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      <SectionCard action={<button type="button" className="btn-primary" onClick={openCreate}>Plan maintenance</button>}>
        {loading ? <div className="page-state-clean">Loading maintenance windows…</div> : null}
        {!loading && !windows.length ? <EmptyState title="No maintenance planned" text="Create a maintenance window when services or infrastructure will be affected." /> : null}
        <div className="maintenance-list-clean">
          {windows.map((item) => {
            const starts = new Date(item.starts_at || item.startsAt);
            const ends = new Date(item.ends_at || item.endsAt);
            const now = new Date();
            const state = now < starts ? 'Scheduled' : now > ends ? 'Finished' : 'Active';
            return (
              <article key={item.id} className="maintenance-card-clean">
                <div className="maintenance-card-main">
                  <div className="maintenance-title-row">
                    <h3>{item.title}</h3>
                    <span className={`status-badge ${state === 'Active' ? 'warning' : state === 'Finished' ? 'neutral' : 'success'}`}>{state}</span>
                  </div>
                  {item.message ? <p>{item.message}</p> : null}
                  <div className="maintenance-meta-clean">
                    <span>{starts.toLocaleString()} → {ends.toLocaleString()}</span>
                    <span>Severity: {item.severity || 'info'}</span>
                    <span>{Boolean(item.notify_users ?? item.notifyUsers) ? 'Users notified' : 'No mail notification'}</span>
                  </div>
                </div>
                <div className="maintenance-actions-clean">
                  <button type="button" className="btn-secondary btn-small" onClick={() => openEdit(item)}>Edit</button>
                  <button type="button" className="btn-danger btn-small" onClick={() => remove(item)} disabled={busy}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
