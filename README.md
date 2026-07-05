# Hosting Portal

A lightweight self-hosted customer portal for Proxmox-based hosting. The portal gives administrators a clean web interface for users, groups, Proxmox clusters, services, credentials, SMTP settings and audit logs. Users can view their assigned services, start/stop them when the token allows it, open a browser console, read task logs, manage service credentials and create/delete their own LXC containers through self-service.

The frontend is built with React and the backend with Express + SQLite. Proxmox API tokens and stored secrets are encrypted at rest.

## Version

Current version: **v2.4.1**

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
- Store central credentials and optionally link them to users or clusters.
- Attach credentials to a specific service without exposing user-created credentials back to the admin.
- Configure SMTP after the first setup.
- Configure LXC self-service per cluster.
- Review audit events for power actions, console access, credentials and provisioning.

### User area

- View assigned services with live status, CPU, RAM and disk information.
- See the reachable container IP address directly on the service card and in the detail view.
- Start, stop, reboot or shut down services when the Proxmox token permits it.
- Open a web console when the Proxmox token permits it.
- Read recent Proxmox tasks and logs for the assigned service.
- Manage service credentials.
- Create new LXC containers through self-service.
- Delete containers that the user created through self-service.

### Self-service provisioning

Self-service has been intentionally LXC-only since v2.4.0. VM creation is no longer exposed to users and stays an administrator task in Proxmox.

The backend automatically allocates:

- The next free VMID from the configured VMID range.
- The next free IPv4 address from the configured IP pool.

The IP allocator checks both the portal reservation table and live LXC interface addresses from Proxmox, so containers created outside the portal are respected as well.

Admins configure per cluster:

- Self-service on/off.
- VMID range.
- IP range, CIDR prefix and gateway.
- Bridge.
- Disk storage, selected from live storages reported by the selected Proxmox node.
- CT template storage.
- Allowed CT templates.
- CPU, RAM and disk limits.
- Optional default root password for newly created containers.

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
