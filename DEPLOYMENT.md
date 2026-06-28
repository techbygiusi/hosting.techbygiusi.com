# 🚀 Hosting Portal - Deployment & Update Guide (Debian)

## Quick Start Commands

### Option 1: Manual Update (Anytime)
```bash
cd /opt/hosting-portal
./deploy.sh --backup --logs
```

### Option 2: Automatic Updates (via Cron)
```bash
cd /opt/hosting-portal
sudo bash setup-cron.sh
```

---

## Detailed Setup Instructions

### Step 1: Install on Debian

```bash
# 1. Create project directory
sudo mkdir -p /opt/hosting-portal
cd /opt/hosting-portal

# 2. Download and extract ZIP
sudo unzip hosting-portal-v1.0.0.zip -d /opt/hosting-portal

# 3. Make scripts executable
sudo chmod +x deploy.sh setup-cron.sh

# 4. Start services
sudo docker-compose up -d
```

### Step 2: Make deploy.sh Executable

```bash
chmod +x /opt/hosting-portal/deploy.sh
```

### Step 3: Test the Deployment Script

```bash
cd /opt/hosting-portal
./deploy.sh --logs
```

---

## Usage

### Manual Update/Deploy

```bash
# Basic update (no backup)
cd /opt/hosting-portal
./deploy.sh

# Update with backup
./deploy.sh --backup

# Update with logs
./deploy.sh --logs

# Update with backup and logs
./deploy.sh --backup --logs

# Verbose output
./deploy.sh --backup --verbose
```

### Automatic Updates (Cron)

```bash
# Setup automatic updates
sudo bash /opt/hosting-portal/setup-cron.sh

# View scheduled cron jobs
crontab -l

# View update logs
tail -f /var/log/hosting-portal-update.log

# Manually trigger cron
cd /opt/hosting-portal && ./deploy.sh --backup

# Remove cron job
crontab -e  # Delete the hosting-portal line
```

---

## What the deploy.sh Script Does

✅ **Checks Requirements**
- Docker installed
- Docker Compose installed
- Project directory exists

✅ **Creates Backup** (with --backup flag)
- Backs up SQLite database
- Backs up docker-compose.yml
- Keeps only last 10 backups

✅ **Pulls Latest Images**
- Fetches newest Docker images
- Updates all services

✅ **Updates Services**
- Stops current containers
- Starts new containers
- Waits for health checks

✅ **Verifies Deployment**
- Tests API health
- Checks container status
- Verifies all services

✅ **Logs Everything**
- Logs all changes
- Deployment log: `/opt/hosting-portal/deployment.log`

---

## Cron Schedule Options

### Once daily
```bash
0 2 * * *     # Every day at 2:00 AM
0 3 * * *     # Every day at 3:00 AM
```

### Weekly
```bash
0 2 * * 0     # Every Sunday at 2:00 AM
```

### Twice daily
```bash
0 2,14 * * *  # 2:00 AM and 2:00 PM daily
```

### Custom schedules
```bash
# Minute Hour Day Month DayOfWeek
0      2    *   *     *         # Daily at 2:00 AM
0      2    1   *     *         # Monthly on 1st at 2:00 AM
0      2    *   *     1-5       # Weekdays at 2:00 AM
```

---

## Backup Strategy

### Automatic Backups
```bash
./deploy.sh --backup
```

Creates:
- Database backup: `backups/hosting.db.backup.YYYYMMDD_HHMMSS`
- Compose backup: `backups/docker-compose.yml.backup.YYYYMMDD_HHMMSS`

### View Backups
```bash
ls -lh /opt/hosting-portal/backups/
```

### Restore from Backup
```bash
# Restore database
cp /opt/hosting-portal/backups/hosting.db.backup.YYYYMMDD_HHMMSS \
   /opt/hosting-portal/backend/data/hosting.db

# Restart services
cd /opt/hosting-portal
docker-compose restart backend frontend
```

---

## Monitoring Updates

### View Deployment Log
```bash
cat /opt/hosting-portal/deployment.log
```

### Watch Cron Updates
```bash
# Real-time log
tail -f /var/log/hosting-portal-update.log

# Last 50 lines
tail -n 50 /var/log/hosting-portal-update.log

# Search for errors
grep ERROR /var/log/hosting-portal-update.log
```

### Check Service Status
```bash
cd /opt/hosting-portal
docker-compose ps

# Detailed status
docker-compose logs -f
```

---

## Production Checklist

- [ ] Scripts are executable
- [ ] Cron job is configured
- [ ] Backups are being created
- [ ] Logs are being written
- [ ] Services restart successfully
- [ ] Database persists after update
- [ ] API is accessible after update
- [ ] Monitoring is active

---

## Systemd Alternative (Advanced)

If you prefer systemd timer instead of cron:

```bash
# Create systemd service
sudo nano /etc/systemd/system/hosting-portal-update.service
```

Add:
```ini
[Unit]
Description=Hosting Portal Update Service
After=network.target docker.service
Wants=hosting-portal-update.timer

[Service]
Type=oneshot
ExecStart=/opt/hosting-portal/deploy.sh --backup
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# Create systemd timer
sudo nano /etc/systemd/system/hosting-portal-update.timer
```

Add:
```ini
[Unit]
Description=Hosting Portal Update Timer
Requires=hosting-portal-update.service

[Timer]
OnCalendar=daily
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable hosting-portal-update.timer
sudo systemctl start hosting-portal-update.timer
sudo systemctl status hosting-portal-update.timer
```

---

## Troubleshooting

### Issue: "Permission denied" when running script
**Solution:**
```bash
sudo chmod +x /opt/hosting-portal/deploy.sh
# Or run with sudo:
sudo /opt/hosting-portal/deploy.sh --backup
```

### Issue: Docker not found
**Solution:**
```bash
# Install Docker
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Issue: Services not starting
**Solution:**
```bash
# Check logs
docker-compose logs

# Check disk space
df -h

# Check Docker status
sudo systemctl status docker

# Restart Docker
sudo systemctl restart docker
```

### Issue: Database locked
**Solution:**
```bash
# Stop services
docker-compose down

# Wait 10 seconds
sleep 10

# Restart
docker-compose up -d
```

### Issue: Port already in use
**Solution:**
```bash
# Find process using port 3000
sudo lsof -i :3000

# Find process using port 3001
sudo lsof -i :3001

# Kill process
sudo kill -9 <PID>

# Or change ports in docker-compose.yml
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `./deploy.sh` | Update services (no backup) |
| `./deploy.sh --backup` | Update with database backup |
| `./deploy.sh --logs` | Update and show logs |
| `setup-cron.sh` | Configure automatic updates |
| `crontab -l` | View scheduled updates |
| `docker-compose ps` | View service status |
| `docker-compose logs -f` | Watch live logs |
| `tail -f /var/log/hosting-portal-update.log` | Watch cron logs |

---

## Full Deployment Example

### First Time Setup
```bash
# 1. Create directory
sudo mkdir -p /opt/hosting-portal
cd /opt/hosting-portal

# 2. Extract ZIP
sudo unzip hosting-portal-v1.0.0.zip

# 3. Make scripts executable
sudo chmod +x deploy.sh setup-cron.sh

# 4. Deploy
sudo ./deploy.sh --backup --logs

# 5. Setup automatic updates
sudo bash setup-cron.sh

# 6. Verify
docker-compose ps
curl http://localhost:3001/api/health
```

### Regular Updates
```bash
# Manual update
cd /opt/hosting-portal
sudo ./deploy.sh --backup --logs

# Check status
docker-compose ps
tail -f deployment.log
```

---

## Emergency Commands

### Quick Restart
```bash
cd /opt/hosting-portal
docker-compose restart
```

### Full Restart (purge containers, keep data)
```bash
cd /opt/hosting-portal
docker-compose down
docker-compose up -d
```

### Full Reset (WARNING: Deletes everything!)
```bash
cd /opt/hosting-portal
docker-compose down -v
docker-compose up -d
```

### View Real-time Activity
```bash
cd /opt/hosting-portal
docker-compose logs -f --tail=100
```

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** June 28, 2024

For more help, see the main README.md or SETUP_GUIDE.md
