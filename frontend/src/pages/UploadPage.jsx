import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadImages } from '../services/api.js';

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

function uploadText(progress) {
  if (progress >= 100) return 'Fertig gelandet. Die Bilder sind angekommen.';
  if (progress >= 75) return 'Fast da. Die letzten Pixel rutschen noch durch.';
  if (progress >= 45) return 'Halbzeit. Picly sortiert die Pixel ordentlich ein.';
  if (progress >= 15) return 'Upload läuft. Der kleine Pixel-Kurier ist unterwegs.';
  return 'Startklar. Picly hebt die Bilder gleich an.';
}

export default function UploadPage() {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  const showProgress = uploading || progress > 0;

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  function addFiles(fileList) {
    const selected = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    setError('');
    setMessage('');
    setProgress(0);
    setFiles((current) => [...current, ...selected]);
  }

  function removeFile(index) {
    if (uploading) return;
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleUpload() {
    if (!files.length) {
      setError('Bitte wähle zuerst mindestens ein Bild aus.');
      return;
    }

    try {
      setUploading(true);
      setProgress(1);
      setError('');
      setMessage('');
      const result = await uploadImages(files, (value) => setProgress(Math.max(1, Math.min(value, 100))));
      setProgress(100);
      setMessage(result.message || 'Upload abgeschlossen.');
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setProgress(0);
      setError(err.response?.data?.message || 'Der Upload konnte nicht abgeschlossen werden.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <p className="eyebrow">Simple Image Drop</p>
        <h1>Bilder hochladen. Schnell, sauber, mobil.</h1>
        <p>
          Picly nimmt Bilder direkt entgegen und legt sie sicher auf dem Server ab. Nutzer brauchen
          keine Zugangsdaten – einfach auswählen, Fortschritt sehen und fertig.
        </p>
        <div className="hero-pills" aria-label="Eigenschaften">
          <span>Ohne User-Login</span>
          <span>Mobile Friendly</span>
          <span>Animierter Upload</span>
        </div>
      </div>

      <div className="card upload-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Upload</p>
            <h2>Neue Bilder</h2>
          </div>
          <span className="soft-badge">PNG · JPG · WebP · GIF</span>
        </div>

        <button
          type="button"
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(event.dataTransfer.files);
          }}
          disabled={uploading}
        >
          <span className="drop-icon">+</span>
          <strong>Bilder auswählen oder hier ablegen</strong>
        </button>

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(event) => addFiles(event.target.files)}
        />

        {previews.length > 0 && (
          <div className="preview-list">
            {previews.map((preview, index) => (
              <div className="preview-item" key={`${preview.file.name}-${index}`}>
                <img src={preview.url} alt={preview.file.name} />
                <div>
                  <strong>{preview.file.name}</strong>
                  <span>{formatSize(preview.file.size)}</span>
                </div>
                <button type="button" className="icon-action" onClick={() => removeFile(index)} aria-label="Entfernen" disabled={uploading}>×</button>
              </div>
            ))}
          </div>
        )}

        {showProgress && (
          <div className={`upload-progress-card ${progress >= 100 ? 'done' : ''}`} aria-live="polite">
            <div className="upload-progress-head">
              <div className="pixel-courier" aria-hidden="true">
                <span className="courier-box">▣</span>
                <span className="courier-face">•‿•</span>
              </div>
              <div>
                <strong>{progress}% hochgeladen</strong>
                <span>{uploadText(progress)}</span>
              </div>
            </div>
            <div className="progress-wrap" role="progressbar" aria-label="Upload Fortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice danger">{error}</div>}

        <button className="btn-primary full-width" type="button" onClick={handleUpload} disabled={uploading || files.length === 0}>
          {uploading ? 'Pixel werden verschickt...' : 'Bilder hochladen'}
        </button>
      </div>
    </section>
  );
}
