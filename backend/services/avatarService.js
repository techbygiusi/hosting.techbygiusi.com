/**
 * Profile pictures (avatars).
 *
 * Avatars are kept as a base64 payload on the users row instead of on disk so
 * they survive container rebuilds together with the SQLite database and need no
 * extra volume. The browser downscales every picture to a square thumbnail
 * before uploading, so the stored payload stays in the low kilobytes.
 */

const { get, run } = require('../config/database');
const { HTTP_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_AVATAR_BYTES = 512 * 1024; // 512 KB of decoded image data

/**
 * Parse and validate a `data:image/...;base64,...` URL coming from the client.
 * Returns the normalised mime type and the raw base64 payload.
 */
function parseAvatarDataUrl(dataUrl) {
  const value = String(dataUrl || '').trim();
  if (!value) {
    throw new AppError('Profile picture is required', HTTP_STATUS.BAD_REQUEST);
  }

  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) {
    throw new AppError('Profile picture must be a base64 encoded image', HTTP_STATUS.BAD_REQUEST);
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new AppError('Profile picture must be a PNG, JPEG or WebP image', HTTP_STATUS.BAD_REQUEST);
  }

  const base64 = match[2].replace(/\s/g, '');
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (_) {
    throw new AppError('Profile picture could not be decoded', HTTP_STATUS.BAD_REQUEST);
  }

  if (!buffer.length) {
    throw new AppError('Profile picture could not be decoded', HTTP_STATUS.BAD_REQUEST);
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new AppError('Profile picture is too large (max. 512 KB)', HTTP_STATUS.BAD_REQUEST);
  }

  return { mimeType, base64: buffer.toString('base64') };
}

/** Build the data URL sent to the client, or null when no avatar is stored. */
function buildAvatarUrl(row) {
  if (!row || !row.avatar_data || !row.avatar_mime) return null;
  return `data:${row.avatar_mime};base64,${row.avatar_data}`;
}

async function getAvatarForUser(userId) {
  const row = await get('SELECT avatar_mime, avatar_data, avatar_updated_at FROM users WHERE id = ?', [userId]);
  return {
    avatarUrl: buildAvatarUrl(row),
    avatarUpdatedAt: row?.avatar_updated_at || null
  };
}

async function saveAvatarForUser(userId, dataUrl) {
  const { mimeType, base64 } = parseAvatarDataUrl(dataUrl);
  await run(
    `UPDATE users
        SET avatar_mime = ?, avatar_data = ?, avatar_updated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [mimeType, base64, userId]
  );
  return getAvatarForUser(userId);
}

async function deleteAvatarForUser(userId) {
  await run(
    `UPDATE users
        SET avatar_mime = NULL, avatar_data = NULL, avatar_updated_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [userId]
  );
  return { avatarUrl: null, avatarUpdatedAt: null };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_AVATAR_BYTES,
  buildAvatarUrl,
  parseAvatarDataUrl,
  getAvatarForUser,
  saveAvatarForUser,
  deleteAvatarForUser
};
