const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const AVATAR_DIR = process.env.AVATAR_DIR || path.join(__dirname, '../data/uploads/avatars');
const MAX_AVATAR_BYTES = Number(process.env.MAX_AVATAR_BYTES || 2 * 1024 * 1024);
const ALLOWED_MIME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

function ensureAvatarDirectory() {
  if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
  }
}

function avatarPublicPath(filename) {
  const raw = String(filename || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/uploads/')) return raw;
  return `/uploads/avatars/${raw}`;
}


function avatarAbsoluteUrl(req, filename) {
  const publicPath = avatarPublicPath(filename);
  if (!publicPath) return '';
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req?.headers?.host || '').trim();
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (req?.secure ? 'https' : 'http');
  return host ? `${proto}://${host}${publicPath}` : publicPath;
}

function makeAvatarFilename(mimeType) {
  const extension = ALLOWED_MIME_TYPES.get(mimeType);
  if (!extension) return '';
  return `${crypto.randomBytes(18).toString('hex')}.${extension}`;
}

function deleteAvatarFile(publicPath) {
  const normalized = String(publicPath || '').trim();
  if (!normalized) return;
  const filename = path.basename(normalized);
  const target = path.join(AVATAR_DIR, filename);
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (_) {
    // Best effort cleanup only.
  }
}

module.exports = {
  AVATAR_DIR,
  MAX_AVATAR_BYTES,
  ALLOWED_MIME_TYPES,
  ensureAvatarDirectory,
  avatarPublicPath,
  makeAvatarFilename,
  deleteAvatarFile,
  avatarAbsoluteUrl
};
