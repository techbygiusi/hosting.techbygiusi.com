/**
 * Branded bilingual HTML e-mail templates with light and dark portal themes.
 * Every template accepts language: 'en' | 'de' and theme: 'light' | 'dark'.
 */

const BRAND_NAME = process.env.BRAND_NAME || 'Hosting by TechByGiusi';
const BRAND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ACCENT = '#dae3d7';

const THEMES = {
  light: {
    body: '#eef1ec',
    shell: '#f7f8f4',
    card: '#ffffff',
    cardAlt: '#f4f6f0',
    text: '#121714',
    muted: '#657064',
    border: 'rgba(20, 28, 22, 0.10)',
    accent: ACCENT,
    accentStrong: '#b8c5b2',
    buttonText: '#0d1410',
    success: '#2f7d46',
    warning: '#b7791f',
    danger: '#b42318',
    shadow: '0 22px 48px rgba(28, 35, 30, 0.08)'
  },
  dark: {
    body: '#070b09',
    shell: '#0b100d',
    card: '#111814',
    cardAlt: '#141d18',
    text: '#eef4ed',
    muted: '#9aa89d',
    border: 'rgba(218, 227, 215, 0.12)',
    accent: ACCENT,
    accentStrong: '#ebf4e7',
    buttonText: '#0d1410',
    success: '#66c084',
    warning: '#e1b45c',
    danger: '#f08a84',
    shadow: '0 28px 60px rgba(0, 0, 0, 0.38)'
  }
};

function normalizeLanguage(language) {
  return String(language || '').toLowerCase() === 'de' ? 'de' : 'en';
}

function normalizeTheme(theme) {
  return String(theme || '').toLowerCase() === 'dark' ? 'dark' : 'light';
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

function baseLayout({ language = 'en', theme = 'light', preheader = '', title, eyebrow, bodyHtml, footerNote = '' }) {
  const lang = normalizeLanguage(language);
  const palette = THEMES[normalizeTheme(theme)];
  const footer = lang === 'de'
    ? `Diese Nachricht wurde automatisch von <a href="${BRAND_URL}" style="color:${palette.accentStrong};text-decoration:none;">${escapeHtml(BRAND_NAME)}</a> versendet.`
    : `This message was sent automatically by <a href="${BRAND_URL}" style="color:${palette.accentStrong};text-decoration:none;">${escapeHtml(BRAND_NAME)}</a>.`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${palette.body};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${palette.text};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.body};padding:28px 14px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;">
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.shell};border:1px solid ${palette.border};border-radius:28px;overflow:hidden;box-shadow:${palette.shadow};">
        <tr>
          <td style="padding:24px 28px 18px;background:linear-gradient(135deg, ${palette.cardAlt} 0%, ${palette.shell} 60%, ${palette.card} 100%);border-bottom:1px solid ${palette.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="top">
                <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${palette.accent};color:${palette.buttonText};font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;">${escapeHtml(eyebrow || BRAND_NAME)}</div>
                <h1 style="margin:18px 0 0;font-size:28px;line-height:1.2;font-weight:600;color:${palette.text};">${escapeHtml(title)}</h1>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="padding:28px;">${bodyHtml}</td></tr>
        <tr>
          <td style="padding:0 28px 28px;">
            <div style="border-radius:20px;background:${palette.cardAlt};border:1px solid ${palette.border};padding:16px 18px;color:${palette.muted};font-size:12px;line-height:1.7;">${footer}${footerNote ? `<br>${escapeHtml(footerNote)}` : ''}</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function button(href, label, theme = 'light') {
  const palette = THEMES[normalizeTheme(theme)];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td style="border-radius:16px;background:${palette.accent};"><a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:${palette.buttonText};text-decoration:none;border-radius:16px;">${escapeHtml(label)}</a></td></tr></table>`;
}
function infoTable(rows, theme = 'light') {
  const palette = THEMES[normalizeTheme(theme)];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${palette.border};border-radius:18px;background:${palette.cardAlt};padding:10px 16px;">${rows.join('')}</table>`;
}
function infoRow(label, value, theme = 'light') {
  const palette = THEMES[normalizeTheme(theme)];
  return `<tr><td style="padding:8px 14px 8px 0;font-size:13px;color:${palette.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;font-size:14px;color:${palette.text};font-weight:600;">${escapeHtml(value)}</td></tr>`;
}
function paragraph(html, theme = 'light') {
  const palette = THEMES[normalizeTheme(theme)];
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${palette.text};">${html}</p>`;
}
function statusPill(text, color) { return `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${color};color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;">${escapeHtml(text)}</span>`; }
function hello(name, lang) { return lang === 'de' ? `Hallo ${escapeHtml(name || '')},` : `Hello ${escapeHtml(name || '')},`; }

function passwordResetTemplate({ name, resetLink, language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language); const de = lang === 'de';
  const subject = de ? `${BRAND_NAME} - Passwort zurücksetzen` : `${BRAND_NAME} - Reset your password`;
  const title = de ? 'Passwort zurücksetzen' : 'Reset your password';
  const html = baseLayout({ language: lang, theme, preheader: de ? 'Der Link ist 1 Stunde gültig.' : 'The link is valid for 1 hour.', title, eyebrow: BRAND_NAME, bodyHtml: `
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Für dein Konto wurde das Zurücksetzen des Passworts angefordert. Klicke auf den Button, um ein neues Passwort festzulegen.' : 'A password reset was requested for your account. Use the button below to set a new password.', theme)}
    ${button(resetLink, de ? 'Neues Passwort festlegen' : 'Set new password', theme)}
    ${paragraph(de ? 'Der Link ist <strong>1 Stunde</strong> gültig. Falls du die Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.' : 'The link is valid for <strong>1 hour</strong>. If you did not request this, you can ignore this email.', theme)}
    <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${THEMES[normalizeTheme(theme)].muted};word-break:break-all;">${de ? 'Falls der Button nicht funktioniert' : 'If the button does not work'}: ${escapeHtml(resetLink)}</p>` });
  const text = de ? `Hallo ${name || ''},

für dein Konto wurde das Zurücksetzen des Passworts angefordert.

Link (1 Stunde gültig):
${resetLink}

${BRAND_NAME}` : `Hello ${name || ''},

a password reset was requested for your account.

Link (valid for 1 hour):
${resetLink}

${BRAND_NAME}`;
  return { subject, text, html };
}

function welcomeTemplate({ name, email, loginUrl, language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language); const de = lang === 'de';
  const subject = de ? `Willkommen bei ${BRAND_NAME}` : `Welcome to ${BRAND_NAME}`;
  const title = de ? 'Willkommen im Hosting Portal' : 'Welcome to the Hosting Portal';
  const html = baseLayout({ language: lang, theme, preheader: de ? 'Dein Zugang wurde eingerichtet.' : 'Your account has been created.', title, eyebrow: BRAND_NAME, bodyHtml: `
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Für dich wurde ein Zugang zum Hosting Portal eingerichtet. Dort kannst du deine Dienste einsehen, verwalten und überwachen.' : 'An account has been created for you. You can use the portal to view, manage and monitor your services.', theme)}
    ${infoTable([infoRow(de ? 'Benutzername' : 'Username', email, theme), infoRow('Portal', loginUrl, theme)], theme)}
    ${paragraph(de ? 'Dein Passwort hast du separat von deinem Administrator erhalten. Bitte ändere es nach der ersten Anmeldung.' : 'Your administrator provided your password separately. Please change it after your first sign-in.', theme)}
    ${button(loginUrl, de ? 'Zum Portal' : 'Open portal', theme)}` });
  const text = de ? `Hallo ${name || ''},

für dich wurde ein Zugang zum Hosting Portal eingerichtet.

Benutzername: ${email}
Portal: ${loginUrl}

${BRAND_NAME}` : `Hello ${name || ''},

an account has been created for you.

Username: ${email}
Portal: ${loginUrl}

${BRAND_NAME}`;
  return { subject, text, html };
}

function resourceDownTemplate({ name, resourceName, containerId, clusterName, since, language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language); const de = lang === 'de'; const service = resourceName || containerId;
  const palette = THEMES[normalizeTheme(theme)];
  const subject = de ? `⚠ Dienst offline: ${service}` : `⚠ Service offline: ${service}`;
  const title = de ? 'Dienst offline' : 'Service offline';
  const html = baseLayout({ language: lang, theme, preheader: de ? `${service} ist nicht mehr erreichbar.` : `${service} is no longer available.`, title, eyebrow: de ? 'Statusmeldung' : 'Status update', bodyHtml: `
    <div style="margin:0 0 16px;">${statusPill('OFFLINE', palette.danger)}</div>
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Einer deiner Dienste wird als <strong>gestoppt</strong> gemeldet:' : 'One of your services is reported as <strong>stopped</strong>:', theme)}
    ${infoTable([infoRow(de ? 'Dienst' : 'Service', service, theme), infoRow('ID', containerId, theme), infoRow('Cluster', clusterName || (de ? 'Unbekannt' : 'Unknown'), theme), infoRow(de ? 'Erkannt am' : 'Detected at', formatDateTime(since || new Date(), lang), theme)], theme)}
    ${paragraph(de ? 'Du kannst den Dienst im Portal prüfen und bei Bedarf neu starten.' : 'You can check the service in the portal and restart it if necessary.', theme)}
    ${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal', theme)}
    <p style="margin:0;font-size:12px;color:${palette.muted};">${de ? 'Diese Meldung ist in deinen Benachrichtigungseinstellungen aktiviert.' : 'This notification is enabled in your notification settings.'}</p>` });
  const text = de ? `Hallo ${name || ''},

Dienst offline:
Dienst: ${service}
ID: ${containerId}
Cluster: ${clusterName || 'Unbekannt'}
Erkannt am: ${formatDateTime(since || new Date(), lang)}

Portal: ${BRAND_URL}` : `Hello ${name || ''},

Service offline:
Service: ${service}
ID: ${containerId}
Cluster: ${clusterName || 'Unknown'}
Detected at: ${formatDateTime(since || new Date(), lang)}

Portal: ${BRAND_URL}`;
  return { subject, text, html };
}

function resourceRecoveredTemplate({ name, resourceName, containerId, clusterName, since, language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language); const de = lang === 'de'; const service = resourceName || containerId;
  const palette = THEMES[normalizeTheme(theme)];
  const subject = de ? `✓ Dienst wieder online: ${service}` : `✓ Service back online: ${service}`;
  const title = de ? 'Dienst wieder online' : 'Service back online';
  const html = baseLayout({ language: lang, theme, preheader: de ? `${service} läuft wieder.` : `${service} is running again.`, title, eyebrow: de ? 'Statusmeldung' : 'Status update', bodyHtml: `
    <div style="margin:0 0 16px;">${statusPill('ONLINE', palette.success)}</div>
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Gute Nachricht - der folgende Dienst läuft wieder:' : 'Good news - the following service is running again:', theme)}
    ${infoTable([infoRow(de ? 'Dienst' : 'Service', service, theme), infoRow('ID', containerId, theme), infoRow('Cluster', clusterName || (de ? 'Unbekannt' : 'Unknown'), theme), infoRow(de ? 'Erkannt am' : 'Detected at', formatDateTime(since || new Date(), lang), theme)], theme)}
    ${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal', theme)}` });
  const text = de ? `Hallo ${name || ''},

Dienst wieder online:
Dienst: ${service}
ID: ${containerId}
Cluster: ${clusterName || 'Unbekannt'}

Portal: ${BRAND_URL}` : `Hello ${name || ''},

Service back online:
Service: ${service}
ID: ${containerId}
Cluster: ${clusterName || 'Unknown'}

Portal: ${BRAND_URL}`;
  return { subject, text, html };
}

function maintenanceTemplate({ name, title, message, startsAt, endsAt, severity, language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language); const de = lang === 'de'; const palette = THEMES[normalizeTheme(theme)];
  const labels = de ? { critical: 'Kritische Wartung', warning: 'Wartung mit Einschränkungen', info: 'Geplante Wartung' } : { critical: 'Critical maintenance', warning: 'Maintenance with restrictions', info: 'Scheduled maintenance' };
  const severityLabel = labels[severity] || labels.info;
  const severityColor = severity === 'critical' ? palette.danger : severity === 'warning' ? palette.warning : palette.accentStrong;
  const subject = `🔧 ${severityLabel}: ${title}`;
  const html = baseLayout({ language: lang, theme, preheader: `${severityLabel}: ${formatDateTime(startsAt, lang)} - ${formatDateTime(endsAt, lang)}.`, title, eyebrow: de ? 'Wartung' : 'Maintenance', bodyHtml: `
    <div style="margin:0 0 16px;">${statusPill(severityLabel.toUpperCase(), severityColor)}</div>
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Für das Hosting Portal wurde eine Wartung angekündigt:' : 'Maintenance has been announced for the Hosting Portal:', theme)}
    ${infoTable([infoRow(de ? 'Beginn' : 'Start', formatDateTime(startsAt, lang), theme), infoRow(de ? 'Ende' : 'End', formatDateTime(endsAt, lang), theme)], theme)}
    ${message ? paragraph(escapeHtml(message).replace(/\n/g, '<br>'), theme) : ''}
    ${paragraph(de ? 'Während der Wartung kann es zu Unterbrechungen kommen. Details findest du im Portal.' : 'Service interruptions may occur during maintenance. Details are available in the portal.', theme)}
    ${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal', theme)}
    <p style="margin:0;font-size:12px;color:${palette.muted};">${de ? 'Diese Meldung ist in deinen Benachrichtigungseinstellungen aktiviert.' : 'This notification is enabled in your notification settings.'}</p>` });
  const text = de ? `Hallo ${name || ''},

${severityLabel}: ${title}

Beginn: ${formatDateTime(startsAt, lang)}
Ende: ${formatDateTime(endsAt, lang)}

${message || ''}

Portal: ${BRAND_URL}` : `Hello ${name || ''},

${severityLabel}: ${title}

Start: ${formatDateTime(startsAt, lang)}
End: ${formatDateTime(endsAt, lang)}

${message || ''}

Portal: ${BRAND_URL}`;
  return { subject, text, html };
}


function infrastructureDownTemplate({ name, kind = 'cluster', serviceName, clusterName = '', detail = '', language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language);
  const de = lang === 'de';
  const palette = THEMES[normalizeTheme(theme)];
  const labels = {
    cluster: de ? 'Cluster' : 'Cluster',
    node: de ? 'Node' : 'Node',
    pangolin: 'Pangolin'
  };
  const typeLabel = labels[kind] || labels.cluster;
  const displayName = serviceName || typeLabel;
  const subject = de ? `⚠ ${typeLabel} nicht erreichbar: ${displayName}` : `⚠ ${typeLabel} unavailable: ${displayName}`;
  const title = de ? `${typeLabel} nicht erreichbar` : `${typeLabel} unavailable`;
  const rows = [
    infoRow(de ? 'Typ' : 'Type', typeLabel, theme),
    infoRow(de ? 'Name' : 'Name', displayName, theme)
  ];
  if (clusterName && kind !== 'cluster') rows.push(infoRow('Cluster', clusterName, theme));
  rows.push(infoRow(de ? 'Erkannt am' : 'Detected at', formatDateTime(new Date(), lang), theme));

  const html = baseLayout({ language: lang, theme, preheader: subject, title, eyebrow: de ? 'Infrastruktur' : 'Infrastructure', bodyHtml: `
    <div style="margin:0 0 16px;">${statusPill('OFFLINE', palette.danger)}</div>
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Das Hosting Portal kann die folgende Infrastruktur-Komponente derzeit nicht erreichen:' : 'The Hosting Portal cannot currently reach the following infrastructure component:', theme)}
    ${infoTable(rows, theme)}
    ${detail ? paragraph(`<strong>${de ? 'Details' : 'Details'}:</strong> ${escapeHtml(detail)}`, theme) : ''}
    ${button(BRAND_URL, de ? 'Portal öffnen' : 'Open portal', theme)}` });

  const text = de
    ? `Hallo ${name || ''},

${typeLabel} nicht erreichbar: ${displayName}${clusterName && kind !== 'cluster' ? `
Cluster: ${clusterName}` : ''}${detail ? `
Details: ${detail}` : ''}

Portal: ${BRAND_URL}`
    : `Hello ${name || ''},

${typeLabel} unavailable: ${displayName}${clusterName && kind !== 'cluster' ? `
Cluster: ${clusterName}` : ''}${detail ? `
Details: ${detail}` : ''}

Portal: ${BRAND_URL}`;

  return { subject, text, html };
}

function testMailTemplate({ name, language = 'en', theme = 'light' }) {
  const lang = normalizeLanguage(language); const de = lang === 'de'; const palette = THEMES[normalizeTheme(theme)];
  const subject = de ? `${BRAND_NAME} - Test-E-Mail` : `${BRAND_NAME} - Test email`;
  const title = de ? 'Test erfolgreich' : 'Test successful';
  const html = baseLayout({ language: lang, theme, preheader: de ? 'Die SMTP-Konfiguration funktioniert.' : 'The SMTP configuration works.', title, eyebrow: 'SMTP', bodyHtml: `
    <div style="margin:0 0 16px;">${statusPill('SMTP OK', palette.success)}</div>
    ${paragraph(hello(name, lang), theme)}
    ${paragraph(de ? 'Diese Test-E-Mail bestätigt, dass der E-Mail-Versand des Hosting Portals korrekt konfiguriert ist.' : 'This test email confirms that outgoing email for the Hosting Portal is configured correctly.', theme)}` });
  const text = de ? `Hallo ${name || ''},

diese Test-E-Mail bestätigt, dass der E-Mail-Versand korrekt konfiguriert ist.

${BRAND_NAME}` : `Hello ${name || ''},

this test email confirms that outgoing email is configured correctly.

${BRAND_NAME}`;
  return { subject, text, html };
}

module.exports = { passwordResetTemplate, welcomeTemplate, resourceDownTemplate, resourceRecoveredTemplate, maintenanceTemplate, infrastructureDownTemplate, testMailTemplate };
