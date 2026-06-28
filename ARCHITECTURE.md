# 🏗️ Hosting Portal - Architecture & Project Structure

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         End Users                                │
│              (Admins & Customers via Browser)                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────┴──────────────────────────────────────────┐
│                    Reverse Proxy (Optional)                      │
│                    (Nginx/Apache in Production)                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Frontend Container  │    │  Backend Container   │
│  (React 3000)        │    │  (Express 3001)      │
│                      │◄──►│                      │
│ - Setup Wizard       │ API│ - REST API           │
│ - User Dashboard     │    │ - Auth (JWT)         │
│ - Admin Panel        │    │ - Database (SQLite)  │
│ - Mobile Responsive  │    │ - Proxmox Integration│
└──────────────────────┘    └──────────────────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  SQLite Database │
                            │  (Persistent)    │
                            │                  │
                            │ - Users          │
                            │ - Groups         │
                            │ - Clusters       │
                            │ - Assignments    │
                            │ - Settings       │
                            └──────────────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │ Proxmox Clusters │
                            │                  │
                            │ - VMs (QEMU)     │
                            │ - LXCs           │
                            │ - Resources      │
                            └──────────────────┘
```

---

## Docker Compose Structure

```
hosting-portal/
│
├── docker-compose.yml
│   ├── backend service (Node.js + Express)
│   │   ├── Exposed: 3001
│   │   ├── Volume: ./backend/data (persistent DB)
│   │   └── Health check: /api/health
│   │
│   └── frontend service (React)
│       ├── Exposed: 3000
│       ├── Depends on: backend (healthy)
│       └── Volume mounts: src, public

└── Network: hosting-network (bridge)
```

---

## Frontend File Structure

```
frontend/
├── public/
│   └── index.html              ◄─ React root
│
└── src/
    │
    ├── index.js                ◄─ Entry point
    ├── App.jsx                 ◄─ Main routing component
    │
    ├── pages/                  ◄─ Page components
    │   ├── Setup.jsx           - Initial setup wizard
    │   ├── Login.jsx           - Login page
    │   ├── UserDashboard.jsx   - User container view
    │   └── AdminDashboard.jsx  - Admin management
    │
    ├── components/             ◄─ Reusable components
    │   (Available for expansion)
    │
    ├── context/
    │   └── AuthContext.jsx     ◄─ Auth state management
    │
    ├── services/
    │   └── api.js              ◄─ Axios API client
    │
    ├── styles/
    │   └── globals.css         ◄─ Mobile-first CSS
    │
    └── utils/
        (Available for helpers)
```

---

## Backend File Structure

```
backend/
│
├── app.js                      ◄─ Express server entry
├── package.json
├── Dockerfile
│
├── config/
│   ├── database.js             ◄─ SQLite initialization
│   └── constants.js            ◄─ App constants
│
├── middleware/
│   ├── auth.js                 ◄─ JWT & role checks
│   └── errorHandler.js         ◄─ Error responses
│
├── routes/
│   ├── auth.js                 ◄─ Login, setup, password
│   ├── admin.js                ◄─ User, group, cluster mgmt
│   └── user.js                 ◄─ User dashboard data
│
├── services/
│   ├── proxmoxService.js       ◄─ Proxmox API calls
│   ├── emailService.js         ◄─ SMTP email sending
│   └── userService.js          (Available for expansion)
│
├── utils/
│   (Available for helpers)
│
└── data/
    └── hosting.db              ◄─ SQLite database
```

---

## Database Schema

```sql
┌─────────────────────────────────────────────────┐
│                 USERS                            │
├─────────────────────────────────────────────────┤
│ id (PK)           | email | name | role         │
│ password_hash     | created_at | updated_at     │
└─────────────────────────────────────────────────┘
           │
           ├──────────┐
           │          │
           ▼          ▼
    ┌─────────────┐  ┌──────────────┐
    │ USER_GROUPS │  │ ASSIGNMENTS  │
    ├─────────────┤  ├──────────────┤
    │ user_id(FK) │  │ container_id │
    │ group_id(FK)│  │ cluster_id   │
    └─────────────┘  │ assigned_to  │
           ▲         │ _type/id     │
           │         └──────────────┘
           │              │
           │              ▼
    ┌──────────────────┐ ┌─────────────────┐
    │CUSTOMER_GROUPS   │ │PROXMOX_CLUSTERS │
    ├──────────────────┤ ├─────────────────┤
    │ id (PK)          │ │ id (PK)         │
    │ name (UNIQUE)    │ │ name            │
    │ created_at       │ │ url             │
    └──────────────────┘ │ api_token       │
                         │ created_at      │
                         └─────────────────┘

┌─────────────────────────────────────┐
│         SETTINGS (Key-Value)        │
├─────────────────────────────────────┤
│ key (PK)    | value                 │
│ created_at  | updated_at            │
└─────────────────────────────────────┘
```

---

## API Endpoint Organization

### Authentication Endpoints
```
POST   /api/auth/setup                 - First-time admin setup
POST   /api/auth/login                 - User login
GET    /api/auth/verify                - Verify JWT token
POST   /api/auth/change-password       - Change password
POST   /api/auth/forgot-password       - Request password reset
POST   /api/auth/reset-password        - Reset with token
POST   /api/auth/logout                - Logout
```

### Admin Endpoints (Protected + Admin Role)
```
GET    /api/admin/users                - List users
POST   /api/admin/users                - Create user
PUT    /api/admin/users/:id            - Update user
DELETE /api/admin/users/:id            - Delete user

GET    /api/admin/groups               - List groups
POST   /api/admin/groups               - Create group
DELETE /api/admin/groups/:id           - Delete group

GET    /api/admin/clusters             - List clusters
POST   /api/admin/clusters             - Add cluster
DELETE /api/admin/clusters/:id         - Delete cluster
GET    /api/admin/clusters/:id/containers - Get cluster containers

GET    /api/admin/assignments          - List assignments
POST   /api/admin/assignments          - Create assignment
DELETE /api/admin/assignments/:id      - Delete assignment

GET    /api/admin/settings             - Get all settings
PUT    /api/admin/settings             - Update settings
POST   /api/admin/settings/test-smtp   - Test SMTP config
POST   /api/admin/settings/test-proxmox - Test Proxmox connection
```

### User Endpoints (Protected)
```
GET    /api/user/profile               - Get own profile
PUT    /api/user/profile               - Update own profile
GET    /api/user/containers            - List assigned containers
GET    /api/user/containers/:id        - Get container details
```

---

## Authentication Flow

### Setup Wizard
```
User → Setup Page → Create Admin Account
                ↓
            Configure SMTP
                ↓
            Review Settings
                ↓
            POST /api/auth/setup
                ↓
            Generate JWT Token
                ↓
            Store in localStorage
                ↓
            Redirect to /admin
```

### Login
```
User → Login Page → Enter Credentials
                ↓
            POST /api/auth/login
                ↓
            Verify Email + Password (bcrypt)
                ↓
            Generate JWT Token (24h expiration)
                ↓
            Return Token + User Info
                ↓
            Store Token in localStorage
                ↓
            Redirect based on role
```

### Authorization
```
Frontend Request with JWT
            ↓
Add Authorization Header
            ↓
Send to Backend
            ↓
authMiddleware checks JWT
            ↓
adminMiddleware checks role (if needed)
            ↓
Execute route handler
            ↓
Return response
```

---

## Security Architecture

### Password Security
```
User Password → bcryptjs (10 salt rounds) → Hash → Database
                                              ↓
                        Stored as irreversible hash
```

### Token Security
```
Login → Generate JWT → Token (24h expiration) → localStorage
                              ↓
                        Added to all requests
                              ↓
                        Verified by server
                              ↓
                        Can be revoked via logout
```

### Data Encryption
```
Sensitive Data (API tokens, passwords)
        ↓
    Encrypt using crypto
        ↓
    Store in database
        ↓
    Decrypt when needed
```

---

## Proxmox Integration Flow

```
Admin adds cluster:
    ├─ URL: https://proxmox.example.com:8006
    ├─ API Token: user@pam!tokenid=xxxxx
    └─ Test connection → Verify access

Admin assigns container:
    ├─ Container ID (from Proxmox)
    ├─ Cluster
    ├─ User/Group
    └─ Save to database

User views dashboard:
    ├─ Query: assignments for user
    ├─ For each assignment:
    │   ├─ Call Proxmox API
    │   ├─ Get container status
    │   ├─ Get container IP
    │   ├─ Get resource usage
    │   └─ Return combined data
    └─ Display in cards

User opens WebUI:
    └─ Generate Proxmox console link
        └─ Open in new tab (NOAUTH required)
```

---

## Mobile-First Responsive Breakpoints

```
Mobile: 320px+
    └─ 1 column grid
    └─ Full-width forms
    └─ Hamburger menu (future)

Tablet: 480px+
    └─ 2 column grid
    └─ Adjusted padding

Tablet: 768px+
    └─ 2-column layouts
    └─ Sidebar ready

Desktop: 1024px+
    └─ 3-column layouts
    └─ Full sidebar
    └─ Multi-pane views

Large Desktop: 1200px+
    └─ 4-column layouts
    └─ Max width containers
```

---

## State Management

### Global State (AuthContext)
```
AuthProvider
    ├─ user: Current user object
    ├─ token: JWT token
    ├─ isAuthenticated: Boolean
    ├─ setupRequired: Boolean
    ├─ loading: Boolean
    ├─ error: Error messages
    │
    ├─ login(email, password)
    ├─ logout()
    ├─ setup(adminData, smtpData)
    └─ changePassword()
```

### Local Component State
```
AdminDashboard
    ├─ activeTab
    ├─ users, groups, clusters, assignments
    ├─ loading, error, successMsg
    │
    └─ Modals for creation
        ├─ showUserModal
        ├─ newUser form state
        ├─ showGroupModal
        └─ ...etc
```

---

## Deployment Considerations

### Development
- Docker Compose with hot reload
- Mock Proxmox data available
- No HTTPS required
- localhost domains only

### Production
- Environment variables for secrets
- Reverse proxy (Nginx/Apache)
- HTTPS with SSL certificates
- Database backups
- Proper CORS configuration
- Rate limiting
- Firewall rules

---

## Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 | UI Components |
| Routing | React Router v6 | Page Navigation |
| HTTP | Axios | API Calls |
| Backend | Express.js | REST API |
| Database | SQLite 3 | Data Storage |
| Auth | JWT | Token-based Auth |
| Passwords | bcryptjs | Secure Hashing |
| Encryption | Node.js crypto | Data Encryption |
| Email | Nodemailer | SMTP Integration |
| Container | Docker | Deployment |
| Compose | Docker Compose | Multi-container |
| API | Proxmox REST | Container Control |

---

## Future Expansion Points

### Frontend
- `/components/` - Reusable components (Modal, Form, Table, Card)
- `/utils/` - Helper functions and utilities
- Dark mode toggle
- User profile page
- Container console/VNC viewer

### Backend
- `/services/userService.js` - User business logic
- `/utils/` - Helper utilities
- Webhook support
- Backup scheduling
- Resource quotas/limits
- Billing integration
- LDAP/AD integration
- Two-factor authentication
- Activity logging/audit trail
- API rate limiting

### Database
- Audit log table
- Backup schedules
- Resource quotas
- Billing records
- API keys table

---

## Development Workflow

### Starting Development
```bash
# Start containers
docker-compose up -d

# Watch logs
docker-compose logs -f

# Code changes auto-reload (via volumes)
# Frontend: http://localhost:3000
# Backend: http://localhost:3001/api
```

### Making Changes

**Backend Changes:**
```bash
# Edit files in backend/
# Changes auto-reload (nodemon)
# Check logs for errors
docker-compose logs -f backend
```

**Frontend Changes:**
```bash
# Edit files in frontend/src/
# Changes auto-reload (React dev server)
# Check logs for errors
docker-compose logs -f frontend
```

### Database Changes
```bash
# Migrations run automatically on startup
# Or access database directly:
docker exec -it hosting-portal-backend sqlite3 ./data/hosting.db
```

---

## Performance Optimization

### Frontend
- CSS Variables for theming
- Mobile-first responsive design
- Lazy loading images (when added)
- API call caching (future)
- Code splitting (future)

### Backend
- Database indexes (future)
- Connection pooling (future)
- API response caching (future)
- Pagination for large lists (future)

### Proxmox Integration
- Cache cluster containers (future)
- Webhook notifications (future)
- Background syncing (future)

---

This is the complete architecture of the Hosting Portal. The system is designed to be scalable, maintainable, and easy to extend.
