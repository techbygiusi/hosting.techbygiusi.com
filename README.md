# Hosting Portal

Hosting Portal is a self-hosted web portal for managing services running on Proxmox. It provides a dedicated administrator area and a simple user-facing interface for assigned services, self-service containers, access links, billing, documentation and browser-based administration.

## Portal overview

### User experience

Users can view the services assigned to them, check their current state and resource usage, open configured website or management links, and use available service controls. Supported services can also provide browser console access, credentials and additional service information.

The dashboard summarizes running and stopped services, resource usage and current billing information in one place. Personal settings such as language, appearance, profile information and notifications are available from the account area.

### Self-service containers

When enabled for a cluster, users can create their own LXC containers from administrator-provided templates. Available CPU, memory and storage options are controlled by the portal configuration. Self-service containers receive their network configuration automatically and appear directly in the user's service list after provisioning.

### Public access

Supported self-service containers can publish HTTP, TCP and UDP services through the portal when Public Access is enabled for their cluster. Website, management and port-based publications can be managed from the user area without exposing the underlying infrastructure configuration.

### Wiki

The integrated Wiki provides English and German documentation directly inside the portal. Administrators can organize articles in folders, edit Markdown content and publish each language independently. Users only see the documentation that has been published for them.

### Administration

Administrators can manage users, groups, services, clusters, templates, Self-service, Public Access, billing, maintenance, email, system updates and audit information. Existing Proxmox resources can be assigned to users or groups while portal-created resources can be managed through their dedicated workflows.

The Health Display provides a configurable read-only dashboard for dedicated monitoring screens. The Hermes Agent integration can be configured separately with explicit portal permissions and an administrator chat interface.

### Security and access

Sensitive credentials and infrastructure secrets are stored server-side and protected by the portal's permission model. User-managed access information remains separated from administrator access where required. Administrative and user actions are recorded in the audit log.

## Components

The portal consists of a React frontend, an Express backend and persistent SQLite-backed portal data. Proxmox clusters and optional Pangolin Public Access integrations are connected through their respective APIs.
