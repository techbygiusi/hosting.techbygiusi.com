import React, { useEffect, useMemo, useRef, useState } from 'react';
import { userApi, getErrorMessage } from '../services/api';
import UserAvatar from './UserAvatar';

const COPY = {
  en: {
    title: 'Profile',
    intro: 'Manage the name and profile image shown in the portal header.',
    fullName: 'Display name',
    email: 'E-mail',
    role: 'Role',
    roleAdmin: 'Administrator',
    roleUser: 'User',
    changePhoto: 'Upload image',
    removePhoto: 'Remove image',
    save: 'Save profile',
    saving: 'Saving...',
    photoHint: 'PNG, JPG, GIF or WebP · max. 2 MB',
    updated: 'Profile updated successfully.',
    imageUpdated: 'Profile image updated successfully.',
    imageRemoved: 'Profile image removed.',
    updateFailed: 'The profile could not be updated.',
    imageFailed: 'The profile image could not be updated.',
    imageRemoveFailed: 'The profile image could not be removed.',
    imageTooLarge: 'The selected image is too large.',
    imageMissing: 'Please choose an image first.'
  },
  de: {
    title: 'Profil',
    intro: 'Verwalte den Namen und das Profilbild, das oben rechts im Portal angezeigt wird.',
    fullName: 'Anzeigename',
    email: 'E-Mail',
    role: 'Rolle',
    roleAdmin: 'Administrator',
    roleUser: 'Benutzer',
    changePhoto: 'Bild hochladen',
    removePhoto: 'Bild entfernen',
    save: 'Profil speichern',
    saving: 'Wird gespeichert...',
    photoHint: 'PNG, JPG, GIF oder WebP · max. 2 MB',
    updated: 'Profil erfolgreich gespeichert.',
    imageUpdated: 'Profilbild erfolgreich aktualisiert.',
    imageRemoved: 'Profilbild wurde entfernt.',
    updateFailed: 'Das Profil konnte nicht gespeichert werden.',
    imageFailed: 'Das Profilbild konnte nicht aktualisiert werden.',
    imageRemoveFailed: 'Das Profilbild konnte nicht entfernt werden.',
    imageTooLarge: 'Das gewählte Bild ist zu groß.',
    imageMissing: 'Bitte zuerst ein Bild auswählen.'
  }
};

const MAX_CLIENT_FILE_SIZE = 2 * 1024 * 1024;

export default function ProfileSettingsPanel({ language = 'en', currentUser, onUserUpdated }) {
  const text = COPY[language] || COPY.en;
  const [name, setName] = useState(currentUser?.name || '');
  const [workingUser, setWorkingUser] = useState(currentUser || null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    setName(currentUser?.name || '');
    setWorkingUser(currentUser || null);
  }, [currentUser?.id, currentUser?.name, currentUser?.avatarUrl, currentUser?.email, currentUser?.role]);

  const roleLabel = useMemo(() => (
    workingUser?.role === 'admin' ? text.roleAdmin : text.roleUser
  ), [workingUser?.role, text]);

  const applyUser = (nextUser) => {
    setWorkingUser(nextUser);
    setName(nextUser?.name || '');
    onUserUpdated?.(nextUser);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await userApi.updateProfile({ name });
      applyUser(response.data.user);
      setMessage(text.updated);
    } catch (err) {
      setError(getErrorMessage(err, text.updateFailed));
    } finally {
      setSaving(false);
    }
  };

  const triggerUpload = () => fileInputRef.current?.click();

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      setError(text.imageMissing);
      return;
    }
    if (file.size > MAX_CLIENT_FILE_SIZE) {
      setError(text.imageTooLarge);
      return;
    }
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await userApi.uploadProfileAvatar(file);
      applyUser(response.data.user);
      setMessage(text.imageUpdated);
    } catch (err) {
      setError(getErrorMessage(err, text.imageFailed));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await userApi.deleteProfileAvatar();
      applyUser(response.data.user);
      setMessage(text.imageRemoved);
    } catch (err) {
      setError(getErrorMessage(err, text.imageRemoveFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-section-card profile-settings-card" aria-labelledby="profile-settings-title">
      <div className="settings-section-heading">
        <h3 id="profile-settings-title">{text.title}</h3>
        <p>{text.intro}</p>
      </div>

      <div className="profile-settings-layout">
        <div className="profile-settings-preview">
          <UserAvatar user={workingUser} size={92} className="profile-settings-avatar" />
          <div className="profile-settings-meta">
            <strong>{workingUser?.name || workingUser?.email || 'User'}</strong>
            <span>{workingUser?.email || '-'}</span>
            <small>{roleLabel}</small>
          </div>
          <div className="profile-settings-avatar-actions">
            <button type="button" className="btn-secondary" onClick={triggerUpload} disabled={saving}>{text.changePhoto}</button>
            <button type="button" className="btn-outline" onClick={handleRemoveImage} disabled={saving || !workingUser?.avatarUrl}>{text.removePhoto}</button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={handleUpload} />
            <small className="hint-text">{text.photoHint}</small>
          </div>
        </div>

        <form className="profile-settings-form" onSubmit={submit}>
          <label className="form-group">
            <span>{text.fullName}</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={text.fullName} />
          </label>
          <label className="form-group">
            <span>{text.email}</span>
            <input type="email" value={workingUser?.email || ''} readOnly disabled />
          </label>
          <label className="form-group">
            <span>{text.role}</span>
            <input type="text" value={roleLabel} readOnly disabled />
          </label>
          {error ? <div className="alert alert-danger settings-password-message">{error}</div> : null}
          {message ? <div className="alert alert-success settings-password-message">{message}</div> : null}
          <div className="settings-password-actions profile-settings-actions">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? text.saving : text.save}</button>
          </div>
        </form>
      </div>
    </section>
  );
}
