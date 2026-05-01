# Superadmin + Backend Scope (Scaffolded)

This backend now includes a practical scaffold for the requested operations:

## Core entities in DB layer

- `users` (auth/profile tier/group/status)
- `familyGroups` (invite code, member roles, frame sharing)
- `frames` (device id, BLE MAC, Wi-Fi status, firmware, last seen, uptime, OTA state)
- `uploads` (photo records + delivery status)
- `playlists` (ordered sets + assignment)
- `notifications` (delivery log)
- `bleProvisionLogs` (per-device provisioning traces)
- `featureFlags` (tier-aware toggles)
- `auditLog` (admin action history)

## Superadmin API areas

All routes are under `/api/admin/*` and require admin token middleware.

### 1) Fleet overview

- `GET /api/admin/fleet/overview`
  - total frames
  - online/offline/never provisioned
  - daily active frames
  - firmware distribution
  - location markers (if reported)

### 2) User management

- `GET /api/admin/users?q=<email|device|blemac>`
- `POST /api/admin/users/:id/status` (`active|suspended|banned`)

### 3) Device management

- `GET /api/admin/frames?filter=offline_7d|never_sent_photo`
- `POST /api/admin/frames/:id/ota` (queue OTA target version)
- `GET /api/admin/frames/:id/ble-logs`

### 4) Content & ops

- `GET /api/admin/content/ops`
  - queue summary, stuck uploads
  - storage by user
  - playlists
  - feature flags
  - audit tail
- `POST /api/admin/content/notify` (broadcast composer)

## Remaining production work

The current implementation is a scaffold for rapid iteration and must be connected to:

- real auth/session + RBAC
- persistent queue system for image processing jobs
- CDN-backed image delivery
- live telemetry (WebSocket/MQTT)
- OTA orchestration workers
- typed BLE provisioning ingestion from app/device

