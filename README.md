# Picly - Changelog

## v0.1.4 - 2026-06-28

**Commit:** `chore: simplify mobile upload copy`

- Removed the extra mobile helper sentence from the upload drop zone because phones already open the image picker/gallery directly.
- Kept the public upload flow unchanged: users still need no login and can upload directly from mobile.

## v0.1.3 - 2026-06-28

**Commit:** `feat: refine mobile navigation and admin storage stats`

- Removed the standalone **P** mark from the header so the top bar stays cleaner.
- Changed the browser tab title to **Tech By Giusi | Picly**.
- Simplified the mobile header so only the **Upload** action stays at the top.
- Moved the **Admin** link into the mobile footer while keeping it in the desktop header.
- Hid the large intro copy on mobile so users land directly on the upload card.
- Added protected admin storage stats showing free/used storage for the mounted data path and the Docker container filesystem.
- Added current active upload count in the admin dashboard.

## v0.1.2 - 2026-06-28

**Commit:** `fix: harden concurrent uploads`

- Added a metadata write queue so parallel uploads cannot overwrite each other in `metadata.json`.
- Switched upload handling to a temporary upload directory first, then atomically moves accepted files into `./data/uploads`.
- Added cleanup for failed, interrupted or rejected uploads so broken partial files do not stay behind.
- Added unique temporary metadata writes plus `metadata.json.bak` as a fallback if the metadata file ever becomes unreadable.
- Added a parallel upload guard with `MAX_PARALLEL_UPLOADS` to protect the server from overload while still allowing several users to upload at the same time.
- Added free-space checks before accepting uploads via `MIN_FREE_SPACE_MB`.
- Increased frontend, backend and Nginx upload timeouts to support slower mobile connections.
- Improved ZIP download streaming by lowering compression load and aborting cleanly when the browser cancels the download.
- Kept existing `.env` values during updates and automatically appends new stability settings when they are missing.

## v0.1.1 - 2026-06-28

**Commit:** `feat: simplify public upload and animate progress`

- Removed the light/dark mode switch and locked the application to a clean light-only design.
- Kept the public upload page completely open: normal users do not need any login credentials.
- Added a clearer upload progress panel with percentage, status text and a small animated Pixel courier.
- Kept the finished upload state visible at 100% so users can see that the transfer completed.
- Improved mobile upload behavior by disabling file changes while an upload is running.
- Kept admin authentication only for `/admin`, so uploaded images are not publicly browsable.

## v0.1.0 - 2026-06-28

**Commit:** `feat: add picly image upload app`

- Added a standalone Docker application named **Picly** for simple image uploads.
- Added a mobile-friendly public upload page with file picker, drag-and-drop area, previews and upload result feedback.
- Added a protected `/admin` area with login, uploaded image gallery, image preview dialog and single-image downloads.
- Added a one-click **download all images as ZIP** action for the admin gallery.
- Added persistent local storage under `./data`, including uploaded images and metadata.
- Added first-deploy admin credential generation in `deploy.sh`; credentials are saved in `.env` and kept unchanged during updates.
- Added Docker Compose deployment with React/Nginx frontend and Node/Express backend.
- Added AGPL-3.0 license matching the existing TechByGiusi project style.

---

## Deployment on Debian

The branch is expected at:

```bash
https://github.com/techbygiusi/hosting.techbygiusi.com/tree/picly
```

Fresh deployment:

```bash
sudo bash -c 'apt-get update && apt-get install -y git curl ca-certificates openssl && if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi; mkdir -p /opt && if [ ! -d /opt/picly.techbygiusi.com/.git ]; then git clone -b picly https://github.com/techbygiusi/hosting.techbygiusi.com.git /opt/picly.techbygiusi.com; else cd /opt/picly.techbygiusi.com && git fetch origin picly && git reset --hard origin/picly; fi; cd /opt/picly.techbygiusi.com && chmod +x deploy.sh && ./deploy.sh'
```

Update an existing installation:

```bash
cd /opt/picly.techbygiusi.com && git fetch origin picly && git reset --hard origin/picly && ./deploy.sh
```

On first deployment, `deploy.sh` prints the admin URL, username and generated password. The values are stored in `.env` and are reused during updates.

Normal upload users do **not** need credentials. Only the admin gallery at `/admin` is protected.

To show the saved admin password again manually:

```bash
cd /opt/picly.techbygiusi.com && PICLY_SHOW_ADMIN_PASSWORD=true ./deploy.sh
```

## Default URLs

- Public upload page: `http://SERVER-IP:3002/`
- Admin gallery: `http://SERVER-IP:3002/admin`

The public port can be changed before the first deployment:

```bash
PICLY_HTTP_PORT=8088 ./deploy.sh
```

## Storage

Picly stores all runtime data below:

```bash
./data
./data/uploads
./data/tmp
./data/metadata.json
./data/metadata.json.bak
```

`./data/tmp` is used only while uploads are being processed. Picly cleans old temporary upload files on startup. Keep the whole `./data` folder when updating the application. Deleting `./data` removes uploaded images and metadata.

## Configuration

The generated `.env` contains:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<generated-on-first-deploy>
JWT_SECRET=<generated-on-first-deploy>
JWT_EXPIRATION=24h
PICLY_HTTP_PORT=3002
MAX_UPLOAD_MB=25
MAX_UPLOAD_FILES=30
MAX_PARALLEL_UPLOADS=12
MIN_FREE_SPACE_MB=250
UPLOAD_REQUEST_TIMEOUT_MS=600000
```

### Stability settings

Picly is designed to handle multiple public uploads in parallel. These values can be adjusted in `.env`:

```env
MAX_PARALLEL_UPLOADS=12
MIN_FREE_SPACE_MB=250
UPLOAD_REQUEST_TIMEOUT_MS=600000
```

Recommended defaults:

- Keep `MAX_PARALLEL_UPLOADS=12` for a small VPS or homelab server.
- Increase it only when CPU, RAM and disk I/O are comfortable.
- Keep `MIN_FREE_SPACE_MB` high enough so the server does not run into a full disk during large uploads.


## License

Picly is licensed under **GNU Affero General Public License v3.0**. See `LICENSE`.
