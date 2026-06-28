const nodemailer = require('nodemailer');
const { get } = require('../config/database');

let transporter = null;

/**
 * Initialize email transporter with settings
 */
async function initializeEmailService() {
  try {
    const smtpHost = await get('SELECT value FROM settings WHERE key = ?', ['smtp_host']);
    const smtpPort = await get('SELECT value FROM settings WHERE key = ?', ['smtp_port']);
    const smtpUser = await get('SELECT value FROM settings WHERE key = ?', ['smtp_user']);
    const smtpPassword = await get('SELECT value FROM settings WHERE key = ?', ['smtp_password']);

    if (!smtpHost || !smtpPort) {
      console.warn('SMTP not configured - email service disabled');
      return false;
    }

    const decryptedPassword = decryptString(smtpPassword?.value || '');

    transporter = nodemailer.createTransport({
      host: smtpHost.value,
      port: parseInt(smtpPort.value),
      secure: parseInt(smtpPort.value) === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser?.value || '',
        pass: decryptedPassword
      }
    });

    // Verify connection
    try {
      await transporter.verify();
      console.log('✓ SMTP connection verified');
      return true;
    } catch (err) {
      console.error('✗ SMTP verification failed:', err.message);
      return false;
    }
  } catch (error) {
    console.error('Error initializing email service:', error.message);
    return false;
  }
}

/**
 * Send email
 */
async function sendEmail(to, subject, text, html = null) {
  try {
    if (!transporter) {
      const initialized = await initializeEmailService();
      if (!initialized) {
        console.warn('Email service not configured, skipping email send');
        return { success: false, message: 'Email service not configured' };
      }
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@hosting-portal.local',
      to,
      subject,
      text,
      ...(html && { html })
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Test SMTP configuration
 */
async function testSmtpConnection(smtpHost, smtpPort, smtpUser, smtpPassword) {
  try {
    const testTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword
      }
    });

    await testTransporter.verify();
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Encryption utilities
 */
function encryptString(str) {
  // Simple encryption for demo - use proper encryption in production
  return Buffer.from(str).toString('base64');
}

function decryptString(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

// Initialize on startup
initializeEmailService().catch(err => {
  console.error('Failed to initialize email service on startup:', err.message);
});

module.exports = {
  sendEmail,
  testSmtpConnection,
  initializeEmailService,
  encryptString,
  decryptString
};
