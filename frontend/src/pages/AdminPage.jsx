import { useEffect, useMemo, useRef, useState } from 'react';
import { adminLogin, changeAdminPassword, deleteImage, downloadAll, downloadImage, getAdminStats, getBackupSettings, getImageBlob, getImages, saveBackupSettings, setAuthToken, syncBackupNow, testBackupSettings } from '../services/api.js';

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
        <h1>Galerie öffnen</h1>
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
    <div className="modal-backdrop password-backdrop">
      <form className="password-modal" onSubmit={handleSubmit}>
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


const emptyBackupForm = {
  enabled: false,
  mode: 'change',
  schedule: { hour: 3, minute: 0, weekday: 1 },
  smb: {
    server: '',
    share: '',
    remotePath: 'Picly',
    username: '',
    password: '',
    domain: '',
    smbVersion: 'SMB3'
  }
};

function normalizeBackupForm(config) {
  return {
    enabled: Boolean(config?.enabled),
    mode: config?.mode || 'change',
    schedule: {
      hour: Number(config?.schedule?.hour ?? 3),
      minute: Number(config?.schedule?.minute ?? 0),
      weekday: Number(config?.schedule?.weekday ?? 1)
    },
    smb: {
      server: config?.smb?.server || '',
      share: config?.smb?.share || '',
      remotePath: config?.smb?.remotePath || 'Picly',
      username: config?.smb?.username || '',
      password: '',
      domain: config?.smb?.domain || '',
      smbVersion: config?.smb?.smbVersion || 'SMB3',
      hasPassword: Boolean(config?.smb?.hasPassword)
    }
  };
}

function BackupDialog({ onClose, onSaved }) {
  const [form, setForm] = useState(emptyBackupForm);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadBackup() {
    try {
      setLoading(true);
      setError('');
      const data = await getBackupSettings();
      setForm(normalizeBackupForm(data.config));
      setLogs(data.logs || []);
      setStatus(data.status || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Backup-Konfiguration konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBackup();
  }, []);

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setMessage('');
    setError('');
  }

  function updateSchedule(field, value) {
    setForm(prev => ({ ...prev, schedule: { ...prev.schedule, [field]: Number(value) } }));
    setMessage('');
    setError('');
  }

  function updateSmb(field, value) {
    setForm(prev => ({ ...prev, smb: { ...prev.smb, [field]: value } }));
    setMessage('');
    setError('');
  }

  function buildPayload(forceEnabled = form.enabled) {
    return {
      enabled: forceEnabled,
      mode: form.mode,
      schedule: form.schedule,
      smb: {
        server: form.smb.server,
        share: form.smb.share,
        remotePath: form.smb.remotePath,
        username: form.smb.username,
        password: form.smb.password,
        domain: form.smb.domain,
        smbVersion: form.smb.smbVersion
      }
    };
  }

  async function handleSave(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const result = await saveBackupSettings(buildPayload());
      setForm(normalizeBackupForm(result.config));
      setMessage(result.message || 'Backup wurde gespeichert.');
      onSaved?.(result.message || 'Backup wurde gespeichert.');
      await loadBackup();
    } catch (err) {
      setError(err.response?.data?.message || 'Backup konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    try {
      setTesting(true);
      setError('');
      setMessage('');
      const result = await testBackupSettings(buildPayload(true));
      setMessage(result.message || 'SMB-Verbindung erfolgreich.');
    } catch (err) {
      setError(err.response?.data?.message || 'SMB-Test fehlgeschlagen.');
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncNow() {
    if (!form.enabled) {
      setError('Bitte Backups zuerst aktivieren.');
      setMessage('');
      return;
    }

    try {
      setSyncing(true);
      setError('');
      setMessage('');
      await saveBackupSettings(buildPayload());
      const result = await syncBackupNow();
      setMessage(result.message || 'Synchronisierung wurde gestartet.');
      await loadBackup();
    } catch (err) {
      setError(err.response?.data?.message || 'Synchronisierung fehlgeschlagen.');
    } finally {
      setSyncing(false);
    }
  }

  const passwordHint = form.smb.hasPassword ? 'Leer lassen, um das gespeicherte Kennwort zu behalten' : 'SMB-Kennwort';

  return (
    <div className="modal-backdrop backup-backdrop">
      <form className="password-modal backup-modal" onSubmit={handleSave}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Schließen">×</button>
        <div className="password-modal-head backup-modal-head">
          <p className="eyebrow">Admin</p>
          <h2>Backup</h2>
          <p>Mach ein Backup deiner Bilder an einem sicheren Ort. Neue Uploads und gelöschte Bilder werden automatisch mit dem SMB-Ziel abgeglichen.</p>
        </div>

        {loading ? (
          <div className="app-loader inline"><span className="spinner" /> Lädt Backup-Konfiguration...</div>
        ) : (
          <>
            <label className="switch-row">
              <span>
                <strong>Backups aktivieren</strong>
                <small>Wenn aktiv, werden Uploads in den SMB-Ordner gespiegelt.</small>
              </span>
              <input type="checkbox" checked={form.enabled} onChange={(event) => updateField('enabled', event.target.checked)} />
            </label>

            <div className="backup-grid two-cols">
              <label>
                SMB-Server
                <input value={form.smb.server} onChange={(event) => updateSmb('server', event.target.value)} placeholder="192.168.1.10 oder nas.local" />
              </label>
              <label>
                Share
                <input value={form.smb.share} onChange={(event) => updateSmb('share', event.target.value)} placeholder="Fotos-Backup" />
              </label>
            </div>

            <label>
              Remote-Pfad im Share
              <input value={form.smb.remotePath} onChange={(event) => updateSmb('remotePath', event.target.value)} placeholder="picly" />
            </label>

            <div className="backup-grid two-cols">
              <label>
                Benutzer
                <input value={form.smb.username} onChange={(event) => updateSmb('username', event.target.value)} autoComplete="username" placeholder="backup-user" />
              </label>
              <label>
                Kennwort
                <input type="password" value={form.smb.password} onChange={(event) => updateSmb('password', event.target.value)} autoComplete="new-password" placeholder={passwordHint} />
              </label>
            </div>

            <div className="backup-grid two-cols">
              <label>
                Domain / Workgroup optional
                <input value={form.smb.domain} onChange={(event) => updateSmb('domain', event.target.value)} placeholder="WORKGROUP" />
              </label>
              <label>
                SMB-Version
                <select value={form.smb.smbVersion} onChange={(event) => updateSmb('smbVersion', event.target.value)}>
                  <option value="SMB3">SMB3</option>
                  <option value="SMB2">SMB2</option>
                  <option value="NT1">NT1 / SMB1</option>
                </select>
              </label>
            </div>

            <div className="backup-section">
              <label>
                Synchronisierung
                <select value={form.mode} onChange={(event) => updateField('mode', event.target.value)}>
                  <option value="change">Bei Änderung sofort spiegeln</option>
                  <option value="hourly">Stündlich</option>
                  <option value="daily">Täglich</option>
                  <option value="weekly">Wöchentlich</option>
                </select>
              </label>
              {form.mode !== 'change' && form.mode !== 'hourly' && (
                <div className="backup-grid three-cols">
                  {form.mode === 'weekly' && (
                    <label>
                      Wochentag
                      <select value={form.schedule.weekday} onChange={(event) => updateSchedule('weekday', event.target.value)}>
                        <option value={1}>Montag</option>
                        <option value={2}>Dienstag</option>
                        <option value={3}>Mittwoch</option>
                        <option value={4}>Donnerstag</option>
                        <option value={5}>Freitag</option>
                        <option value={6}>Samstag</option>
                        <option value={0}>Sonntag</option>
                      </select>
                    </label>
                  )}
                  <label>
                    Stunde
                    <input type="number" min="0" max="23" value={form.schedule.hour} onChange={(event) => updateSchedule('hour', event.target.value)} />
                  </label>
                  <label>
                    Minute
                    <input type="number" min="0" max="59" value={form.schedule.minute} onChange={(event) => updateSchedule('minute', event.target.value)} />
                  </label>
                </div>
              )}
              <p className="backup-help">Im Modus „Bei Änderung“ wird nach Uploads oder Löschungen automatisch gespiegelt. Entfernte Picly-Bilder werden im SMB-Ziel ebenfalls entfernt.</p>
            </div>

            {status?.running && <div className="notice">Backup-Sync läuft gerade...</div>}
            {error && <div className="notice danger">{error}</div>}
            {message && <div className="notice success">{message}</div>}

            <div className="backup-actions">
              <button className="btn-outline" type="button" onClick={handleTest} disabled={testing || saving || syncing}>{testing ? 'Teste...' : 'Verbindung testen'}</button>
              <button className="btn-secondary" type="button" onClick={handleSyncNow} disabled={!form.enabled || testing || saving || syncing}>{syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}</button>
              <button className="btn-primary" type="submit" disabled={saving || testing || syncing}>{saving ? 'Speichere...' : 'Speichern'}</button>
            </div>

            <div className="backup-log">
              <strong>Letzte Backup-Läufe</strong>
              {logs.length === 0 ? (
                <p>Noch keine Backup-Läufe vorhanden.</p>
              ) : (
                <ul>
                  {logs.slice(0, 5).map((entry, index) => (
                    <li key={`${entry.time}-${index}`} className={entry.status === 'success' ? 'ok' : 'bad'}>
                      <span>{formatDate(entry.time)}</span>
                      <p>{entry.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function galleryCornerClass(index, total, columns) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeColumns = Math.max(1, Number(columns || 1));
  if (!safeTotal) return '';

  const firstRowEnd = Math.min(safeColumns - 1, safeTotal - 1);
  const lastRowStart = Math.floor((safeTotal - 1) / safeColumns) * safeColumns;
  const classes = [];

  if (index === 0) classes.push('gallery-corner-top-left');
  if (index === firstRowEnd) classes.push('gallery-corner-top-right');
  if (index === lastRowStart) classes.push('gallery-corner-bottom-left');
  if (index === safeTotal - 1) classes.push('gallery-corner-bottom-right');

  return classes.join(' ');
}

function GalleryImage({ image, index, onOpen, onDelete, deleting, onUrlLoaded, cornerClass = '' }) {
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

  async function handleDownload(event) {
    event.stopPropagation();
    const blob = await downloadImage(image.id);
    saveBlob(blob, image.originalName || `${image.id}.jpg`);
  }

  function handleDelete(event) {
    event.stopPropagation();
    onDelete(image);
  }

  return (
    <article className={`image-card image-tile ${cornerClass}`.trim()}>
      <button className="image-thumb" type="button" onClick={() => onOpen(index)} aria-label={`${image.originalName || 'Bild'} öffnen`}>
        {url ? <img src={url} alt={image.originalName || 'Upload'} /> : <span className="spinner" />}
      </button>
      <div className="image-tile-actions" aria-label="Bild-Aktionen">
        <button className="image-icon-btn" type="button" onClick={handleDownload} aria-label={`${image.originalName || 'Bild'} herunterladen`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button className="image-icon-btn image-icon-danger" type="button" onClick={handleDelete} disabled={deleting} aria-label={`${image.originalName || 'Bild'} löschen`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
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
  const [backupOpen, setBackupOpen] = useState(false);
  const [success, setSuccess] = useState('');
  const [galleryColumns, setGalleryColumns] = useState(1);
  const galleryRef = useRef(null);

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

  useEffect(() => {
    function updateGalleryColumns() {
      const grid = galleryRef.current;
      if (!grid) {
        setGalleryColumns(1);
        return;
      }

      const tiles = Array.from(grid.children).filter((node) => node.classList?.contains('image-card'));
      if (!tiles.length) {
        setGalleryColumns(1);
        return;
      }

      const firstRowTop = tiles[0].offsetTop;
      const columns = tiles.filter((node) => node.offsetTop === firstRowTop).length || 1;
      setGalleryColumns(columns);
    }

    const runUpdate = () => window.requestAnimationFrame(updateGalleryColumns);
    runUpdate();

    window.addEventListener('resize', runUpdate);

    let resizeObserver;
    if (window.ResizeObserver && galleryRef.current) {
      resizeObserver = new window.ResizeObserver(runUpdate);
      resizeObserver.observe(galleryRef.current);
    }

    return () => {
      window.removeEventListener('resize', runUpdate);
      resizeObserver?.disconnect();
    };
  }, [images.length]);

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
          <button className="btn-secondary admin-action-password" type="button" onClick={() => setPasswordOpen(true)}>Kennwort ändern</button>
          <button className="btn-secondary admin-action-backup" type="button" onClick={() => setBackupOpen(true)}>Backup</button>
          <button className="btn-secondary admin-action-refresh" type="button" onClick={loadImages} disabled={loading}>Aktualisieren</button>
          <button className="btn-primary admin-action-download" type="button" onClick={handleDownloadAll} disabled={!images.length} aria-label="Alle Bilder als ZIP herunterladen"><span className="zip-label-short">Alle als ZIP</span><span className="zip-label-long">Alle als ZIP herunterladen</span></button>
          <button className="btn-outline admin-action-logout" type="button" onClick={logout}>Abmelden</button>
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

      <div className="gallery-grid" ref={galleryRef}>
        {images.map((image, index) => (
          <GalleryImage
            key={image.id}
            image={image}
            index={index}
            onOpen={openViewer}
            onDelete={handleDeleteImage}
            deleting={deletingId === image.id}
            onUrlLoaded={(id, url) => setLoadedUrls(prev => ({ ...prev, [id]: url }))}
            cornerClass={galleryCornerClass(index, images.length, galleryColumns)}
          />
        ))}
      </div>

      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} onChanged={handlePasswordChanged} />}
      {backupOpen && <BackupDialog onClose={() => setBackupOpen(false)} onSaved={(message) => { setSuccess(message); window.setTimeout(() => setSuccess(''), 5000); }} />}

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
