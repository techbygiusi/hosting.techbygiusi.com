import { useEffect, useMemo, useRef, useState } from 'react';
import { adminLogin, changeAdminPassword, deleteImage, downloadAll, downloadImage, getAdminStats, getImageBlob, getImages, setAuthToken } from '../services/api.js';

const TOKEN_KEY = 'picly-admin-token';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function storageStatusText(item) {
  if (!item?.available) return item?.message || 'Speicherwerte nicht verfügbar.';
  return `${formatSize(item.availableBytes)} frei von ${formatSize(item.totalBytes)}`;
}

function StorageCard({ item }) {
  const usedPercent = item?.available ? Math.min(100, Math.max(0, Number(item.usedPercent || 0))) : 0;

  return (
    <article className="storage-card dashboard-card storage-card-wide">
      <div className="dashboard-card-head">
        <div>
          <p className="eyebrow">Speicher</p>
          <h3>{item?.label || 'Docker-Speicher'}</h3>
        </div>
        {item?.available && <strong>{usedPercent}%</strong>}
      </div>
      <span>{storageStatusText(item)}</span>
      {item?.available && (
        <>
          <div className="storage-bar" aria-label={`${item.label} Nutzung`}>
            <span style={{ width: `${usedPercent}%` }} />
          </div>
        </>
      )}
    </article>
  );
}

function AdminLogin({ onSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError('');
      const result = await adminLogin(username, password);
      window.localStorage.setItem(TOKEN_KEY, result.token);
      setAuthToken(result.token);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="center-stage">
      <form className="card login-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Hochzeitsalbum · Admin</p>
        <h1>Galerie öffnen</h1>
        <p>Hier liegen alle Fotos eurer Gäste gesammelt bereit.</p>
        <label>
          Benutzer
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="notice danger">{error}</div>}
        <button className="btn-primary full-width" type="submit" disabled={loading}>{loading ? 'Prüfe...' : 'Anmelden'}</button>
      </form>
    </section>
  );
}

function PasswordDialog({ onClose, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();

    if (newPassword !== repeatPassword) {
      setError('Die neuen Kennwörter stimmen nicht überein.');
      setSuccess('');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const result = await changeAdminPassword(currentPassword, newPassword);
      onChanged(result);
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setSuccess(result.message || 'Admin-Kennwort wurde geändert.');
    } catch (err) {
      setError(err.response?.data?.message || 'Kennwort konnte nicht geändert werden.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop password-backdrop" onClick={onClose}>
      <form className="password-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Schließen">×</button>
        <div className="password-modal-head">
          <p className="eyebrow">Admin</p>
          <h2>Kennwort ändern</h2>
        </div>
        <label>
          Aktuelles Kennwort
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <label>
          Neues Kennwort
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </label>
        <label>
          Neues Kennwort wiederholen
          <input type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="notice danger">{error}</div>}
        {success && <div className="notice success">{success}</div>}
        <div className="password-modal-actions">
          <button className="btn-outline" type="button" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Speichere...' : 'Speichern'}</button>
        </div>
      </form>
    </div>
  );
}

function GalleryImage({ image, index, onOpen, onDelete, deleting, onUrlLoaded }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    getImageBlob(image.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setUrl(objectUrl);
          onUrlLoaded(image.id, objectUrl);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id]);

  async function handleDownload() {
    const blob = await downloadImage(image.id);
    saveBlob(blob, image.originalName || `${image.id}.jpg`);
  }

  return (
    <article className="image-card">
      <button className="image-thumb" type="button" onClick={() => onOpen(index)}>
        {url ? <img src={url} alt={image.originalName} /> : <span className="spinner" />}
      </button>
      <div className="image-meta">
        <strong>{image.originalName}</strong>
        <span>{formatDate(image.createdAt)}</span>
        <span>{formatSize(image.size)}</span>
      </div>
      <div className="card-actions split-actions">
        <button className="btn-secondary" type="button" onClick={() => onOpen(index)}>Ansehen</button>
        <button className="btn-primary" type="button" onClick={handleDownload}>Download</button>
        <button className="btn-danger" type="button" onClick={() => onDelete(image)} disabled={deleting}>{deleting ? 'Lösche...' : 'Löschen'}</button>
      </div>
    </article>
  );
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(Boolean(window.localStorage.getItem(TOKEN_KEY)));
  const [images, setImages] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [deletingId, setDeletingId] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [success, setSuccess] = useState('');

  // Viewer: track loaded URLs per image id
  const [loadedUrls, setLoadedUrls] = useState({});

  const selected = selectedIndex !== null ? images[selectedIndex] : null;
  const selectedUrl = selected ? (loadedUrls[selected.id] || '') : '';

  function openViewer(index) { setSelectedIndex(index); }
  function closeViewer() { setSelectedIndex(null); }
  function prevImage(e) { e?.stopPropagation(); setSelectedIndex(i => Math.max(0, i - 1)); }
  function nextImage(e) { e?.stopPropagation(); setSelectedIndex(i => Math.min(images.length - 1, i + 1)); }

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;
    function onKey(e) {
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowLeft') setSelectedIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setSelectedIndex(i => Math.min(images.length - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIndex, images.length]);

  // Touch/swipe support
  const touchStartX = useRef(null);
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) dx < 0 ? nextImage() : prevImage();
    touchStartX.current = null;
  }

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) setAuthToken(token);
  }, []);

  async function loadImages() {
    try {
      setLoading(true);
      setError('');
      const [imageResult, statsResult] = await Promise.all([getImages(), getAdminStats()]);
      setImages(imageResult);
      setStats(statsResult);
    } catch (err) {
      if (err.response?.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
        setAuthenticated(false);
      } else {
        setError(err.response?.data?.message || 'Galerie konnte nicht geladen werden.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authenticated) loadImages();
  }, [authenticated]);

  const totalSize = useMemo(() => images.reduce((sum, image) => sum + Number(image.size || 0), 0), [images]);

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setAuthenticated(false);
    setImages([]);
    setStats(null);
  }

  async function handleDownloadAll() {
    const blob = await downloadAll();
    saveBlob(blob, `picly-images-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  async function handleDeleteImage(image) {
    if (!image || deletingId) return;
    const confirmed = window.confirm(`Bild wirklich löschen?\n\n${image.originalName || image.id}`);
    if (!confirmed) return;

    try {
      setDeletingId(image.id);
      setError('');
      await deleteImage(image.id);
      if (selected?.id === image.id) closeViewer();
      await loadImages();
    } catch (err) {
      setError(err.response?.data?.message || 'Bild konnte nicht gelöscht werden.');
    } finally {
      setDeletingId('');
    }
  }


  function handlePasswordChanged(result) {
    if (result?.token) {
      window.localStorage.setItem(TOKEN_KEY, result.token);
      setAuthToken(result.token);
    }
    setSuccess(result?.message || 'Admin-Kennwort wurde geändert.');
    window.setTimeout(() => setSuccess(''), 5000);
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <section className="admin-layout">
      <div className="admin-hero">
        <div>
          <h1>Alle Uploads</h1>
          <p>{images.length} Bilder · {formatSize(totalSize)}</p>
        </div>
        <div className="admin-actions">
          <button className="btn-secondary" type="button" onClick={() => setPasswordOpen(true)}>Kennwort ändern</button>
          <button className="btn-secondary" type="button" onClick={loadImages} disabled={loading}>Aktualisieren</button>
          <button className="btn-primary" type="button" onClick={handleDownloadAll} disabled={!images.length}>Alle als ZIP</button>
          <button className="btn-outline" type="button" onClick={logout}>Abmelden</button>
        </div>
      </div>

      {stats && (
        <div className="admin-dashboard" aria-label="Admin Status">
          <article className="dashboard-card">
            <p className="eyebrow">Galerie</p>
            <h3>{images.length}</h3>
            <span>{images.length === 1 ? 'Bild gespeichert' : 'Bilder gespeichert'} · {formatSize(totalSize)}</span>
          </article>
          <article className="dashboard-card">
            <p className="eyebrow">Upload-Last</p>
            <h3>{stats.activeUploads || 0} aktiv</h3>
            <span>bis zu {stats.maxParallelUploads || 12} Upload-Vorgänge parallel erlaubt</span>
          </article>
          {(stats.storage || []).slice(0, 1).map((item) => (
            <StorageCard key={item.label} item={item} />
          ))}
        </div>
      )}

      {error && <div className="notice danger">{error}</div>}
      {success && <div className="notice success">{success}</div>}
      {loading && <div className="app-loader inline"><span className="spinner" /> Lädt Galerie und Speicherstatus...</div>}

      {!loading && images.length === 0 && (
        <div className="empty-state card">
          <p className="eyebrow">Noch leer</p>
          <h2>Noch keine Fotos hochgeladen.</h2>
          <p>Sobald eure Gäste über die Startseite Fotos teilen, erscheinen sie hier.</p>
        </div>
      )}

      <div className="gallery-grid">
        {images.map((image, index) => (
          <GalleryImage
            key={image.id}
            image={image}
            index={index}
            onOpen={openViewer}
            onDelete={handleDeleteImage}
            deleting={deletingId === image.id}
            onUrlLoaded={(id, url) => setLoadedUrls(prev => ({ ...prev, [id]: url }))}
          />
        ))}
      </div>

      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} onChanged={handlePasswordChanged} />}

      {selected && (
        <div
          className="viewer-backdrop"
          onClick={closeViewer}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Previous */}
          {selectedIndex > 0 && (
            <button className="viewer-nav viewer-prev" onClick={prevImage} aria-label="Vorheriges Bild">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}

          {/* Image */}
          <div className="viewer-img-wrap" onClick={e => e.stopPropagation()}>
            {selectedUrl
              ? <img className="viewer-img" src={selectedUrl} alt={selected.originalName} />
              : <div className="app-loader"><span className="spinner" /></div>
            }
          </div>

          {/* Next */}
          {selectedIndex < images.length - 1 && (
            <button className="viewer-nav viewer-next" onClick={nextImage} aria-label="Nächstes Bild">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          {/* Top bar */}
          <div className="viewer-topbar" onClick={e => e.stopPropagation()}>
            <span className="viewer-counter">{selectedIndex + 1} / {images.length}</span>
            <button className="viewer-close" onClick={closeViewer} aria-label="Schließen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Bottom info bar */}
          <div className="viewer-infobar" onClick={e => e.stopPropagation()}>
            <div className="viewer-info">
              <strong>{selected.originalName}</strong>
              <span>{formatDate(selected.createdAt)} · {formatSize(selected.size)}</span>
            </div>
            <div className="viewer-actions">
              <button className="viewer-btn" onClick={async () => { const blob = await downloadImage(selected.id); saveBlob(blob, selected.originalName || `${selected.id}.jpg`); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span className="viewer-btn-text">Download</span>
              </button>
              <button className="viewer-btn viewer-btn-danger" onClick={() => handleDeleteImage(selected)} disabled={deletingId === selected.id}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                <span className="viewer-btn-text">{deletingId === selected.id ? 'Lösche...' : 'Löschen'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
