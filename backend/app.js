require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const { initDatabase } = require('./config/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const announcementRoutes = require('./routes/announcements');
const wikiRoutes = require('./routes/wiki');
const { authMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { sanitizeRequest } = require('./middleware/validate');
const { attachConsoleProxy } = require('./services/consoleService');
const { startMonitoring } = require('./services/monitoringService');
const { resumeProvisioningJobs } = require('./services/provisioningJobService');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Behind nginx / a reverse proxy: trust X-Forwarded-For for rate limiting & audit IPs
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Express advertises itself by default; there is no reason to tell a scanner
// which stack to target.
app.disable('x-powered-by');
// ETag on JSON API responses buys nothing and leaks response fingerprints.
app.set('etag', false);

app.use(helmet({
  // This process only serves JSON; the CSP that matters is the one nginx sends
  // with the frontend. A restrictive default here would break nothing but also
  // protect nothing, so the API-relevant headers are set explicitly instead.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
  noSniff: true,
  hidePoweredBy: true,
  // 180 days HSTS. Only sent over TLS, so it is inert on a plain-HTTP dev run.
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: false }
}));

// CORS: restrict to the configured frontend origin(s) in production.
// FRONTEND_ORIGIN can be a comma-separated list, e.g. "https://portal.example.com"
const allowedOrigins = String(process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  console.warn('⚠ FRONTEND_ORIGIN is not set - CORS allows all origins. Set it in production!');
}

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true
}));

/*
 * Body limits are scoped, not global. Only the two endpoints that legitimately
 * carry an image get the large ceiling; everything else is capped at 256 KB, so
 * a request to /api/auth/login can never be used to push megabytes into the
 * process. Order matters: the specific mounts must be registered first.
 */
const largeJson = bodyParser.json({ limit: '4mb' });
const standardJson = bodyParser.json({ limit: '256kb' });

app.use('/api/user/avatar', largeJson);
app.use('/api/wiki/admin/images', largeJson);
app.use(standardJson);
app.use(bodyParser.urlencoded({ limit: '256kb', extended: false, parameterLimit: 100 }));

// Structural input hardening: prototype-pollution keys, oversized strings and
// pathologically nested payloads are rejected before any route sees them.
app.use(sanitizeRequest);

// Rate limiting: strict on auth (brute force), generous on the rest of the API
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Too many login attempts. Please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Rate limit exceeded.' }
});

/*
 * Password reset is rate limited harder than login: a login attempt costs one
 * bcrypt verification, but a reset request sends an e-mail, so an unthrottled
 * endpoint turns the portal into a spam relay pointed at its own users.
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Too many password reset requests. Please try again later.' }
});

// Avatar uploads are cheap per call but large; cap the sustained rate.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Too many uploads. Please try again later.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);
app.use('/api/user/avatar', uploadLimiter);
app.use('/api/wiki/admin/images', uploadLimiter);
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDatabase().then(() => {
  console.log('✓ Database initialized');
  startMonitoring();
  resumeProvisioningJobs();
}).catch(err => {
  console.error('✗ Database initialization failed:', err);
  process.exit(1);
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', authMiddleware, userRoutes);
// Public: maintenance announcements for the top banner (also on login screen)
app.use('/api/announcements', announcementRoutes);
// Wiki: admin-authored knowledge base. Auth is applied per route because the
// image endpoint must stay reachable for <img> tags without an auth header.
app.use('/api/wiki', wikiRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

app.use(errorHandler);

// HTTP server (instead of app.listen) so the console WebSocket proxy can attach
const server = http.createServer(app);
attachConsoleProxy(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   🚀 Hosting Portal Backend v3.3.0 Started      ║
║   Port: ${PORT}                                 ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║   API: http://localhost:${PORT}/api           ║
╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
