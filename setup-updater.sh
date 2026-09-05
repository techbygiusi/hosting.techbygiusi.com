#!/bin/bash
set -euo pipefail

PROJECT_DIR="${HOSTING_PORTAL_PROJECT_DIR:-/opt/hosting.techbygiusi.com}"
DATA_DIR="$PROJECT_DIR/backend/data"
HELPER_SOURCE="$PROJECT_DIR/scripts/host_updater.py"
HELPER_TARGET="/usr/local/sbin/hosting-portal-updater"
SERVICE_FILE="/etc/systemd/system/hosting-portal-updater.service"
PATH_FILE="/etc/systemd/system/hosting-portal-updater.path"
VERSION_FILE="$DATA_DIR/system-updater-version"
TIMEZONE_FILE="$DATA_DIR/system-timezone.txt"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root: sudo ./setup-updater.sh"
  exit 1
fi

if [ ! -f "$HELPER_SOURCE" ]; then
  echo "Updater helper not found: $HELPER_SOURCE"
  exit 1
fi

command -v python3 >/dev/null 2>&1 || { echo "python3 is required"; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo "systemd is required"; exit 1; }

mkdir -p "$DATA_DIR"
install -m 0755 "$HELPER_SOURCE" "$HELPER_TARGET"

cat > "$SERVICE_FILE" <<UNIT
[Unit]
Description=Hosting Portal host update job
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=HOSTING_PORTAL_PROJECT_DIR=$PROJECT_DIR
ExecStart=/usr/bin/python3 $HELPER_TARGET
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
UNIT

cat > "$PATH_FILE" <<UNIT
[Unit]
Description=Watch for Hosting Portal update requests

[Path]
PathExists=$DATA_DIR/system-update-request.json
Unit=hosting-portal-updater.service

[Install]
WantedBy=multi-user.target
UNIT

touch "$DATA_DIR/system-updater-ready"
printf '%s\n' '2' > "$VERSION_FILE"
if command -v timedatectl >/dev/null 2>&1; then
  timedatectl show --property=Timezone --value > "$TIMEZONE_FILE" 2>/dev/null || true
fi
chmod 0644 "$DATA_DIR/system-updater-ready" "$VERSION_FILE"
[ ! -f "$TIMEZONE_FILE" ] || chmod 0644 "$TIMEZONE_FILE"
systemctl daemon-reload
systemctl enable --now hosting-portal-updater.path

echo "Hosting Portal updater installed."
echo "Project directory: $PROJECT_DIR"
echo "Watcher: hosting-portal-updater.path"
