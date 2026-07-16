# Hosting Portal

A lightweight self-hosted customer portal for Proxmox-based hosting. The portal gives administrators a clean web interface for users, groups, Proxmox clusters, services, credentials, SMTP settings and audit logs. Users can view their assigned services, open service details for power and delete actions when the token allows it, open a full-page desktop console, read task logs, manage service credentials and create/delete their own LXC containers through self-service.

The frontend is built with React and the backend with Express + SQLite. Proxmox API tokens and stored secrets are encrypted at rest.

## Version

Current version: **v3.1.29**

Versioning now follows a clean semantic sequence:

- **Patch** versions for small fixes and UI polish.
- **Minor** versions for user-visible features.
- **Major** versions only for breaking changes.

The old history is kept below, but new releases should continue from the current `v3.x` line without date or numbering jumps.

## What's new in v3.0.0

### Security hardening

- **Fixed a critical password-reset flaw**: reset tokens were verified against a hardcoded fallback secret when `JWT_SECRET` was unset. Reset tokens are now purpose-bound (`password-reset`), expire after **1 hour**, are verified against the real runtime secret and are rejected as session tokens.
- Minimum password length raised from 6 to **8 characters** everywhere (setup, admin-created users, change and reset).
- bcrypt cost factor raised from 10 to **12**.
- Logins (successful and failed), password changes and resets are now written to the audit log.

### Maintenance windows & top banner

- Admins can plan maintenance windows (title, description, severity, start/end) in the new **Wartung** tab.
- Active and upcoming windows appear as a banner at the top of every page - **including the login screen**. Active windows cannot be dismissed; upcoming ones can be hidden per browser.
- Optionally notify all users by e-mail when a window is created or updated.

### Monitoring & user notifications

- A background monitoring service polls all clusters (default every 60 s, debounced against flapping) and records status transitions.
- Users choose in their own **Benachrichtigungen** settings whether to receive e-mails when a service goes **offline**, comes **back online**, or when **maintenance** is announced.
- Admin overview shows the most recent status events.

### Professional e-mails & login

- All outgoing mail (password reset, welcome, outage, recovery, maintenance, test) now uses branded, responsive HTML templates in the portal design language.
- Redesigned split-layout login screen with feature panel, password visibility toggle and a working **Passwort vergessen** flow - including the previously missing reset-password page.
- Admins can send a welcome e-mail when creating a user and a branded test e-mail from the settings tab.

## Highlights

### Admin area

- Manage users and administrators.
- Manage customer groups and share services with group members.
- Add Proxmox clusters by URL and API token.
- Show token capabilities directly on the cluster card.
- Keep the Proxmox cluster card focused on the cluster address and permissions.
- Assign existing Proxmox LXCs/VMs to users.
- Attach credentials to a specific service without exposing private user-created credentials back to the admin.
- Maintain one shared management-page credential per service that admins and authorized users can both update.
- Configure SMTP after the first setup.
- Configure LXC self-service per cluster.
- Review audit events for power actions, console access, credentials and provisioning.

### User area

- View assigned services with live status, CPU, RAM and disk information.
- See the reachable container IP address in the detail view. Static LXC IPs are read from the Proxmox network config and loopback addresses are ignored.
- Start, stop, reboot, shut down or delete services from the detail view when the Proxmox token permits it.
- Open a full-page console in a separate browser tab on desktop when the Proxmox token permits it.
- Read recent Proxmox tasks and logs for the assigned service.
- Manage service credentials. Root credentials used during self-service provisioning are saved automatically on the created service.
- Create new LXC containers on desktop or mobile through template-only self-service with mandatory internet-only network isolation.
- Delete containers that the user created through self-service.

### Self-service provisioning

Self-service is intentionally limited to LXC containers created from administrator-approved CT templates. VM creation remains an administrator task in Proxmox, and Community Scripts have been removed from the portal.

The backend automatically allocates:

- The next free VMID from the configured VMID range.
- The next free IPv4 address from the configured IP pool.

The IP allocator checks the portal reservation table, static LXC network config and live LXC interface addresses from Proxmox, so containers created outside the portal are respected as well.

Before the first start, the backend enables the Proxmox guest firewall and adds outbound drop rules for the container subnet, RFC1918 networks, CGNAT, IPv4 link-local ranges and all IPv6 traffic. DNS is limited to configured public IPv4 resolvers. The portal verifies that the Proxmox Datacenter firewall is enabled and deletes a newly created LXC if the isolation rules cannot be installed. If automatic cleanup fails, the orphaned LXC remains stopped and the portal reports that it must be checked in Proxmox.

Admins configure per cluster:

- Self-service on/off.
- VMID range.
- IP range, CIDR prefix and gateway.
- Bridge.
- Disk storage, selected from live storages reported by the selected Proxmox node.
- CT template storage.
- Allowed CT templates. Submitted template IDs are validated again by the backend.
- CPU, RAM and disk limits.

## Recommended Proxmox token rights

A read-only token is enough for monitoring. Extra features appear only when the token has the matching permissions.

Recommended role for full portal functionality:

- `VM.Audit`
- `VM.PowerMgmt`
- `VM.Console`
- `VM.Allocate`
- `VM.Config.Network` on the Proxmox VM path used for self-service containers so the portal can create guest firewall rules
- `Sys.Audit` on `/` so the portal can verify that the Datacenter firewall is enabled
- `Datastore.AllocateSpace` on the storage used for LXC disks/templates

The portal hides unavailable actions when the token does not provide the matching capability. The Proxmox Datacenter firewall must also be enabled before self-service can be activated.

## Docker Compose

```yaml
services:
  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      DB_PATH: /app/data/hosting.db
      FRONTEND_ORIGIN: https://your-domain.example
      TRUST_PROXY_HOPS: 1
      SELF_SERVICE_DNS_SERVERS: "1.1.1.1 1.0.0.1"
    volumes:
      - hosting-data:/app/data

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  hosting-data:
```

Start or update the portal:

```bash
docker compose up -d --build
```

Open the frontend on port `3000` or place it behind your reverse proxy.

## Environment variables

### Backend

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Backend API port inside the container. |
| `DB_PATH` | `backend/data/hosting.db` | SQLite database path. |
| `JWT_SECRET` | auto-generated in data volume | JWT signing secret. Set it manually for strict production control. |
| `ENCRYPTION_KEY` | auto-generated in data volume | AES key for Proxmox tokens and stored secrets. Set it manually for strict production control. |
| `FRONTEND_ORIGIN` | empty | Optional CORS origin, for example `https://portal.example.com`. |
| `TRUST_PROXY_HOPS` | `0` | Express trust proxy setting for reverse proxy deployments. |
| `SELF_SERVICE_DNS_SERVERS` | `1.1.1.1 1.0.0.1` | Space-, comma- or semicolon-separated public IPv4 DNS resolvers assigned to new self-service LXCs. Private, local, multicast and reserved addresses are rejected. |

### Frontend

| Variable | Default | Description |
| --- | --- | --- |
| `REACT_APP_API_URL` | `/api` | API base URL. The shipped Nginx config proxies `/api` to the backend. |

## Reverse proxy notes

The frontend container serves the React build through Nginx and proxies `/api/` to the backend. The console feature uses WebSockets, so the reverse proxy must pass WebSocket upgrades for `/api/console/ws`.

The included `frontend/nginx.conf` already contains the required upgrade headers.

## Data and security

- SQLite data is stored in the backend data volume.
- JWT and encryption keys are generated once and persisted in the data volume if they are not supplied by environment variables.
- Proxmox tokens and stored credentials are encrypted with AES-256-GCM.
- Legacy plaintext/base64 values are still accepted and are re-encrypted on save.
- Credential reveal actions are logged in the audit log.
- User self-service deletion is restricted to containers the same user created through the portal.
- Self-service creation is template-only; the removed Community Script endpoints and node-shell provisioning page are no longer available.
- New self-service LXCs are created stopped, receive host-side outbound isolation rules, and are started only after the firewall configuration succeeds.

### Network isolation recommendation

The portal firewall rules provide a host-side safety layer that a compromised container cannot change. For the strongest traditional network boundary, place the self-service IP pool on a dedicated VLAN/bridge and enforce an upstream firewall policy from that VLAN to **WAN only**. Block access to management, server, client, storage, VPN and other internal VLANs at the router/firewall as well. This protects the environment even if the Proxmox guest firewall is accidentally changed later.

## Update notes

For normal updates:

```bash
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

The database migrates itself on startup. Keep the backend data volume before updating.

## Changelog

### v3.1.29 - 2026-07-16

**Commit:** `feat: enforce template-only provisioning with internet-only container isolation`

- removed the unfinished Community Scripts picker, API endpoints, node-shell provisioning console, stored node-credential management and related client code
- restricted user self-service to CT templates on desktop and mobile and validate administrator-approved template IDs again in the backend
- create new self-service LXCs in a stopped state, enable their Proxmox firewall and block outbound access to the guest subnet, private networks, CGNAT, IPv4 link-local ranges and IPv6 before startup
- allow only configured public IPv4 DNS resolvers and add `SELF_SERVICE_DNS_SERVERS` for resolver configuration
- fail closed by deleting a newly created container when isolation cannot be applied, keep cleanup failures stopped for manual inspection, and require the Proxmox Datacenter firewall to be enabled
- require and display `VM.Config.Network` plus `Sys.Audit` capabilities for secure self-service provisioning
- documented the recommended dedicated VLAN/bridge with an upstream WAN-only firewall policy

### v3.1.28 - 2026-07-16

**Commit:** `fix: remember auth language without showing a login language switch`

- removed the EN/DE switch from the login, password-reset and initial-setup screens
- fresh browsers now use English automatically on all unauthenticated pages
- browsers that previously stored a user language continue to use that language for login, forgot-password, password reset, setup text and maintenance banners
- kept the stored language when logging out, so returning users see authentication pages in their last selected language
- validated the stored language value and fall back to English for missing or invalid values

### v3.1.27 - 2026-07-16

**Commit:** `fix: move user notifications inline and use language buttons in settings`

- replaced the normal user notification modal with a dedicated inline **Notifications** page on desktop and mobile
- kept notification preferences directly accessible from the user sidebar and fullscreen mobile menu
- changed language selection in admin and user settings from a compact slider to two full-width **English / Deutsch** buttons matching the mobile menu
- kept the selected language synchronized with the stored user preference used for portal text, maintenance banners and e-mail notifications

### v3.1.26 - 2026-07-16

**Commit:** `fix: move desktop language selection into settings and align user desktop layout`

- removed the desktop header EN/DE switch for authenticated admin and user views
- moved desktop language selection into the **Settings** area and kept the fullscreen mobile menu selector for smaller screens
- aligned the normal user desktop layout with the admin shell by adding the same left sidebar pattern
- restored clearer location markers on the cluster map with a visible marker halo


### v3.1.25 - 2026-07-16

**Commit:** `fix: align user menu language controls and restore map markers`

- changed the normal user menu button to an icon-only control without the extra `Menu` text
- added the same full-width **English / Deutsch** selector used by the admin overlay to the normal user fullscreen menu
- removed the separate language card from normal user settings so language placement now follows the admin layout
- placed country borders and cluster markers in separate Leaflet panes so asynchronously loaded country shapes can no longer cover the location markers

### v3.1.24 - 2026-07-16

**Commit:** `docs: normalize changelog version history`

- corrected duplicated and misnumbered `v3.1.x` changelog headings
- restored the continuous `v3.1.7` through `v3.1.23` release sequence
- added the previously missing `v3.0.0` changelog entry
- corrected the versioning note so new releases continue from the current `v3.x` line

### v3.1.23 - 2026-07-16

**Commit:** `feat: persist user language for notifications and simplify cluster map borders`

- stores each authenticated user's last selected EN/DE language in the database
- restores the stored language after login and synchronizes language changes across devices
- sends password-reset, welcome, outage, recovery, maintenance and test e-mails in the recipient's stored language
- renders the cluster map from a bundled country-boundary dataset with only national borders and no road or regional line clutter

### v3.1.22 - 2026-07-16

**Commit:** `fix: complete bilingual UI audit and compact node status pills`

- completed a screen-by-screen English/German audit across login, setup, admin, user, service details, self-service, consoles, maintenance, notifications and status views
- added missing translations for visible labels, helper text, audit actions, native confirmation dialogs, API errors, terminal messages and input/textarea placeholders
- made timestamps and uptime values respect the selected portal language
- reduced the desktop and mobile height of the cluster node-count pills and enforced a consistent compact pill shape
- fixed the duplicated maintenance panel header found during the audit

### v3.1.21 - 2026-07-16

- tightened the **3/3 Nodes** pills in cluster location and cluster status cards so they no longer look oversized on desktop and stay cleaner on mobile
- added missing portal translations for cluster-location labels and self-service range labels
- added missing translations for multiple input placeholders and helper texts so English and German both cover placeholder content more consistently

### v3.1.20 - 2026-07-09

**Commit:** `feat: complete bilingual portal translation and refine language controls`

- Hidden the admin EN/DE topbar switch on mobile because language selection already exists in the fullscreen menu.
- Removed the duplicate language selector from desktop admin settings.
- Redesigned the user language selector as a light/dark-style sliding control with theme-aware colors.
- Added a portal-wide bilingual translation runtime for pages, dialogs, buttons, placeholders, errors and dynamically loaded UI.
- Added language controls to sign-in, setup and password reset screens. English remains the default.

### v3.1.19 - 2026-07-09

**Commit:** `feat: add user fullscreen menu and language settings`

- Added the EN/DE language switch inside the settings area.
- Added a fullscreen user menu with Dashboard, Notifications and Settings.
- Moved user notification access into the user menu and the new user settings page.
- Added a language card to the admin settings page as well.

### v3.1.18 - 2026-07-09

**Commit:** `fix: localize maintenance banner labels`

- Maintenance banner labels now follow the selected EN/DE language.
- Active and upcoming maintenance prefixes, relative time text, date locale and dismiss labels are translated.
- Banner layout offset recalculates after language changes so the sticky header remains correctly positioned.

### v3.1.17 - 2026-07-09

**Commit:** `fix: apply selected language to dashboard labels`

- The EN/DE switch now changes the visible dashboard labels instead of only the mobile overlay.
- Admin dashboard navigation, counters, actions, cluster map and cluster status labels now react to the selected language.
- User topbar actions and service card buttons now react to the selected language as well.
- English remains the default language.

### v3.1.16 - 2026-07-09

**Commit:** `feat: add desktop language switch to admin and user topbars`

- Added a visible EN/DE language switch to the desktop topbar for admins and users.
- Reused the same stored language setting as the mobile overlay, with English as the default.
- Kept the mobile overlay language switch in sync with the desktop topbar selector.

### v3.1.15 - 2026-07-09

**Commit:** `fix: improve mobile overlay contrast and restore standard dashboard spacing`

- Fixed unreadable dark mobile menu text by enforcing the proper theme text color in the fullscreen overlay.
- Restored a cleaner, standard-sized gap between the dashboard metric cards and the Cluster-Standorte section on desktop and mobile.
- Kept the mobile overlay language feature from v3.1.14 intact.

### v3.1.14 - 2026-07-09

**Commit:** `feat: add english and german language options to mobile overlay`

- Added English and German language options to the mobile admin overlay.
- English is now the default overlay language.
- The selected overlay language is stored locally and reused on the next visit.

### v3.1.13 - 2026-07-09

**Commit:** `fix: standardize overview wording to dashboard`

- Standardized the main portal navigation wording from `Übersicht` to `Dashboard`.
- Updated dashboard navigation labels and related accessibility labels for consistent wording.

### v3.1.12 - 2026-07-09

**Commit:** `style: normalize mobile self-service spacing`

- Cleaned up the mobile self-service settings layout.
- Added consistent mobile padding for the self-service panel, toggle row, fields, storage/template blocks and form buttons.
- Stacked self-service form grids on small screens to avoid cramped controls and horizontal overflow.

### v3.1.11 - 2026-07-09

**Commit:** `fix: add proper spacing to self-service cluster toggle`

- Added proper left and right padding to the self-service cluster activation row.
- Improved spacing between the toggle label and the switch so the row looks consistent and usable.

### v3.1.10 - 2026-07-09

**Commit:** `fix: polish service link layout and cluster map spacing`

- Public page and management page buttons now appear side by side when both are available.
- Added clearer spacing above the Cluster-Standorte section and between the location cards.
- Refined the 3/3 Nodes badges so they are aligned and consistently formatted.
- The cluster map is now more tightly focused on Europe, without the visible map caption/attribution bar.

### v3.1.9 - 2026-07-09

**Commit:** `fix: handle shared management credentials and admin read-only user services`

- Users now see assigned service management pages when the admin has configured a management URL or shared management credential.
- Admins can see self-service/user-created services in the services overview, including status and metrics.
- Self-service/user-created services are read-only for admins: credentials stay hidden and edit/delete actions are blocked.
- Backend checks now enforce the same read-only rules for user-managed services.

### v3.1.8 - 2026-07-09

**Commit:** `fix: remove dashboard showcase copy`

- Removed the descriptive showcase sentence from the admin dashboard hero.
- Kept the dashboard focused on productive actions and status information.

### v3.1.7 - 2026-07-09

**Commit:** `fix: refine cluster cards and modernize cluster map`

- improved spacing between cluster summary cards so boxes are clearly separated
- reformatted the `3/3 Nodes` badges in cluster summary and cluster status cards
- switched the cluster map to a cleaner modern outline style with theme-aware light and dark tiles
- kept the map zoomed farther out so the overall region is easier to recognize

### v3.1.6 - 2026-07-09

**Commit:** `fix: offset sticky navigation below maintenance banner`

- fixed sticky header and admin sidebar offsets when a maintenance banner is active so navigation no longer scrolls behind the banner
- mobile admin menu overlay now respects the active maintenance banner height

### v3.1.5 - 2026-07-09

**Commit:** `fix: hide cluster addresses in status cards`

- Removed cluster URL and stored location address from the Cluster-Status cards.
- Cluster-Status now focuses on the cluster name, online badge and resource metrics only.

### v3.1.4 - 2026-07-09

**Commit:** `fix: unify cluster action button labels`

- Standardized cluster action buttons so the dashboard uses the same wording consistently.
- Changed the Cluster-Standorte action from `Cluster bearbeiten` to `Cluster verwalten` to match the main dashboard action.

### v3.1.3 - 2026-07-09

**Commit:** `feat: refine admin dashboard layout and mobile navigation`

- Made the Cluster-Standorte section span the full admin content width for a cleaner dashboard layout.
- Moved the dashboard action buttons flush to the right and tightened panel spacing between stacked admin sections.
- Simplified Proxmox cluster preview cards by removing the full address from the card preview.
- Added a dedicated fullscreen mobile admin menu with a top-right menu button to avoid horizontal scrolling and improve navigation on phones.
- Added extra mobile layout safeguards so cards and dashboard sections stay centered without horizontal overflow.

### v3.1.2 - 2026-07-09

**Commit:** `style: zoom out cluster map and add theme-aware map shading`

- Zoomed the dashboard cluster map further out so the view feels more global and shows a broader regional context.
- Added a subtle theme-aware shader overlay so the map blends better into both light and dark mode.
- Tuned the map contrast and saturation for a calmer, more integrated dashboard look.

### v3.1.1 - 2026-07-09

**Commit:** `style: polish admin dashboard spacing and sidebar active state`

- Tightened and equalized spacing across the new admin dashboard layout.
- Reworked the sidebar active state so the accent line is now straight and cleaner instead of curved.
- Improved paddings and gaps for the hero area, metric cards, map section and sidebar navigation.

### v3.1.0 - 2026-07-09

**Commit:** `feat: add a Hetzner-inspired dashboard revamp with cluster maps`

- Reworked the admin dashboard into a cleaner hosting-console style with a dedicated navigation sidebar and a more structured landing page.
- Added a live cluster map widget on the dashboard overview to show where Proxmox clusters are located.
- Extended Proxmox cluster management with address lookup, dropdown suggestions and stored coordinates for map placement.
- Added a backend geocoding endpoint for address search and saved location metadata directly on each cluster.

### v3.0.16 - 2026-07-09

**Commit:** `fix: use the exact brand greens for all green badges and bubbles`

- Updated green capability bubbles like **Lesen**, **Power**, **Konsole** and **Erstellen** to use the exact portal greens in both themes.
- Standardized green chip, badge and success states so light mode always uses `#7a876f` and dark mode always uses `#c2cea7`.
- Kept soft green backgrounds and borders aligned with the same shared brand tokens for a fully consistent look.

### v3.0.15 - 2026-07-09

**Commit:** `fix: align all green text accents with the brand palette`

- Set light mode green text accents to `#7a876f`.
- Set dark mode green text accents to `#c2cea7`.
- Aligned links, role labels, online/status labels, success text, badges, focus states and green hover states with the same central brand colors.

### v3.0.14 - 2026-07-09

**Commit:** `fix: unify brand green across light and dark mode`

- Standardized all success and active green states to the portal brand colors.
- Light mode now consistently uses `#7a876f` for green accents.
- Dark mode now consistently uses `#c2cea7` for green accents.
- Updated alerts, status badges, maintenance badges, toggles, online states, progress accents and terminal cursor accents to follow the shared brand tokens.

### v3.0.13 - 2026-07-09

**Commit:** `fix: use brand green for active maintenance badges`

- Updated the active maintenance status badge to use the portal's brand green accent instead of the separate success green.
- Kept badge text color aligned with the primary button contrast token.

### v3.0.12 - 2026-07-09

**Commit:** `fix: align mobile cluster node badges`

- Improved the mobile Cluster Status header layout.
- Centered the node count badge vertically beside the cluster title block.
- Kept the node count badge from drifting or looking misaligned when long cluster URLs wrap.

### v3.0.11 - 2026-07-09

**Commit:** `fix: normalize mobile container alignment`

- Normalized mobile page width, card width and inner spacing so panels, metric cards and cluster status cards stay centered.
- Added consistent horizontal padding to the self-service toggle row so labels no longer sit directly on the card edge.
- Prevented mobile horizontal overflow from wide cards, cluster addresses and service metadata.

### v3.0.10 - 2026-07-08

**Commit:** `fix: use a themed background for the login theme toggle`

- Restored the login theme toggle to the top-right corner on desktop and mobile.
- Added a solid light or dark background to the toggle so it stays readable above maintenance banners and page content.
- Removed the maintenance-banner offset that made the toggle appear in the wrong position.

### v3.0.9 - 2026-07-08

**Commit:** `fix: pin login theme toggle away from maintenance banner`

- Fixed the login theme toggle position on desktop and mobile.
- Keeps the toggle in the top-right corner and moves it below the maintenance banner when a banner is visible.
- Prevents the toggle from affecting login-card centering.

### v3.0.8 - 2026-07-08

**Commit:** `fix: remove password reset plaintext footer note`

- Removed the extra footer note from password reset e-mails.
- Kept the reset-link validity and safety instructions unchanged.

### v3.0.7 - 2026-07-08

**Commit:** `fix: separate login maintenance banner from theme toggle`

- Moved the login theme toggle into the login form flow so it no longer overlaps maintenance banners.
- Changed the login maintenance banner from fixed overlay behavior to a sticky banner that reserves its own space.
- Kept the login card vertically centered in the remaining viewport on desktop and mobile.

### v3.0.6 - 2026-07-08

**Commit:** `fix: simplify login screen and use public reset URLs`

- Removed the left brand panel from the login screen so only the sign-in card remains.
- Improved vertical spacing in the forgot-password form, including success and error messages.
- Password reset links now use `FRONTEND_URL`, `FRONTEND_ORIGIN`, the request origin, forwarded host headers or the current host instead of falling back to localhost in production.
- Updated Docker Compose and the backend environment example so `FRONTEND_URL` can stay empty behind a reverse proxy.

### v3.0.5 - 2026-07-08

**Commit:** `fix: remove dashboard temperatures and center theme toggle`

- Removed the temperature column from the Proxmox cluster status dashboard because Proxmox did not provide reliable sensor values in this setup.
- Tightened the theme toggle geometry so the dark-mode moon icon sits centered inside the right slider position.

### v3.0.4 - 2026-07-08

**Commit:** `fix: align test email result below the action`

- Moved the test email result message below the test email action.
- Let the result message use the full settings panel width for better readability.

### v3.0.3 - 2026-07-08

**Commit:** `fix: polish sliders and theme toggle alignment`

- Reworked the self-service CPU, RAM and disk sliders so the filled track reaches the exact right edge at the maximum value.
- Removed the input-like background around those sliders and gave them a cleaner native track/thumb style.
- Centered the moon icon visually inside the dark-mode toggle thumb.

### v3.0.2 - 2026-07-08

**Commit:** `fix: improve Proxmox temperature detection and neutral login copy`

- Reads temperatures from Proxmox node status thermal data as well as sensor endpoints.
- Supports numeric and string temperature values such as `42 C` or `42 °C`.
- Keeps the temperature field visible when Proxmox exposes usable data and leaves it empty only when no sensor data is available.
- Adjusted the login page copy so it speaks to all portal users, not only administrators.

### v3.0.1 - 2026-07-08

**Commit:** `fix: polish login copy smtp sender and mobile sheets`

- Reworked the login page copy to sound more professional and less explanatory.
- Removed the maintenance-window helper text from the admin area.
- Test e-mails now use the authenticated SMTP user as the default sender and envelope sender when no `SMTP_FROM` is configured, which fixes strict providers such as STRATO.
- Added a final mobile layout pass so modals stay full-width bottom sheets and spacing remains consistent.
- Replaced typographic dashes in project text with normal hyphens.

### v3.0.0 - 2026-07-08

**Commit:** `feat: add maintenance monitoring notifications and secure password reset`

- introduced maintenance windows with public banners and optional user e-mail notifications
- added background service monitoring with outage and recovery notifications
- added user notification preferences and recent status events on the admin dashboard
- hardened password reset tokens, password requirements and audit logging
- redesigned login, password-reset and branded e-mail workflows

### v2.9.6 - 2026-07-07

**Commit:** `fix: keep community terminals open for script output and cap disk size`

- Community Script terminals no longer close just because the Proxmox terminal session ends.
- The tab only auto-closes when the script output clearly indicates that the user aborted the script.
- Normal script completion and errors stay visible in the terminal so the output can be reviewed.
- Self-service container disk limits are capped at 32 GB in admin settings, user options and backend validation.

### v2.9.5 - 2026-07-07

**Commit:** `fix: normalize page spacing around error banners`

- Normalized top-level page spacing with a shared layout gap.
- Fixed uneven spacing when error banners appear above dashboard actions or content grids.
- Kept dashboard actions, alerts and content sections aligned across desktop and mobile.

### v2.9.4 - 2026-07-07

**Commit:** `fix: close provisioning terminals and blend terminal edges`

- Community Script terminals now replace the node login shell with the script wrapper so the shell closes when the script ends.
- The browser locks terminal input and closes/returns as soon as the script exit marker is printed.
- Provisioning terminal edges now use the same blue background as the script UI to avoid black gaps on the right and bottom.
- Terminal resizing before and after script launch was tightened for more reliable desktop fitting.

### v2.9.3 - 2026-07-07

**Commit:** `fix: close community script terminals after exit`

- Community Script terminals now log out of the Proxmox node shell after the script finishes, fails or is aborted.
- The provisioning terminal tab closes automatically when the script session ends.
- The provisioning URL parameters are removed after the first load so restored browser tabs cannot start a new root node shell again.
- Reconnect is disabled for Community Script provisioning terminals.

### v2.9.2 - 2026-07-07

**Commit:** `fix: stack cluster status cards and deduplicate shared storage`

- Stacked Proxmox cluster status cards vertically in the admin overview.
- Fixed cluster storage totals by counting shared storages only once across nodes.
- Kept local per-node storages counted per node while still using root filesystem values as fallback.

### v2.9.1 - 2026-07-07

**Commit:** `fix: improve desktop terminal fitting for community scripts`

- Improved the full-page community script terminal so it fits and resizes better across desktop resolutions.
- Added responsive terminal font sizing for fixed-size helper-script dialogs.
- Re-sends terminal resize events during connection and before script startup.
- Sets terminal rows and columns before launching the community script for more reliable ncurses layouts.

### v2.9.0 - 2026-07-07

**Commit:** `feat: add Proxmox cluster stats to the admin overview`

- Added live Proxmox cluster status cards below the existing admin overview metrics.
- Shows per-cluster node count, online nodes, average CPU, RAM usage, storage usage, node uptime and temperatures when Proxmox exposes sensor data.
- Added a backend cluster stats endpoint that reads live node, storage and sensor information from every connected Proxmox cluster.
- Keeps the overview usable when a cluster is temporarily unavailable by showing an error state per cluster instead of breaking the whole dashboard.

### v2.8.1 - 2026-07-07

**Commit:** `feat: add node credentials to Proxmox cluster settings`

- Added per-node login credentials directly to the Proxmox cluster configuration modal.
- Stores node passwords encrypted at rest and keeps existing secrets when the password field is left empty.
- Community Script terminals now use the matching node credentials to log in automatically before starting the script.
- Blocks Community Script startup with a clear error when the selected node has no saved credentials.

### v2.8.0 - 2026-07-07

**Commit:** `feat: run community scripts in an interactive desktop terminal`

- Community Script provisioning now opens a full-page desktop terminal in a new tab.
- The selected Community Script command is started inside the live Proxmox node shell so users can see progress and answer interactive prompts.
- Community Script provisioning keeps background detection for newly created LXCs and automatically attaches detected containers to the requesting user.
- Container creation and Community Script deployment are hidden and blocked on mobile because the interactive terminal is desktop-only.

### v2.7.19 - 2026-07-07

**Commit:** `fix: keep the template placeholder out of the dropdown`

- Kept "Template auswählen" as a field placeholder only.
- Removed the placeholder entry from the selectable template dropdown list.

### v2.7.18 - 2026-07-07

**Commit:** `fix: keep the community script placeholder out of the dropdown`

- Kept "Community Script auswählen" as a field placeholder only.
- Removed the placeholder entry from the selectable Community Script dropdown list.

### v2.7.17 - 2026-07-06

**Commit:** `fix: remove self-service configuration hint`

- Removed the extra self-service configuration hint from the Proxmox cluster modal.

### v2.7.16 - 2026-07-06

**Commit:** `fix: return accepted status for community script provisioning`

- Added the missing HTTP 202 Accepted status constant used when a Community Script is started.
- Fixed the Community Script creation modal error `Invalid status code: undefined`.
- Hardened backend error handling so invalid status values fall back to HTTP 500 instead of causing another response error.

### v2.7.15 - 2026-07-06

**Commit:** `fix: remove the community script helper text`

- Removed the extra helper text below the Community Script selector in the container creation modal.

### v2.7.14 - 2026-07-06

**Commit:** `fix: remove redundant LXC type hint from creation modal`

- Removed the redundant `Typ: Container (LXC)` text from the user container creation modal.
- Kept the creation flow focused on the actual choices: cluster, provisioning source, hostname/template or community script.

### v2.7.13 - 2026-07-06

**Commit:** `fix: normalize mobile spacing across the portal`

- Added one consistent UI spacing rhythm for mobile modals, cards, forms and action rows.
- Removed uneven modal margins that made buttons and sections look randomly spaced.
- Aligned setup-check, form and action spacing so vertical and horizontal gaps feel consistent across the whole portal.

### v2.7.12 - 2026-07-06

**Commit:** `fix: remove incompatible ajv keyword override`

- Removed the global `ajv-keywords` override that broke `fork-ts-checker-webpack-plugin` during Docker frontend builds.
- Kept a top-level AJV v8 dependency so newer webpack/schema-utils packages can resolve `ajv/dist/compile/codegen`.
- Allows older schema-utils dependencies to keep their own compatible AJV keyword package version.

### v2.7.11 - 2026-07-06

**Commit:** `fix: pin frontend ajv dependencies for Docker builds`

- Pinned compatible `ajv` and `ajv-keywords` versions in the frontend package.
- Added npm overrides so Docker builds do not resolve an incompatible AJV dependency tree.
- Fixes the frontend build error `Cannot find module 'ajv/dist/compile/codegen'`.

### v2.7.10 - 2026-07-06

**Commit:** `fix: use brand navigation for mobile overview`

- Removed the separate Overview tab from the mobile admin navigation.
- The brand title now acts as the Overview navigation target.
- Desktop navigation keeps the Overview tab unchanged.

### v2.7.9 - 2026-07-06

**Commit:** `fix: make Docker npm installs more reliable`

- Updated frontend Docker installs to use legacy peer dependency resolution for React tooling.
- Disabled npm audit and funding checks during Docker builds to avoid unrelated install failures.
- Updated backend production installs to use `--omit=dev` with the same reliable install flags.

### v2.7.8 - 2026-07-06

**Commit:** `fix: add slim themed scrollbars`

- Added slim custom scrollbars for light and dark mode.
- Matched scrollbar colors to the portal theme instead of the browser defaults.
- Kept scrollbars thin and modern across pages, tables, modals and detail panes.

### v2.7.7 - 2026-07-06

**Commit:** `fix: hide unused admin default credentials settings`

- Removed the default root password field from the self-service settings UI for now.
- Removed the standalone global admin credentials section from the Settings tab for now.
- Service-level and management-page credentials remain available in each service detail view.

### v2.7.6 - 2026-07-05

**Commit:** `fix: remove group assignment hint from services`

- Removed the visible group-assignment hint from the services area.
- Kept group-based service access behavior unchanged.

### v2.7.5 - 2026-07-05

**Commit:** `fix: use full-width bottom sheets on mobile`

- Mobile dialogs no longer appear as floating centered popups.
- All modal menus slide up from the bottom edge on mobile.
- Mobile sheets now take the full viewport width and ignore global layout padding.
- Detail dialogs keep their internal scrolling while using the same bottom-sheet behavior.

### v2.7.4 - 2026-07-05

**Commit:** `fix: allow desktop console for assigned admin services`

- Desktop console access is now shown for every assigned service when the Proxmox token has `VM.Console`.
- Console access is no longer visually tied to self-service ownership or delete permissions.
- Admin-created services assigned directly to users or shared through groups can now open the full-page console from the detail view.

### v2.7.3 - 2026-07-05

**Commit:** `fix: align credential toolbar button heights`

- Matched the height of the management-page credential button with the adjacent add button.
- Keeps credential toolbar actions visually aligned in modals and detail views.

### v2.7.2 - 2026-07-05

**Commit:** `fix: polish audit search and provisioning source selection`

- Reworked the audit search area into a separate filter card so the counter and controls no longer collide with the input.
- Audit search no longer unmounts the panel while typing, so the input keeps focus between characters.
- Debounced audit filtering to avoid a backend request on every keystroke.
- Reworked the create-container dialog so users explicitly choose either a template or a Community Script.
- Template settings and Community Script search are now shown in separate, cleaner sections instead of side by side.

### v2.7.1 - 2026-07-05

**Commit:** `fix: remove card IPs and paginate audit logs`

- Removed the IP address from service cards because it is already available in the detail view.
- Added audit log pagination with 50 entries per page.
- Added a search filter for audit log action, user, target, details and IP address.
- The backend audit endpoint now returns pagination metadata and supports filtered queries.

### v2.7.0 - 2026-07-05

**Commit:** `feat: add filtered community script provisioning`

- Added a searchable Community Scripts picker to the user self-service creation flow.
- Users can now start selected LXC scripts from `community-scripts/ProxmoxVE` as an alternative when no local template is selected.
- VPN, Proxmox host tooling, backup and cleanup style scripts are filtered out before they appear in the picker.
- Community scripts are started on the selected Proxmox node with their own default values.
- The backend watches for the newly created LXC and attaches it to the requesting user once detected.
- Improved spacing in the credentials modal so toolbar buttons no longer touch the container edge.

### v2.6.0 - 2026-07-05

**Commit:** `feat: add shared management-page credentials`

- Added a dedicated shared credential slot for each service management page.
- Admins and authorized users can create, reveal, edit and delete the management-page credential.
- The management credential is kept separate from private user credentials and normal admin-provided service credentials.
- The management credential defaults to the service's configured management URL when available.
- Added database migration support for credential purpose metadata and a one-management-credential-per-service guard.

### v2.5.4 - 2026-07-05

**Commit:** `fix: normalize portal spacing across layouts`

- Introduced one shared spacing token for the main portal layout.
- Normalized vertical and horizontal gaps across cards, grids, forms, tabs, modals, action rows and detail views.
- Aligned major component padding so spacing stays consistent in light mode, dark mode, desktop and mobile layouts.

### v2.5.3 - 2026-07-05

**Commit:** `fix: keep dropdown arrows clean in dark mode`

- Fixed dark-mode dropdown fields where the custom arrow could repeat across the full input.
- Switched form-control color overrides from `background` shorthand to `background-color` so dropdown arrow settings are preserved.
- Re-applied the dropdown arrow position and size after component-specific overrides for consistent desktop and mobile rendering.

### v2.5.2 - 2026-07-05

**Commit:** `feat: place console beside power actions and auto-login root sessions`

- Moved the desktop console button into the power action row, directly before the stop button.
- LXC console sessions now look for a saved root credential on the resource and automatically answer the login and password prompts when available.
- Auto-login only uses credentials already attached to the resource and still keeps the console hidden on mobile.

### v2.5.1 - 2026-07-05

**Commit:** `fix: move user service actions into the detail view`

- Removed power and delete actions from user service cards.
- Power controls and self-service container deletion are now only shown after opening the service details.
- Removed the IP address tile from user service cards because the IP address remains visible in the detail view.

### v2.5.0 - 2026-07-05

**Commit:** `feat: open console in a full-page desktop tab and save root credentials`

- Moved the Proxmox console out of the service detail modal into a dedicated full-page route opened in a new browser tab.
- The console launch button is desktop-only, so mobile users no longer see an option that does not fit small screens well.
- Fixed the Proxmox console WebSocket bridge so the initial termproxy ticket is queued until the upstream connection is ready. This prevents dropped tickets and the Proxmox `failed reading ticket: timed out` error.
- Self-service LXC creation now stores the root password used for the new container as a service credential for the requesting user.

### v2.4.5 - 2026-07-05

**Commit:** `fix: add spacing below the self-service cluster dropdown`

- Added proper spacing between the self-service cluster dropdown and the permission warning message.
- Keeps the self-service settings panel visually consistent with the rest of the UI.

### v2.4.4 - 2026-07-05

**Commit:** `fix: improve dropdown spacing across the UI`

- Added consistent right-side padding to all dropdown fields.
- Moved the dropdown arrow inward so it no longer sits too close to the field edge on mobile or desktop.
- Switched to a consistent custom arrow for a cleaner look across browsers.

### v2.4.3 - 2026-07-05

**Commit:** `fix: remove horizontal scrolling from the mobile admin dashboard`

- Reworked the mobile admin navigation tabs into a wrapped button grid instead of a horizontal scroller.
- Removed page-level horizontal overflow on the mobile dashboard layout.
- Improved small-screen header behavior so the site title can wrap cleanly without pushing the layout wider than the viewport.

### v2.4.2 - 2026-07-05

**Commit:** `fix: read LXC IPs from Proxmox network config`

#### LXC IP detection

- LXC IP addresses are now read from the Proxmox container network configuration in addition to the live interface endpoint.
- Static addresses such as `net0: ip=192.168.1.24/24` are shown correctly on service cards and in detail views.
- Loopback and link-local addresses such as `127.0.0.1` and `169.254.x.x` are ignored, so they no longer appear as the primary service IP.
- The next-free-IP allocator now also sees static LXC config IPs, which prevents collisions with containers created outside the portal.

#### Settings layout

- Improved the spacing in the self-service settings section, especially between the cluster selector and the enable toggle.
- Removed the remaining self-service helper sentence from the settings surface to keep the page cleaner.

### v2.4.1 - 2026-07-05

**Commit:** `fix: use only live Proxmox storages in self-service settings`

#### Self-service storage selection

- The Disk Storage dropdown now shows only live storages returned by the selected Proxmox node.
- Stale database defaults such as `local-lvm` are no longer injected into the dropdown when that storage is not present on the node.
- If an old saved storage no longer exists, the settings form automatically switches to the first live storage reported by Proxmox.
- Saving self-service settings now validates that the selected disk storage is available on the selected node.
- User-created LXC containers also re-check live storages before provisioning, so stale storage names are not used for new containers.

#### Interface cleanup

- Removed explanatory helper text from the credential and template sections to keep the settings page cleaner.
- Removed the encrypted-storage helper sentence below the default root password field.
- Removed new-secret placeholders that repeated encryption wording.

### v2.4.0 - 2026-07-05

**Commit:** `feat: make self-service LXC-only and add user-owned container deletion`

#### Proxmox cluster cards

- Simplified the Proxmox admin card so it shows the cluster name, cluster address and token permissions only.
- Removed the noisy self-service range details from the card.
- Kept the token check action for live permission refresh.

#### Settings layout

- Added spacing between settings panels so SMTP, self-service and credential sections no longer visually touch each other.

#### Self-service

- Removed VM/QEMU creation from the user self-service flow.
- Kept self-service focused on LXC containers only.
- Removed VM/ISO choices from the creation modal and admin self-service UI.
- The backend rejects user VM creation requests even if an old client sends them.
- The allocator now checks live LXC interface IPs in Proxmox in addition to portal reservations before choosing the next free IP.

#### User container management

- Users can delete containers they created through self-service.
- Deletion removes the Proxmox resource, portal resource entry, related credentials and IP reservation.
- Users cannot delete manually assigned admin resources or resources shared through a group.

#### IP visibility

- The user dashboard now shows the reachable container IP on the service card.
- The service detail view also shows the primary IP address.
- Admin service cards and details show the same IP information.

#### Version cleanup

- Frontend and backend package versions are now `2.4.0`.
- Backend startup output now reports `v2.4.0`.
- Package licenses now match the repository license: `AGPL-3.0-or-later`.

### v2.3.1 - 2026-07-04

**Commit:** `fix: limit disk-storage choices to disk-capable Proxmox storages`

- The disk-storage dropdown lists storages that can hold VM disks or CT root filesystems.
- Storage options show their Proxmox storage type.
- The field falls back to free text if no disk-capable storage is reported.

### v2.3.0 - 2026-07-04

**Commit:** `feat: add per-cluster template and ISO allowlists`

- Admins can select which templates or ISOs users may choose.
- Users only see released entries in the creation wizard.
- Added `allowed_templates` and `allowed_isos` database columns.
- Fixed self-service storage-row wrapping.

### v2.2.1 - 2026-07-04

**Commit:** `fix: show token permissions automatically`

- Token permissions are loaded automatically when opening the Proxmox tab.
- The token check button refreshes a single cluster live.
- Added permission loading and error states.
- Removed visible encryption hints from the credentials UI while keeping encryption and logging active.

### v2.2.0 - 2026-07-04

**Commit:** `feat: add admin-attached resource credentials`

- Admins can attach credentials to a service.
- Users can reveal, copy or delete admin-provided credentials.
- Users cannot edit admin-provided credentials.
- Admins cannot reveal, edit or delete user-created credentials.
- Added the `created_by_role` column to `resource_credentials`.

### v2.1.0 - 2026-07-04

**Commit:** `feat: move provisioning and credentials into settings`

- Moved detailed self-service configuration into Settings.
- Added per-cluster VMID/IP ranges, gateway, bridge, storage and limits.
- Added live template and ISO fetching.
- Added an optional encrypted default root password.
- Added the admin credential vault.
- Fixed scrolling in the detail view so only tab content scrolls.

### v2.0.0 - 2026-07-04

**Commit:** `feat: add power actions, console, logs, credentials, groups and self-service`

- Added power actions for assigned services.
- Added browser console support through a backend WebSocket relay.
- Added tasks and log viewing per machine.
- Added encrypted credentials per service.
- Added groups and shared service access.
- Added self-service provisioning.
- Added the audit log.
- Added API token capability detection.
- Added security hardening for secrets, rate limits, CORS and task access.

### v1.0.x - 2026-06-28 to 2026-06-29

- Initial Dockerized React + Express + SQLite portal.
- First setup wizard.
- Proxmox cluster integration.
- User and admin dashboards.
- Resource assignment and monitoring.
- SMTP configuration.
- Light/dark desktop theme handling.
- Mobile layout refinements.
- Disk reporting improvements.
- UI cleanup, modal fixes and card polish.

## License

AGPL-3.0-or-later. See `LICENSE`.
