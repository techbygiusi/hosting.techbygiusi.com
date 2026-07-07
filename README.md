# Hosting Portal

A lightweight self-hosted customer portal for Proxmox-based hosting. The portal gives administrators a clean web interface for users, groups, Proxmox clusters, services, credentials, SMTP settings and audit logs. Users can view their assigned services, open service details for power and delete actions when the token allows it, open a full-page desktop console, read task logs, manage service credentials and create/delete their own LXC containers through self-service.

The frontend is built with React and the backend with Express + SQLite. Proxmox API tokens and stored secrets are encrypted at rest.

## Version

Current version: **v2.9.3**

Versioning now follows a clean semantic sequence:

- **Patch** versions for small fixes and UI polish.
- **Minor** versions for user-visible features.
- **Major** versions only for breaking changes.

The old history is kept below, but new releases should continue from the current `v2.x` line without date or numbering jumps.

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
- Create new LXC containers through self-service.
- Delete containers that the user created through self-service.

### Self-service provisioning

Self-service has been intentionally LXC-only since v2.4.0. VM creation is no longer exposed to users and stays an administrator task in Proxmox.

The backend automatically allocates:

- The next free VMID from the configured VMID range.
- The next free IPv4 address from the configured IP pool.

The IP allocator checks the portal reservation table, static LXC network config and live LXC interface addresses from Proxmox, so containers created outside the portal are respected as well.

Admins configure per cluster:

- Self-service on/off.
- VMID range.
- IP range, CIDR prefix and gateway.
- Bridge.
- Disk storage, selected from live storages reported by the selected Proxmox node.
- CT template storage.
- Allowed CT templates.
- CPU, RAM and disk limits.

## Recommended Proxmox token rights

A read-only token is enough for monitoring. Extra features appear only when the token has the matching permissions.

Recommended role for full portal functionality:

- `VM.Audit`
- `VM.PowerMgmt`
- `VM.Console`
- `VM.Allocate`
- `Datastore.AllocateSpace` on the storage used for LXC disks/templates

The portal hides unavailable actions when the token does not provide the matching capability.

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

## Update notes

For normal updates:

```bash
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

The database migrates itself on startup. Keep the backend data volume before updating.

## Changelog

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
