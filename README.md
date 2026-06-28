# Hosting Portal - Changelog

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
