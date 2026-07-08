/**
 * emailTemplates.js - Branded, responsive HTML e-mail templates.
 *
 * Design language mirrors the portal: white background, cold-grey card,
 * sage green accent (#7A876F), near-black editorial text.
 * All templates return { subject, text, html }.
 */

const BRAND_NAME = process.env.BRAND_NAME || 'Hosting by TechByGiusi';
const BRAND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const COLORS = {
  accent: '#7A876F',
  accentDark: '#626D59',
  text: '#111111',
  muted: '#6B7280',
  surface: '#f4f4f2',
  border: '#e3e3e0',
  danger: '#b42318',
  warning: '#b7791f',
  success: '#2f7d46'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Europe/Berlin'
    }) + ' Uhr';
  } catch (_) {
    return String(value);
  }
}

/**
 * Base layout wrapping every mail. Inline styles only (e-mail clients!).
 */
function baseLayout({ preheader = '', title, bodyHtml, footerNote = '' }) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.text};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <!-- Header -->
        <tr><td style="padding:0 8px 20px 8px;">
          <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.accent};font-weight:600;">${escapeHtml(BRAND_NAME)}</div>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:14px;padding:32px 28px;">
          <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:600;line-height:1.3;color:${COLORS.text};">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 8px 0 8px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">
            Diese Nachricht wurde automatisch von <a href="${BRAND_URL}" style="color:${COLORS.accent};text-decoration:none;">${escapeHtml(BRAND_NAME)}</a> versendet.
            ${footerNote ? `<br>${escapeHtml(footerNote)}` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="border-radius:10px;background:${COLORS.accent};">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:13px;color:${COLORS.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${COLORS.text};font-weight:500;">${escapeHtml(value)}</td>
  </tr>`;
}

function paragraph(html) {
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${COLORS.text};">${html}</p>`;
}

function statusPill(text, color) {
  return `<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${color};color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.04em;">${escapeHtml(text)}</span>`;
}

/* ------------------------------------------------------------ TEMPLATES */

function passwordResetTemplate({ name, resetLink }) {
  const subject = `${BRAND_NAME} - Passwort zurücksetzen`;
  const html = baseLayout({
    preheader: 'Link zum Zurücksetzen deines Passworts - gültig für 1 Stunde.',
    title: 'Passwort zurücksetzen',
    bodyHtml: `
      ${paragraph(`Hallo ${escapeHtml(name || '')},`)}
      ${paragraph('für dein Konto wurde das Zurücksetzen des Passworts angefordert. Klicke auf den Button, um ein neues Passwort zu vergeben:')}
      ${button(resetLink, 'Neues Passwort vergeben')}
      ${paragraph(`Der Link ist aus Sicherheitsgründen <strong>1 Stunde</strong> gültig. Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren - dein Passwort bleibt unverändert.`)}
      <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:${COLORS.muted};word-break:break-all;">Falls der Button nicht funktioniert: ${escapeHtml(resetLink)}</p>
    `,
    footerNote: 'Aus Sicherheitsgründen enthält diese E-Mail keinen Passwortklartext.'
  });
  const text = `Hallo ${name || ''},\n\nfür dein Konto wurde das Zurücksetzen des Passworts angefordert.\n\nLink (1 Stunde gültig):\n${resetLink}\n\nFalls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function welcomeTemplate({ name, email, loginUrl }) {
  const subject = `Willkommen bei ${BRAND_NAME}`;
  const html = baseLayout({
    preheader: 'Dein Zugang zum Hosting Portal wurde eingerichtet.',
    title: 'Willkommen im Hosting Portal',
    bodyHtml: `
      ${paragraph(`Hallo ${escapeHtml(name || '')},`)}
      ${paragraph('für dich wurde ein Zugang zum Hosting Portal eingerichtet. Dort kannst du deine Dienste einsehen, verwalten und überwachen.')}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px 0;">
        ${infoRow('Benutzername', email)}
        ${infoRow('Portal', loginUrl)}
      </table>
      ${paragraph('Dein Passwort hast du separat von deinem Administrator erhalten. Bitte ändere es nach der ersten Anmeldung.')}
      ${button(loginUrl, 'Zum Portal')}
    `
  });
  const text = `Hallo ${name || ''},\n\nfür dich wurde ein Zugang zum Hosting Portal eingerichtet.\n\nBenutzername: ${email}\nPortal: ${loginUrl}\n\nDein Passwort hast du separat erhalten. Bitte ändere es nach der ersten Anmeldung.\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function resourceDownTemplate({ name, resourceName, containerId, clusterName, since }) {
  const subject = `⚠ Dienst offline: ${resourceName || containerId}`;
  const html = baseLayout({
    preheader: `${resourceName || containerId} ist nicht mehr erreichbar.`,
    title: 'Dienst offline',
    bodyHtml: `
      <div style="margin:0 0 16px 0;">${statusPill('OFFLINE', COLORS.danger)}</div>
      ${paragraph(`Hallo ${escapeHtml(name || '')},`)}
      ${paragraph('einer deiner Dienste wird von der Überwachung als <strong>gestoppt</strong> gemeldet:')}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
        ${infoRow('Dienst', resourceName || `#${containerId}`)}
        ${infoRow('ID', containerId)}
        ${infoRow('Cluster', clusterName || 'Unbekannt')}
        ${infoRow('Erkannt am', formatDateTime(since || new Date()))}
      </table>
      ${paragraph('Du kannst den Dienst im Portal prüfen und ggf. neu starten.')}
      ${button(BRAND_URL, 'Portal öffnen')}
      <p style="margin:0;font-size:12px;color:${COLORS.muted};">Du erhältst diese Meldung, weil Benachrichtigungen bei Ausfällen in deinen Einstellungen aktiviert sind.</p>
    `
  });
  const text = `Hallo ${name || ''},\n\nDienst offline:\n\nDienst: ${resourceName || containerId}\nID: ${containerId}\nCluster: ${clusterName || 'Unbekannt'}\nErkannt am: ${formatDateTime(since || new Date())}\n\nPortal: ${BRAND_URL}\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function resourceRecoveredTemplate({ name, resourceName, containerId, clusterName, since }) {
  const subject = `✓ Dienst wieder online: ${resourceName || containerId}`;
  const html = baseLayout({
    preheader: `${resourceName || containerId} läuft wieder.`,
    title: 'Dienst wieder online',
    bodyHtml: `
      <div style="margin:0 0 16px 0;">${statusPill('ONLINE', COLORS.success)}</div>
      ${paragraph(`Hallo ${escapeHtml(name || '')},`)}
      ${paragraph('gute Nachricht - der folgende Dienst läuft wieder:')}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
        ${infoRow('Dienst', resourceName || `#${containerId}`)}
        ${infoRow('ID', containerId)}
        ${infoRow('Cluster', clusterName || 'Unbekannt')}
        ${infoRow('Erkannt am', formatDateTime(since || new Date()))}
      </table>
      ${button(BRAND_URL, 'Portal öffnen')}
    `
  });
  const text = `Hallo ${name || ''},\n\nDienst wieder online:\n\nDienst: ${resourceName || containerId}\nID: ${containerId}\nCluster: ${clusterName || 'Unbekannt'}\n\nPortal: ${BRAND_URL}\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function maintenanceTemplate({ name, title, message, startsAt, endsAt, severity }) {
  const severityLabel = severity === 'critical' ? 'Kritische Wartung' : severity === 'warning' ? 'Wartung mit Einschränkungen' : 'Geplante Wartung';
  const severityColor = severity === 'critical' ? COLORS.danger : severity === 'warning' ? COLORS.warning : COLORS.accent;
  const subject = `🔧 ${severityLabel}: ${title}`;
  const html = baseLayout({
    preheader: `${severityLabel} von ${formatDateTime(startsAt)} bis ${formatDateTime(endsAt)}.`,
    title,
    bodyHtml: `
      <div style="margin:0 0 16px 0;">${statusPill(severityLabel.toUpperCase(), severityColor)}</div>
      ${paragraph(`Hallo ${escapeHtml(name || '')},`)}
      ${paragraph('für das Hosting Portal wurde eine Wartung angekündigt:')}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
        ${infoRow('Beginn', formatDateTime(startsAt))}
        ${infoRow('Ende', formatDateTime(endsAt))}
      </table>
      ${message ? paragraph(escapeHtml(message).replace(/\n/g, '<br>')) : ''}
      ${paragraph('Während der Wartung kann es zu Unterbrechungen der Dienste kommen. Details findest du im Portal.')}
      ${button(BRAND_URL, 'Portal öffnen')}
      <p style="margin:0;font-size:12px;color:${COLORS.muted};">Du erhältst diese Meldung, weil Wartungsankündigungen in deinen Einstellungen aktiviert sind.</p>
    `
  });
  const text = `Hallo ${name || ''},\n\n${severityLabel}: ${title}\n\nBeginn: ${formatDateTime(startsAt)}\nEnde: ${formatDateTime(endsAt)}\n\n${message || ''}\n\nPortal: ${BRAND_URL}\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function testMailTemplate({ name }) {
  const subject = `${BRAND_NAME} - Test-E-Mail`;
  const html = baseLayout({
    preheader: 'Die SMTP-Konfiguration funktioniert.',
    title: 'Test erfolgreich',
    bodyHtml: `
      <div style="margin:0 0 16px 0;">${statusPill('SMTP OK', COLORS.success)}</div>
      ${paragraph(`Hallo ${escapeHtml(name || '')},`)}
      ${paragraph('diese Test-E-Mail bestätigt, dass der E-Mail-Versand des Hosting Portals korrekt konfiguriert ist. Ausgehende Nachrichten (Passwort-Resets, Ausfall-Benachrichtigungen, Wartungsankündigungen) verwenden dieses Layout.')}
    `
  });
  const text = `Hallo ${name || ''},\n\ndiese Test-E-Mail bestätigt, dass der E-Mail-Versand des Hosting Portals korrekt konfiguriert ist.\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

module.exports = {
  passwordResetTemplate,
  welcomeTemplate,
  resourceDownTemplate,
  resourceRecoveredTemplate,
  maintenanceTemplate,
  testMailTemplate
};
