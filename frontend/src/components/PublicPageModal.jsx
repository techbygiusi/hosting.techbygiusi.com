import React, { useState } from 'react';
import Modal from './Modal';
import { userApi, getErrorMessage } from '../services/api';

export default function PublicPageModal({ resource, labels, onClose, onSaved }) {
  const existingUrl = resource?.publicUrl || resource?.webUrl || '';
  const [url, setUrl] = useState(existingUrl);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return labels.publicPageRequired;

    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        return labels.publicPageInvalid;
      }
    } catch (_) {
      return labels.publicPageInvalid;
    }

    return '';
  };

  const save = async (event) => {
    event.preventDefault();
    const normalized = String(url || '').trim();
    const validationError = validate(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setBusy(true);
      setError('');
      await userApi.updatePublicPage(resource.id, normalized);
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(getErrorMessage(err, labels.publicPageSaveFailed));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existingUrl || !window.confirm(labels.removePublicPageConfirm)) return;

    try {
      setBusy(true);
      setError('');
      await userApi.updatePublicPage(resource.id, '');
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(getErrorMessage(err, labels.publicPageRemoveFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existingUrl ? labels.editPublicPage : labels.addPublicPage}
      onClose={onClose}
      className="public-page-modal-card"
      disableBackdropClose={busy}
    >
      <form className="form-stack" onSubmit={save} noValidate>
        <p className="hint-text public-page-modal-hint">{labels.publicPageHelp}</p>
        {error && <div className="alert alert-danger">{error}</div>}
        <label className="form-group">
          <span>{labels.publicPageUrl}</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            autoFocus
            autoComplete="url"
            disabled={busy}
          />
        </label>
        <div className="form-actions public-page-form-actions">
          {existingUrl && (
            <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
              {labels.removePublicPage}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? labels.saving : labels.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
