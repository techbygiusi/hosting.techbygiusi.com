# Picly v0.1.33

## v0.1.33 - 2026-06-29

**Commit:** `style: adjust wedding thank-you spacing`

- Increased the spacing between **Ein herzliches Dankeschön** and **Florian & Alexandra** on desktop and mobile.
- Removed the decorative ornament with the lines from the desktop upload intro card.
- Kept the rest of the upload intro layout unchanged.

## v0.1.32 - 2026-06-29

**Commit:** `fix: detect empty gallery grid columns`

- Fixed gallery corner detection so empty CSS grid columns count as available columns.
- Right-side gallery corners are now only rounded when an image really sits in the outer right column.
- Prevented a short, incomplete row from being rounded on the right side.

## v0.1.31 - 2026-06-29

**Commit:** `chore: replace typographic dashes with hyphens`

- Replaced typographic dashes with normal hyphens across the app text and documentation.
- Kept the wedding upload copy visually unchanged except for the dash character.
- Updated frontend and backend package versions.

## v0.1.30 - 2026-06-29

**Commit:** `fix: restore names below wedding thank-you copy`

- Added **Florian & Alexandra** back below **Ein herzliches Dankeschön** on the upload intro card.
- Applied this consistently for desktop and mobile.
- Kept the simplified wedding intro layout from the previous version.

## v0.1.29 - 2026-06-29
- Upload-Intro bereinigt, damit Namen und Hochzeitsalbum-Titel nicht doppelt erscheinen.
- Dankeschön-Zeile vereinfacht, ohne die Namen erneut als Signatur zu wiederholen.
- Galerie-Abrundung im Admin-Bereich auf 10px reduziert.
- Ecklogik verbessert: rechte Ecken werden nur gerundet, wenn das Bild wirklich in der letzten Spalte sitzt.

## v0.1.28 - 2026-06-29
- Galerie-Ecken im Admin-Bereich verbessert: Bilder an den echten Außenecken übernehmen jetzt die passende Abrundung.
- Galerie-Container im Admin-Bereich rundet sauber mit, auch wenn nicht jede Ecke belegt ist.

## v0.1.27 - 2026-06-29

**Commit:** `copy: update wedding upload intro`

- Reworded the upload page intro for guests on desktop and mobile.
- Added a short thank-you line signed by Florian & Alexandra.
- Kept the upload flow and admin area unchanged.

## v0.1.26 - 2026-06-29

**Commit:** `style: improve mobile admin action order`

- Swapped the mobile positions of **Abmelden** and the ZIP download action.
- Made **Alle als ZIP herunterladen** span the full two-button width on mobile.
- Kept the desktop admin action layout unchanged.

## v0.1.25 - 2026-06-29

**Commit:** `copy: simplify backup dialog description`

- Replaced the technical backup dialog helper text with a friendlier message about keeping images safe.
- Clarified that uploads and deletions are mirrored to the SMB backup target.

## v0.1.24 - 2026-06-29

**Commit:** `fix: keep admin dialogs open on backdrop click`

- Prevented the **Backup** and **Kennwort ändern** dialogs from closing when clicking beside the window.
- Kept dialog closing explicit through the close/cancel buttons.
- Replaced SMB form examples with neutral placeholder values instead of project-specific examples.

## v0.1.23 - 2026-06-29

**Commit:** `feat: add container smb backup sync`

- Added a new **Backup** button next to **Kennwort ändern** in the protected admin area.
- Added a desktop backup configuration popup and a mobile bottom sheet that slides up from the bottom.
- Added SMB backup settings directly inside Picly so the Docker host does not need to mount the SMB share.
- Added connection testing, manual sync, sync logs and password-preserving SMB configuration.
- Added immediate change-based mirroring: new uploads are copied to SMB and deleted Picly images are removed from the SMB target as well.
- Added optional hourly, daily and weekly scheduled sync modes.
- Installed `smbclient` in the backend container image so SMB access happens from inside the container.

## v0.1.22 - 2026-06-28

**Commit:** `style: equalize admin stats card heights`

- Made the mobile **Galerie** and **Upload-Last** cards share the same height.
- Kept the storage card full width below them on mobile.
- Made all three admin stats cards use the same height on desktop.
- Kept the previously tightened admin spacing and button layout unchanged.

## v0.1.21 - 2026-06-28

**Commit:** `style: tighten admin layout spacing`

- Tightened the admin layout so the action row, dashboard cards and notices no longer stretch so tall.
- Distributed the desktop admin action buttons evenly across the full available width.
- Kept the mobile admin action row aligned to the same full content width as the gallery below.
- Centered the **Galerie öffnen** login title and kept the removed helper sentence out.

## v0.1.20 - 2026-06-28

**Commit:** `style: compact mobile admin dashboard`

- Made the mobile admin action buttons use the same available width as the gallery area.
- Reduced the height and padding of the admin info cards so the dashboard feels more balanced.
- Removed the extra helper sentence from the admin login card.
- Centered the **Galerie öffnen** login title.

## v0.1.19 - 2026-06-28

**Commit:** `style: improve mobile wedding intro`

- Reworked the mobile intro panel so the wedding text reads cleaner on small screens.
- Replaced the awkward mobile album heading with a cleaner three-line layout.
- Reduced visual clutter in the mobile hero card and tightened spacing for better balance.
- Kept the desktop wedding hero and the rest of the upload flow unchanged.

## v0.1.18 - 2026-06-28

**Commit:** `style: compact desktop admin actions and clean login copy`

- Reduced the desktop admin action buttons back to compact button sizing.
- Stopped stretching the admin action buttons across the full desktop width.
- Removed **Hochzeitsalbum · Admin** from the admin login card.
- Kept the wedding typography in the top bar and footer unchanged.

## v0.1.17 - 2026-06-28

**Commit:** `style: convert admin gallery to dense photo grid`

- Changed the admin gallery to a dense photo-grid layout similar to common phone photo galleries.
- Mobile gallery now uses three columns so photos use the available width better.
- Removed the visible **Ansehen** button from image cards because clicking the image opens the viewer.
- Hid image names, dates and sizes from the gallery grid; those details are now shown only in the image viewer.
- Added small SVG download and delete buttons on desktop image hover.
- Hidden grid action buttons on mobile so download/delete actions are only available after opening the image.

## v0.1.16 - 2026-06-28

**Commit:** `style: soften admin typography`

- Switched the protected admin content area to Helvetica/Arial for cleaner readability.
- Reduced admin headline, card, button and metadata font weights so the dashboard no longer looks too bold.
- Kept the decorative wedding typography only outside the admin content area, especially in the top bar and footer.
- Kept the existing gallery, upload, ZIP download and password-change behavior unchanged.

## v0.1.15 - 2026-06-28

**Commit:** `style: optimize mobile gallery viewer`

- Mobile gallery cards now use one full-width column so uploaded images get as much horizontal space as possible.
- The full-screen image viewer now uses the full phone width on mobile.
- Previous and next arrow buttons are hidden on mobile because users can swipe between images.
- Desktop gallery and viewer controls stay unchanged.

## v0.1.14 - 2026-06-28

- Mobile Admin-Login-Karte auf dieselbe Breite wie die mobile Upload-Karte gebracht.
- Galerie-öffnen-Box nutzt auf Mobile jetzt die volle verfügbare Kartenbreite.
- README/Changelog aktualisiert.

## v0.1.13 - 2026-06-28

**Commit:** `style: compact admin controls and improve readability`

- Reduced the admin action buttons back to normal compact button height on desktop and mobile.
- Kept the wedding-style typography only for the top bar and footer.
- Switched the admin page content, cards, buttons and dialogs to a normal readable system font.
- Kept the existing upload flow, admin password dialog, gallery and storage display unchanged.

## v0.1.12 - 2026-06-28

**Commit:** `feat: add admin password change dialog`

- Added an admin action to change the admin password directly inside the protected admin portal.
- Added a centered password dialog on desktop.
- Added a full-width bottom sheet password dialog on mobile.
- Stores the changed admin password in `./data/admin.json`, so it stays available after container updates.
- Keeps the admin session active by issuing a fresh token after a successful password change.

## v0.1.11 - 2026-06-28

**Commit:** `chore: simplify admin and upload copy`

- Removed the **Admin Galerie** eyebrow from the admin page on desktop and mobile.
- Changed the public hero headline to **Bilder teilen, leicht gemacht.**
- Kept the existing upload flow, admin gallery and demo notice unchanged.

## v0.1.10 - 2026-06-28

**Commit:** `chore: add demo proof of concept notice`

- Added a separate demo notice below the public upload card.
- The notice uses the same width as the upload card and is visible on desktop and mobile.
- Marked the installation as a demo and proof of concept so test users understand the purpose.

## v0.1.9 - 2026-06-28

**Commit:** `style: clean mobile admin header and restore upload limit`

- Hid the mobile-only top **Upload** navigation link on the admin page.
- Hid the **Admin Galerie** eyebrow on mobile so the admin view starts cleaner.
- Restored the default parallel upload limit from `24` back to `12`.
- Existing `.env` files that still contain `MAX_PARALLEL_UPLOADS=24` are migrated back to `12` during deploy.

## v0.1.8 - 2026-06-28

**Commit:** `chore: simplify upload hero copy`

- Removed the extra eyebrow from the upload intro.
- Replaced the typographic dash in the public upload text with a normal hyphen for cleaner, consistent wording.

## v0.1.7 - 2026-06-28

**Commit:** `feat: add admin image deletion`

- Added single-image deletion in the protected admin gallery.
- Deleting an image removes the gallery metadata entry and the uploaded file from `./data/uploads`.
- Added a delete action directly on every image card and inside the image preview dialog.
- Made the old `MAX_PARALLEL_UPLOADS=12` migration more robust so existing `.env` files are reliably updated to `24`.
- Changed the admin text to **Upload-Vorgänge** so the parallel limit is not confused with a total image limit.
- Deployment output now prints the active parallel upload limit.

## v0.1.6 - 2026-06-28

**Commit:** `fix: clear completed upload progress`

- Raised the default parallel upload limit from `12` to `24`.
- Existing `.env` files that still contain the old default `MAX_PARALLEL_UPLOADS=12` are migrated to `24` during deploy.
- Fixed the upload progress panel so it no longer stays visible forever after reaching `100%`.
- The finished `100%` state remains visible briefly, then clears automatically while keeping the success message visible.

## v0.1.5 - 2026-06-28

**Commit:** `style: compact admin dashboard stats`

- Reworked the admin dashboard so the mobile view is much more compact and easier to read.
- Removed the duplicate LXC/data storage card from the admin view and now shows only **Docker-Speicher**.
- Changed the upload load display from `0 / 12` to clearer wording: active uploads now show as `0 aktiv`, with the configured parallel upload limit shown below.
- Kept the gallery, ZIP download and logout actions available, but arranged them more cleanly on small screens.

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
cd /opt/picly.techbygiusi.com && git fetch origin picly && git reset --hard origin/picly && chmod +x deploy.sh && ./deploy.sh
```

On first deployment, `deploy.sh` prints the admin URL, username and generated password. The values are stored in `.env` and are reused during updates.

Normal upload users do **not** need credentials. Only the admin gallery at `/admin` is protected.

To show the original `.env` admin password again manually:

```bash
cd /opt/picly.techbygiusi.com && PICLY_SHOW_ADMIN_PASSWORD=true ./deploy.sh
```

If the password was changed inside the admin portal, Picly uses the persistent value from `./data/admin.json`. That value stays in place during container updates and is not printed by `deploy.sh`.

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
./data/admin.json
./data/admin.json.bak
```

`./data/tmp` is used only while uploads are being processed. Picly cleans old temporary upload files on startup. Keep the whole `./data` folder when updating the application. Deleting `./data` removes uploaded images, metadata and the changed admin password.

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
- Increase it further only when CPU, RAM and disk I/O are comfortable.
- Keep `MIN_FREE_SPACE_MB` high enough so the server does not run into a full disk during large uploads.


## License

Picly is licensed under **GNU Affero General Public License v3.0**. See `LICENSE`.
