# 📋 CHANGELOG - Hosting Portal

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2024-06-28

### 🎉 Initial Release - Production Ready

**Commit Hash:** `init: complete hosting portal project scaffold`

**Status:** ✅ RELEASED

#### Added

##### Backend Features
- Complete Express.js REST API server
- SQLite3 database with 6 tables
- JWT authentication system (24-hour expiration)
- Bcrypt password hashing (10 salt rounds)
- Admin authentication middleware
- Global error handling
- CORS configuration
- Helmet security headers

##### Authentication System
- Setup wizard (3-step admin registration)
- Login endpoint with email/password
- Password reset flow via email
- Token verification system
- Password change functionality
- Logout support

##### User Management
- Create users (CRUD operations)
- Assign users to groups
- Delete user accounts
- User role management (admin/user)
- Email notifications on account creation

##### Customer Groups
- Create customer groups
- Add/remove users from groups
- Delete groups
- User-group relationship management

##### Proxmox Integration
- Add multiple Proxmox clusters
- Get all containers from clusters
- Container details (CPU, RAM, Disk, IP)
- Connection testing
- API token encryption & storage

##### Settings Management
- SMTP configuration storage
- Proxmox cluster configuration
- Setting key-value store
- SMTP connection testing
- Proxmox connection testing

##### Container Assignment System
- Assign containers to users
- Assign containers to groups
- List all assignments
- Delete assignments
- Support for multiple clusters

##### Email Service
- SMTP integration via Nodemailer
- Password reset emails
- User invitation emails
- Connection testing
- Configuration management

##### Frontend Features
- React 18 with hooks
- React Router for navigation
- Responsive mobile-first design
- Authentication context (global state)
- Axios HTTP client with interceptors

##### Pages
- **Setup Wizard** - 3-step initial configuration
- **Login Page** - Email/password authentication
- **User Dashboard** - View assigned containers with real-time data
- **Admin Dashboard** - Complete management interface (5 tabs)
- **Responsive Design** - 100% mobile optimized

##### Admin Dashboard Tabs
1. **Overview** - Statistics dashboard
2. **Users** - User management (create, edit, delete)
3. **Groups** - Customer group management
4. **Clusters** - Proxmox cluster configuration
5. **Assignments** - Container assignment management

##### User Dashboard Features
- Display assigned containers in responsive grid
- Show container status (running/stopped)
- Real-time resource monitoring (CPU, RAM, Disk)
- Display IP addresses
- One-click WebUI access
- Connection percentage indicators
- Mobile-optimized cards

##### Database Tables
- `users` - User accounts with roles
- `customer_groups` - Customer grouping
- `user_groups` - User-group relationship
- `proxmox_clusters` - Cluster configuration
- `container_assignments` - Container-to-user/group mapping
- `settings` - Key-value store for configuration

##### API Endpoints (26 total)
- 7 Authentication endpoints
- 16 Admin endpoints (users, groups, clusters, assignments, settings)
- 3 User endpoints (profile, containers)

##### Security Features
- JWT token-based authentication
- Bcrypt password hashing
- Encrypted API tokens
- Encrypted SMTP passwords
- CORS properly configured
- SQL injection prevention (prepared statements)
- Role-based access control (admin/user)
- Helmet security headers
- Environment variables for secrets

##### Docker Configuration
- Backend Dockerfile (Node.js 18-Alpine)
- Frontend Dockerfile (Node.js 18-Alpine)
- docker-compose.yml with both services
- Persistent SQLite database volume
- Health checks for services
- Custom network bridge (hosting-network)
- Port mappings (3000 frontend, 3001 backend)

##### Responsive Design
- Mobile-first CSS approach
- CSS Variables for theming
- Breakpoints: 320px, 480px, 768px, 1024px, 1200px
- Touch-friendly buttons (48px minimum)
- Responsive grid system
- Hamburger menu ready

##### CSS Features
- Global variables system
- Responsive grid layouts
- Flexbox utilities
- Mobile-first breakpoints
- Dark/Light mode support (ready)
- Smooth animations & transitions
- Form styling
- Card components
- Modal dialogs
- Alert/Toast system
- Loading spinners
- Progress bars
- Table styling with horizontal scroll

##### Documentation
- **README.md** - Overview with changelog
- **SETUP_GUIDE.md** - Step-by-step installation (11 sections)
- **ARCHITECTURE.md** - Technical documentation (10+ sections)
- Inline code comments throughout
- API documentation in ARCHITECTURE.md

##### Development Files
- .env.example files for both backend and frontend
- .gitignore files
- .dockerignore files
- package.json files with all dependencies
- Docker health checks

##### File Structure (40+ files)
```
hosting-portal/
├── Backend (Node.js + Express)
│   ├── app.js (main server)
│   ├── config/ (database, constants)
│   ├── middleware/ (auth, error handling)
│   ├── routes/ (auth, admin, user)
│   ├── services/ (proxmox, email)
│   ├── data/ (SQLite database)
│   └── docker setup
│
├── Frontend (React)
│   ├── src/
│   │   ├── pages/ (Setup, Login, Dashboards)
│   │   ├── components/
│   │   ├── context/ (auth state)
│   │   ├── services/ (API client)
│   │   └── styles/ (CSS)
│   ├── public/ (index.html)
│   └── docker setup
│
├── Docker Compose (orchestration)
├── Documentation (README, SETUP_GUIDE, ARCHITECTURE)
└── Configuration files
```

#### Changed
- N/A (initial release)

#### Fixed
- N/A (initial release)

#### Deprecated
- N/A (initial release)

#### Removed
- N/A (initial release)

#### Security
- All passwords hashed with bcrypt (10 salt rounds)
- API tokens encrypted before storage
- SMTP passwords encrypted
- JWT tokens with 24-hour expiration
- SQL injection prevention
- CORS properly configured
- Helmet security headers enabled
- Environment variables for all secrets
- No hardcoded credentials

---

## [Unreleased] - Future Plans

### Planned for v1.1.0
- [ ] Database audit logging
- [ ] Activity log viewer
- [ ] Automated database migrations
- [ ] Webhook support
- [ ] Rate limiting
- [ ] API key management

### Planned for v1.2.0
- [ ] Two-factor authentication (2FA)
- [ ] LDAP/AD integration
- [ ] Backup scheduling
- [ ] Resource quotas/limits
- [ ] Billing integration
- [ ] Email templates

### Planned for v2.0.0
- [ ] Kubernetes support
- [ ] Terraform integration
- [ ] Advanced analytics
- [ ] Multi-language support
- [ ] Custom branding
- [ ] Single sign-on (SSO)

---

## How to Update

When new versions are released:

```bash
# Download latest version
# Extract and replace files
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

Database migrations run automatically on startup.

---

## Release Notes Format

Each version will follow this format:

```
## [VERSION] - YYYY-MM-DD

### 🎉 Release Name (if applicable)

**Commit Hash:** `short commit message`

#### Added
- New feature 1
- New feature 2

#### Changed
- Changed feature 1

#### Fixed
- Fixed bug 1

#### Security
- Security improvement 1
```

---

**For more details, see README.md**  
**For technical details, see ARCHITECTURE.md**
