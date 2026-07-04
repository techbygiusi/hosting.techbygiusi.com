# Hosting Portal - Changelog

## v2.2.1 - 2026-07-04

**Commit:** `fix: v2.2.1 – token-berechtigungen immer anzeigen (live-refresh via token prüfen), verschlüsselungs-hinweise entfernt`

### Cluster / Token-Berechtigungen
- Die Token-Berechtigungen (Lesen / Power / Konsole / Erstellen) werden jetzt **automatisch beim Öffnen des Cluster-Tabs** angezeigt – nicht mehr erst nach „Token prüfen".
- „Token prüfen" bleibt und aktualisiert die Anzeige des jeweiligen Clusters **live**, ohne Tab-Wechsel oder Reload; der Button zeigt währenddessen „Prüfe…".
- Neue Lade- und Fehlerzustände: „Berechtigungen werden geladen…" bzw. ein Hinweis, wenn der Token/die Verbindung nicht abrufbar ist.

### UI-Text
- Entfernt: die Hinweise „Verschlüsselt gespeichert. Jeder Abruf wird protokolliert." / „AES-256-GCM-verschlüsselt gespeichert" im Zugangsdaten-Bereich (Verschlüsselung/Protokollierung passieren weiterhin, werden aber nicht mehr im UI erwähnt).

---

## v2.2.0 - 2026-07-04

**Commit:** `feat: v2.2.0 – admin kann ressourcen-zugangsdaten hinterlegen; user behält/löscht sie, admin kann user-daten nicht anfassen`

### Zugangsdaten pro Ressource
- Der **Admin** kann jetzt direkt an einer Ressource Zugangsdaten hinterlegen (Dienste → Karte → „Zugangsdaten hinterlegen"). Diese erscheinen beim Benutzer im Zugangsdaten-Tab mit der Markierung „vom Admin".
- Der **Benutzer** kann admin-hinterlegte Zugangsdaten ansehen, kopieren und **löschen oder behalten** – aber nicht bearbeiten.
- **Trennung der Rechte** (serverseitig erzwungen):
  - Admin sieht/verwaltet nur die von ihm angelegten Einträge; vom Benutzer erstellte Zugangsdaten werden ihm nur als gesperrt angezeigt (kein Klartext, kein Bearbeiten, kein Löschen).
  - Benutzer-eigene Zugangsdaten kann der Admin weder aufdecken (403) noch löschen (403).
  - Der Benutzer kann admin-hinterlegte Einträge nicht bearbeiten (403), nur löschen.
- Neue Spalte `created_by_role` an `resource_credentials` unterscheidet Admin- und Benutzer-Einträge. Jeder Passwort-Abruf wird im Audit-Log protokolliert.

### Update-Hinweise
- Rebuild mit `docker compose up -d --build`. Die Datenbank migriert sich selbst (neue Spalte `created_by_role`, Standard `user` für bestehende Einträge).

---

## v2.1.0 - 2026-07-04

**Commit:** `feat: v2.1.0 – self-service als toggle, provisioning & credentials in settings, CT/VM-typwahl mit live templates/ISOs, log-scroll fix`

### Self-Service
- Der Self-Service-Schalter im Proxmox-Modal ist jetzt ein echter **Toggle**; die Detail-Konfiguration ist von dort entfernt.
- Neuer Bereich **Einstellungen → Self-Service**: Cluster im Dropdown wählen, dann pro Cluster VMID-/IP-Bereich, Gateway/Bridge, Storages und Limits konfigurieren.
- **CT/VM-Unterscheidung**: pro Cluster festlegbar, ob Benutzer Container (LXC), VMs (QEMU) oder beides erstellen dürfen.
- CT-Templates und VM-ISOs werden **live über den API-Token** abgerufen (Storage frei wählbar, „Templates/ISOs abrufen"-Buttons).
- Optionales, verschlüsseltes **Standard-Root-Passwort** pro Cluster für neue Container.
- Der Erstell-Wizard unterscheidet nun CT (Template + Root-Passwort) und VM (leere QEMU-VM, bootet vom ausgewählten ISO; OS-Installation über die Konsole).

### Zugangsdaten
- Neuer **Zugangsdaten-Vault** unter Einstellungen: Admin kann zentrale Zugangsdaten hinterlegen, optional an einen Cluster oder Benutzer gekoppelt. AES-256-GCM-verschlüsselt, Anzeigen/Bearbeiten/Löschen, jeder Abruf im Audit-Log.

### UI-Fixes
- In der Detailansicht scrollt jetzt **nur der Tab-Inhalt** (z. B. die Log-/Aufgabenliste), Titel und Tabs bleiben fixiert – auf Desktop und im mobilen Bottom-Sheet.

### Update-Hinweise
- Rebuild mit `docker compose up -d --build`. Die Datenbank migriert sich selbst (neue Spalten `allow_types`, `iso_storage`, `default_password_encrypted`, Tabelle `admin_credentials`).
- Bestehende Cluster mit aktiviertem Self-Service: Konfiguration einmalig unter Einstellungen → Self-Service prüfen und speichern.
- Für VM-Self-Service braucht der Token zusätzlich Storage-Rechte für das ISO-Storage; für CT wie gehabt `VM.Allocate`.

---

## v2.0.0 - 2026-07-04

**Commit:** `feat: v2.0.0 – power actions, web console, logs, credentials, groups, self-service provisioning & security hardening`

### Benutzer
- Added power actions (start, reboot, shutdown, hard stop) on service cards and in the details dialog, with confirmation prompts.
- Added an **Aufgaben & Logs** tab showing the latest Proxmox tasks per machine with expandable task logs.
- Added an in-browser **web console** (xterm.js) via a backend WebSocket relay – the Proxmox API token never leaves the server; console sessions use one-time tokens (30 s validity).
- Added **Zugangsdaten** per service: credentials are stored AES-256-GCM encrypted, can be revealed/copied on demand, and every reveal is written to the audit log.
- Added **self-service machine creation** (LXC) with template selection and CPU/RAM/disk sliders; VMID and IP are allocated automatically from the admin-defined ranges.

### Gruppen
- Services can now be shared with a **group** in addition to their owner – all group members see and control the resource.
- Added group management with a member checklist in the admin area.

### Admin
- Added per-cluster self-service configuration: VMID range, IP pool (start–end, prefix, gateway), bridge, storage, template storage and limits for cores/RAM/disk.
- Added **Token prüfen**: live display of the API token permissions (read / power / console / create). Read-only tokens automatically hide power, console and provisioning for all users.
- Added a **Protokoll** tab with a full audit log (power actions, console opens, credential reveals, machine creation, admin changes) including user, timestamp and IP.

### Sicherheit
- Proxmox API tokens and stored secrets are now encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY` env or auto-generated key in `data/.encryption-key`); legacy plaintext/base64 values keep working and are re-encrypted on save.
- Removed the hardcoded JWT fallback secret: `JWT_SECRET` env or an auto-generated secret persisted in `data/.jwt-secret`.
- Added rate limiting (strict on login/password reset, moderate on the API) and a login lockout (5 failed attempts → 15 minutes).
- CORS restrictable via `FRONTEND_ORIGIN`, request body limit lowered to 1 MB, `trust proxy` configurable via `TRUST_PROXY_HOPS`.
- Task log access is restricted to tasks of the user's own machine.

### Mobile
- All modals become full-width **bottom sheets** on mobile: they slide up from the bottom edge with a grab handle and safe-area padding, while desktop keeps centered dialogs.

### Update-Hinweise
- Rebuild with `docker compose up -d --build` (new deps: `ws`, `express-rate-limit`, `@xterm/xterm`, `@xterm/addon-fit`). The database migrates itself on first start – no data is lost.
- The reverse proxy must pass WebSocket upgrades for `/api/console/ws` (already included in the shipped `nginx.conf`; Cloudflare Tunnel handles WebSockets out of the box).
- Recommended Proxmox token role for full functionality: `VM.Audit`, `VM.PowerMgmt`, `VM.Console`, `VM.Allocate` (+ `Datastore.AllocateSpace` for self-service). Read-only tokens keep working – the portal hides the unavailable features.

---

## v1.0.32 - 2026-06-29

**Commit:** `fix: lock modal scroll and refine dark surfaces`

- Locked the page background while a popup is open so the dashboard behind it no longer scrolls on desktop or mobile.
- Replaced the rotating close icon with a subtle button wiggle/hover effect.
- Reworked dark-mode surface hierarchy so page, main containers, service cards, inner boxes and popups are easier to distinguish while keeping the same dark base background.
- Strengthened dark-mode danger button contrast for clearer destructive actions.

---

## v1.0.31 - 2026-06-29

**Commit:** `style: improve modal field contrast and close hover`

- Increased the contrast between light-mode popup backgrounds and the white fields/inner sections so inputs are easier to distinguish.
- Kept the popup surface neutral grey while making form fields and detail boxes clearly white with a stronger border.
- Added a subtle hover/focus animation to the modal close button with rotation and contrast feedback.
- Preserved the service-card light-mode hierarchy and the neutral dark-mode popup styling.

---

## v1.0.30 - 2026-06-29

**Commit:** `style: tune light modal surface`

- Changed the light-mode popup background to the same neutral gray surface used in the app cards instead of the brighter modal look.
- Kept form fields and inner popup sections white for clear contrast and readability.
- Preserved the service-card light-mode hierarchy and the neutral dark-mode popup styling.

---

## v1.0.29 - 2026-06-29

**Commit:** `fix: separate service cards in light mode`

- Fixed the light-mode **Dienste** section so individual service cards stand out clearly from the surrounding panel.
- Changed the service cards themselves to white in light mode and set the inner summary boxes back to a light neutral grey.
- Kept the improved light-mode styling for Benutzer and Proxmox, and kept the darker neutral popup styling in dark mode.

---

## v1.0.28 - 2026-06-28

**Commit:** `style: refine modal and nested surface contrast`

- Fixed light-mode nested surfaces so box-in-box layouts stand out more clearly, especially in Proxmox and Benutzer sections.
- Changed dark-mode popups from a blue-tinted look to a more neutral black/gray surface.
- Made danger actions in dark mode more visible with stronger red contrast.
- Kept the compact Dienste cards and the new details modal behavior.

---

## v1.0.27 - 2026-06-29

**Commit:** `feat: show service details in modal`

- Changed **Details anzeigen** on Dienst cards so it opens a dedicated details popup instead of expanding the card inline.
- Kept the compact Dienst overview stable while moving metadata, disks and admin actions into the details dialog.
- On mobile, the details dialog uses the existing full-width bottom-sheet behavior and slides up from the bottom.
- Updated the README changelog.

---

## v1.0.26 - 2026-06-29

**Commit:** `style: remove beige light surfaces`

- Removed the remaining warm/beige-looking light-mode surfaces.
- Set the light-mode page background to pure white, main containers and popups to neutral cold grey, and nested boxes back to white.
- Added final light-mode surface overrides so older component rules cannot reintroduce warm tones.
- Left dark mode unchanged.

---

## v1.0.25 - 2026-06-29

**Commit:** `style: alternate light mode surfaces`

- Changed the light-mode page background back to pure white.
- Kept main cards, panels and popup dialogs on the neutral grey surface.
- Changed nested boxes inside cards, such as service summary fields and detail rows, back to white so the hierarchy is clearer.
- Left dark mode unchanged.

---

## v1.0.24 - 2026-06-28

**Commit:** `style: restore neutral gray light cards`

- Changed the light-mode container and service card surfaces back to a neutral gray palette instead of the warmer beige tones.
- Kept the stronger separation between outer cards and inner boxes so the Dienste overview remains readable.
- Left the dark-mode styling unchanged.

---

## v1.0.23 - 2026-06-28

**Commit:** `style: widen desktop admin layout`

- Increased the desktop app and header width so the admin area uses more available screen space.
- Let the **Dienste** grid use wider desktop layouts while keeping the mobile layout unchanged.
- Kept login and setup pages visually centered and preserved the existing light/dark theme behavior.

---

## v1.0.22 - 2026-06-28

**Commit:** `fix: increase light mode service card contrast`

- Increased the visual contrast of inner boxes on light-mode **Dienste** cards so Benutzer/Cluster and detail boxes stand out more clearly from the outer card.
- Kept the dark-mode card styling unchanged because that view already had good contrast.
- Preserved the compact Dienste overview, the direct website links and the German-only frontend wording.

---

## v1.0.21 - 2026-06-28

**Commit:** `fix: show service links outside details`

- Shows configured service website links directly on admin service cards again.
- Keeps technical metadata, disks and admin actions behind **Details anzeigen** so the service overview stays compact.
- Keeps the existing user dashboard behavior where the public website link is visible directly on the card.
- Preserves the German-only frontend wording and current TechByGiusi styling.

---

## v1.0.20 - 2026-06-28

**Commit:** `feat: rename resources to services and collapse details`

- Renamed the frontend resource area to **Dienste** so the portal wording better matches the hosted customer services.
- Reduced service cards to the most important overview data first: name, type, status, assigned user or cluster, CPU and RAM.
- Moved detailed metadata, disks, management links and admin actions behind a **Details anzeigen** toggle so the overview stays clean.
- Applied the collapsed service card behavior to both the admin dashboard and the user dashboard.
- Kept all visible frontend labels in German and preserved the current TechByGiusi theme behavior.

---

## v1.0.19 - 2026-06-28

**Commit:** `fix: center desktop login card`

- Centered the login card vertically on desktop as well as mobile.
- Kept setup pages scroll-friendly and unchanged.
- Preserved the mobile header, mobile theme toggle and floating mobile logout behavior from v1.0.18.

---

## v1.0.18 - 2026-06-28

**Commit:** `fix: enable mobile theme toggle and center login`

- Enabled the same dark/light SVG theme toggle on mobile instead of forcing mobile clients to light mode.
- Kept the mobile header layout with `Hosting by TechByGiusi` on the left and the theme toggle aligned on the right.
- Kept the mobile logout action as a floating bottom-right SVG button so it does not disturb the header layout.
- Centered the mobile login card vertically while keeping setup pages scroll-friendly.
- Preserved the German-only visible frontend labels and the clean TechByGiusi-style surfaces.

---

## v1.0.17 - 2026-06-28

**Commit:** `feat: add setup check in settings`

- Added an **Einrichtung prüfen** action to the admin settings area so the initial configuration can be checked again after setup has already been completed.
- Added a setup check dialog showing administrator, Proxmox and SMTP status without deleting or changing existing configuration.
- Added direct Proxmox and SMTP test actions inside the setup check dialog; both reuse the already stored credentials where possible.
- Kept the existing setup route protected for incomplete setup only and kept the UI German-only.

---

## v1.0.16 - 2026-06-28

**Commit:** `fix: use solid surfaces for readable dialogs`

- Replaced transparent light-mode surfaces with solid `#ebe9e6` cards so nested elements no longer bleed through each other.
- Kept the page background at `#F7F5F3` and kept forms on solid white input fields for readable contrast.
- Reworked modal dialogs with a solid panel, clear overlay, better spacing and mobile scrolling so background cards no longer overlap visually with form fields.
- Preserved the reduced TechByGiusi-style layout, German-only frontend labels and mobile-only light mode.

---

## v1.0.15 - 2026-06-28

**Commit:** `fix: update brand title and mobile logout action`

- Changed the header brand text to `Hosting by TechByGiusi`.
- Changed the browser tab title to `Tech by Giusi | Hosting`.
- Changed the mobile logout action to a floating bottom-right SVG icon button.
- Kept the desktop logout button as a normal text action in the header.
- Kept mobile locked to light mode and preserved the German-only frontend labels.

---

## v1.0.14 - 2026-06-28

**Commit:** `feat: add resource links and edit flows`

- Changed the light mode card surfaces to the simpler `#cccccc45` style from the TechByGiusi reference while keeping the page background `#F7F5F3`.
- Added separate resource links for public pages and management pages.
- Added edit dialogs for Benutzer, Proxmox clusters and Ressourcen.
- Added Proxmox cluster editing with optional token reuse when no new API token is entered.
- Added resource editing for name, assigned user, cluster, VM/CT ID, public page and management page.
- Made the overview cards clickable so they open the related admin areas.
- Kept mobile locked to light mode and preserved the German-only frontend labels.

---

## v1.0.13 - 2026-06-28

**Commit:** `fix: reuse saved smtp password for tests`

- Changed the admin SMTP test so an empty password field reuses the already saved SMTP password.
- Kept the current SMTP host, port and user values editable while still falling back to saved values if a field is not submitted.
- Updated the SMTP password placeholder to make the saved-password behavior clear.

---

## v1.0.12 - 2026-06-28

**Commit:** `style: update light mode background`

- Changed the light mode page background to `#F7F5F3`.
- Kept cards and input surfaces white so the UI keeps its clean contrast.
- Kept mobile locked to light mode with the same `#F7F5F3` background.

---

## v1.0.11 - 2026-06-28

**Commit:** `fix: replace theme button with neutral icon toggle`

- Replaced the visible Hell/Dunkel text button with a compact neutral icon toggle.
- Added simple inline SVG sun and moon icons without colored accent styling.
- Kept the desktop-only theme toggle behavior unchanged and continued to force light mode on mobile.
- Kept the switch aligned with the header actions.

---
## v1.0.10 - 2026-06-28

**Commit:** `fix: improve resource disk reporting`

- Changed the admin and user header brand text to `TechByGiusi - Hosting`.
- Expanded Proxmox disk reporting for VMs and LXCs so configured disks are shown individually instead of only showing a single zero value.
- Added optional QEMU guest-agent filesystem usage detection. If the guest agent reports filesystem usage, the portal shows used and total values; otherwise it shows configured disk size and clearly marks usage as not reported.
- Added support for multiple configured VM disks such as SCSI, SATA, IDE and VirtIO disks.
- Kept LXC root disk and mount point detection based on Proxmox config and live status values.
- Changed the Einstellungen panel to use the same width as Benutzer, Proxmox and Ressourcen.
- Updated resource cards to display disk details in German with a cleaner layout.

---

## v1.0.9 - 2026-06-28

**Commit:** `fix: modernize header and remove tg mark`

- Removed the TG mark from the admin and user headers.
- Replaced the decorative lamp theme switch with a simple desktop-only light/dark button.
- Moved the theme button into the header next to Abmelden so all header actions are aligned.
- Kept mobile locked to light mode and hid the theme button on small screens.
- Reduced visual decoration, heavy borders, large spacing and oversized typography for a cleaner modern layout.
- Updated login and setup pages to use the same simple desktop theme action without showing anything on mobile.

---

## v1.0.8 - 2026-06-28

**Commit:** `fix: clean ui and add proxmox test action`

- Removed helper/comment-style frontend text from the admin panels, login page and setup sections so the UI stays cleaner and more direct.
- Removed the logged-in user chip from the top-right header on admin and user pages; only the logout action remains.
- Added a Proxmox connection test button to the admin cluster creation dialog.
- Reset the Proxmox test result when cluster fields are changed or the dialog is closed.
- Reduced remaining heavy font weights across headings, buttons and table headers.
- Kept all visible frontend labels and messages in German and mobile locked to light mode.

---

## v1.0.7 - 2026-06-28

**Commit:** `feat: add monitored resources tab`

- Added a new admin tab named Ressourcen for managed Proxmox containers and VMs.
- Added resource creation with cluster selection, Proxmox resource loading, user assignment and optional web link.
- Added backend API routes for creating, listing, updating and deleting resources.
- Added a new resources database table while keeping the old assignment routes for compatibility.
- Switched Proxmox monitoring to the read-friendly cluster resources endpoint so PVEAuditor-style API tokens can show live status, CPU, RAM and disk values.
- Updated the user dashboard so users see their assigned resources with online/offline state, utilization and the configured web link.
- Cleaned the frontend wording to German-only visible text and reduced heavy font weights and oversized headings.
- Refined the layout toward the Tech by Giusi design, kept desktop light/dark mode and forced mobile to light mode only.

---

## v1.0.6 - 2026-06-28

**Commit:** `feat: simplify admin settings and polish responsive ui`

- Moved the desktop header layout so the logout button no longer sits underneath the lamp light/dark switch.
- Kept mobile clients locked to light mode and hid the light/dark switch on mobile.
- Added an admin settings page for SMTP so the mail configuration can be changed after the first setup.
- Changed user creation so an administrator can set the start password manually and hand it to the user.
- Removed customer group management from the frontend and simplified assignments to direct user assignments only.
- Replaced the old role handling with a simple dropdown for Benutzer or Administrator. The first setup user remains administrator automatically.
- Cleaned and modernized the admin and user dashboards with responsive cards, cleaner tables, mobile-friendly modals and a layout closer to the Tech by Giusi site colors.
- Rewrote broken inline dashboard CSS and fixed backend route syntax issues from the previous package.

---

## v1.0.5 - 2026-06-28

**Commit:** `fix: serve frontend through nginx api proxy`

- Changed the frontend container from the React development server to a production Nginx build. This removes the React development WebSocket errors and prevents the browser from trying to connect to `:3000/ws`.
- Added an internal Nginx proxy for `/api/` so the browser now calls the same domain instead of `https://domain:3001`. This fixes the API timeout that prevented the first setup wizard from opening.
- Updated Docker Compose so only the frontend is publicly exposed on port `3000`; the backend remains reachable locally on the server and internally inside the Docker network.
- Changed the frontend API default to `/api` and updated the frontend environment example.
- Fixed the login card layout so it no longer stretches across the whole screen.
- Added a clear backend-unreachable screen instead of silently falling back to the login page when the API cannot be reached.
- Reset Proxmox and SMTP test results when the related input values are changed.
- Removed leftover frontend styling comments and fixed an invalid extra brace in the admin dashboard CSS.

---

## v1.0.4 - 2026-06-28

**Commit:** `fix: localize frontend and force mobile light mode`

- Forced the mobile frontend to always use light mode and hide the lamp light/dark toggle on mobile screens.
- Kept the desktop light/dark lamp toggle intact.
- Translated visible frontend UI texts to German across login, setup, admin dashboard, user dashboard, status messages, confirmations, and fallback error messages.
- Removed the unfinished password reset link from the login UI until a matching frontend page exists.
- Added frontend-side translation for common backend/API response messages so errors shown in the UI stay German.
- Cleaned visible setup text so the interface no longer shows random English helper comments.

---

## v1.0.3 - 2026-06-28

**Commit:** `feat: require complete first setup wizard`

- Changed initial setup so it is only complete when all required parts are saved: administrator, Proxmox API, and SMTP.
- Added setup status detection for missing admin, Proxmox, or SMTP configuration. The portal now redirects to setup on every start until all required parts exist.
- Reworked the setup wizard into three tabs: Administrator, Proxmox API, and SMTP Mail.
- Added public first-setup-only test endpoints for Proxmox and SMTP, so both can be tested before the first login.
- Fixed Proxmox connection tests so HTTP errors like 401/403 are treated as failed tests instead of false success.
- Matched the portal light and dark mode colors to the WordPress site theme: white/black base, soft card surfaces, muted text, green link accent, dark mode surfaces, and the lamp-style theme toggle.
- Improved frontend API URL detection so a localhost build value no longer breaks access from another device on the network.

---

## v1.0.2 - 2026-06-28

**Commit:** `fix: use node based docker healthchecks`

- Replaced the backend Docker Compose healthcheck from `curl` to a Node.js based check, because the Alpine Node image does not include `curl` by default.
- Reduced the backend healthcheck waiting time with a shorter `start_period` and faster retry interval.
- Updated the standalone backend Dockerfile healthcheck to use the same robust Node.js logic.
- Backend should no longer stay on `waiting` and then become `unhealthy` only because the healthcheck command is missing.

---

## v1.0.1 - 2024-06-28

**Commit:** `fix: remove version from docker-compose.yml + npm ci to npm install`

- Changed `npm ci` to `npm install` in Dockerfiles
- Removed version line from docker-compose.yml

---

## v1.0.0 - 2024-06-28

**Commit:** `init: complete hosting portal project scaffold`

- Full backend (Express + SQLite)
- Full frontend (React 18)
- 26 API endpoints
- Admin & User dashboards
- Proxmox integration
- Docker Compose setup
- JWT auth + Bcrypt
- Email service
- 100% responsive
