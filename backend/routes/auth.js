const express = require('express');
const crypto = require('crypto');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { get, run, all } = require('../config/database');
const { generateToken, authMiddleware, generateResetToken, verifyResetToken } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../config/constants');
const { sendEmail, testSmtpConnection, initializeEmailService, encryptString } = require('../services/emailService');
const { testConnection } = require('../services/proxmoxService');
const { passwordResetTemplate } = require('../services/emailTemplates');
const { logAudit } = require('../services/auditService');
const { buildAvatarUrl } = require('../services/avatarService');
const { asString, asEmail, asEnum, assertPasswordPolicy } = require('../middleware/validate');
const { getPublicFrontendUrl } = require('../utils/publicUrl');

const SETUP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'];

async function getSetupState() {
  const adminUser = await get(
    'SELECT id, email, name, role, preferred_language FROM users WHERE role = ? ORDER BY id ASC LIMIT 1',
    [ROLES.ADMIN]
  );
  const proxmoxCluster = await get('SELECT id FROM proxmox_clusters ORDER BY id ASC LIMIT 1');
  const smtpRows = await all(
    `SELECT key, value FROM settings WHERE key IN (${SETUP_KEYS.map(() => '?').join(',')})`,
    SETUP_KEYS
  );

  const smtpSettings = smtpRows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  const adminConfigured = Boolean(adminUser);
  const proxmoxConfigured = Boolean(proxmoxCluster);
  const smtpConfigured = SETUP_KEYS.every(
    key => typeof smtpSettings[key] === 'string' && smtpSettings[key].trim() !== ''
  );

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
      role: adminUser.role,
      preferredLanguage: adminUser.preferred_language || 'en'
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
  return url.trim().replace(/\/+$/, '');
}

function validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword }) {
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    throw new AppError('SMTP host, port, user, and password are required', HTTP_STATUS.BAD_REQUEST);
  }

  const parsedPort = Number(smtpPort);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new AppError('SMTP port is invalid', HTTP_STATUS.BAD_REQUEST);
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

router.get('/setup-required', async (req, res, next) => {
  try {
    const state = await getSetupState();
    res.json(state);
  } catch (err) {
    next(err);
  }
});

router.post('/setup/test-smtp', async (req, res, next) => {
  try {
    await assertSetupOpen();
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = req.body;
    validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword });

    const result = await testSmtpConnection(
      smtpHost.trim(),
      String(smtpPort).trim(),
      smtpUser.trim(),
      smtpPassword
    );
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/setup/test-proxmox', async (req, res, next) => {
  try {
    await assertSetupOpen();
    const proxmoxName = req.body.proxmoxName || 'Proxmox';
    const proxmoxUrl = normalizeUrl(req.body.proxmoxUrl);
    const proxmoxApiToken = req.body.proxmoxApiToken;
    validateProxmox({ proxmoxName, proxmoxUrl, proxmoxApiToken });

    const result = await testConnection(proxmoxUrl, proxmoxApiToken.trim());
    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.BAD_REQUEST).json(result);
  } catch (err) {
    next(err);
  }
});

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
      smtpPassword,
      preferredLanguage
    } = req.body;

    let adminUser = state.adminUser;

    if (!state.adminConfigured) {
      const normalizedAdminEmail = asEmail(adminEmail, { field: 'Admin email' });
      const normalizedAdminName = asString(adminName, { field: 'Admin name', max: 120, required: true });
      const normalizedPassword = asString(adminPassword, { field: 'Admin password', max: 200, required: true });
      assertPasswordPolicy(normalizedPassword, 'Admin password');
      const setupLanguage = asEnum(preferredLanguage, ['en', 'de'], { fallback: 'en' });

      const existingUser = await get('SELECT id FROM users WHERE email = ?', [normalizedAdminEmail]);
      if (existingUser) {
        throw new AppError(ERROR_MESSAGES.USER_EXISTS, HTTP_STATUS.CONFLICT);
      }

      const passwordHash = await bcryptjs.hash(normalizedPassword, 12);
      const result = await run(
        'INSERT INTO users (email, name, password_hash, role, preferred_language) VALUES (?, ?, ?, ?, ?)',
        [normalizedAdminEmail, normalizedAdminName, passwordHash, ROLES.ADMIN, setupLanguage]
      );

      adminUser = {
        id: result.lastID,
        email: normalizedAdminEmail,
        name: normalizedAdminName,
        role: ROLES.ADMIN,
        preferredLanguage: setupLanguage
      };
    }

    if (!state.proxmoxConfigured) {
      const normalizedProxmoxUrl = normalizeUrl(proxmoxUrl);
      validateProxmox({ proxmoxName, proxmoxUrl: normalizedProxmoxUrl, proxmoxApiToken });

      const proxmoxTest = await testConnection(normalizedProxmoxUrl, proxmoxApiToken.trim());
      if (!proxmoxTest.success) {
        throw new AppError(`Proxmox test failed: ${proxmoxTest.message}`, HTTP_STATUS.BAD_REQUEST);
      }

      await run(
        'INSERT INTO proxmox_clusters (name, url, api_token) VALUES (?, ?, ?)',
        [proxmoxName.trim(), normalizedProxmoxUrl, encryptString(proxmoxApiToken.trim())]
      );
    }

    if (!state.smtpConfigured) {
      validateSmtp({ smtpHost, smtpPort, smtpUser, smtpPassword });

      const smtpTest = await testSmtpConnection(
        smtpHost.trim(),
        String(smtpPort).trim(),
        smtpUser.trim(),
        smtpPassword
      );
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

/*
 * Brute-force lockout: 5 failed attempts lock further tries for 15 minutes.
 *
 * Attempts are tracked per email *and* per source IP. Email-only tracking lets
 * anyone lock a known account out on purpose (a denial-of-service against that
 * user); IP-only tracking lets a distributed attacker spread attempts across
 * hosts. Requiring both narrows each of those.
 *
 * The map is swept on write and hard-capped, so a spray of random addresses
 * cannot grow it without bound - the previous version never removed entries.
 */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 10000;
const loginAttempts = new Map();

function clientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0];
  return String(first || req?.socket?.remoteAddress || '').trim() || 'unknown';
}

function loginKey(email, req) {
  return `${email}|${clientIp(req)}`;
}

function pruneLoginAttempts(now) {
  for (const [key, entry] of loginAttempts) {
    const expired = (entry.lockedUntil || 0) < now && (entry.seenAt || 0) < now - LOGIN_LOCK_MS;
    if (expired) loginAttempts.delete(key);
  }
  if (loginAttempts.size > LOGIN_ATTEMPT_LIMIT) {
    // Oldest-first eviction; Map preserves insertion order.
    const excess = loginAttempts.size - LOGIN_ATTEMPT_LIMIT;
    let removed = 0;
    for (const key of loginAttempts.keys()) {
      loginAttempts.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

function checkLoginLock(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    throw new AppError('Account temporarily locked. Try again later.', HTTP_STATUS.UNAUTHORIZED);
  }
}

function registerFailedLogin(key) {
  const now = Date.now();
  pruneLoginAttempts(now);
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: 0, seenAt: now };
  entry.count += 1;
  entry.seenAt = now;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function clearFailedLogins(key) {
  loginAttempts.delete(key);
}

/*
 * A bcrypt hash of a random value, compared against when no user matches.
 * Without it, an unknown email returns in ~1ms while a known one costs a full
 * bcrypt verification (~250ms) - a timing gap wide enough to enumerate valid
 * accounts. Doing the same work in both branches closes it.
 */
const DUMMY_PASSWORD_HASH = bcryptjs.hashSync(crypto.randomBytes(32).toString('hex'), 12);

router.post('/login', async (req, res, next) => {
  try {
    // Coerce at the edge: a body like {"email":{}} must fail as a clean 400,
    // never as a TypeError inside the handler.
    const normalizedEmail = asEmail(req.body?.email, { field: 'Email' });
    const password = asString(req.body?.password, { field: 'Password', max: 200, required: true });
    const preferredLanguage = asEnum(req.body?.preferredLanguage, ['en', 'de'], { fallback: null });

    const setupState = await getSetupState();
    if (setupState.setupRequired) {
      throw new AppError(ERROR_MESSAGES.SETUP_REQUIRED, HTTP_STATUS.FORBIDDEN);
    }

    const attemptKey = loginKey(normalizedEmail, req);
    checkLoginLock(attemptKey);

    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    // Always run a bcrypt comparison, even for an unknown account, so the
    // response time does not reveal whether the email exists.
    const passwordMatch = await bcryptjs.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatch) {
      registerFailedLogin(attemptKey);
      await logAudit(req, 'auth.login_failed', normalizedEmail, user ? 'wrong password' : 'unknown user');
      throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    clearFailedLogins(attemptKey);
    const requestedLanguage = ['en', 'de'].includes(String(preferredLanguage || '').toLowerCase())
      ? String(preferredLanguage).toLowerCase()
      : (user.preferred_language || 'en');
    if (requestedLanguage !== (user.preferred_language || 'en')) {
      await run('UPDATE users SET preferred_language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [requestedLanguage, user.id]);
      user.preferred_language = requestedLanguage;
    }
    await logAudit({ user: { id: user.id, email: user.email }, headers: req.headers, socket: req.socket }, 'auth.login', user.email);
    const token = generateToken(user.id, user.email, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferred_language || 'en',
        avatarUrl: buildAvatarUrl(user)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/verify', authMiddleware, async (req, res, next) => {
  try {
    const setupState = await getSetupState();
    const storedUser = await get('SELECT id, email, name, role, preferred_language, avatar_mime, avatar_data FROM users WHERE id = ?', [req.user.id]);
    res.json({
      valid: true,
      user: storedUser ? {
        id: storedUser.id,
        email: storedUser.email,
        name: storedUser.name,
        role: storedUser.role,
        preferredLanguage: storedUser.preferred_language || null,
        avatarUrl: buildAvatarUrl(storedUser)
      } : req.user,
      setupRequired: setupState.setupRequired
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const currentPassword = asString(req.body?.currentPassword, { field: 'Current password', max: 200, required: true });
    const newPassword = asString(req.body?.newPassword, { field: 'New password', max: 200, required: true });
    assertPasswordPolicy(newPassword, 'New password');
    if (newPassword === currentPassword) {
      throw new AppError('The new password must differ from the current one', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (!user) {
      throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const passwordMatch = await bcryptjs.compare(currentPassword, user.password_hash);

    if (!passwordMatch) {
      throw new AppError('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED);
    }

    const newPasswordHash = await bcryptjs.hash(newPassword, 12);

    await run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, req.user.id]
    );

    await logAudit(req, 'auth.password_changed', req.user.email);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, preferredLanguage } = req.body;

    if (!email) {
      throw new AppError('Email is required', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);

    if (!user) {
      return res.json({ message: 'If email exists, password reset link has been sent' });
    }

    const requestedLanguage = ['en', 'de'].includes(String(preferredLanguage || '').toLowerCase())
      ? String(preferredLanguage).toLowerCase()
      : (user.preferred_language || 'en');
    if (requestedLanguage !== (user.preferred_language || 'en')) {
      await run('UPDATE users SET preferred_language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [requestedLanguage, user.id]);
      user.preferred_language = requestedLanguage;
    }

    const resetToken = generateResetToken(user.id, user.email);
    const resetLink = `${getPublicFrontendUrl(req)}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const template = passwordResetTemplate({ name: user.name, resetLink, language: user.preferred_language || 'en' });
    await sendEmail(user.email, template.subject, template.text, template.html);
    await logAudit(req, 'auth.password_reset_requested', user.email);

    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const token = asString(req.body?.token, { field: 'Token', max: 4000, required: true });
    const newPassword = asString(req.body?.newPassword, { field: 'New password', max: 200, required: true });
    assertPasswordPolicy(newPassword, 'New password');

    let decoded;
    try {
      decoded = verifyResetToken(token);
    } catch (err) {
      throw new AppError(ERROR_MESSAGES.INVALID_TOKEN, HTTP_STATUS.UNAUTHORIZED);
    }
    const user = await get('SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const newPasswordHash = await bcryptjs.hash(newPassword, 12);

    await run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, user.id]
    );

    await logAudit(req, 'auth.password_reset_completed', user.email);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
