const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../config/constants');
const { sendEmail } = require('../services/emailService');

/**
 * Check if setup is required
 */
router.get('/setup-required', async (req, res, next) => {
  try {
    const adminUser = await get('SELECT id FROM users WHERE role = ?', [ROLES.ADMIN]);
    res.json({ setupRequired: !adminUser });
  } catch (err) {
    next(err);
  }
});

/**
 * Initial setup - create admin user and configure settings
 */
router.post('/setup', async (req, res, next) => {
  try {
    const { adminName, adminEmail, adminPassword, smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;

    // Check if setup already done
    const existingAdmin = await get('SELECT id FROM users WHERE role = ?', [ROLES.ADMIN]);
    if (existingAdmin) {
      throw new AppError(ERROR_MESSAGES.SETUP_ALREADY_COMPLETED, HTTP_STATUS.CONFLICT);
    }

    // Validate input
    if (!adminName || !adminEmail || !adminPassword) {
      throw new AppError('Missing required fields', HTTP_STATUS.BAD_REQUEST);
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcryptjs.hash(adminPassword, saltRounds);

    // Create admin user
    const result = await run(
      `INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)`,
      [adminEmail, adminName, password_hash, ROLES.ADMIN]
    );

    // Save SMTP settings
    if (smtpHost && smtpPort) {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_host', smtpHost]);
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_port', smtpPort]);
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_user', smtpUser || '']);
      
      // Encrypt and save SMTP password
      const encrypted = encryptString(smtpPassword || '');
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
        ['smtp_password', encrypted]);
    }

    // Mark setup as complete
    await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
      ['setup_complete', 'true']);

    const token = generateToken(result.lastID, adminEmail, ROLES.ADMIN);

    res.status(HTTP_STATUS.CREATED).json({
      message: 'Setup completed successfully',
      token,
      user: {
        id: result.lastID,
        email: adminEmail,
        name: adminName,
        role: ROLES.ADMIN
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Login endpoint
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password required', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    const passwordMatch = await bcryptjs.compare(password, user.password_hash);

    if (!passwordMatch) {
      throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    const token = generateToken(user.id, user.email, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Verify token
 */
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

/**
 * Change password
 */
router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current and new password required', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (!user) {
      throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const passwordMatch = await bcryptjs.compare(currentPassword, user.password_hash);

    if (!passwordMatch) {
      throw new AppError('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED);
    }

    const saltRounds = 10;
    const newPasswordHash = await bcryptjs.hash(newPassword, saltRounds);

    await run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Forgot password - send reset email
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If email exists, password reset link has been sent' });
    }

    // Generate reset token
    const resetToken = generateToken(user.id, user.email, user.role);

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    await sendEmail(
      email,
      'Password Reset Request',
      `Click the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 24 hours.`
    );

    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    next(err);
  }
});

/**
 * Reset password with token
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw new AppError('Token and new password required', HTTP_STATUS.BAD_REQUEST);
    }

    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret-key');
    const user = await get('SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const saltRounds = 10;
    const newPasswordHash = await bcryptjs.hash(newPassword, saltRounds);

    await run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, user.id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Logout (client-side only, but endpoint for completeness)
 */
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Encryption utility
function encryptString(str) {
  // Simple encryption for now - in production use proper encryption
  return Buffer.from(str).toString('base64');
}

function decryptString(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

module.exports = router;
