/**
 * Branded bilingual HTML e-mail templates.
 *
 * Visual language mirrors the portal redesign: a near-black masthead with the
 * dotted wordmark, a light content card, hairline borders and a muted green
 * accent. Subjects are plain text - no emoji, so they render identically in
 * every client and never get mangled on the way.
 *
 * Every template accepts language: 'en' | 'de'. English is the fallback.
 */

const BRAND_NAME = process.env.BRAND_NAME || 'Hosting by TechByGiusi';
const BRAND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const COLORS = {
  ink: '#0d100d',          // masthead / footer bar
  page: '#e8ebe4',         // page background (light sage)
  surface: '#ffffff',      // content card
  inset: '#f2f4ee',        // boxes inside the card
  text: '#101310',
  muted: '#6a7266',
  accent: '#5f7052',       // brand green, dark enough for white text
  accentSoft: '#c3d2ae',
  border: '#d9ded1',
  danger: '#a5372c',
  warning: '#9a6b12',
  success: '#3f7a4e'
};

const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function normalizeLanguage(language) {
  return String(language || '').toLowerCase() === 'de' ? 'de' : 'en';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateTime(value, language = 'en') {
  const lang = normalizeLanguage(language);
  try {
    const formatted = new Date(value).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Europe/Berlin'
    });
    return lang === 'de' ? `${formatted} Uhr` : formatted;
  } catch (_) {
    return String(value);
  }
}

/**
 * Dark masthead with the wordmark and three dots picking up the dotted
 * headline treatment used across the portal. Built from table cells so it
 * survives clients that strip web fonts and background images.
 */
function masthead(eyebrow) {
  return `
<tr><td style="background:${COLORS.ink};padding:26px 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="vertical-align:middle;">
      <div style="font-family:${MONO};font-size:15px;letter-spacing:.30em;text-transform:uppercase;color:${COLORS.accentSoft};font-weight:700;">${escapeHtml(BRAND_NAME)}</div>
      <div style="margin-top:8px;font-family:${MONO};font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#7f8a78;">${escapeHtml(eyebrow || 'Portal notification')}</div>
    </td>
    <td align="right" style="vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:10px;height:10px;background:${COLORS.accentSoft};border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
        <td style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="width:10px;height:10px;background:#3c453a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
        <td style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="width:10px;height:10px;background:#3c453a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td>
  </tr></table>
</td></tr>`;
}

function baseLayout({ language = 'en', preheader = '', title, eyebrow = '', bodyHtml, footerNote = '' }) {
  const lang = normalizeLanguage(language);
  const footer = lang === 'de'
    ? `Automatisch versendet von <a href="${BRAND_URL}" style="color:${COLORS.accent};text-decoration:none;">${escapeHtml(BRAND_NAME)}</a>.`
    : `Sent automatically by <a href="${BRAND_URL}" style="color:${COLORS.accent};text-decoration:none;">${escapeHtml(BRAND_NAME)}</a>.`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:${SANS};color:${COLORS.text};-webkit-font-smoothing:antialiased;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;border-radius:18px;overflow:hidden;border:1px solid ${COLORS.border};">
${masthead(eyebrow)}
<tr><td style="background:${COLORS.surface};padding:34px 30px 30px;">
<h1 style="margin:0 0 18px;font-size:23px;font-weight:600;line-height:1.28;letter-spacing:-.01em;color:${COLORS.text};">${escapeHtml(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="background:${COLORS.inset};border-top:1px solid ${COLORS.border};padding:18px 30px;">
<p style="margin:0;font-size:12px;line-height:1.65;color:${COLORS.muted};">${footer}${footerNote ? `<br>${escapeHtml(footerNote)}` : ''}</p></td></tr>
</table></td></tr></table></body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;"><tr><td style="border-radius:12px;background:${COLORS.accent};"><a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:.01em;">${escapeHtml(label)}</a></td></tr></table>`;
}

function infoTable(rows) {
  const body = rows.filter(Boolean).map(([label, value], index) => {
    const topBorder = index === 0 ? '0' : `1px solid ${COLORS.border}`;
    return `<tr>
    <td style="padding:10px 14px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${COLORS.muted};white-space:nowrap;vertical-align:top;font-family:${MONO};border-top:${topBorder};">${escapeHtml(label)}</td>
    <td style="padding:10px 14px;font-size:14px;color:${COLORS.text};font-weight:500;border-top:${topBorder};word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 4px;background:${COLORS.inset};border:1px solid ${COLORS.border};border-radius:12px;">${body}</table>`;
}

function paragraph(html) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${COLORS.text};">${html}</p>`;
}

function statusPill(text, color) {
  return `<span style="display:inline-block;padding:5px 14px;border-radius:999px;background:${color};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.16em;font-family:${MONO};">${escapeHtml(text)}</span>`;
}

function footnote(text) {
  return `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${escapeHtml(text)}</p>`;
}

function hello(name, lang) {
  return lang === 'de' ? `Hallo ${escapeHtml(name || '')},` : `Hello ${escapeHtml(name || '')},`;
}

function passwordResetTemplate({ name, resetLink, language = 'en' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const subject = de ? `${BRAND_NAME} - Passwort zurücksetzen` : `${BRAND_NAME} - Reset your password`;
  const title = de ? 'Passwort zurücksetzen' : 'Reset your password';
  const html = baseLayout({
    language: lang,
    eyebrow: de ? 'Kontosicherheit' : 'Account security',
    preheader: de ? 'Der Link ist 1 Stunde gültig.' : 'The link is valid for 1 hour.',
    title,
    bodyHtml: `
    ${paragraph(hello(name, lang))}
    ${paragraph(de ? 'Für dein Konto wurde das Zurücksetzen des Passworts angefordert. Über den Button legst du ein neues Passwort fest.' : 'A password reset was requested for your account. Use the button below to set a new password.')}
    ${button(resetLink, de ? 'Neues Passwort festlegen' : 'Set new password')}
    ${paragraph(de ? 'Der Link ist <strong>1 Stunde</strong> gültig. Falls du die Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.' : 'The link is valid for <strong>1 hour</strong>. If you did not request this, you can ignore this email.')}
    <p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:${COLORS.muted};word-break:break-all;font-family:${MONO};">${de ? 'Falls der Button nicht funktioniert' : 'If the button does not work'}: ${escapeHtml(resetLink)}</p>`
  });
  const text = de
    ? `Hallo ${name || ''},\n\nfür dein Konto wurde das Zurücksetzen des Passworts angefordert.\n\nLink (1 Stunde gültig):\n${resetLink}\n\n${BRAND_NAME}`
    : `Hello ${name || ''},\n\na password reset was requested for your account.\n\nLink (valid for 1 hour):\n${resetLink}\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function welcomeTemplate({ name, email, loginUrl, language = 'en' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const subject = de ? `Willkommen bei ${BRAND_NAME}` : `Welcome to ${BRAND_NAME}`;
  const title = de ? 'Willkommen im Hosting Portal' : 'Welcome to the Hosting Portal';
  const html = baseLayout({
    language: lang,
    eyebrow: de ? 'Zugang eingerichtet' : 'Account created',
    preheader: de ? 'Dein Zugang wurde eingerichtet.' : 'Your account has been created.',
    title,
    bodyHtml: `
    ${paragraph(hello(name, lang))}
    ${paragraph(de ? 'Für dich wurde ein Zugang zum Hosting Portal eingerichtet. Dort siehst, verwaltest und überwachst du deine Dienste.' : 'An account has been created for you. Use the portal to view, manage and monitor your services.')}
    ${infoTable([[de ? 'Benutzername' : 'Username', email], ['Portal', loginUrl]])}
    ${paragraph(de ? 'Dein Passwort hast du separat von deinem Administrator erhalten. Bitte ändere es nach der ersten Anmeldung in den Einstellungen - dort kannst du auch dein Profilbild hinterlegen.' : 'Your administrator provided your password separately. Please change it after your first sign-in under Settings, where you can also add your profile picture.')}
    ${button(loginUrl, de ? 'Zum Portal' : 'Open portal')}`
  });
  const text = de
    ? `Hallo ${name || ''},\n\nfür dich wurde ein Zugang zum Hosting Portal eingerichtet.\n\nBenutzername: ${email}\nPortal: ${loginUrl}\n\n${BRAND_NAME}`
    : `Hello ${name || ''},\n\nan account has been created for you.\n\nUsername: ${email}\nPortal: ${loginUrl}\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

function resourceDownTemplate({ name, resourceName, containerId, clusterName, since, language = 'en' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const service = resourceName || containerId;
  const subject = de ? `Dienst offline: ${service}` : `Service offline: ${service}`;
  const title = de ? 'Dienst offline' : 'Service offline';
  const html = baseLayout({
    language: lang,
    eyebrow: 'Monitoring',
    preheader: de ? `${service} ist nicht mehr erreichbar.` : `${service} is no longer available.`,
    title,
    bodyHtml: `
    <div style="margin:0 0 18px;">${statusPill('OFFLINE', COLORS.danger)}</div>${paragraph(hello(name, lang))}
    ${paragraph(de ? 'Einer deiner Dienste wird als <strong>gestoppt</strong> gemeldet:' : 'One of your services is reported as <strong>stopped</strong>:')}
    ${infoTable([
      [de ? 'Dienst' : 'Service', service],
      ['ID', containerId],
      ['Cluster', clusterName || (de ? 'Unbekannt' : 'Unknown')],
      [de ? 'Erkannt am' : 'Detected at', formatDateTime(since || new Date(), lang)]
    ])}
    ${paragraph(de ? 'Du kannst den Dienst im Portal prüfen und bei Bedarf neu starten.' : 'You can check the service in the portal and restart it if necessary.')}${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal')}
    ${footnote(de ? 'Diese Meldung ist in deinen Benachrichtigungseinstellungen aktiviert.' : 'This notification is enabled in your notification settings.')}`
  });
  const text = de
    ? `Hallo ${name || ''},\n\nDienst offline:\nDienst: ${service}\nID: ${containerId}\nCluster: ${clusterName || 'Unbekannt'}\nErkannt am: ${formatDateTime(since || new Date(), lang)}\n\nPortal: ${BRAND_URL}`
    : `Hello ${name || ''},\n\nService offline:\nService: ${service}\nID: ${containerId}\nCluster: ${clusterName || 'Unknown'}\nDetected at: ${formatDateTime(since || new Date(), lang)}\n\nPortal: ${BRAND_URL}`;
  return { subject, text, html };
}

function resourceRecoveredTemplate({ name, resourceName, containerId, clusterName, since, language = 'en' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const service = resourceName || containerId;
  const subject = de ? `Dienst wieder online: ${service}` : `Service back online: ${service}`;
  const title = de ? 'Dienst wieder online' : 'Service back online';
  const html = baseLayout({
    language: lang,
    eyebrow: 'Monitoring',
    preheader: de ? `${service} läuft wieder.` : `${service} is running again.`,
    title,
    bodyHtml: `
    <div style="margin:0 0 18px;">${statusPill('ONLINE', COLORS.success)}</div>${paragraph(hello(name, lang))}
    ${paragraph(de ? 'Gute Nachricht - der folgende Dienst läuft wieder:' : 'Good news - the following service is running again:')}
    ${infoTable([
      [de ? 'Dienst' : 'Service', service],
      ['ID', containerId],
      ['Cluster', clusterName || (de ? 'Unbekannt' : 'Unknown')],
      [de ? 'Erkannt am' : 'Detected at', formatDateTime(since || new Date(), lang)]
    ])}${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal')}`
  });
  const text = de
    ? `Hallo ${name || ''},\n\nDienst wieder online:\nDienst: ${service}\nID: ${containerId}\nCluster: ${clusterName || 'Unbekannt'}\n\nPortal: ${BRAND_URL}`
    : `Hello ${name || ''},\n\nService back online:\nService: ${service}\nID: ${containerId}\nCluster: ${clusterName || 'Unknown'}\n\nPortal: ${BRAND_URL}`;
  return { subject, text, html };
}

function maintenanceTemplate({ name, title, message, startsAt, endsAt, severity, language = 'en' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const labels = de
    ? { critical: 'Kritische Wartung', warning: 'Wartung mit Einschränkungen', info: 'Geplante Wartung' }
    : { critical: 'Critical maintenance', warning: 'Maintenance with restrictions', info: 'Scheduled maintenance' };
  const severityLabel = labels[severity] || labels.info;
  const severityColor = severity === 'critical' ? COLORS.danger : severity === 'warning' ? COLORS.warning : COLORS.accent;
  const subject = `${severityLabel}: ${title}`;
  const html = baseLayout({
    language: lang,
    eyebrow: de ? 'Wartungsfenster' : 'Maintenance window',
    preheader: `${severityLabel}: ${formatDateTime(startsAt, lang)} - ${formatDateTime(endsAt, lang)}.`,
    title,
    bodyHtml: `
    <div style="margin:0 0 18px;">${statusPill(severityLabel.toUpperCase(), severityColor)}</div>${paragraph(hello(name, lang))}
    ${paragraph(de ? 'Für das Hosting Portal wurde eine Wartung angekündigt:' : 'Maintenance has been announced for the Hosting Portal:')}
    ${infoTable([
      [de ? 'Beginn' : 'Start', formatDateTime(startsAt, lang)],
      [de ? 'Ende' : 'End', formatDateTime(endsAt, lang)]
    ])}
    ${message ? paragraph(escapeHtml(message).replace(/\n/g, '<br>')) : ''}
    ${paragraph(de ? 'Während der Wartung kann es zu Unterbrechungen kommen. Details findest du im Portal.' : 'Service interruptions may occur during maintenance. Details are available in the portal.')}${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal')}
    ${footnote(de ? 'Diese Meldung ist in deinen Benachrichtigungseinstellungen aktiviert.' : 'This notification is enabled in your notification settings.')}`
  });
  const text = de
    ? `Hallo ${name || ''},\n\n${severityLabel}: ${title}\n\nBeginn: ${formatDateTime(startsAt, lang)}\nEnde: ${formatDateTime(endsAt, lang)}\n\n${message || ''}\n\nPortal: ${BRAND_URL}`
    : `Hello ${name || ''},\n\n${severityLabel}: ${title}\n\nStart: ${formatDateTime(startsAt, lang)}\nEnd: ${formatDateTime(endsAt, lang)}\n\n${message || ''}\n\nPortal: ${BRAND_URL}`;
  return { subject, text, html };
}

function testMailTemplate({ name, language = 'en' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const subject = de ? `${BRAND_NAME} - Test-E-Mail` : `${BRAND_NAME} - Test email`;
  const title = de ? 'Test erfolgreich' : 'Test successful';
  const html = baseLayout({
    language: lang,
    eyebrow: de ? 'SMTP-Prüfung' : 'SMTP check',
    preheader: de ? 'Die SMTP-Konfiguration funktioniert.' : 'The SMTP configuration works.',
    title,
    bodyHtml: `
    <div style="margin:0 0 18px;">${statusPill('SMTP OK', COLORS.success)}</div>${paragraph(hello(name, lang))}
    ${paragraph(de ? 'Diese Test-E-Mail bestätigt, dass der E-Mail-Versand des Hosting Portals korrekt konfiguriert ist.' : 'This test email confirms that outgoing email for the Hosting Portal is configured correctly.')}`
  });
  const text = de
    ? `Hallo ${name || ''},\n\ndiese Test-E-Mail bestätigt, dass der E-Mail-Versand korrekt konfiguriert ist.\n\n${BRAND_NAME}`
    : `Hello ${name || ''},\n\nthis test email confirms that outgoing email is configured correctly.\n\n${BRAND_NAME}`;
  return { subject, text, html };
}

module.exports = { passwordResetTemplate, welcomeTemplate, resourceDownTemplate, resourceRecoveredTemplate, maintenanceTemplate, testMailTemplate };
