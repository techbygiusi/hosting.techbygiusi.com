# Picly – AI project handover

This file is the persistent handover for future AI-assisted work on this project.

## Project identity

Picly is a standalone wedding photo upload/gallery portal for Florian & Alexandra. It must remain independent from unrelated infrastructure-management portals, cluster tooling, user-service management and source-control based deployment systems.

The active application is intentionally small:

- `frontend/src/main.jsx` – Vite/React entry point
- `frontend/src/pages/UploadPage.jsx` – public photo upload page
- `frontend/src/pages/AdminPage.jsx` – protected gallery/admin page
- `frontend/src/components/AppShell.jsx` – shared page shell
- `frontend/src/services/api.js` – frontend API client
- `frontend/src/styles/globals.css` – application styling
- `backend/app.js` – complete Picly backend/API
- `updater/app.py` – internal ZIP update/rollback service
- `docker-compose.yml` – backend, frontend and updater containers
- `deploy.sh` – first/manual deployment helper

Do not recreate removed legacy setup/dashboard files, infrastructure-management modules, SMTP modules, cron updaters, or source-control based updaters.

## Persistent data

These paths are runtime state and must survive every update and rollback:

- `.env`
- `data/`

Important files below `data/` include uploads, metadata, the persisted admin password/configuration, SMB backup settings/logs, and updater state/version archives.

Never include `.env`, `data/`, `.git/`, secrets, or runtime uploads in a release ZIP.

## Versioning

`VERSION` is the only Picly release-version source for the admin update UI.

Current version starts at:

`1.01`

Future releases increment in this style:

`1.01` → `1.02` → `1.03` → …

Do not add a `v` prefix. Before packaging a changed release, increment `VERSION` exactly once.

`package.json` versions are intentionally not used as Picly release versions.

## Release policy

There is deliberately no separate release-history document. Do not add release-history sections, commit histories, or source-control based update instructions.

Keep this file current when architecture, deployment, persistence, update behavior, or other important project rules change. It should describe only the current state, not historical release notes.

Release ZIPs should contain only the files needed to run, update, understand, and license Picly. Remove dead code and generated files before packaging.

A valid update ZIP must contain at least:

- `VERSION`
- `AI_README.md`
- `docker-compose.yml`
- `deploy.sh`
- `backend/`
- `frontend/`
- `updater/`
- `LICENSE`

The ZIP may contain one top-level project directory. The built-in updater also accepts a ZIP whose project files are directly at ZIP root.

## Admin ZIP updater

The protected admin page contains an **Updates** button between **Backup** and **Aktualisieren**.

Update flow:

1. Admin uploads a Picly ZIP.
2. Backend stores it in `data/updates/staging/`.
3. The internal updater validates ZIP paths, required files, version format, archive size and forbidden runtime files.
4. The uploaded version must be newer than the currently installed version. Older versions are handled only through Rollback.
5. Clicking **Update installieren** snapshots the currently installed code, replaces application code while preserving `.env` and `data/`, rebuilds the Docker services and checks backend/frontend health.
6. If deployment fails, the updater attempts to restore the previous version automatically.
7. Up to five version archives are retained under `data/updates/versions/` for rollback.

The updater is intentionally isolated in its own internal container. Only that updater container receives the Docker socket and write access to the project directory. The host project directory is mounted inside the updater as `/workspace`; the host path comes from `PICLY_PROJECT_DIR` and safely defaults to `/opt/picly.techbygiusi.com`. The normal backend does not receive the Docker socket.

The updater API is not published to the host. Backend-to-updater calls use `JWT_SECRET` as the internal updater token.

## First deployment

On a new host, extract the ZIP to the desired project directory and run:

```bash
chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` creates `.env` on first deployment, generates the initial admin credentials/secrets, creates the persistent data directory, and runs `docker compose up --build -d`.

After the first deployment, normal releases should be installed from the protected Picly admin page using ZIP files.

## Update-development rules for future chats

When changing Picly:

1. Read this file first.
2. Treat this repository as a standalone Picly project only.
3. Preserve `.env` and `data/` compatibility.
4. Do not reintroduce unrelated infrastructure-management or source-control updater code.
5. Keep the ZIP updater and five-version rollback working.
6. Increment `VERSION` using the `1.01`, `1.02`, … scheme for each new deliverable.
7. Run syntax/build validation where possible.
8. Package a clean ZIP without runtime state, source-control metadata, dependency folders or separate release-history files.
