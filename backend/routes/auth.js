const express = require('express');
const bcryptjs = require('bcryptjs');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../config/constants');
const { sendEmail, testSmtpConnection, initializeEmailService, encryptString } = require('../services/emailService');
const { testConnection } = require('../services/proxmoxService');

const SETUP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'];

async function getSetupState() {
  const adminUser = await get('SELECT id, email, name, role FROM users WHERE role = ? ORDER BY id ASC LIMIT 1', [ROLES.ADMIN]);
  const proxmoxCluster = await get('SELECT id FROM proxmox_clusters ORDER BY id ASC LIMIT 1');
  const smtpRows = await all(`SELECT key, value FROM settings WHERE key IN (${SETUP_KEYS.map(() => '?').join(',')})`, SETUP_KEYS);

  const smtpSettings = smtpRows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  const adminConfigured = !!adminUser;
  const proxmoxConfigured = !!proxmoxCluster;
  const smtpConfigured = SETUP_KEYS.every(key => typeof smtpSettings[key] === 'string' && smtpSettings[key].trim() !== '');

  const missing = [];
  if (!adminConfigured) missing.push('admin');
  if (!proxmoxConfigured) missing.push('proxmox');
  if (!smtpConfigured) missing.push('smtp');

  return {
    setupRequired: missing.length > 0,
    setupComplete: missing.length === 0,
    adminConfigured,
    proxmoxConfigured,
    smtpConfigured,
    missing,
    adminUser: adminUser ? {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role
    } : null
  };
}

async function assertSetupOpen() {
  const state = await getSetupState();
  if (state.setupComplete) {
    throw new AppError(ERROR_MESSAGES.SETUP_ALREADY_COMPLETED, HTTP_STATUS.CONFLICT);
  }
  return state;
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/\/$/, '');
}

function validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword }) {
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    throw new AppError('SMTP host, port, user, and password are required', HTTP_STATUS.BAD_REQUEST);
  }
}

function validateProxmox({ proxmoxName, proxmoxUrl, proxmoxApiToken }) {
  if (!proxmoxName || !proxmoxUrl || !proxmoxApiToken) {
    throw new AppError('Proxmox name, URL, and API token are required', HTTP_STATUS.BAD_REQUEST);
  }
  if (!/^https?:\/\//i.test(proxmoxUrl)) {
    throw new AppError('Proxmox URL must start with http:// or https://', HTTP_STATUS.BAD_REQUEST);
  }
}

/**
 * Check if setup is required
 */
router.get('/setup-required', async (req, res, next) => {
  try {
    const state = await getSetupState();
    res.json(state);
  } catch (err) {
    next(err);
  }
});

/**
 * Public SMTP test during first setup. This is only available until setup is complete.
 */
router.post('/setup/test-smtp', async (req, res, next) => {
  try {
    await assertSetupOpen();
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;
    validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword });

    const result = await testSmtpConnection(smtpHost, smtpPort, smtpUser, smtpPassword);
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Public Proxmox test during first setup. This is only available until setup is complete.
 */
router.post('/setup/test-proxmox', async (req, res, next) => {
  try {
    await assertSetupOpen();
    const proxmoxName = req.body.proxmoxName || 'Proxmox';
    const proxmoxUrl = normalizeUrl(req.body.proxmoxUrl);
    const proxmoxApiToken = req.body.proxmoxApiToken;
    validateProxmox({ proxmoxName, proxmoxUrl, proxmoxApiToken });

    const result = await testConnection(proxmoxUrl, proxmoxApiToken);
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Initial setup - create admin user, configure Proxmox and SMTP.
 * Setup is complete only when all three parts are present.
 */
router.post('/setup', async (req, res, next) => {
  try {
    const state = await assertSetupOpen();
    const {
      adminName,
      adminEmail,
      adminPassword,
      proxmoxName,
      proxmoxUrl,
      proxmoxApiToken,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword
    } = req.body;

    let adminUser = state.adminUser;

    if (!state.adminConfigured) {
      if (!adminName || !adminEmail || !adminPassword) {
        throw new AppError('Admin name, email, and password are required', HTTP_STATUS.BAD_REQUEST);
      }
      if (adminPassword.length < 6) {
        throw new AppError('Admin password must be at least 6 characters', HTTP_STATUS.BAD_REQUEST);
      }

      const existingUser = await get('SELECT id FROM users WHERE email = ?', [adminEmail]);
      if (existingUser) {
        throw new AppError(ERROR_MESSAGES.USER_EXISTS, HTTP_STATUS.CONFLICT);
      }

      const passwordHash = await bcryptjs.hash(adminPassword, 10);
      const result = await run(
        'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
        [adminEmail, adminName, passwordHash, ROLES.ADMIN]
      );

      adminUser = {
        id: result.lastID,
        email: adminEmail,
        name: adminName,
        role: ROLES.ADMIN
      };
    }

    if (!state.proxmoxConfigured) {
      const normalizedProxmoxUrl = normalizeUrl(proxmoxUrl);
      validateProxmox({ proxmoxName, proxmoxUrl: normalizedProxmoxUrl, proxmoxApiToken });

      const proxmoxTest = await testConnection(normalizedProxmoxUrl, proxmoxApiToken);
      if (!proxmoxTest.success) {
        throw new AppError(`Proxmox test failed: ${proxmoxTest.message}`, HTTP_STATUS.BAD_REQUEST);
      }

      await run(
        'INSERT INTO proxmox_clusters (name, url, api_token) VALUES (?, ?, ?)',
        [proxmoxName.trim(), normalizedProxmoxUrl, proxmoxApiToken.trim()]
      );
    }

    if (!state.smtpConfigured) {
      validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword });

      const smtpTest = await testSmtpConnection(smtpHost.trim(), smtpPort, smtpUser.trim(), smtpPassword);
      if (!smtpTest.success) {
        throw new AppError(`SMTP test failed: ${smtpTest.message}`, HTTP_STATUS.BAD_REQUEST);
      }

      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_host', smtpHost.trim()]);
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_port', String(smtpPort).trim()]);
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_user', smtpUser.trim()]);
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_password', encryptString(smtpPassword)]);
      await initializeEmailService();
    }

    const finalState = await getSetupState();
    if (finalState.setupRequired) {
      throw new AppError(`Setup incomplete. Missing: ${finalState.missing.join(', ')}`, HTTP_STATUS.BAD_REQUEST);
    }

    await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['setup_complete', 'true']);

    const token = generateToken(adminUser.id, adminUser.email, adminUser.role);

    res.status(HTTP_STATUS.CREATED).json({
      message: 'Setup completed successfully',
      setupComplete: true,
      token,
      user: adminUser
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

    const setupState = await getSetupState();
    if (setupState.setupRequired) {
      throw new AppError(ERROR_MESSAGES.SETUP_REQUIRED, HTTP_STATUS.FORBIDDEN);
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
router.get('/verify', authMiddleware, async (req, res, next) => {
  try {
    const setupState = await getSetupState();
    res.json({ valid: true, user: req.user, setupRequired: setupState.setupRequired });
  } catch (err) {
    next(err);
  }
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

    const newPasswordHash = await bcryptjs.hash(newPassword, 10);

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
      return res.json({ message: 'If email exists, password reset link has been sent' });
    }

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

    const newPasswordHash = await bcryptjs.hash(newPassword, 10);

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

module.exports = router;
