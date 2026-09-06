import React, { useCallback, useEffect, useState } from 'react';
import { CopyIcon } from './Icons';
import { userApi, getErrorMessage } from '../services/api';
import { InlineNotice, SectionCard } from './UiBits';

const EMPTY_FORM = {
  id: null,
  label: '',
  username: '',
  secret: '',
  url: '',
  notes: '',
  purpose: 'general',
  useForSshConsole: false
};

const TEXT = {
  en: {
    title: 'Access & SSH',
    website: 'Website',
    admin: 'Admin page',
    ssh: 'SSH',
    ip: 'Service IP',
    credentials: 'Credentials',
    noCredentials: 'No credentials configured.',
    username: 'Username',
    password: 'Password',
    reveal: 'Show password',
    hide: 'Hide password',
    copyUsername: 'Copy username',
    copyPassword: 'Copy password',
    copied: 'Copied to clipboard.',
    open: 'Open',
    provided: 'Provided by administrator',
    userProvided: 'Your credential',
    sshLogin: 'SSH login',
    readOnly: 'Administrator-provided access details are read-only. You can still view and copy the credentials.',
    loadFailed: 'Access credentials could not be loaded.',
    manageTitle: 'Manage credentials',
    addTitle: 'Add credentials',
    editTitle: 'Edit credentials',
    label: 'Label',
    url: 'URL (optional)',
    notes: 'Notes (optional)',
    passwordHint: 'Leave blank to keep the current password',
    sshChoice: 'Use for SSH console',
    sshChoiceHint: 'Use these credentials for the browser SSH console when applicable.',
    add: 'Add credentials',
    save: 'Save credentials',
    saving: 'Saving…',
    cancel: 'Cancel',
    edit: 'Edit',
    remove: 'Delete',
    saved: 'Credentials saved.',
    deleted: 'Credentials deleted.',
    saveFailed: 'Credentials could not be saved.',
    deleteFailed: 'Credentials could not be deleted.',
    deleteConfirm: 'Delete these credentials?',
    linksTitle: 'Service links',
    linksHint: 'Set the website and admin page shown for this self-created service.',
    websiteUrl: 'Website URL',
    adminUrl: 'Admin page URL',
    saveLinks: 'Save links',
    linksSaved: 'Service links saved.',
    linksRemoved: 'Service links removed.',
    linksFailed: 'Service links could not be saved.',
    removeWebsite: 'Remove website',
    removeAdmin: 'Remove admin page',
    websiteAutoHint: 'Leave blank to use the automatic Public Access website.'
  },
  de: {
    title: 'Zugriff & SSH',
    website: 'Webseite',
    admin: 'Admin-Seite',
    ssh: 'SSH',
    ip: 'Service-IP',
    credentials: 'Zugangsdaten',
    noCredentials: 'Keine Zugangsdaten hinterlegt.',
    username: 'Benutzername',
    password: 'Passwort',
    reveal: 'Passwort anzeigen',
    hide: 'Passwort ausblenden',
    copyUsername: 'Benutzername kopieren',
    copyPassword: 'Passwort kopieren',
    copied: 'In die Zwischenablage kopiert.',
    open: 'Öffnen',
    provided: 'Vom Administrator hinterlegt',
    userProvided: 'Eigene Zugangsdaten',
    sshLogin: 'SSH-Zugang',
    readOnly: 'Vom Administrator hinterlegte Zugriffsdaten sind schreibgeschützt. Du kannst sie aber ansehen und kopieren.',
    loadFailed: 'Zugangsdaten konnten nicht geladen werden.',
    manageTitle: 'Zugangsdaten verwalten',
    addTitle: 'Zugangsdaten hinzufügen',
    editTitle: 'Zugangsdaten bearbeiten',
    label: 'Bezeichnung',
    url: 'URL (optional)',
    notes: 'Notizen (optional)',
    passwordHint: 'Leer lassen, um das aktuelle Passwort beizubehalten',
    sshChoice: 'Für SSH-Konsole verwenden',
    sshChoiceHint: 'Diese Zugangsdaten für die Browser-SSH-Konsole verwenden, wenn möglich.',
    add: 'Zugangsdaten hinzufügen',
    save: 'Zugangsdaten speichern',
    saving: 'Speichert…',
    cancel: 'Abbrechen',
    edit: 'Bearbeiten',
    remove: 'Löschen',
    saved: 'Zugangsdaten gespeichert.',
    deleted: 'Zugangsdaten gelöscht.',
    saveFailed: 'Zugangsdaten konnten nicht gespeichert werden.',
    deleteFailed: 'Zugangsdaten konnten nicht gelöscht werden.',
    deleteConfirm: 'Diese Zugangsdaten wirklich löschen?',
    linksTitle: 'Service-Links',
    linksHint: 'Lege die Webseite und Admin-Seite fest, die bei diesem selbst erstellten Service angezeigt werden.',
    websiteUrl: 'Webseiten-URL',
    adminUrl: 'Admin-Seiten-URL',
    saveLinks: 'Links speichern',
    linksSaved: 'Service-Links gespeichert.',
    linksRemoved: 'Service-Link entfernt.',
    linksFailed: 'Service-Links konnten nicht gespeichert werden.',
    removeWebsite: 'Webseite entfernen',
    removeAdmin: 'Admin-Seite entfernen',
    websiteAutoHint: 'Leer lassen, um automatisch die Public-Access-Webseite zu verwenden.'
  }
};

function copyFallback(value) {
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

export default function ResourceAccessDetails({ resource, language = 'en', onResourceUpdate }) {
  const text = TEXT[language] || TEXT.en;
  const [credentials, setCredentials] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [linkSaving, setLinkSaving] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(resource.manualPublicUrl || '');
  const [adminPageUrl, setAdminPageUrl] = useState(resource.adminUrl || '');
  const [managementPage, setManagementPage] = useState({ username: '', notes: '', fromAdmin: false });

  const canManageCredentials = resource.canManageCredentials === true
    || (resource.source === 'self-service' && resource.adminManaged !== true);
  const adminManaged = resource.adminManaged === true || resource.source === 'admin';
  const canManageServiceLinks = resource.canManagePublicPage === true
    || (resource.source === 'self-service' && resource.adminManaged !== true);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await userApi.getCredentials(resource.id);
      setCredentials(response.data?.credentials || []);
    } catch (err) {
      setError(getErrorMessage(err, text.loadFailed));
    } finally {
      setLoading(false);
    }
  }, [resource.id, text.loadFailed]);

  useEffect(() => {
    setCredentials([]);
    setRevealed({});
    setError('');
    setNotice('');
    setForm(EMPTY_FORM);
    setWebsiteUrl(resource.manualPublicUrl || '');
    setAdminPageUrl(resource.adminUrl || '');
    setManagementPage({ username: '', notes: '', fromAdmin: false });
    loadCredentials();
    if (canManageServiceLinks) {
      userApi.getManagementPage(resource.id)
        .then((response) => {
          const page = response.data?.managementPage || {};
          setManagementPage({ username: page.username || '', notes: page.notes || '', fromAdmin: !!page.fromAdmin });
          if (page.url) setAdminPageUrl(page.url);
        })
        .catch(() => {});
    }
  }, [resource.id, resource.manualPublicUrl, resource.publicUrl, resource.webUrl, resource.adminUrl, canManageServiceLinks, loadCredentials]);

  const copyText = async (value) => {
    const safe = String(value || '');
    if (!safe) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(safe);
      else copyFallback(safe);
      setNotice(text.copied);
    } catch (_) {
      copyFallback(safe);
      setNotice(text.copied);
    }
  };

  const getSecret = async (credential) => {
    if (Object.prototype.hasOwnProperty.call(revealed, credential.id)) return revealed[credential.id];
    const response = await userApi.revealCredential(resource.id, credential.id);
    const secret = response.data?.secret || '';
    setRevealed((current) => ({ ...current, [credential.id]: secret }));
    return secret;
  };

  const toggleSecret = async (credential) => {
    if (Object.prototype.hasOwnProperty.call(revealed, credential.id)) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      return;
    }

    setError('');
    try {
      await getSecret(credential);
    } catch (err) {
      setError(getErrorMessage(err, text.loadFailed));
    }
  };

  const copySecret = async (credential) => {
    setError('');
    try {
      const secret = await getSecret(credential);
      await copyText(secret);
    } catch (err) {
      setError(getErrorMessage(err, text.loadFailed));
    }
  };

  const editCredential = (credential) => {
    if (!credential.canManage) return;
    setForm({
      id: credential.id,
      label: credential.label || '',
      username: credential.username || '',
      secret: '',
      url: credential.url || '',
      notes: credential.notes || '',
      purpose: credential.purpose || 'general',
      useForSshConsole: !!credential.useForSshConsole
    });
    setError('');
    setNotice('');
  };

  const resetForm = () => setForm(EMPTY_FORM);

  const saveCredential = async (event) => {
    event.preventDefault();
    if (!canManageCredentials) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        label: form.label,
        username: form.username,
        url: form.url,
        notes: form.notes,
        purpose: form.purpose,
        useForSshConsole: !!form.useForSshConsole
      };
      if (form.secret !== '') payload.secret = form.secret;
      if (form.id) await userApi.updateCredential(resource.id, form.id, payload);
      else await userApi.createCredential(resource.id, payload);
      resetForm();
      setRevealed({});
      await loadCredentials();
      setNotice(text.saved);
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  const deleteCredential = async (credential) => {
    if (!credential.canManage || !window.confirm(text.deleteConfirm)) return;
    setError('');
    setNotice('');
    try {
      await userApi.deleteCredential(resource.id, credential.id);
      if (String(form.id) === String(credential.id)) resetForm();
      setRevealed((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      await loadCredentials();
      setNotice(text.deleted);
    } catch (err) {
      setError(getErrorMessage(err, text.deleteFailed));
    }
  };

  const refreshResource = async () => {
    try {
      const response = await userApi.getResourceDetails(resource.id);
      const nextResource = response.data?.resource;
      if (nextResource) onResourceUpdate?.(nextResource);
    } catch (_) {
      // The links are already saved; a later dashboard refresh will reconcile the resource.
    }
  };

  const saveServiceLinks = async (event) => {
    event.preventDefault();
    if (!canManageServiceLinks) return;
    setLinkSaving(true);
    setError('');
    setNotice('');
    try {
      const cleanWebsite = String(websiteUrl || '').trim();
      const cleanAdmin = String(adminPageUrl || '').trim();
      if (cleanWebsite) await userApi.saveManualPublicPage(resource.id, cleanWebsite);
      else await userApi.removeManualPublicPage(resource.id).catch((err) => {
        if (err.response?.status !== 404) throw err;
      });
      if (!managementPage.fromAdmin) {
        if (cleanAdmin) {
          await userApi.saveManagementPage(resource.id, {
            url: cleanAdmin,
            username: managementPage.username || '',
            notes: managementPage.notes || ''
          });
        } else {
          await userApi.removeManagementPage(resource.id).catch((err) => {
            if (err.response?.status !== 404) throw err;
          });
        }
      }
      await refreshResource();
      setNotice(text.linksSaved);
    } catch (err) {
      setError(getErrorMessage(err, text.linksFailed));
    } finally {
      setLinkSaving(false);
    }
  };

  const removeWebsiteLink = async () => {
    if (!canManageServiceLinks) return;
    setLinkSaving(true);
    setError('');
    setNotice('');
    try {
      await userApi.removeManualPublicPage(resource.id);
      setWebsiteUrl('');
      await refreshResource();
      setNotice(text.linksRemoved);
    } catch (err) {
      setError(getErrorMessage(err, text.linksFailed));
    } finally {
      setLinkSaving(false);
    }
  };

  const removeAdminLink = async () => {
    if (!canManageServiceLinks || managementPage.fromAdmin) return;
    setLinkSaving(true);
    setError('');
    setNotice('');
    try {
      await userApi.removeManagementPage(resource.id);
      setAdminPageUrl('');
      await refreshResource();
      setNotice(text.linksRemoved);
    } catch (err) {
      setError(getErrorMessage(err, text.linksFailed));
    } finally {
      setLinkSaving(false);
    }
  };

  const serviceIp = resource.manualIp || resource.primaryIp || resource.detectedIp || resource.ip || '';
  const publicUrl = canManageServiceLinks ? (websiteUrl || resource.publicUrl || resource.webUrl || '') : (resource.publicUrl || resource.webUrl || '');
  const adminUrl = canManageServiceLinks ? (adminPageUrl || resource.adminUrl || '') : (resource.adminUrl || '');

  return (
    <SectionCard title={text.title}>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {adminManaged && !canManageCredentials ? <div className="resource-access-readonly-note">{text.readOnly}</div> : null}

      <div className="resource-access-summary-grid">
        <div className="resource-access-summary-item">
          <span>{text.website}</span>
          {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer">{text.open} ↗</a> : <strong>—</strong>}
        </div>
        <div className="resource-access-summary-item">
          <span>{text.admin}</span>
          {adminUrl ? <a href={adminUrl} target="_blank" rel="noreferrer">{text.open} ↗</a> : <strong>—</strong>}
        </div>
        <div className="resource-access-summary-item">
          <span>{text.ip}</span>
          <strong>{serviceIp || '—'}</strong>
        </div>
        <div className="resource-access-summary-item">
          <span>{text.ssh}</span>
          <strong>{serviceIp ? `${serviceIp}:${resource.sshPort || 22}` : '—'}</strong>
        </div>
      </div>

      {canManageServiceLinks ? (
        <form className="resource-service-links-editor" onSubmit={saveServiceLinks}>
          <div className="resource-service-links-head">
            <div><strong>{text.linksTitle}</strong><span>{text.linksHint}</span></div>
          </div>
          <div className="resource-service-links-grid">
            <label>
              <span>{text.websiteUrl}</span>
              <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://" />
              <small>{text.websiteAutoHint}</small>
              {websiteUrl ? <button type="button" className="resource-link-remove" onClick={removeWebsiteLink} disabled={linkSaving}>{text.removeWebsite}</button> : null}
            </label>
            <label>
              <span>{text.adminUrl}</span>
              <input type="url" value={adminPageUrl} onChange={(event) => setAdminPageUrl(event.target.value)} placeholder="https://" disabled={managementPage.fromAdmin} />
              {adminPageUrl && !managementPage.fromAdmin ? <button type="button" className="resource-link-remove" onClick={removeAdminLink} disabled={linkSaving}>{text.removeAdmin}</button> : null}
            </label>
          </div>
          {managementPage.fromAdmin ? <div className="resource-access-readonly-note">{text.readOnly}</div> : null}
          <div className="resource-service-links-actions">
            <button type="submit" className="btn-primary" disabled={linkSaving}>{linkSaving ? text.saving : text.saveLinks}</button>
          </div>
        </form>
      ) : null}

      <div className="resource-access-credentials-head"><strong>{text.credentials}</strong></div>
      <div className="resource-access-credential-list">
        {loading ? <span className="muted-table-value">…</span> : null}
        {!loading && !credentials.length ? <span className="muted-table-value">{text.noCredentials}</span> : null}
        {credentials.map((credential) => {
          const secretVisible = Object.prototype.hasOwnProperty.call(revealed, credential.id);
          return (
            <article className="resource-access-credential" key={credential.id}>
              <div className="resource-access-credential-head">
                <div>
                  <strong>{credential.label}</strong>
                  <span>{credential.fromAdmin ? text.provided : text.userProvided}</span>
                </div>
                {credential.useForSshConsole ? <span className="status-badge success">{text.sshLogin}</span> : null}
              </div>
              <div className="resource-access-credential-grid">
                <div><span>{text.username}</span><strong>{credential.username || '—'}</strong></div>
                <div><span>{text.password}</span><code>{secretVisible ? (revealed[credential.id] || '—') : '••••••••'}</code></div>
              </div>
              {credential.url ? <a className="resource-access-credential-url" href={credential.url} target="_blank" rel="noreferrer">{credential.url}</a> : null}
              {credential.notes ? <p>{credential.notes}</p> : null}
              <div className="resource-access-credential-actions">
                <button type="button" className="btn-secondary btn-small" onClick={() => toggleSecret(credential)}>{secretVisible ? text.hide : text.reveal}</button>
                {credential.username ? <button type="button" className="btn-secondary btn-small" onClick={() => copyText(credential.username)}><CopyIcon size={14} />{text.copyUsername}</button> : null}
                <button type="button" className="btn-secondary btn-small" onClick={() => copySecret(credential)}><CopyIcon size={14} />{text.copyPassword}</button>
                {credential.canManage ? <button type="button" className="btn-secondary btn-small" onClick={() => editCredential(credential)}>{text.edit}</button> : null}
                {credential.canManage ? <button type="button" className="btn-danger btn-small" onClick={() => deleteCredential(credential)}>{text.remove}</button> : null}
              </div>
            </article>
          );
        })}
      </div>

      {canManageCredentials ? (
        <form className="clean-form-grid compact resource-access-editor" onSubmit={saveCredential}>
          <div className="span-full resource-access-editor-head">
            <strong>{form.id ? text.editTitle : text.addTitle}</strong>
            {form.id ? <button type="button" className="btn-secondary btn-small" onClick={resetForm}>{text.cancel}</button> : null}
          </div>
          <label><span>{text.label}</span><input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} required /></label>
          <label><span>{text.username}</span><input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} autoComplete="off" /></label>
          <label><span>{text.password}</span><input type="password" value={form.secret} onChange={(event) => setForm((current) => ({ ...current, secret: event.target.value }))} placeholder={form.id ? text.passwordHint : ''} autoComplete="new-password" /></label>
          <label><span>{text.url}</span><input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://" /></label>
          <label className="span-full"><span>{text.notes}</span><textarea rows="3" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          {form.purpose !== 'management' ? (
            <label className="span-full admin-resource-ssh-choice">
              <input type="checkbox" checked={!!form.useForSshConsole} onChange={(event) => setForm((current) => ({ ...current, useForSshConsole: event.target.checked }))} />
              <span><strong>{text.sshChoice}</strong><small>{text.sshChoiceHint}</small></span>
            </label>
          ) : null}
          <div className="span-full form-actions left">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? text.saving : form.id ? text.save : text.add}</button>
          </div>
        </form>
      ) : null}
    </SectionCard>
  );
}
