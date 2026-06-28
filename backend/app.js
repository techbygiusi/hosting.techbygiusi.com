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
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin.json');
const ADMIN_CONFIG_BACKUP_FILE = path.join(DATA_DIR, 'admin.json.bak');
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ADMIN_PASSWORD_MIN_LENGTH = Number(process.env.ADMIN_PASSWORD_MIN_LENGTH || 8);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES || 30);
const MAX_PARALLEL_UPLOADS = Number(process.env.MAX_PARALLEL_UPLOADS || 12);
const MIN_FREE_SPACE_MB = Number(process.env.MIN_FREE_SPACE_MB || 250);
const UPLOAD_REQUEST_TIMEOUT_MS = Number(process.env.UPLOAD_REQUEST_TIMEOUT_MS || 600000);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MIN_FREE_SPACE_BYTES = MIN_FREE_SPACE_MB * 1024 * 1024;
const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let activeUploads = 0;
let metadataQueue = Promise.resolve();
let adminConfigQueue = Promise.resolve();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/bmp',
  'image/tiff',
  'image/x-adobe-dng'
]);

const allowedExtensions = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.webp', '.gif', '.avif', '.heic', '.heif', '.heics', '.heifs', '.bmp', '.tif', '.tiff', '.dng']);

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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt);

  return {
    algorithm: 'scrypt',
    salt,
    hash: derivedKey.toString('hex')
  };
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword || storedPassword.algorithm !== 'scrypt' || !storedPassword.salt || !storedPassword.hash) {
    return false;
  }

  const expected = Buffer.from(storedPassword.hash, 'hex');
  const actual = await scryptAsync(password, storedPassword.salt);

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

function normalizeAdminUsername(username) {
  const value = String(username || '').trim();
  return value || 'admin';
}

function normalizeAdminConfig(config) {
  if (!config || !config.password || !config.password.hash || !config.password.salt) {
    return null;
  }

  return {
    username: normalizeAdminUsername(config.username),
    password: {
      algorithm: String(config.password.algorithm || 'scrypt'),
      salt: String(config.password.salt),
      hash: String(config.password.hash)
    },
    createdAt: config.createdAt || new Date().toISOString(),
    updatedAt: config.updatedAt || config.createdAt || new Date().toISOString()
  };
}

async function createDefaultAdminConfig() {
  const now = new Date().toISOString();
  return {
    username: normalizeAdminUsername(DEFAULT_ADMIN_USERNAME),
    password: await hashPassword(DEFAULT_ADMIN_PASSWORD),
    createdAt: now,
    updatedAt: now
  };
}

async function readAdminConfigFile(file) {
  const raw = await fsp.readFile(file, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  const normalized = normalizeAdminConfig(parsed);

  if (!normalized) {
    throw createHttpError(500, 'Admin-Konfiguration ist ungueltig.');
  }

  return normalized;
}

async function writeAdminConfigUnlocked(config) {
  await ensureDataFiles();

  const tempFile = path.join(DATA_DIR, `admin.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`);
  const data = `${JSON.stringify(normalizeAdminConfig(config), null, 2)}\n`;

  try {
    await fsp.writeFile(tempFile, data, { encoding: 'utf8', mode: 0o600 });
    await fsp.copyFile(ADMIN_CONFIG_FILE, ADMIN_CONFIG_BACKUP_FILE).catch(() => {});
    await fsp.rename(tempFile, ADMIN_CONFIG_FILE);
    await fsp.chmod(ADMIN_CONFIG_FILE, 0o600).catch(() => {});
  } catch (error) {
    await fsp.rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function readAdminConfigUnlocked() {
  await ensureDataFiles();

  try {
    return await readAdminConfigFile(ADMIN_CONFIG_FILE);
  } catch (primaryError) {
    try {
      const backup = await readAdminConfigFile(ADMIN_CONFIG_BACKUP_FILE);
      console.warn('Picly admin.json was invalid, admin.json.bak was used instead.', primaryError.message);
      return backup;
    } catch {
      const config = await createDefaultAdminConfig();
      await writeAdminConfigUnlocked(config);
      return config;
    }
  }
}

async function readAdminConfig() {
  return readAdminConfigUnlocked();
}

function withAdminConfigLock(task) {
  const run = adminConfigQueue.then(task, task);
  adminConfigQueue = run.catch(() => {});
  return run;
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

async function removeImageMetadata(id) {
  return withMetadataLock(async () => {
    const existing = await readMetadataUnlocked();
    const image = existing.find((item) => item.id === id);

    if (!image) {
      return null;
    }

    const next = existing.filter((item) => item.id !== id);
    await writeMetadataUnlocked(next);
    return image;
  });
}

function resolveUploadPath(filename) {
  const filePath = path.resolve(path.join(UPLOAD_DIR, path.basename(filename)));
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);

  if (!filePath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
    return null;
  }

  return filePath;
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


async function getStorageInfo(label, targetPath) {
  await ensureDataFiles();

  if (typeof fsp.statfs !== 'function') {
    return {
      label,
      path: targetPath,
      available: false,
      message: 'Storage stats are not supported by this Node.js runtime.'
    };
  }

  const stat = await fsp.statfs(targetPath);
  const blockSize = Number(stat.bsize || 0);
  const totalBytes = Number(stat.blocks || 0) * blockSize;
  const freeBytes = Number(stat.bfree || 0) * blockSize;
  const availableBytes = Number(stat.bavail || 0) * blockSize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;

  return {
    label,
    path: targetPath,
    available: true,
    totalBytes,
    freeBytes,
    availableBytes,
    usedBytes,
    usedPercent
  };
}

async function getAdminStats() {
  const images = await readMetadata();
  const totalImageBytes = images.reduce((sum, item) => sum + Number(item.size || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    activeUploads,
    maxParallelUploads: MAX_PARALLEL_UPLOADS,
    uploadLimits: {
      maxUploadMb: MAX_UPLOAD_MB,
      maxUploadFiles: MAX_UPLOAD_FILES,
      minFreeSpaceMb: MIN_FREE_SPACE_MB
    },
    gallery: {
      totalImages: images.length,
      totalImageBytes
    },
    storage: [
      await getStorageInfo('Docker-Speicher', '/')
    ]
  };
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

function createToken(username) {
  return jwt.sign({ sub: username || DEFAULT_ADMIN_USERNAME, role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
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
    const mime = String(file.mimetype || '').toLowerCase();
    // Akzeptiere, wenn die Endung bekannt ist ODER der MIME-Type passt ODER
    // es sich generell um ein Bild handelt. So werden auch HEIC/HEIF von
    // iPhones (oft ohne sauberen MIME-Type) und Formate von Samsung, Xiaomi,
    // Oppo etc. zuverlässig angenommen.
    if (allowedExtensions.has(ext) || allowedMimeTypes.has(mime) || mime.startsWith('image/')) {
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

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const config = await readAdminConfig();
    const usernameMatches = String(username || '') === config.username;
    const passwordMatches = await verifyPassword(String(password || ''), config.password);

    if (usernameMatches && passwordMatches) {
      return res.json({ token: createToken(config.username), username: config.username });
    }

    return res.status(401).json({ message: 'Benutzername oder Passwort ist falsch.' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/password', requireAdmin, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Bitte aktuelles und neues Kennwort eintragen.' });
    }

    if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ message: `Das neue Kennwort muss mindestens ${ADMIN_PASSWORD_MIN_LENGTH} Zeichen haben.` });
    }

    const result = await withAdminConfigLock(async () => {
      const config = await readAdminConfigUnlocked();
      const passwordMatches = await verifyPassword(currentPassword, config.password);

      if (!passwordMatches) {
        throw createHttpError(401, 'Aktuelles Kennwort ist falsch.');
      }

      const nextConfig = {
        ...config,
        password: await hashPassword(newPassword),
        updatedAt: new Date().toISOString()
      };

      await writeAdminConfigUnlocked(nextConfig);

      return {
        username: nextConfig.username,
        token: createToken(nextConfig.username)
      };
    });

    return res.json({
      message: 'Admin-Kennwort wurde geändert.',
      username: result.username,
      token: result.token
    });
  } catch (error) {
    return next(error);
  }
});


app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const stats = await getAdminStats();
  res.json(stats);
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


app.delete('/api/admin/images/:id', requireAdmin, async (req, res) => {
  const image = await removeImageMetadata(req.params.id);

  if (!image) {
    return res.status(404).json({ message: 'Bild nicht gefunden.' });
  }

  const filePath = resolveUploadPath(image.filename);
  if (!filePath) {
    return res.status(400).json({ message: 'Ungültiger Dateipfad.' });
  }

  await fsp.rm(filePath, { force: true }).catch((error) => {
    console.warn(`Picly could not remove uploaded file ${image.filename}:`, error.message);
  });

  return res.json({ message: 'Bild wurde gelöscht.', image: publicImageInfo(image) });
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
  const statusCode = Number(err.statusCode || err.status || 500);
  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ message: err.message || 'Interner Serverfehler.' });
});

ensureDataFiles()
  .then(readAdminConfig)
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
