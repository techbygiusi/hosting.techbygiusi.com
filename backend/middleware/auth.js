const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../config/constants');

/**
 * JWT secret resolution (no hardcoded fallback):
 * 1. JWT_SECRET env - recommended for production
 * 2. Auto-generated secret persisted at data/.jwt-secret (chmod 600)
 */
function resolveJwtSecret() {
  const envSecret = String(process.env.JWT_SECRET || '').trim();
  if (envSecret) return envSecret;

  const dataDir = path.dirname(process.env.DB_PATH || path.join(__dirname, '../data/hosting.db'));
  const secretFile = path.join(dataDir, '.jwt-secret');

  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf8').trim();
      if (stored.length >= 32) return stored;
    }
  } catch (err) {
    console.error('Could not read JWT secret file:', err.message);
  }

  const generated = crypto.randomBytes(48).toString('hex');
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    console.log('✓ Generated new JWT secret at', secretFile);
  } catch (err) {
    console.error('Could not persist JWT secret - set JWT_SECRET env!', err.message);
  }
  return generated;
}

const JWT_SECRET = resolveJwtSecret();

/**
 * Authentication middleware - verify JWT token
 */
function authMiddleware(req, res, next) {
  try {
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'No token provided',
        message: ERROR_MESSAGES.UNAUTHORIZED
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.purpose) {
      // Purpose-bound tokens (e.g. password reset) are not session tokens
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Invalid token',
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid token',
      message: ERROR_MESSAGES.INVALID_TOKEN
    });
  }
}

/**
 * Admin-only middleware
 */
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Access denied',
        message: ERROR_MESSAGES.FORBIDDEN
      });
    }
    next();
  });
}

/**
 * Generate JWT token
 */
function generateToken(userId, email, role) {
  const expiresIn = process.env.JWT_EXPIRATION || '24h';
  return jwt.sign(
    { id: userId, email, role },
    JWT_SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
}

/**
 * Generate a short-lived, purpose-bound password reset token (1 hour).
 * Not usable as a session token: authMiddleware rejects purpose-tagged tokens.
 */
function generateResetToken(userId, email) {
  return jwt.sign(
    { id: userId, email, purpose: 'password-reset' },
    JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
}

/**
 * Verify a reset token. Throws on invalid/expired/wrong-purpose tokens.
 */
function verifyResetToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  if (decoded.purpose !== 'password-reset') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  generateToken,
  generateResetToken,
  verifyResetToken
};
