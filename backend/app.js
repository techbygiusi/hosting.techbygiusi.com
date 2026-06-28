require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');

const { initDatabase } = require('./config/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const { authMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDatabase().then(() => {
  console.log('✓ Database initialized');
}).catch(err => {
  console.error('✗ Database initialization failed:', err);
  process.exit(1);
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', authMiddleware, userRoutes);

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   🚀 Hosting Portal Backend Started           ║
║   Port: ${PORT}                                 ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║   API: http://localhost:${PORT}/api           ║
╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
