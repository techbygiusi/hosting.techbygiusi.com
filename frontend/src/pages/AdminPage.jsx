import { useEffect, useMemo, useState } from 'react';
import { adminLogin, deleteImage, downloadAll, downloadImage, getAdminStats, getImageBlob, getImages, setAuthToken } from '../services/api.js';

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
          <small>Container-Pfad: {item.path}</small>
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
        <p className="eyebrow">Picly Admin</p>
        <h1>Galerie öffnen</h1>
        <p>Hier liegen alle hochgeladenen Bilder gesammelt bereit.</p>
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

function GalleryImage({ image, onOpen, onDelete, deleting }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    getImageBlob(image.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
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

  async function handleDelete() {
    await onDelete(image);
  }

  return (
    <article className="image-card">
      <button className="image-thumb" type="button" onClick={() => onOpen({ ...image, url })}>
        {url ? <img src={url} alt={image.originalName} /> : <span className="spinner" />}
      </button>
      <div className="image-meta">
        <strong>{image.originalName}</strong>
        <span>{formatDate(image.createdAt)}</span>
        <span>{formatSize(image.size)}</span>
      </div>
      <div className="card-actions split-actions">
        <button className="btn-secondary" type="button" onClick={() => onOpen({ ...image, url })}>Ansehen</button>
        <button className="btn-primary" type="button" onClick={handleDownload}>Download</button>
        <button className="btn-danger" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? 'Lösche...' : 'Löschen'}</button>
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
  const [selected, setSelected] = useState(null);
  const [deletingId, setDeletingId] = useState('');

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
      if (selected?.id === image.id) setSelected(null);
      await loadImages();
    } catch (err) {
      setError(err.response?.data?.message || 'Bild konnte nicht gelöscht werden.');
    } finally {
      setDeletingId('');
    }
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <section className="admin-layout">
      <div className="admin-hero">
        <div>
          <p className="eyebrow">Admin Galerie</p>
          <h1>Alle Uploads</h1>
          <p>{images.length} Bilder · {formatSize(totalSize)}</p>
        </div>
        <div className="admin-actions">
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
            <span>bis zu {stats.maxParallelUploads || 24} Upload-Vorgänge parallel erlaubt</span>
          </article>
          {(stats.storage || []).slice(0, 1).map((item) => (
            <StorageCard key={item.label} item={item} />
          ))}
        </div>
      )}

      {error && <div className="notice danger">{error}</div>}
      {loading && <div className="app-loader inline"><span className="spinner" /> Lädt Galerie und Speicherstatus...</div>}

      {!loading && images.length === 0 && (
        <div className="empty-state card">
          <p className="eyebrow">Noch leer</p>
          <h2>Es wurden noch keine Bilder hochgeladen.</h2>
          <p>Sobald jemand über die Startseite Bilder hochlädt, erscheinen sie hier.</p>
        </div>
      )}

      <div className="gallery-grid">
        {images.map((image) => (
          <GalleryImage key={image.id} image={image} onOpen={setSelected} onDelete={handleDeleteImage} deleting={deletingId === image.id} />
        ))}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="image-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setSelected(null)} aria-label="Schließen">×</button>
            {selected.url ? <img src={selected.url} alt={selected.originalName} /> : <div className="app-loader inline"><span className="spinner" /> Lade Bild...</div>}
            <div className="image-modal-footer">
              <div>
                <strong>{selected.originalName}</strong>
                <span>{formatDate(selected.createdAt)} · {formatSize(selected.size)}</span>
              </div>
              <button className="btn-danger" type="button" onClick={() => handleDeleteImage(selected)} disabled={deletingId === selected.id}>
                {deletingId === selected.id ? 'Lösche...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
