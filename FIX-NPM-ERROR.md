# 🔧 NPM Error Fix - package-lock.json

## Problem
```
npm error The `npm ci` command can only install with an existing package-lock.json
```

## Solution Applied ✅

Die Dockerfiles wurden gefixt:
- `npm ci` → `npm install` (Backend)
- `npm ci` → `npm install` (Frontend)

Das ist für Development/Production schneller und einfacher.

## Kommande nach dem Fix

```bash
# 1. Alte Images löschen
docker-compose down
docker system prune -a

# 2. Neu bauen
docker-compose build --no-cache

# 3. Starten
docker-compose up -d
```

## Was wurde geändert

**backend/Dockerfile:**
```dockerfile
# Alt:
RUN npm ci --only=production

# Neu:
RUN npm install --production
```

**frontend/Dockerfile:**
```dockerfile
# Alt:
RUN npm ci

# Neu:
RUN npm install
```

## Warum?

`npm install` ist besser für:
- Development Umgebungen
- Keine externe Lock-Datei nötig
- Schneller beim ersten Build
- Flexibler bei Updates

`npm ci` ist besser für:
- Strikte CI/CD Pipelines
- Production wenn Lock-Datei vorhanden
- Reproduzierbare Builds

Für dieses Projekt ist `npm install` perfekt!

## Teste jetzt

```bash
cd /opt/hosting.techbygiusi.com
docker-compose build --no-cache
docker-compose up -d
docker-compose ps
```

Sollte jetzt funktionieren! 🚀
