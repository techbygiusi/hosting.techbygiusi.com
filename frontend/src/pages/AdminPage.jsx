import { useEffect, useMemo, useState } from 'react';
import { adminLogin, downloadAll, downloadImage, getImageBlob, getImages, setAuthToken } from '../services/api.js';

const TOKEN_KEY = 'picly-admin-token';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
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

function GalleryImage({ image, onOpen }) {
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
      </div>
    </article>
  );
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(Boolean(window.localStorage.getItem(TOKEN_KEY)));
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) setAuthToken(token);
  }, []);

  async function loadImages() {
    try {
      setLoading(true);
      setError('');
      const result = await getImages();
      setImages(result);
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
  }

  async function handleDownloadAll() {
    const blob = await downloadAll();
    saveBlob(blob, `picly-images-${new Date().toISOString().slice(0, 10)}.zip`);
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

      {error && <div className="notice danger">{error}</div>}
      {loading && <div className="app-loader inline"><span className="spinner" /> Lädt Galerie...</div>}

      {!loading && images.length === 0 && (
        <div className="empty-state card">
          <p className="eyebrow">Noch leer</p>
          <h2>Es wurden noch keine Bilder hochgeladen.</h2>
          <p>Sobald jemand über die Startseite Bilder hochlädt, erscheinen sie hier.</p>
        </div>
      )}

      <div className="gallery-grid">
        {images.map((image) => (
          <GalleryImage key={image.id} image={image} onOpen={setSelected} />
        ))}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="image-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setSelected(null)} aria-label="Schließen">×</button>
            {selected.url ? <img src={selected.url} alt={selected.originalName} /> : <div className="app-loader inline"><span className="spinner" /> Lade Bild...</div>}
            <div className="image-modal-footer">
              <strong>{selected.originalName}</strong>
              <span>{formatDate(selected.createdAt)} · {formatSize(selected.size)}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
