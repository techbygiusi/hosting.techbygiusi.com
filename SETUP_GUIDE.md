# 🚀 Hosting Portal - Complete Setup Guide

This guide will walk you through setting up and running the Hosting Portal step by step.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Installation with Docker](#installation-with-docker)
3. [Initial Setup](#initial-setup)
4. [First Admin User](#first-admin-user)
5. [Proxmox Configuration](#proxmox-configuration)
6. [Development & Troubleshooting](#development--troubleshooting)

---

## System Requirements

### Minimum Requirements
- Docker and Docker Compose installed
- At least 2GB RAM available
- Port 3000 and 3001 available on your machine
- (Optional) Access to a Proxmox cluster for full functionality

### Installation Verification
```bash
# Check Docker installation
docker --version
# Should show: Docker version XX.X.X

# Check Docker Compose installation
docker-compose --version
# Should show: Docker Compose version XX.X.X
```

---

## Installation with Docker

### Step 1: Get the Code

**Option A: Download as ZIP**
- Download the project files
- Extract to your desired location
- Navigate to the project folder

**Option B: Clone from Git**
```bash
git clone https://github.com/your-repo/hosting-portal.git
cd hosting-portal
```

### Step 2: Verify Project Structure

The project structure should look like:
```
hosting-portal/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── app.js
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── data/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── public/
│   └── src/
└── README.md
```

### Step 3: Create Environment Configuration (Optional)

For development, the defaults work fine. For production:

**Backend .env**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your settings
```

**Frontend .env**
```bash
cp frontend/.env.example frontend/.env
# Edit frontend/.env if needed
```

### Step 4: Build and Start

```bash
# Build and start all services
docker-compose up -d

# Watch the startup (logs)
docker-compose logs -f

# Stop after seeing successful startup messages
# Press Ctrl+C
```

### Step 5: Verify Services are Running

```bash
# Check container status
docker-compose ps

# Should show:
# - hosting-portal-backend: Up
# - hosting-portal-frontend: Up

# Test backend health
curl http://localhost:3001/api/health
# Should return: {"status":"ok",...}

# Test frontend
curl http://localhost:3000
# Should return HTML content
```

---

## Initial Setup

### Accessing the Portal

1. Open http://localhost:3000 in your browser
2. You should see the setup wizard page

### Setup Wizard Steps

#### Step 1: Create Admin Account

Fill in the admin user details:
- **Full Name**: Your name (e.g., "John Admin")
- **Email**: Admin email (e.g., "admin@example.com")
- **Password**: Strong password (min. 6 characters)
- **Confirm Password**: Repeat the password

Click "Next" to proceed.

#### Step 2: Configure SMTP (Email)

This is for password reset functionality. You have two options:

**Option A: Use Gmail**
1. Create a Google Account (if you don't have one)
2. Enable 2-Factor Authentication in Google Account Settings
3. Create an App Password:
   - Go to myaccount.google.com
   - Click "Security" on the left
   - Find "App passwords"
   - Select "Mail" and "Windows Computer"
   - Generate password
4. Fill in the form:
   - **SMTP Host**: smtp.gmail.com
   - **SMTP Port**: 587
   - **SMTP User**: your-email@gmail.com
   - **SMTP Password**: (paste the app password from step 3)

**Option B: Use Custom SMTP Server**
1. Get details from your email provider:
   - SMTP Host
   - SMTP Port (usually 587 or 465)
   - Username
   - Password
2. Fill in the form

**Option C: Skip for Now**
- Leave SMTP fields empty
- You can configure later in the admin panel
- Password reset won't work until configured

#### Step 3: Review Settings

Review your settings:
- Admin email should be correct
- Admin name should be correct
- SMTP config is shown (or "Not configured")

Click "Complete Setup" to finish.

### Success!

After setup completes:
1. You'll be logged in as admin
2. You'll see the Admin Dashboard
3. You're ready to configure Proxmox clusters

---

## First Admin User

### Login

After setup:
1. Your admin user is created
2. Use the email and password you set during setup
3. You'll access the Admin Panel

### Change Password (Recommended)

To change your password later:
1. Login to the portal
2. Go to your profile (click your name in top right)
3. Click "Change Password"
4. Enter current password and new password

---

## Proxmox Configuration

### Prerequisites

You need access to your Proxmox cluster's admin interface.

### Get Proxmox API Token

1. **Login to Proxmox Web UI**
   - Go to https://your-proxmox-server:8006
   - Login with admin credentials

2. **Navigate to API Tokens**
   - Click "Datacenter" in left menu
   - Click "Permissions"
   - Click "API Tokens" tab

3. **Create New Token**
   - Click "Add" button
   - Fill in:
     - **User**: Select admin user (e.g., root@pam)
     - **Token ID**: Give it a name (e.g., "hosting-portal")
     - **Expire**: Set expiration (e.g., 365 days)
   - Click "Add"

4. **Grant Permissions**
   - After creating token, grant it permissions:
   - Go back to "Permissions"
   - Click "Add" to add permission
   - Select the token
   - Grant these privileges:
     - **Datacenter**: Audit
     - **Nodes**: Audit  
     - **VM**: Audit, Console

5. **Copy Your Token**
   - The token will look like: `user@pam!tokenid=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - This is sensitive - treat it like a password

### Add Cluster in Portal

1. **Login to Hosting Portal as Admin**
2. **Go to Admin Panel → Clusters**
3. **Click "Add Cluster"**
4. **Fill in the form**:
   - **Cluster Name**: e.g., "Main Cluster"
   - **Proxmox URL**: https://your-proxmox-ip:8006
   - **API Token**: Paste the token from step 5 above
5. **Click "Add Cluster"**

### Verify Connection

After adding cluster:
1. The cluster should appear in the list
2. You can now see containers from this cluster
3. You can assign containers to users

---

## Managing Users and Containers

### Create Your First User

1. **Go to Admin Panel → Users**
2. **Click "Add User"**
3. **Fill in**:
   - **Email**: user@example.com
   - **Name**: John User
4. **Click "Create User"**
5. **Email is sent** with temporary password (if SMTP configured)

### Create a Customer Group (Optional)

1. **Go to Admin Panel → Groups**
2. **Click "Add Group"**
3. **Enter group name**: e.g., "Enterprise Customers"
4. **Click "Create Group"**

### Assign Containers

1. **Go to Admin Panel → Assignments**
2. **Click "Create Assignment"**
3. **Fill in**:
   - **Container ID**: (from Proxmox, e.g., "100")
   - **Cluster**: Select your cluster
   - **Assign To Type**: User or Group
   - **User/Group**: Select from dropdown
4. **Click "Create Assignment"**

### User Can Now See Container

1. User logs in with their credentials
2. They see "My Containers" dashboard
3. They see only containers assigned to them
4. They can click "Open WebUI" to access Proxmox console

---

## Development & Troubleshooting

### Common Issues

**1. Can't access http://localhost:3000**

```bash
# Check if containers are running
docker-compose ps

# If not running, start them
docker-compose up -d

# Check logs for errors
docker-compose logs frontend
```

**2. Setup page keeps showing**

```bash
# The database might be corrupted
# Delete and recreate
docker-compose down
docker volume rm hosting-portal_backend-data
docker-compose up -d
```

**3. Can't login after setup**

- Check your email/password are correct
- Check database was initialized: `docker-compose logs backend`

**4. Can't connect to Proxmox**

- Verify Proxmox URL is accessible from your machine
- Test: `curl https://your-proxmox-ip:8006` (ignore SSL warnings)
- Verify API token is correct
- Check firewall isn't blocking connection

**5. Containers not showing**

- Verify cluster connection works (test button in settings)
- Verify user has assignments created
- Check user is in correct group (if using groups)

### Docker Commands

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart services
docker-compose restart

# Stop everything
docker-compose down

# Remove everything including data
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Access backend shell
docker exec -it hosting-portal-backend /bin/sh

# Access frontend shell
docker exec -it hosting-portal-frontend /bin/sh
```

### Database Access

The SQLite database is stored in: `/backend/data/hosting.db`

To inspect it:
```bash
# Access the database
docker exec -it hosting-portal-backend sqlite3 ./data/hosting.db

# View tables
.tables

# View users
SELECT * FROM users;

# Exit
.exit
```

### Reset Everything

To start fresh (removes all data):

```bash
docker-compose down -v
docker volume prune
docker-compose up -d
# Go to http://localhost:3000 to set up again
```

---

## Production Deployment

### Before Going Live

1. **Change all secrets**:
   - Generate strong JWT_SECRET
   - Generate strong ENCRYPTION_KEY
   - Update in docker-compose.yml or .env

2. **Use HTTPS**:
   - Deploy behind Nginx/Apache
   - Use Let's Encrypt SSL
   - Update REACT_APP_API_URL to use https://

3. **Backup database**:
   - The `/backend/data/hosting.db` is your entire database
   - Back it up regularly
   - This persists across updates

4. **Security**:
   - Use strong passwords
   - Restrict network access
   - Don't expose ports to public internet
   - Use firewalls
   - Keep Docker images updated

### Deployment Example (Nginx Proxy)

```nginx
server {
    listen 443 ssl http2;
    server_name hosting.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Authorization $http_authorization;
    }
}
```

---

## Support & Resources

### Logs
Check logs for error messages:
```bash
docker-compose logs -f
```

### Documentation
- Full API docs: See README.md
- Proxmox API: https://pve.proxmox.com/pve-docs/api-viewer/
- React Documentation: https://react.dev/

### Need Help?

1. Check the README.md in project root
2. Review logs: `docker-compose logs -f`
3. Verify database: Check if `backend/data/hosting.db` exists
4. Check network: Verify ports 3000 and 3001 are accessible

---

## Next Steps

1. ✅ Completed: Portal is running
2. ✅ Completed: Admin account created
3. ✅ Next: Configure Proxmox cluster
4. Next: Create users and groups
5. Next: Assign containers to users
6. Next: Have users login and test dashboard

Good luck! 🚀
