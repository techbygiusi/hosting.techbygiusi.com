# Hosting Portal - Changelog

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
