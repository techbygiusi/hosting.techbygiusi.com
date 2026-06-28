const jwt = require('jsonwebtoken');
const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../config/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

/**
 * Authentication middleware - verify JWT token
 */
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'No token provided',
        message: ERROR_MESSAGES.UNAUTHORIZED
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
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
    { expiresIn }
  );
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  generateToken
};
