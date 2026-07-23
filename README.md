# Hosting Portal

A lightweight self-hosted customer portal for Proxmox-based hosting. The portal gives administrators a clean web interface for users, groups, Proxmox clusters, services, credentials, SMTP settings and audit logs. Users can view their assigned services, open service details for power and delete actions when the token allows it, open a full-page desktop console, read task logs, manage service credentials, publish their own services securely through Pangolin, and create/delete their own LXC containers through self-service.

The frontend is built with React and the backend with Express + SQLite. Proxmox API tokens and stored secrets are encrypted at rest.

## Version

Current version: **v3.1.90**

## What's new in v3.1.90

- Fixed the Wiki tab title in the user portal being larger than every other tab. It used its own heading markup and fell back to the browser default heading size (24px) instead of the shared panel header size (20px) used by Dashboard and Settings. The wiki now uses the same `panel-header` as the other tabs, so all tab titles match.

## What's new in v3.1.89

- **The wiki is Markdown-only.** The plain-text editor mode, its Markdown/Plain text switch and the "this article is set to plain text" warning are gone; every article is written and rendered as Markdown.
- **Existing articles are migrated automatically** on startup: translations still stored as plain text are converted to Markdown, so articles that previously showed raw code such as `![image](...)` now render properly. The migration is idempotent and safe to run repeatedly.
- Note: if an older plain-text article happens to contain Markdown special characters (`*`, `_`, `#`), it is now interpreted as Markdown. Worth a quick look over existing articles after updating.

## What's new in v3.1.88

- **Articles can be moved by drag and drop.** Drag an article in the admin wiki structure onto any folder to move it there; while dragging, a drop zone appears at the top for moving it back to the top level. The target folder is highlighted, and only the innermost folder under the cursor receives the drop.
- Only the folder changes on a move - title, translations and publish state stay untouched, and dropping an article into the folder it is already in does nothing.
- Removed the "Articles open in the full-screen editor." note.

## What's new in v3.1.87

- **Fixed images appearing as raw code in the user portal.** The cause was the article format: an article set to plain text shows its Markdown literally, so `![image](...)` was printed instead of the picture. The editor now warns when a plain-text article contains Markdown (with a dedicated message when it contains an image) and offers a one-click "Switch to Markdown".
- **Fixed plain-text articles being drawn inside a code box.** Plain text reuses `<pre>` for whitespace handling and inherited the code-block border and radius, which produced the framed box around the text.
- Removed the "Guides and documentation provided by your administrators." subtitle in the user portal.
- Reworked the reading view: larger article title with a separating rule, readable line length and line height, properly sized body and headings, and a sidebar that reads as a navigation column with uppercase folder labels.

## What's new in v3.1.86

- **Inserted images can now be aligned left, centered or right.** Place the cursor on an image in the editor and use the new alignment buttons in the toolbar; a fourth button removes the alignment again.
- Alignment is stored as a `#left` / `#center` / `#right` fragment on the image URL (`![shot](/api/wiki/images/…#center)`), so articles stay valid Markdown and no raw HTML is needed.
- Left and right aligned images float so text wraps around them and are limited to half the article width. On narrow screens they automatically fall back to full-width centered, because a floated half-width image next to text is unreadable on a phone.

## What's new in v3.1.85

- The admin wiki tab now uses the same layout and typography as the other admin tabs (Log, Maintenance): standard panel header, 15px section heading and 14px body text instead of its own sizes. The "Build the folder structure..." subtitle was removed.
- Folder names are no longer rendered as tiny uppercase section labels; they read as normal folder rows with a folder icon.
- The four text buttons per folder were replaced by compact icon buttons (new subfolder, new article, edit, delete) that appear on hover with tooltips, so the structure stays readable. Delete turns red on hover.
- The structure now fills the full panel width in a single card instead of sitting in a narrow column next to an empty pane.

## What's new in v3.1.84

- **The wiki structure is now a real nested tree.** Subfolders were previously flattened into one list and only hinted at with dashes; they are now rendered inside their parent folder with indentation guides, at any depth.
- **Create content where it belongs.** Every folder has its own "+ Folder" and "+ Article" actions, so a subfolder or an article is created directly inside that folder instead of always landing at the top level. The top-level buttons still create at the root.
- Folders show a hint when they are still empty, and a folder's parent can be changed at any time in the folder form (the backend rejects moving a folder into its own subtree).

## What's new in v3.1.83

- **The wiki editor is now its own full-screen page** at `/admin/wiki/:articleId`. Selecting or creating an article in the admin wiki tab opens it there, so the editor uses the entire browser window instead of a column inside the dashboard. The admin tab keeps the folder structure and article list.
- **Formatting toolbar.** H1/H2/H3, bold, italic, strikethrough, inline code, code block, quote, bullet and numbered lists, link, table, divider and image upload — applied to the current selection like in a normal editor. Headings and lists toggle off when pressed again and replace an existing heading level, and block elements such as tables always start on their own line.
- **Write / Split / Preview modes**, so the rendered result can be watched side by side while typing.
- **Keyboard shortcuts**: Ctrl/Cmd+B bold, Ctrl/Cmd+I italic, Ctrl/Cmd+K link, Ctrl/Cmd+S save.
- Formatting a plain-text article automatically switches it to Markdown (with a short notice), because the syntax would otherwise be shown literally. Unsaved changes are protected by a confirmation when leaving the editor or closing the tab.

## What's new in v3.1.82

- Plain text is now the default editor for new wiki articles and new translations; Markdown has to be selected explicitly per language. Existing articles keep the format they were written in.
- The "Publish this language" checkbox is now the same slider toggle used everywhere else in the portal instead of a native checkbox.

## What's new in v3.1.81

- The language-fallback notice now sits at the very top of the article, above the title, and states plainly that the article is currently only available in English ("Dieser Artikel ist derzeit nur auf Englisch verfügbar.").
- The wiki now fully follows the portal's light/dark switch. Code blocks, inline code, the article tree hover/active states, the fallback notice and the copy buttons all use dedicated theme tokens instead of hardcoded colours, so nothing stays dark-on-dark or light-on-light.
- Code blocks got a copy button that appears on hover (and stays visible on keyboard focus, after copying, and on touch devices where there is no hover). It copies the raw code, confirms with "Copied ✓" / "Kopiert ✓" and works on portals served over plain HTTP.
- The clipboard helper is now shared between the wiki and the published-access copy control instead of being duplicated.

## What's new in v3.1.80

- **New: Wiki.** Portal users get a "Wiki" entry between Dashboard and Settings that shows a searchable, admin-curated knowledge base. Only articles an administrator has published are visible.
- **Admin authoring.** Administrators get their own "Wiki" tab to build a nested folder structure and write articles in a Markdown editor with a live preview, or in a plain-text editor per article and language.
- **Multi-language articles.** Every article can be written and published per language (EN/DE) independently, so an English article can go live while its German translation is still a draft. Readers who request a language without a translation automatically get the English version with a notice.
- **Screenshots and images.** Images can be uploaded from the file picker or pasted directly into the editor from the clipboard; the Markdown link is inserted at the caret. Uploads are stored in the persistent `backend/data` volume and served through an unguessable token URL.
- Markdown is rendered by a small built-in renderer with no new npm dependencies, so the Docker build is unchanged. All author input is HTML-escaped before rendering and link/image URLs are restricted to safe schemes.

## What's new in v3.1.79

- Published access entries can now be copied by clicking the address. The address is shown and copied without its protocol prefix (`tcp://minecraft.apps.example.com:20001` is copied as `minecraft.apps.example.com:20001`), so it can be pasted directly into clients such as a game launcher. A short "Copied ✓" confirmation is shown, and the copy also works when the portal is reached over plain HTTP.
- The "Open" button for HTTP publications keeps using the full URL including the protocol.

## What's new in v3.1.78

- Fixed German labels appearing in the "Tasks & logs" list while the portal language is English (for example a restart task showing as "Neustart"). Task types, task status and the service type label are now resolved per language directly in the component instead of relying on the runtime phrase dictionary, so a missing dictionary entry can no longer leak German text.
- Added the missing English translations for the restart and busy-state action labels ("Neustart", "Startet…", "Stoppt…", "Neustart…").

## What's new in v3.1.77

- Made the Docker image builds resilient to transient npm registry drops: both Dockerfiles now configure npm fetch retries and longer timeouts before installing, so a `ECONNRESET`/`network aborted` error during `npm install` retries instead of failing the whole build. (This addresses build failures caused by flaky build-host networking, not the application itself.)

## What's new in v3.1.76

- Hardened self-service containers against IP spoofing: the portal now enables the Proxmox firewall IP filter (`ipfilter`) and MAC filter on every provisioned container. A container is pinned to the IP address the portal assigned it, so even a root user inside cannot change the IP, spoof it, or take over another container's address — packets with a different source IP are dropped at the bridge.

## What's new in v3.1.75

- Fixed the template console opening at a bare `root@mc:/root#` shell: `cmode`/`console`/`tty` are pending LXC settings, so the container kept the no-login shell console used for password setup until it was restarted. Full clones are now stopped and started once after the console mode is switched to `tty`, so the user's console opens at a normal password-protected login shell (`root@mc:~#`).
- Fixed the requested boot-disk size growing the volume but not the filesystem: the disk is now resized while the container is running, so Proxmox runs `resize2fs` and the root filesystem fills the new size instead of staying at the template size.
- Reordered the provisioning progress steps accordingly (disk resize now runs after start) and added a "Restarting the container to secure the console" step.

## What's new in v3.1.74

- Fixed prepared-LXC full clones failing to start with a `can't lock file '/run/lock/lxc/pve-config-<vmid>.lock' - got timeout` error when a custom boot-disk size was requested: the asynchronous Proxmox disk resize is now awaited so it releases the container config lock before the firewall and start steps run.
- Failed provisioning jobs now disappear from the dashboard 5 minutes after finishing instead of remaining forever; successful jobs continue to clear after 30 seconds.

## What's new in v3.1.73

- Replaced all Pangolin policy checkboxes with the portal's compact toggle controls and removed the two redundant Pangolin introduction texts.
- Removed the editable template profile selector from the administrator template catalog.
- Added one catalog for both normal Proxmox CT archives and prepared Proxmox LXC templates.
- Prepared LXC templates are always provisioned as full clones with a new VMID and the next free IPv4 address from the configured portal pools.
- Full clones receive a newly configured hostname, CPU count, RAM allocation, disk size, bridge, IPv4 address, gateway and guest firewall policy after the clone task finishes and before startup.
- The root password is initialized after the first start through a temporary backend-only Proxmox shell session, then the container console is returned to password-protected `tty` mode.
- Existing clone firewall rules and additional network interfaces are removed before the portal rebuilds its internet-only isolation rules.
- Preserved the `client-lxc` tag and any template/admin tags on newly provisioned containers.
- Imported prepared-template descriptions from Proxmox and displayed the saved template description in the user's German/English creation dialog.
- Added the required `VM.Clone` and `VM.Console` capability checks, detailed Proxmox validation errors and automatic database migrations for the new template source metadata.


## What's new in v3.1.72

- Removed provisioning-job logs from the administrator template catalog so that area only manages cluster templates.
- Replaced the oversized self-service checkbox with the portal's compact toggle control.
- Improved spacing between template fields and each template's save action.
- Displayed an administrator-provided template description below the user's selected template in the container creation dialog.
- Kept running and failed provisioning jobs visible to users, while successful 100% jobs now disappear from the Dashboard automatically 30 seconds after completion.
- Kept completed job details available while the provisioning modal is still open.
- Preserved German and English labels and the v3.1.70 Proxmox live-console workflow.


## What's new in v3.1.71

- Added an administrator-managed template catalog for every Proxmox cluster.
- Added display names, operating-system metadata, profile types, descriptions, additional tags and self-service approval per template.
- Added persistent background provisioning jobs with live, user-safe progress events.
- Kept CPU, RAM, disk and root-password selection available for every approved template.
- Added automatic Docker LXC features for Docker profiles while retaining the standard LXC workflow for base and Nginx profiles.
- Kept the existing automatic VMID/IP assignment, firewall isolation, `client-lxc` tag and Proxmox live console.


## What's new in v3.1.70

- Rebased the release on v3.1.66 so user-created LXC consoles use the reliable Proxmox live-console path again; the SSH-only console and automatic `console=0` / `tty=0` hardening from later experimental builds are not included.
- Added the existing Proxmox tag `client-lxc` to every newly created user self-service LXC container.
- Removed the fixed `Europe/Berlin` container timezone and mounted `/etc/localtime` from the hosting VM into both portal containers.
- Removed the unintended light input background and focus halo around resource sliders in dark mode without changing the light theme.
- Kept RAM selectable in 256 MB increments while adding stronger snapping at every 1 GB boundary.
- Kept disk capacity selectable in 2 GB increments while adding stronger snapping at every 8 GB boundary.
- Removed the automatic VMID, IP and firewall explanation below the root-password field in both German and English.


## What's new in v3.1.66

- Added a localized password-change section to the user **Settings** page with current-password verification, an 8-character minimum and confirmation of the new password.
- Reused the existing authenticated password-change endpoint and audit logging without exposing password values outside the form submission.
- Increased the administrator-configurable and user-selectable self-service LXC disk limit from **32 GB to 64 GB**.
- Updated both frontend input limits and backend validation so values such as 50 GB are accepted consistently.
- Preserved German and English labels, validation messages and success feedback.


## What's new in v3.1.65

- Removed the explanatory manual-IPv4 note from the administrator service editor while keeping the QEMU-only manual address workflow unchanged.
- Removed the redundant Pangolin publishing information box from the administrator service editor.
- Removed the obsolete **Add management page** action and related management-page explanation from the administrator credentials dialog; management-page settings remain in the combined Dashboard access editor.
- Kept management-page credentials out of the administrator credentials list so the dialog now focuses on general entries such as SSH credentials.
- Removed the HTTP/HTTPS allowed-port example below the Pangolin policy field.
- Preserved German and English behavior while simplifying the affected administration views.


## What's new in v3.1.64

- Moved management-page setup out of the user **Credentials** tab and into the service Dashboard access editor.
- Renamed the combined action to **Edit public access / Öffentlichen Zugriff bearbeiten**.
- The same localized dialog now manages Pangolin publications or the manual public website fallback together with the management-page URL.
- Added optional management-page username, password/secret and notes fields, including update and removal actions.
- Kept general credentials such as SSH logins in the **Credentials** tab while hiding the dedicated management-page record there.
- Made the access editor available to the directly assigned user even when a service has no publishable guest IP, because the management-page URL does not depend on Pangolin.
- Synchronized management-page changes with the service record so Dashboard and detail buttons update immediately.


## What's new in v3.1.63

- Restricted manual service IPs to administrator-assigned QEMU VMs that already exist as visible portal services.
- The manual IPv4 and SSH-port fields are no longer shown while creating an assignment; they become available to the administrator after assignment and to the directly assigned user in service details.
- LXC containers never expose the manual-IP workflow. Their addresses continue to come from the Proxmox API or from the self-service reservation stored by the portal.
- Self-service creation remains LXC-only and still allocates the next free IPv4 address from the administrator-defined pool without any change to the provisioning logic.
- Stored the Proxmox resource type on portal assignments and added backend checks so LXC or self-service resources cannot enable the SSH-IP fallback through direct API requests.
- Kept the fully localized manual website fallback for Pangolin-disabled clusters and the compact, overflow-safe service-card action typography in both German and English.


## What's new in v3.1.62

- Added an optional manual service IPv4 address and SSH port that administrators and the directly assigned user can maintain for each assigned VM or container.
- A configured service IP becomes the preferred guest address for details, Pangolin targets and the browser console when Proxmox cannot detect the guest address reliably.
- The full-page browser console now uses an SSH relay to the configured service IP and keeps the saved username and password exclusively on the backend. Add a normal credential in the **Credentials** tab, preferably with `SSH` in its label.
- Services without a manual IP continue to use the traditional Proxmox serial console. This explains why the old console connected through the Proxmox node address and why QEMU guests without a serial device returned `unable to find a serial interface`.
- The console header now distinguishes **SSH console** from **Proxmox console** and shows the effective SSH target instead of the cluster-node address.
- Rechecked and completed German and English localization for the manual website fallback introduced in v3.1.61 and for the new service-IP workflow.
- Reduced service-card action typography and allowed safe two-line wrapping so website, access and administration actions never escape their buttons.


## What's new in v3.1.61

- Added a manual public website fallback for services on clusters where Pangolin publishing is disabled or globally unavailable.
- Assigned users can save, edit, open and remove one validated `http://` or `https://` website link without requiring a guest IP address.
- Service cards and detail views now show **Add link / Link hinzufügen** or **Edit link / Link bearbeiten** instead of the Pangolin access action while fallback mode is active.
- Existing Pangolin publications remain visible and removable after cluster publishing is disabled, while the manually stored website becomes the primary website button.
- Added a dedicated database column and automatic migration so manual links are not overwritten by Pangolin synchronization.


## What's new in v3.1.60

- Replaced the remaining mixed-language Proxmox cluster labels with explicit German and English UI text for cluster cards, capability badges and the add/edit dialog.
- Renamed the permission action to **Check permissions / Berechtigungen prüfen** and localized all loading, map-location, token, self-service and Pangolin publishing texts consistently.
- Removed the explanatory administrator paragraph below **Managed publications / Verwaltete Veröffentlichungen** in the Pangolin settings panel.


## What's new in v3.1.59

- Restored consistent inner padding around the complete **Add public access** form; the previous high-specificity rule unintentionally overrode the section padding with zero.
- Removed the generated **Public address** preview from the add/edit form. Published endpoints remain visible only in the existing-publications list after Pangolin has created them.
- Shortened service-card action captions to **Website**, **Access** and **Admin** (with equivalent German labels) so two or three actions fit without overlapping.
- Added localized descriptive tooltips and accessible labels while keeping the visible buttons compact.
- Improved responsive action grids so buttons wrap cleanly instead of allowing text to escape their borders.


## What's new in v3.1.58

- New Pangolin resources use the deterministic name format `UserName_ContainerName_PROTOCOL_PORT`, for example `Erik_Schmidt_test_TCP_20001`.
- User and container names are normalized to underscore-separated Pangolin-safe values while the protocol remains uppercase.
- The administrator connection test now probes the Pangolin Integration API root with the same URL and Bearer authentication used by real publication operations.
- The connection test no longer depends on organization, site and domain catalogue reads; the separate **Load from Pangolin** action remains responsible for discovery.
- Updated German and English connection-test diagnostics so an upstream test failure is no longer reported as a general portal-container problem.


## What's new in v3.1.57

- Service details now show the assigned CPU core count and configured memory capacity in addition to live utilization metrics.
- Users can create and manage multiple Pangolin publications for the same service instead of being limited to one public endpoint.
- HTTP, TCP and UDP publications can run in parallel, including several TCP or UDP public ports for one container.
- Every publication is stored, edited and removed independently, while existing single-publication databases are migrated automatically without losing Pangolin resource IDs.
- The publishing dialog now includes a localized list of all active endpoints and keeps the add/edit form separate for clearer management.


## What's new in v3.1.56

- The Pangolin publishing dialog now grows with its content and shows an internal scrollbar only when the available browser height is genuinely too small.
- HTTP, TCP and UDP publications now all require a validated subdomain instead of exposing raw services on the base domain hostname.
- Raw public addresses now use protocol-specific hostnames such as `tcp://service.apps.example.com:20001` and `udp://service.apps.example.com:20001`.
- Added matching German and English validation messages for the required subdomain workflow.


## What's new in v3.1.55

- Service details now show the guest operating system reported by Proxmox and the exact LXC template used for new self-service containers.
- Existing LXC containers fall back to the configured Proxmox OS type, while QEMU guests use QEMU Guest Agent OS information when available.
- Removed the redundant TCP/UDP helper panel completely and expanded the public-port field across the available dialog width.
- Added matching German and English localization for the new operating-system label.


## What's new in v3.1.54

- Removed the fixed `20000-26000` helper comments from the Pangolin administrator and user publishing forms.
- The user publishing dialog now displays the TCP and UDP port policies saved by the administrator without an additional hard-coded range message.
- TCP and UDP inputs now select their initial port and browser input bounds from the configured administrator policy.


## What's new in v3.1.53

- Reorganized the main Settings panel into distinct Language, SMTP settings and Setup check sections.
- Moved the complete setup status and Proxmox/SMTP connection tests out of the popup and directly into Settings.
- Added automatic inline setup loading, refresh controls and complete German/English localization for the new section copy.


## What's new in v3.1.52

- Removed the publishing-enabled status chip from Proxmox cluster cards while keeping the per-cluster publishing setting and backend enforcement unchanged.
- Removed only the Isolation and Firewall check capability chips from cluster cards; both permission checks and security functions continue to operate normally.
- Kept the remaining Read, Power, Console and Provision capability indicators visible.


## What's new in v3.1.51

- The sticky publishing action row now uses the exact background color of the surrounding popup in every theme.
- Removed the visibly different rectangle behind the Cancel and Publish buttons while keeping the actions fixed during scrolling.


## What's new in v3.1.50

- The user publishing dialog now keeps equal visual spacing on its left and right sides, including when its content scrolls.
- The service-port and backend-protocol labels and controls now share the same row height and top alignment on desktop.
- The mobile publishing form keeps the existing single-column layout and consistent localized spacing.

## What's new in v3.1.49

- Raw TCP and UDP publishing is now presented as an active feature instead of a prepared placeholder.
- New and previously untouched installations use the dedicated `20000-26000` TCP/UDP pool by default.
- The administrator form explains the fixed pool in German and English and rejects policies outside it.
- The backend independently enforces the raw port pool for every publication request, while the user dialog applies matching input limits.

## What's new in v3.1.48

- Proxmox tasks are now limited to the current VM or container lifecycle, starting with the latest create, clone or restore operation.
- Reusing a previously deleted VMID no longer shows tasks or logs from the old machine.
- Direct task-log requests are validated against the current lifecycle as well, preventing access to stale logs through an old UPID.

## What's new in v3.1.47

- The Proxmox console now detects an existing interactive shell prompt instead of sending repeated synthetic Enter keys.
- Existing blank rows and duplicate prompts are collapsed so one active prompt starts on the first terminal row.
- The terminal receives focus automatically as soon as the shell prompt is ready, allowing immediate typing without an extra click.

## What's new in v3.1.46

- Removed the bottom fade from the publishing dialog action row.
- Kept the sticky action buttons on a flat background matching the rest of the modal on desktop and mobile.

## What's new in v3.1.45

- Removed the extra Pangolin Site ID explanatory note from the administrator settings.
- Aligned the service-port and backend-protocol controls at the top of the user publishing dialog.
- Added matching German and English help text for the backend protocol so both columns keep a consistent responsive layout.
- Kept the two-column desktop form and single-column mobile form visually balanced.

## What's new in v3.1.44

- Fixed intermittent portal `502 Bad Gateway` responses after recreating only the backend container. Nginx now resolves the Docker backend hostname dynamically instead of retaining an obsolete container IP.
- Reworked the user publishing dialog so its header stays visible and only the dialog content scrolls on desktop and mobile.
- Localized all Pangolin publishing settings and status messages in German and English.
- Renamed the misleading **Newt site** field to **Pangolin site** and shows the numeric Site ID in the selector.
- Improved Pangolin connectivity diagnostics for DNS, timeout, refused connection and TLS verification failures.

## What's new in v3.1.43

- Administrators can enable or disable Pangolin publishing independently for every Proxmox cluster.
- The cluster switch is enforced by the backend for resource lists, publishing options and every create/update request, not only hidden in the frontend.
- Existing publications remain reachable after a cluster is disabled and can still be removed by the assigned user or an administrator.
- Cluster cards and the responsive edit dialog clearly show the current publishing state.

## What's new in v3.1.42

- The dedicated desktop console now fits exactly into the browser viewport, keeping the page itself fixed while only the terminal scrollback can move.
- Selecting terminal text automatically copies it to the clipboard without an extra button or keyboard shortcut.
- Right-click and Ctrl/Cmd+V now paste clipboard content directly into the active Proxmox console.
- Console resizing continues to update Proxmox whenever the browser or terminal card dimensions change.

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
- Users choose in the **Notifications** section inside their personal settings whether to receive e-mails when a service goes **offline**, comes **back online**, or when **maintenance** is announced.
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
- Configure LXC self-service and Pangolin publishing independently per cluster.
- Review audit events for power actions, console access, credentials and provisioning.

### User area

- View assigned services with live status, CPU, RAM and disk information.
- See the reachable container IP address in the detail view. Static LXC IPs are read from the Proxmox network config and loopback addresses are ignored.
- Start, stop, reboot, shut down or delete services from the detail view when the Proxmox token permits it.
- Open a viewport-fitted full-page console in a separate browser tab on desktop when the Proxmox token permits it. Only terminal scrollback moves; selecting text copies automatically, while right-click or Ctrl/Cmd+V pastes into the session. LXC consoles can automatically sign in with an attached root credential without forwarding terminal status replies into the login field.
- Read Proxmox tasks and logs for the current service lifecycle only. Reused VMIDs do not expose the previous machine history.
- Manage service credentials. The exact root password used during self-service provisioning, including a configured cluster default, is saved automatically on the created service.
- Publish, edit or remove directly assigned services through Pangolin. Every HTTP, TCP and UDP publication requires its own validated subdomain; the backend fixes the target to the service IP, validates the administrator-defined port policy and displays the generated public address on the service card.
- Create new LXC containers on desktop or mobile through template-only self-service with mandatory internet-only network isolation.
- Delete containers that the user created through self-service.
- Configure language and e-mail notification preferences together on the Settings page.

### Self-service provisioning

Self-service is intentionally limited to LXC containers created from administrator-approved sources. The catalog supports normal CT archive files (`vztmpl`) and prepared Proxmox LXC templates. Archive sources create a new container in the traditional way; prepared LXC templates are always provisioned as full clones. VM creation remains an administrator task in Proxmox, and Community Scripts have been removed from the portal.

The backend automatically allocates:

- The next free VMID from the configured VMID range.
- The next free IPv4 address from the configured IP pool.

The IP allocator checks the portal reservation table, static LXC network config and live LXC interface addresses from Proxmox, so containers created outside the portal are respected as well. A prepared template never reuses its source VMID or source IP.

For a prepared LXC template, the backend first waits for the full-clone task to finish. It then overwrites the hostname, CPU, RAM, target storage, disk size and network configuration through separate Proxmox configuration requests. Additional inherited network interfaces and inherited guest-firewall rules are removed. The `client-lxc` tag is always present, while existing template tags and administrator-defined tags are retained.

Proxmox accepts a root password while creating or restoring an LXC but not through the configuration update endpoint of an existing clone. The portal therefore starts the isolated clone in temporary `cmode=shell`, sets the requested root password inside the container through an authenticated backend-only Proxmox termproxy session, and immediately restores password-protected `tty` console mode. The clone is deleted if this initialization cannot be completed. No Proxmox-node SSH credential is required.

Before the first start, the backend enables the Proxmox guest firewall and adds outbound drop rules for the container subnet, RFC1918 networks, CGNAT, IPv4 link-local ranges and all IPv6 traffic. DNS is limited to configured public IPv4 resolvers. The portal verifies that the Proxmox Datacenter firewall is enabled before presenting a cluster as available to users, rechecks it during creation and deletes a newly created or cloned LXC if the isolation rules cannot be installed. If automatic cleanup fails, the orphaned LXC remains stopped and the portal reports that it must be checked in Proxmox.

Admins configure per cluster:

- Self-service on/off. The remaining provisioning settings can be prepared and saved while self-service is disabled.
- Pangolin publishing on/off. Existing publications stay reachable when disabled, while user create/update requests are blocked.
- VMID range.
- IP range, CIDR prefix and gateway.
- Bridge.
- Disk storage, selected from live storages reported by the selected Proxmox node.
- CT template storage.
- Approved CT archives and prepared LXC templates. Submitted catalog IDs are validated again by the backend.
- CPU, RAM and disk limits.

## Recommended Proxmox token rights

A read-only token is enough for monitoring. Extra features appear only when the token has the matching permissions.

Recommended role for full portal functionality:

- `VM.Audit`
- `VM.PowerMgmt`
- `VM.Console` (also required to initialize the root password inside a prepared full clone)
- `VM.Allocate`
- `VM.Clone` on prepared source templates
- `VM.Config.CPU`, `VM.Config.Memory`, `VM.Config.Disk` and `VM.Config.Options` for cloned-container customization
- `VM.Config.Network` on the Proxmox VM path used for self-service containers so the portal can create guest firewall rules
- `Sys.Audit` on `/` so the portal can verify that the Datacenter firewall is enabled
- `Datastore.AllocateSpace` on the storage used for LXC disks/templates

The portal hides unavailable actions when the token does not provide the matching capability. The Proxmox Datacenter firewall must remain enabled before and during self-service. The portal never disables or globally changes it; isolation is applied only to each newly created container.

## Pangolin Integration API setup

The portal expects a working Pangolin Integration API endpoint. In the Pangolin dashboard, create an **Organization API key** with least-privilege permissions:

- Organization: get organization.
- Domain: list organization domains and get domain.
- Site: list sites and get site.
- Resource: create, delete, get, list and update.
- Target: create, delete, get, list and update.

Do not use a root key. Open **Admin Console → Settings → Pangolin publishing** and enter:

- Integration API URL, including `/v1`, for example `https://pangolin-api.example.com/v1`.
- Organization API key. It is encrypted at rest with the portal encryption key and never returned to the browser again.
- Organization ID.
- Pangolin site and Pangolin domain, selected after using **Load from Pangolin**. The site selector uses the numeric Pangolin `siteId`; the alphanumeric Newt connector ID is not used.
- Base domain used for generated user addresses, for example `apps.example.com`.
- Allowed HTTP target ports and the fixed raw TCP/UDP publication pool. TCP and UDP policies may only contain ports from `20000` through `26000`.

Port policies accept comma-, space- or semicolon-separated values and inclusive ranges:

```text
80,443,3000-3999,8080
```

For HTTP publishing, Pangolin terminates public TLS while the configured backend method controls the Newt-to-service connection. Every protocol requires a unique subdomain. Raw TCP or UDP resources use that hostname together with the selected port, for example `tcp://service.apps.example.com:20001`; the selected port is used as both the public Pangolin proxy port and the internal service port. The portal accepts and publishes raw ports only inside the dedicated `20000-26000` pool; this limit is enforced in both the administrator settings and every backend publication request.

### Publishing security model

- Only the directly assigned service owner can create or change a publication.
- Publishing must be enabled globally and for the service's Proxmox cluster. The backend enforces both switches on every create or update request.
- The backend resolves the service IPv4 address itself; the user interface has no target-IP input.
- Subdomains are validated, checked for local collisions and checked against the administrator's reserved list.
- Target ports must match the active protocol's administrator-defined port policy.
- Pangolin identifiers are stored in the `resource_publications` table so updates and deletes operate on the exact remote objects.
- The API key is used only by the Express backend and must never be added to React environment variables or client-side code.

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
      SELF_SERVICE_BLOCKED_NETWORKS: ""
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
| `SELF_SERVICE_BLOCKED_NETWORKS` | empty | Optional additional IPv4 addresses or CIDRs that self-service containers must never reach, useful for internal networks using public address space. |

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
- Pangolin publication changes are restricted to the user directly assigned to the service. The backend selects the service IP, validates subdomains and administrator-defined port ranges, and stores only Pangolin object IDs plus the generated public address. Group-shared viewers cannot change publishing.
- Self-service creation is template-only; the removed Community Script endpoints and node-shell provisioning page are no longer available.
- New self-service LXCs are created stopped, receive host-side outbound isolation rules, and are started only after the firewall configuration succeeds. The container output policy is `DROP`; private/local ranges, the complete guest subnet, cluster-node addresses, discovered guest addresses and IPv6 are blocked before a final public-IPv4 Internet allow rule is installed.
- The portal never disables or changes the Proxmox Datacenter firewall. It must remain enabled so the per-container rules are enforced.

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

### v3.1.90 - 2026-07-23

**Commit:** `fix: use the shared panel header for the wiki so its tab title matches the other tabs`

- Replace the custom `.wiki-panel-heading` wrapper in `WikiBrowser` with the shared `panel-header`, so the title resolves to `.panel-header h2` (20px) instead of the unstyled browser default (24px).
- Reduce `.wiki-panel-heading` to layout-only rules (wrapping and a capped search field width, unconstrained on narrow screens).

### v3.1.89 - 2026-07-23

**Commit:** `refactor: make the wiki markdown-only and migrate existing plain-text articles`

- Always store `markdown` in `wikiService`, restore the schema default and add an idempotent startup migration converting existing `text` translations to `markdown`.
- Drop the plain-text branch from `MarkdownView` and the `format` prop from all callers.
- Remove the editor's format toggle, the plain-text warning banner and every auto-switch path in the toolbar, image upload and image alignment actions, along with the labels and CSS they used.

### v3.1.88 - 2026-07-23

**Commit:** `feat: move wiki articles between folders by drag and drop`

- Make article rows draggable with a grip handle and turn folder nodes into drop targets, using `stopPropagation` so a drop lands in the innermost folder instead of bubbling to its parents.
- Add a top-level drop zone that only appears while dragging, highlight the active target, and skip the request when an article is dropped into its current folder.
- Moves send only `folderId`, so `updateArticle` leaves slug, translations and publish state unchanged.
- Remove the "Articles open in the full-screen editor." hint from the structure card.

### v3.1.87 - 2026-07-23

**Commit:** `fix: stop plain-text wiki articles rendering markdown literally and polish the reading view`

- Reset border and radius on `.markdown-plain`, which previously inherited the `<pre>` code-block styling and framed every plain-text article in a box.
- Detect Markdown syntax inside a plain-text article in the editor and show a warning with a one-click switch to Markdown, using a specific message when an image is present (the reason inserted images appeared as raw code to readers).
- Remove the user-portal wiki subtitle and restyle the reading view: 24px article title with a separating rule, 74ch measure, 15px/1.75 body text, scaled headings and a navigation-style sidebar.

### v3.1.86 - 2026-07-23

**Commit:** `feat: allow wiki images to be aligned left, center or right`

- Parse an optional `#left`/`#center`/`#right` fragment on image URLs in `MarkdownView`, strip it from the emitted `src` and map it to an allowlisted `align-*` class, so no author-controlled value reaches the class attribute and unsafe URLs are still rejected.
- Add four toolbar actions in the wiki editor that set or clear the alignment of the image at (or nearest before) the caret, replacing an existing fragment instead of appending a second one.
- Style centered images as auto-margin blocks and left/right as floats limited to half the article width, with float clearing on headings, rules, code blocks and tables, plus a full-width centered fallback under 700px.

### v3.1.85 - 2026-07-23

**Commit:** `style: align the wiki admin tab with the other admin panels and use icon actions`

- Use the standard `panel-header` markup and drop the intro paragraph so the Wiki tab matches Log and Maintenance; align tree typography to 14px body / 15px section headings.
- Replace the uppercase micro-label folder titles with normal folder rows including a folder icon, and swap the four per-folder text buttons for compact icon buttons revealed on hover (always visible on touch devices).
- Collapse the two-column layout into one full-width structure card now that editing happens on its own page, and remove 24 labels left unused after the editor moved out.

### v3.1.84 - 2026-07-23

**Commit:** `feat: render the wiki structure as a nested tree and create folders and articles in place`

- Replace the flattened folder list in `WikiAdminPanel` with a recursive `renderBranch` that nests subfolders inside their parent at any depth, with indentation guides.
- Add per-folder "+ Folder" and "+ Article" actions that pre-select the target parent; `createArticle` now takes a destination folder instead of always creating at the root.
- Add an empty-folder hint and reveal the folder actions on hover, focus, and always on touch devices.

### v3.1.83 - 2026-07-23

**Commit:** `feat: move the wiki editor to a full-screen page with a formatting toolbar`

- Add `pages/WikiEditorPage.jsx` and the admin-guarded route `/admin/wiki/:articleId`, following the existing full-page `/console/:resourceId` pattern; the admin wiki tab now navigates there instead of editing inline.
- Add a formatting toolbar (headings, bold/italic/strikethrough, inline code, code block, quote, bullet/numbered lists, link, table, divider, image upload) operating on the textarea selection, with heading/list toggling, heading-level replacement and forced line breaks before block-level templates.
- Add Write/Split/Preview view modes, Ctrl+B/I/K/S shortcuts, an unsaved-changes guard on navigation and `beforeunload`, and automatic switching to Markdown when a formatting action is used on a plain-text article.
- Strip the now-duplicated inline editor and its dead state from `WikiAdminPanel`, keeping structure management plus per-article delete.

### v3.1.82 - 2026-07-23

**Commit:** `feat: default wiki articles to plain text and use the standard slider for the publish toggle`

- Make `text` the default article format in the editor, in `wikiService` normalisation, in the `wiki_article_translations` schema default and in the `MarkdownView` fallback, so an unset format never renders as Markdown. Stored formats of existing translations are unchanged.
- Replace the native publish checkbox with the shared `toggle-switch`/`toggle-knob` slider markup used by the Pangolin settings panel, and keep its label on one line.

### v3.1.81 - 2026-07-23

**Commit:** `feat: theme the wiki for light and dark mode and add hover copy buttons to code blocks`

- Move the translation-fallback notice above the article title and reword it to state that the article is currently only available in English.
- Introduce wiki theme tokens for both `theme-light` and `theme-dark` and replace the hardcoded code-block colours and the undefined `--color-surface-muted` fallbacks, so tree hover states, inline code, code blocks and the notice render correctly in both themes.
- Render fenced code blocks inside a wrapper with a copy button that reveals on hover, stays visible on focus/after copying/on touch devices, and copies the raw code text via click delegation (the body is injected HTML, so the handler is delegated from the container).
- Extract `utils/clipboard.js` with the secure-context clipboard call plus `execCommand` fallback and reuse it in `MarkdownView` and `PublicPageModal`.

### v3.1.80 - 2026-07-23

**Commit:** `feat: add admin-managed multi-language wiki with markdown editor and image uploads`

- Add wiki schema (`wiki_folders`, `wiki_folder_translations`, `wiki_articles`, `wiki_article_translations`, `wiki_images`) with per-language publishing and cascading folder deletes that preserve articles by moving them to the top level.
- Add `services/wikiService.js` and `routes/wiki.js`: folder/article CRUD for admins, published-only tree and article reads for users, and raw-binary image upload without adding a multipart dependency.
- Add a "Wiki" tab between Dashboard and Settings in the user portal (`WikiBrowser`) and a "Wiki" admin tab (`WikiAdminPanel`) with folder management, per-language tabs, Markdown/plain-text switch, live preview, publish toggle and clipboard image paste.
- Add a dependency-free Markdown renderer (`MarkdownView`) that escapes all input before rendering and allows only `http(s)`, root-relative, `mailto:` and anchor URLs.
- Wiki images are addressed by an unguessable token because rendered `<img>` tags cannot send the JWT auth header; upload directory is resolved absolutely so it works with the relative `DB_PATH` used in docker-compose.

### v3.1.79 - 2026-07-23

**Commit:** `feat: copy published access address without the protocol prefix on click`

- Render the published access address as a click-to-copy control that shows and copies the address without its scheme (`tcp://`, `udp://`, `http(s)://`), with a temporary "Copied ✓" confirmation in both portal languages.
- Fall back to the legacy `execCommand` copy path when the async clipboard API is unavailable, so copying also works on portals served over plain HTTP.

### v3.1.78 - 2026-07-23

**Commit:** `fix: localize Proxmox task labels so they follow the selected portal language`

- Resolve task type, task status and the service type label per language in `ResourceDetail`, fixing German task labels such as "Neustart" showing in the English portal because the phrase dictionary had no matching entry.
- Add the missing dictionary entries for "Neustart", "Startet...", "Stoppt..." and "Neustart..." without changing the German wording of the restart button.

### v3.1.77 - 2026-07-19

**Commit:** `build: add npm fetch retries and timeouts to Dockerfiles to survive transient registry resets`

- Configure npm fetch-retries, retry timeouts and a longer fetch-timeout in the backend and frontend Dockerfiles before `npm install`, so a transient `ECONNRESET`/`network aborted` during dependency download retries instead of failing the image build.

### v3.1.76 - 2026-07-19

**Commit:** `feat: enable Proxmox ipfilter and macfilter to pin containers to their assigned IP`

- Enable the Proxmox firewall IP filter and MAC filter on every self-service container so it is locked to the portal-assigned IP/MAC; a root user inside can no longer spoof or change the effective IP because non-matching source packets are dropped at the bridge.

### v3.1.75 - 2026-07-19

**Commit:** `fix: restart cloned LXC for tty console and resize disk online so the filesystem grows`

- Stop and start a full-clone LXC once after switching it to `cmode: tty`, so the pending console mode applies and the console opens at a password-protected `root@host:~#` login shell instead of a no-login `/root` shell.
- Resize the boot disk while the container is running so Proxmox runs `resize2fs` and the root filesystem fills the requested size (offline dir/raw resizes grew only the volume).
- Reorder provisioning progress so the disk resize runs after start and add a container-restart progress step.

### v3.1.74 - 2026-07-19

**Commit:** `fix: await LXC disk resize before start and auto-clear finished provisioning jobs`

- Wait for the asynchronous Proxmox disk-resize task to finish before rebuilding the firewall and starting a full-clone LXC, fixing the `pve-config-<vmid>.lock` timeout when a custom boot-disk size is requested.
- Retire failed provisioning jobs from the dashboard after 5 minutes (backend query and client-side timers), keeping the existing 30-second retention for successful jobs.

### v3.1.73 - 2026-07-19

**Commit:** `feat: support prepared LXC template full clones`

- Replace Pangolin checkboxes with compact toggles and remove the two redundant introduction texts.
- Remove administrator template profile selection.
- Discover both CT archives and prepared Proxmox LXC templates in the template catalog.
- Always provision prepared templates as full clones with portal-pool VMIDs and IPv4 addresses.
- Reapply hostname, CPU, RAM, disk, network and firewall settings after cloning, then initialize the new root password through a temporary backend-only Proxmox shell session.
- Preserve `client-lxc`, template descriptions and German/English user guidance.

### v3.1.70 - 2026-07-19

**Commit:** `fix: restore Proxmox consoles and refine provisioning`

- Restore the v3.1.66 Proxmox live-console implementation and omit the later SSH-only console changes.
- Apply the existing `client-lxc` tag to every newly created self-service LXC container.
- Inherit the hosting VM timezone through read-only `/etc/localtime` mounts for backend and frontend.
- Remove the dark-mode range-input halo while preserving the light-mode appearance.
- Keep three intermediate RAM choices between full-gigabyte boundaries and three intermediate disk choices between 8 GB boundaries, with stronger snapping at the major allocations.
- Remove the automatic-allocation and firewall explanation from the creation form in both languages.

### v3.1.66 - 2026-07-19

**Commit:** `feat: add account password settings and raise disk limit`

- Add a secure, localized password-change form to the user Settings page.
- Verify the current password, enforce the existing eight-character minimum and require new-password confirmation.
- Raise the complete self-service disk-size limit from 32 GB to 64 GB in administrator settings, user options and backend enforcement.

### v3.1.65 - 2026-07-18

**Commit:** `fix: streamline service and credential administration`

- Remove redundant help text from the administrator service editor.
- Remove the legacy management-page action from administrator credentials because management access is maintained in the Dashboard access editor.
- Hide management-purpose records from the general administrator credential list.
- Remove the HTTP/HTTPS example below the Pangolin allowed-port policy.

### v3.1.64 - 2026-07-18

**Commit:** `feat: combine public and management access editing`

- Move management-page configuration from the user Credentials tab into the Dashboard access editor.
- Manage the public website or Pangolin publications and the management page from one German/English dialog.
- Store optional management-page login credentials and notes without exposing saved secrets to the browser.
- Allow the assigned user to open the access editor independently of Pangolin IP availability.
- Keep SSH and other general credentials in the dedicated Credentials tab.

### v3.1.63 - 2026-07-18

**Commit:** `fix: restrict manual service IPs to assigned QEMU VMs`

- Limit manual guest IPv4 and SSH settings to administrator-assigned QEMU VMs after the portal assignment exists.
- Hide the manual-IP controls for LXC containers and during initial service assignment.
- Enforce the same restriction in administrator and user APIs and remember the Proxmox resource type in the resource record.
- Keep LXC IP discovery and self-service next-free-address allocation unchanged.
- Preserve complete German and English localization for the service-IP and Pangolin-disabled website fallback workflows.

### v3.1.62 - 2026-07-18

**Commit:** `feat: add manual guest IP SSH console fallback`

- Let administrators and the directly assigned user store a manual guest IPv4 address and SSH port for each service.
- Prefer the manual address for service details and Pangolin target resolution when automatic guest discovery is unavailable or unsuitable.
- Add a backend-only SSH WebSocket relay that reuses a saved service credential without exposing passwords to the browser.
- Keep the existing Proxmox serial-console path for resources without a manual guest address.
- Label SSH and Proxmox console modes clearly, show the effective target, and provide localized validation and setup guidance.
- Complete the German and English manual-website fallback text and make resource-card actions smaller and overflow-safe.

### v3.1.61 - 2026-07-18

**Commit:** `feat: add manual website fallback for disabled Pangolin clusters`

- Allow the assigned user to store one existing public website URL when Pangolin is disabled for the cluster or unavailable globally.
- Validate fallback links server-side and accept only credential-free HTTP or HTTPS URLs.
- Keep manual website links separate from Pangolin-managed URLs so publication synchronization cannot overwrite them.
- Show localized add/edit website actions on service cards and in service details.
- Preserve and expose existing Pangolin publications for removal while a cluster uses manual fallback mode.

### v3.1.60 - 2026-07-18

**Commit:** `fix: correct Proxmox localization`

- Use explicit German and English labels for Proxmox cluster cards and capability indicators.
- Fully localize the Proxmox add/edit dialog, including the selected map coordinates and cluster feature settings.
- Replace the token-check caption with a clearer localized permission-check action.
- Remove the redundant administrator explanation from the managed Pangolin publications section.

### v3.1.59 - 2026-07-18

**Commit:** `fix: refine publishing layout and service actions`

- Restore the intended inner spacing of the Pangolin add/edit publication section.
- Remove the generated public-address preview from the form while retaining created endpoints in the publication list.
- Use compact localized service-card actions with full accessible descriptions.
- Make two- and three-button resource-card layouts wrap safely at narrower widths.

### v3.1.58 - 2026-07-18

**Commit:** `fix: align Pangolin resource names and connection testing`

- Name newly created and edited Pangolin resources as `UserName_ContainerName_PROTOCOL_PORT`.
- Normalize name components to stable underscore-separated values before sending them to Pangolin.
- Replace the multi-request catalogue-based connection check with a direct Integration API root probe using the stored publication credentials.
- Keep catalogue discovery separate and improve localized connection-test failure text.

### v3.1.57 - 2026-07-18

**Commit:** `feat: support multiple parallel service publications`

- Added assigned CPU core and memory values to the localized service detail view.
- Replaced the one-publication-per-service database constraint with a backward-compatible automatic migration.
- Added independent create, edit and delete operations for multiple HTTP, TCP and UDP publications.
- Added a localized publication manager that lists all endpoints and supports parallel raw ports and HTTP hostnames.
- Updated administrator publication removal to target an individual publication instead of deleting every endpoint of a service.

### v3.1.56 - 2026-07-18

**Commit:** `fix: require publishing subdomains and remove idle scrollbars`

- Made the publishing dialog content-sized so its internal scrollbar appears only when required by the viewport.
- Required unique subdomains for HTTP, TCP and UDP publications.
- Generated raw TCP and UDP addresses with the selected subdomain hostname.
- Added German and English validation copy for the new required field.

### v3.1.55 - 2026-07-18

**Commit:** `feat: show guest operating systems and source templates`

- read the configured guest OS from Proxmox and prefer QEMU Guest Agent details when available
- persist the exact source template for newly provisioned LXC containers and expose it in service details
- remove the redundant TCP/UDP helper panel and let the public-port field use the full row
- localize the new detail label in German and English

### v3.1.54 - 2026-07-18

**Commit:** `fix: use configured publishing port ranges`

- remove the fixed raw-port helper comments from both Pangolin forms
- keep the user-visible TCP and UDP ranges sourced from the administrator settings
- derive the initial raw port and HTML input bounds from the configured policy


### v3.1.53 - 2026-07-18

**Commit:** `refactor: organize settings into inline sections`

- separate language, SMTP and setup verification into clearly bounded settings sections
- replace the setup-check popup with an automatically loaded inline status and test area
- localize all new headings, descriptions and connection-test labels in German and English


### v3.1.52 - 2026-07-18

**Commit:** `refactor: simplify Proxmox cluster status badges`

- hide the cluster publishing-state chip without changing the stored setting or its backend enforcement
- remove the Isolation and Firewall check chips from the visual capability list only
- keep all firewall verification, isolation and permission logic active


### v3.1.51 - 2026-07-18

**Commit:** `fix: match publishing actions to the modal background`

- inherit the popup background through the scrollable publishing form and sticky action row
- remove the differently colored block behind the cancel and publish buttons in light and dark themes


### v3.1.50 - 2026-07-18

**Commit:** `fix: balance publishing modal spacing and field alignment`

- reserve matching scrollbar gutters on both sides of the desktop publishing form
- align the service-port and backend-protocol field labels, controls and help rows
- preserve the localized single-column mobile publishing layout

### v3.1.49 - 2026-07-18

**Commit:** `feat: activate the restricted raw publishing pool`

- remove the prepared labels from the TCP and UDP administrator cards
- activate the `20000-26000` raw TCP/UDP pool by default, including migration of the previous untouched prepared state
- add localized German and English explanations for the fixed raw publication range
- reject administrator policies and user publication requests outside the raw pool in the backend
- limit raw port inputs in the user publishing dialog to the same minimum and maximum

### v3.1.48 - 2026-07-18

**Commit:** `fix: isolate Proxmox task history by machine lifecycle`

- start the visible task history at the newest create, clone or restore operation for the current portal resource
- use the portal resource creation timestamp as a safe fallback for manually assigned machines
- hide tasks from previously deleted machines when Proxmox later reuses the same VMID
- reject task-log requests whose UPID does not belong to the current machine lifecycle

### v3.1.47 - 2026-07-18

**Commit:** `fix: stabilize console prompts and initial focus`

- detect an already authenticated shell prompt before attempting automatic login wake-up
- send at most one synthetic carriage return and only when the console is completely blank
- clear stale terminal rows while preserving the active prompt as the first visible line
- focus the terminal automatically when the interactive prompt becomes ready

### v3.1.46 - 2026-07-18

**Commit:** `fix: remove the publishing action gradient`

- replace the publishing dialog action-row fade with the same flat surface background used by the modal
- keep the sticky desktop and mobile action controls without introducing a visual style used nowhere else in the portal

### v3.1.45 - 2026-07-18

**Commit:** `fix: align publishing controls and simplify Pangolin settings`

- remove the redundant numeric Site ID versus Newt connector explanation from the Pangolin administrator form
- align the service-port and backend-protocol fields from the top instead of bottom-aligning controls with different helper-text heights
- add localized German and English backend-protocol guidance to keep both desktop columns balanced
- retain the responsive single-column publishing form on mobile devices

### v3.1.44 - 2026-07-16

**Commit:** `fix: stabilize Pangolin settings and publishing dialogs`

- resolve the backend service dynamically in Nginx so frontend requests survive backend container recreation without stale-upstream 502 errors
- keep the publishing modal header visible and constrain scrolling to the modal body on desktop and mobile
- localize all new Pangolin administration settings and publication controls in German and English
- display the numeric Pangolin Site ID clearly in the Pangolin site selector
- return more useful Pangolin connection diagnostics and use IPv4-aware keep-alive agents for outbound API calls

### v3.1.43 - 2026-07-16

**Commit:** `feat: add per-cluster publishing controls`

- add a persistent Pangolin publishing switch to every Proxmox cluster
- enforce the cluster switch in user resource metadata, publishing options and server-side create/update routes
- keep existing publications reachable and removable when a cluster is disabled
- show the active state on cluster cards and in the responsive cluster editor

### v3.1.42 - 2026-07-16

**Commit:** `fix: fit desktop consoles and add native clipboard controls`

- locked the dedicated desktop console route to the current viewport so the surrounding page no longer scrolls
- kept scrolling inside xterm only and continued fitting rows and columns after container or window resizing
- added automatic clipboard copy when terminal text is selected
- added right-click and Ctrl/Cmd+V paste support without exposing Proxmox credentials to the browser

### v3.1.41 - 2026-07-16

**Commit:** `feat: add secure Pangolin publishing with admin port policies`

- add server-side Pangolin Integration API support for creating, updating and deleting public resources and Newt targets
- add a responsive user publishing dialog with automatic service-IP selection, HTTP backend method selection and configurable TCP/UDP modes
- add responsive administrator settings for API credentials, organization, site, domain, reserved subdomains and protocol-specific port ranges
- encrypt the Pangolin Organization API key and keep it out of the React frontend
- remove remote Pangolin objects before deleting portal services or self-service containers
- replace manual public-page URL entry with generated Pangolin publication metadata

### v3.1.40 - 2026-07-16

**Commit:** `refactor: move user notifications into settings`

- remove the separate Notifications item from the desktop and mobile user navigation
- place e-mail notification preferences below the language controls on the Settings page
- keep the existing notification API, preferences and save behavior unchanged

### v3.1.39 - 2026-07-16

**Commit:** `fix: start console auto-login without user input`

- detect login and password prompts from the rendered xterm buffer in addition to raw WebSocket output
- automatically wake inactive LXC getty sessions so users no longer need to click the console and press Enter before credentials are submitted
- keep terminal status-reply filtering and clear the active input line before sending the stored root username and password

### v3.1.38 - 2026-07-16

**Commit:** `feat: let users manage public service pages`

- let directly assigned users add a public-page URL from a service card when no link exists
- add an edit/remove action for the public page in the service detail view
- validate public links server-side and accept only complete `http://` or `https://` URLs
- keep group-shared resources read-only for public-page metadata and record changes in the audit log

### v3.1.37 - 2026-07-16

**Commit:** `fix: stabilize console auto-login and localize credential copy actions`

- filter terminal cursor/status replies during automatic LXC login so escape sequences are not entered as part of the username
- clear the login and password lines before submitting the stored root credentials
- translate the credential copy action to `Copy` in English and keep `Kopieren` in German
- translate the automatic root-credential note in the English portal

### v3.1.36 - 2026-07-16

**Commit:** `style: add spacing above the provisioning warning banner`

- add spacing above the self-service availability warning on the user dashboard
- keep the container provisioning and firewall behavior unchanged

### v3.1.35 - 2026-07-16

**Commit:** `fix: keep the datacenter firewall enabled while isolating guest egress`

- keep the Proxmox Datacenter firewall enabled and never modify its global setting from the portal
- change new self-service LXC firewalls to a fail-closed `DROP` output policy
- block the complete guest subnet, private/local/reserved IPv4 ranges, IPv6, discovered cluster-node addresses and existing guest addresses before allowing public IPv4 Internet access
- add `SELF_SERVICE_BLOCKED_NETWORKS` for additional internal IPv4 addresses or CIDRs that use non-private address space
- clarify in the user and admin interfaces that self-service requires the Datacenter firewall to remain active while isolation is applied per container

### v3.1.34 - 2026-07-16

**Commit:** `style: add TechByGiusi favicon to the browser tab`

- replaced the browser tab icon with the TechByGiusi 150 x 150 PNG favicon
- added standard favicon, shortcut icon and Apple touch icon declarations
- added a versioned favicon URL so browsers refresh the cached tab icon after deployment

### v3.1.33 - 2026-07-16

**Commit:** `style: remove active menu indicator bars`

- removed the green left-side indicator from active desktop and mobile menu entries
- kept the existing active background and border highlight as the only navigation selection state

### v3.1.32 - 2026-07-16

**Commit:** `fix: prevent unavailable provisioning and persist root credentials`

- mark self-service clusters unavailable before users open the creation form when the Proxmox Datacenter firewall is disabled or cannot be verified
- keep the server-side firewall recheck during every container creation so provisioning remains fail closed
- show the unavailable cluster and reason on the user dashboard instead of failing only after form submission
- store the exact root password used for the container, including a cluster default password, in the created resource credentials
- confirm successful credential storage in the provisioning response and result screen

### v3.1.31 - 2026-07-16

**Commit:** `docs: remove internal release guidance from the readme`

- removed obsolete editorial notes from the public README
- kept the version section focused on the currently installed release

### v3.1.30 - 2026-07-16

**Commit:** `fix: persist template selections while self-service prerequisites are unavailable`

- allow approved CT templates, storage, IP ranges and resource limits to be edited and saved while self-service is disabled
- verify live Proxmox permissions, storage availability and the Datacenter firewall only when self-service changes from disabled to enabled
- preserve all edited provisioning settings and keep self-service disabled when an activation prerequisite is unavailable, instead of discarding the selected templates
- keep container creation fail closed because the provisioning path still rechecks firewall permissions and Datacenter firewall status before creating a container
- explain directly in the admin form that provisioning settings can be prepared before the Proxmox Datacenter firewall is enabled

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
