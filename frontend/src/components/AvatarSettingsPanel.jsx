import React, { useEffect, useRef, useState } from 'react';
import { userApi, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import { UploadIcon, TrashIcon, ImageIcon } from './Icons';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // reject absurd source files early
const OUTPUT_SIZE = 256;                  // square thumbnail edge in pixels
const OUTPUT_QUALITY = 0.86;

const TEXT = {
  en: {
    title: 'Profile picture',
    intro: 'Upload a profile picture for your account. It is stored now and ready to be used across the portal in a later UI update.',
    choose: 'Upload picture',
    replace: 'Replace picture',
    remove: 'Remove',
    hint: 'PNG, JPEG or WebP.',
    drop: 'Drop an image here or use the button',
    saving: 'Saving...',
    saved: 'Your profile picture was updated.',
    removed: 'Your profile picture was removed.',
    tooLarge: 'This file is too large. Please choose an image under 8 MB.',
    wrongType: 'Please choose a PNG, JPEG or WebP image.',
    readFailed: 'The image could not be read.',
    saveFailed: 'The profile picture could not be saved.'
  },
  de: {
    title: 'Profilbild',
    intro: 'Lade ein Profilbild für dein Konto hoch. Es wird jetzt gespeichert und kann in einem späteren UI-Update im Portal verwendet werden.',
    choose: 'Bild hochladen',
    replace: 'Bild ersetzen',
    remove: 'Entfernen',
    hint: 'PNG, JPEG oder WebP.',
    drop: 'Bild hierher ziehen oder Button verwenden',
    saving: 'Wird gespeichert...',
    saved: 'Dein Profilbild wurde aktualisiert.',
    removed: 'Dein Profilbild wurde entfernt.',
    tooLarge: 'Die Datei ist zu groß. Bitte wähle ein Bild unter 8 MB.',
    wrongType: 'Bitte wähle ein PNG-, JPEG- oder WebP-Bild.',
    readFailed: 'Das Bild konnte nicht gelesen werden.',
    saveFailed: 'Das Profilbild konnte nicht gespeichert werden.'
  }
};

/**
 * Downscale + centre-crop the picked file to a square PNG data URL. Doing this
 * in the browser keeps the upload in the low kilobytes and means the backend
 * never has to depend on an image processing library.
 */
function toSquareThumbnail(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode'));
      image.onload = () => {
        try {
          const edge = Math.min(image.width, image.height);
          const sourceX = (image.width - edge) / 2;
          const sourceY = (image.height - edge) / 2;

          const canvas = document.createElement('canvas');
          canvas.width = OUTPUT_SIZE;
          canvas.height = OUTPUT_SIZE;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, sourceX, sourceY, edge, edge, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

          // JPEG keeps photos small; PNG preserves logos with flat colour.
          const jpeg = canvas.toDataURL('image/jpeg', OUTPUT_QUALITY);
          const png = canvas.toDataURL('image/png');
          resolve(png.length < jpeg.length ? png : jpeg);
        } catch (_) {
          reject(new Error('decode'));
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AvatarSettingsPanel({ language = 'en' }) {
  const { user, applyUserPatch } = useAuth();
  const text = TEXT[language] || TEXT.en;
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(user?.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPreview(user?.avatarUrl || null);
  }, [user?.avatarUrl]);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setMessage('');

    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setError(text.wrongType);
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError(text.tooLarge);
      return;
    }

    try {
      setBusy(true);
      const dataUrl = await toSquareThumbnail(file);
      const response = await userApi.updateAvatar(dataUrl);
      const avatarUrl = response.data?.avatarUrl || dataUrl;
      setPreview(avatarUrl);
      applyUserPatch({ avatarUrl });
      setMessage(text.saved);
    } catch (uploadError) {
      if (uploadError?.message === 'read' || uploadError?.message === 'decode') {
        setError(text.readFailed);
      } else {
        setError(getErrorMessage(uploadError, text.saveFailed));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setError('');
    setMessage('');
    try {
      setBusy(true);
      await userApi.deleteAvatar();
      setPreview(null);
      applyUserPatch({ avatarUrl: null });
      setMessage(text.removed);
    } catch (removeError) {
      setError(getErrorMessage(removeError, text.saveFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-avatar-card">
      <div className="settings-section-header">
        <div>
          <h3>{text.title}</h3>
          <p>{text.intro}</p>
        </div>
      </div>

      <div
        className={`avatar-dropzone ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer?.files?.[0]);
        }}
      >
        <Avatar src={preview} name={user?.name} email={user?.email} size={96} className="avatar-dropzone-preview" />

        <div className="avatar-dropzone-body">
          <p className="avatar-dropzone-hint"><ImageIcon size={16} />{text.drop}</p>
          <div className="avatar-dropzone-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <UploadIcon size={17} />{busy ? text.saving : (preview ? text.replace : text.choose)}
            </button>
            {preview && (
              <button type="button" className="btn-secondary" onClick={removeAvatar} disabled={busy}>
                <TrashIcon size={17} />{text.remove}
              </button>
            )}
          </div>
          <small className="avatar-dropzone-note">{text.hint}</small>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="visually-hidden-input"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>

      {error && <div className="alert alert-danger settings-password-message">{error}</div>}
      {message && <div className="alert alert-success settings-password-message">{message}</div>}
    </div>
  );
}
