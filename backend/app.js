require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.BACKEND_PORT || 3001);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const TEMP_UPLOAD_DIR = path.join(DATA_DIR, 'tmp');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');
const METADATA_BACKUP_FILE = path.join(DATA_DIR, 'metadata.json.bak');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES || 30);
const MAX_PARALLEL_UPLOADS = Number(process.env.MAX_PARALLEL_UPLOADS || 12);
const MIN_FREE_SPACE_MB = Number(process.env.MIN_FREE_SPACE_MB || 250);
const UPLOAD_REQUEST_TIMEOUT_MS = Number(process.env.UPLOAD_REQUEST_TIMEOUT_MS || 600000);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MIN_FREE_SPACE_BYTES = MIN_FREE_SPACE_MB * 1024 * 1024;
const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let activeUploads = 0;
let metadataQueue = Promise.resolve();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif'
]);

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.heic', '.heif']);

function ensureSafeName(name) {
  return String(name || 'image')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'image';
}

function normalizeMetadata(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && item.id && item.filename)
    .map((item) => ({
      id: String(item.id),
      filename: path.basename(String(item.filename)),
      originalName: ensureSafeName(item.originalName || item.filename),
      mimeType: String(item.mimeType || 'application/octet-stream'),
      size: Number(item.size || 0),
      createdAt: item.createdAt || new Date().toISOString()
    }));
}

async function ensureDataFiles() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await fsp.mkdir(TEMP_UPLOAD_DIR, { recursive: true });

  try {
    await fsp.access(METADATA_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(METADATA_FILE, '[]\n', 'utf8');
  }
}

async function readJsonArray(file) {
  const raw = await fsp.readFile(file, 'utf8');
  return normalizeMetadata(JSON.parse(raw || '[]'));
}

async function readMetadataUnlocked() {
  await ensureDataFiles();

  try {
    return await readJsonArray(METADATA_FILE);
  } catch (primaryError) {
    try {
      const backup = await readJsonArray(METADATA_BACKUP_FILE);
      console.warn('Picly metadata.json was invalid, metadata.json.bak was used instead.', primaryError.message);
      return backup;
    } catch {
      console.error('Picly metadata could not be read. Starting with an empty gallery list.', primaryError);
      return [];
    }
  }
}

async function readMetadata() {
  return readMetadataUnlocked();
}

async function writeMetadataUnlocked(items) {
  await ensureDataFiles();

  const tempFile = path.join(DATA_DIR, `metadata.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`);
  const data = `${JSON.stringify(normalizeMetadata(items), null, 2)}\n`;

  try {
    await fsp.writeFile(tempFile, data, 'utf8');
    await fsp.copyFile(METADATA_FILE, METADATA_BACKUP_FILE).catch(() => {});
    await fsp.rename(tempFile, METADATA_FILE);
  } catch (error) {
    await fsp.rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

function withMetadataLock(task) {
  const run = metadataQueue.then(task, task);
  metadataQueue = run.catch(() => {});
  return run;
}

async function prependMetadata(created) {
  return withMetadataLock(async () => {
    const existing = await readMetadataUnlocked();
    const next = [...created, ...existing];
    await writeMetadataUnlocked(next);
    return next;
  });
}

async function cleanupFiles(files) {
  await Promise.all(
    (files || [])
      .filter(Boolean)
      .map((file) => {
        const filePath = typeof file === 'string' ? file : file.path || file.finalPath;
        return filePath ? fsp.rm(filePath, { force: true }).catch(() => {}) : Promise.resolve();
      })
  );
}

async function cleanupStaleTempUploads() {
  await ensureDataFiles();
  const entries = await fsp.readdir(TEMP_UPLOAD_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    const filePath = path.join(TEMP_UPLOAD_DIR, entry.name);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (stat && now - stat.mtimeMs > TMP_MAX_AGE_MS) {
      await fsp.rm(filePath, { force: true }).catch(() => {});
    }
  }));
}

async function hasEnoughFreeSpace(req) {
  if (typeof fsp.statfs !== 'function') return true;

  const stat = await fsp.statfs(DATA_DIR);
  const available = stat.bavail * stat.bsize;
  const contentLength = Number(req.headers['content-length'] || 0);
  const required = Math.max(contentLength + MIN_FREE_SPACE_BYTES, MIN_FREE_SPACE_BYTES);

  return available >= required;
}

function publicImageInfo(item) {
  return {
    id: item.id,
    originalName: item.originalName,
    size: item.size,
    mimeType: item.mimeType,
    createdAt: item.createdAt
  };
}

function createToken() {
  return jwt.sign({ sub: ADMIN_USERNAME, role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Nicht angemeldet.' });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }
}

function withUploadSlot(req, res, next) {
  if (activeUploads >= MAX_PARALLEL_UPLOADS) {
    return res.status(503).json({
      message: 'Picly ist gerade mit vielen Uploads beschäftigt. Bitte in einem Moment erneut versuchen.'
    });
  }

  activeUploads += 1;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      activeUploads = Math.max(0, activeUploads - 1);
    }
  };

  res.on('finish', release);
  res.on('close', release);
  return next();
}

async function requireUploadSpace(req, res, next) {
  try {
    const enoughSpace = await hasEnoughFreeSpace(req);
    if (!enoughSpace) {
      return res.status(507).json({
        message: `Nicht genug freier Speicher für den Upload. Bitte mindestens ${MIN_FREE_SPACE_MB} MB frei lassen.`
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = allowedExtensions.has(ext) ? ext : '.img';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: MAX_UPLOAD_FILES,
    fields: 0,
    parts: MAX_UPLOAD_FILES + 2
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowedMimeTypes.has(file.mimetype) && allowedExtensions.has(ext)) {
      return cb(null, true);
    }
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
});

app.set('trust proxy', true);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' }
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  await ensureDataFiles();
  await fsp.access(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
  res.json({
    ok: true,
    app: 'Picly',
    activeUploads,
    maxParallelUploads: MAX_PARALLEL_UPLOADS
  });
});

app.post('/api/upload', withUploadSlot, requireUploadSpace, (req, res, next) => {
  req.setTimeout(UPLOAD_REQUEST_TIMEOUT_MS);

  upload.array('images', MAX_UPLOAD_FILES)(req, res, async (err) => {
    if (err) {
      await cleanupFiles(req.files);

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: `Eine Datei ist größer als ${MAX_UPLOAD_MB} MB.` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ message: `Maximal ${MAX_UPLOAD_FILES} Dateien pro Upload.` });
      }
      if (err.code === 'LIMIT_PART_COUNT') {
        return res.status(413).json({ message: `Maximal ${MAX_UPLOAD_FILES} Dateien pro Upload.` });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ message: 'Nur Bilddateien mit passender Endung sind erlaubt.' });
      }
      return res.status(400).json({ message: err.message || 'Upload fehlgeschlagen.' });
    }

    const movedFiles = [];

    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ message: 'Bitte mindestens ein Bild auswählen.' });
      }

      const now = new Date().toISOString();
      const created = [];

      for (const file of files) {
        const finalPath = path.join(UPLOAD_DIR, file.filename);
        await fsp.rename(file.path, finalPath);
        movedFiles.push(finalPath);

        created.push({
          id: path.parse(file.filename).name,
          filename: file.filename,
          originalName: ensureSafeName(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          createdAt: now
        });
      }

      await prependMetadata(created);

      return res.status(201).json({
        message: created.length === 1 ? 'Bild wurde hochgeladen.' : `${created.length} Bilder wurden hochgeladen.`,
        images: created.map(publicImageInfo)
      });
    } catch (error) {
      await cleanupFiles(req.files);
      await cleanupFiles(movedFiles);
      return next(error);
    }
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (String(username || '') === ADMIN_USERNAME && String(password || '') === ADMIN_PASSWORD) {
    return res.json({ token: createToken(), username: ADMIN_USERNAME });
  }

  return res.status(401).json({ message: 'Benutzername oder Passwort ist falsch.' });
});

app.get('/api/admin/images', requireAdmin, async (_req, res) => {
  const images = await readMetadata();
  res.json({ images: images.map(publicImageInfo), total: images.length });
});

app.get('/api/admin/images/:id/view', requireAdmin, async (req, res) => {
  const images = await readMetadata();
  const image = images.find((item) => item.id === req.params.id);

  if (!image) {
    return res.status(404).json({ message: 'Bild nicht gefunden.' });
  }

  const filePath = path.join(UPLOAD_DIR, image.filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);

  if (!resolvedPath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
    return res.status(400).json({ message: 'Ungültiger Dateipfad.' });
  }

  const exists = await fsp.access(resolvedPath, fs.constants.R_OK).then(() => true).catch(() => false);
  if (!exists) {
    return res.status(404).json({ message: 'Bilddatei nicht gefunden.' });
  }

  res.type(image.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.sendFile(resolvedPath);
});

app.get('/api/admin/images/:id/download', requireAdmin, async (req, res) => {
  const images = await readMetadata();
  const image = images.find((item) => item.id === req.params.id);

  if (!image) {
    return res.status(404).json({ message: 'Bild nicht gefunden.' });
  }

  const filePath = path.join(UPLOAD_DIR, image.filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);

  if (!resolvedPath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
    return res.status(400).json({ message: 'Ungültiger Dateipfad.' });
  }

  const exists = await fsp.access(resolvedPath, fs.constants.R_OK).then(() => true).catch(() => false);
  if (!exists) {
    return res.status(404).json({ message: 'Bilddatei nicht gefunden.' });
  }

  const downloadName = ensureSafeName(image.originalName || image.filename);
  return res.download(resolvedPath, downloadName);
});

app.get('/api/admin/download-all', requireAdmin, async (req, res, next) => {
  try {
    const images = await readMetadata();
    const archiveName = `picly-images-${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    let aborted = false;

    req.on('aborted', () => {
      aborted = true;
      archive.destroy();
    });
    res.on('close', () => {
      if (!res.writableEnded) {
        aborted = true;
        archive.destroy();
      }
    });

    archive.on('warning', (warning) => {
      console.warn('Picly ZIP warning:', warning.message);
    });
    archive.on('error', next);
    archive.pipe(res);

    const seenNames = new Map();

    for (const image of images) {
      if (aborted) break;

      const filePath = path.resolve(path.join(UPLOAD_DIR, image.filename));
      const resolvedUploadDir = path.resolve(UPLOAD_DIR);
      if (!filePath.startsWith(`${resolvedUploadDir}${path.sep}`)) continue;

      const exists = await fsp.access(filePath, fs.constants.R_OK).then(() => true).catch(() => false);
      if (!exists) continue;

      const baseName = ensureSafeName(image.originalName || image.filename);
      const count = seenNames.get(baseName) || 0;
      seenNames.set(baseName, count + 1);
      const zipName = count === 0 ? baseName : `${path.parse(baseName).name}-${count}${path.extname(baseName)}`;
      archive.file(filePath, { name: zipName });
    }

    if (!aborted) {
      await archive.finalize();
    }
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ message: err.message || 'Interner Serverfehler.' });
});

ensureDataFiles()
  .then(cleanupStaleTempUploads)
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Picly backend listening on port ${PORT}`);
    });
    server.requestTimeout = UPLOAD_REQUEST_TIMEOUT_MS;
    server.headersTimeout = UPLOAD_REQUEST_TIMEOUT_MS + 5000;
  })
  .catch((error) => {
    console.error('Picly could not initialise data directory:', error);
    process.exit(1);
  });
