#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Picly"
ENV_FILE=".env"
FIRST_DEPLOY=false

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Fehlt: $1" >&2
    exit 1
  fi
}

random_secret() {
  openssl rand -base64 48 | tr -d '\n' | tr '/+' '_-' | cut -c1-64
}

random_password() {
  openssl rand -base64 24 | tr -d '\n' | tr '/+' '_-' | cut -c1-24
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

require_command openssl
require_command docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose Plugin fehlt. Installiere bitte docker-compose-plugin." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  FIRST_DEPLOY=true
  ADMIN_USERNAME="admin"
  ADMIN_PASSWORD="$(random_password)"
  JWT_SECRET="$(random_secret)"
  PICLY_HTTP_PORT="${PICLY_HTTP_PORT:-3002}"
  MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-25}"
  MAX_UPLOAD_FILES="${MAX_UPLOAD_FILES:-30}"
  MAX_PARALLEL_UPLOADS="${MAX_PARALLEL_UPLOADS:-12}"
  MIN_FREE_SPACE_MB="${MIN_FREE_SPACE_MB:-250}"
  UPLOAD_REQUEST_TIMEOUT_MS="${UPLOAD_REQUEST_TIMEOUT_MS:-600000}"

  cat > "$ENV_FILE" <<EOF
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRATION=24h
PICLY_HTTP_PORT=${PICLY_HTTP_PORT}
MAX_UPLOAD_MB=${MAX_UPLOAD_MB}
MAX_UPLOAD_FILES=${MAX_UPLOAD_FILES}
MAX_PARALLEL_UPLOADS=${MAX_PARALLEL_UPLOADS}
MIN_FREE_SPACE_MB=${MIN_FREE_SPACE_MB}
UPLOAD_REQUEST_TIMEOUT_MS=${UPLOAD_REQUEST_TIMEOUT_MS}
EOF

  chmod 600 "$ENV_FILE"
fi

ensure_env_value "JWT_EXPIRATION" "24h"
ensure_env_value "PICLY_HTTP_PORT" "${PICLY_HTTP_PORT:-3002}"
ensure_env_value "MAX_UPLOAD_MB" "${MAX_UPLOAD_MB:-25}"
ensure_env_value "MAX_UPLOAD_FILES" "${MAX_UPLOAD_FILES:-30}"
ensure_env_value "MAX_PARALLEL_UPLOADS" "${MAX_PARALLEL_UPLOADS:-12}"
ensure_env_value "MIN_FREE_SPACE_MB" "${MIN_FREE_SPACE_MB:-250}"
ensure_env_value "UPLOAD_REQUEST_TIMEOUT_MS" "${UPLOAD_REQUEST_TIMEOUT_MS:-600000}"

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

mkdir -p data/uploads
chmod 750 data

echo ""
echo "========================================"
echo "${APP_NAME} Deployment"
echo "========================================"
echo "Port: ${PICLY_HTTP_PORT:-3002}"
echo "Daten: ./data"
echo ""

if [ "$FIRST_DEPLOY" = true ]; then
  echo "Admin-Zugangsdaten für den ersten Deploy:"
  echo "Admin-Link: http://SERVER-IP:${PICLY_HTTP_PORT:-3002}/admin"
  echo "Benutzer: ${ADMIN_USERNAME}"
  echo "Passwort: ${ADMIN_PASSWORD}"
  echo ""
  echo "Diese Zugangsdaten wurden in .env gespeichert und bleiben bei Updates erhalten."
else
  echo "Vorhandene .env gefunden. Admin-Zugangsdaten bleiben unverändert."
  echo "Admin-Link: http://SERVER-IP:${PICLY_HTTP_PORT:-3002}/admin"
  echo "Benutzer: ${ADMIN_USERNAME:-admin}"
  if [ "${PICLY_SHOW_ADMIN_PASSWORD:-false}" = "true" ]; then
    echo "Passwort: ${ADMIN_PASSWORD}"
  else
    echo "Passwort wird bei Updates nicht erneut ausgegeben. Anzeigen mit: PICLY_SHOW_ADMIN_PASSWORD=true ./deploy.sh"
  fi
fi

echo ""
echo "Baue und starte Container..."
docker compose up --build -d

echo ""
echo "Status:"
docker compose ps

echo ""
echo "Fertig. Öffentliche Upload-Seite: http://SERVER-IP:${PICLY_HTTP_PORT:-3002}/"
echo ""
