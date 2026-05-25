# MyFrame API Server

Express + TypeScript API for MyFrame app/web uploads, device status, and self-hosted MQTT frame control (`/api/frame-cloud/*`).

## Local run

```bash
npm install
npm run dev
```

On the VPS, `backend/.env` is the source of truth. Do not overwrite it during deploys and do not recreate it from `.env.example`. Normal backend deploys should be: `git pull`, `npm run build`, `pm2 restart myframe-api`.

API listens on `http://127.0.0.1:3001` unless `PORT` is set.

## Production knobs

Set in `.env`:

- `FRAME_PAIRING_TOKEN`: required for `POST /api/photo/upload` (`x-pairing-token` or Bearer)
- `ADMIN_TOKEN`: required for admin/settings write routes
- `CORS_ORIGINS`: comma-separated allowlist
- `UPLOADS_PER_MINUTE`: per-IP limit for `/api/photo/upload`
- `MQTT_URL`: backend connects to your Mosquitto (e.g. `mqtt://device:pass@127.0.0.1:1883`)
- `PUBLIC_BASE_URL`: public HTTP base for the API (for this VPS: `http://128.241.231.234`)
- `PUBLIC_MEDIA_BASE_URL`: public HTTP base for frame downloads (for this VPS: `http://128.241.231.234`, served by Nginx on port `80`)
- `FRAME_MQTT_PORT=80` / `FRAME_MEDIA_PORT=80`: operational values used for the VPS setup; frames fetch media through Nginx on port `80`, not the API on `3001`
- `FRAME_MYFM_ENCODE` (default on): raster uploads become **MYFM `.bin`** (960032 B) + **keep** the original JPEG/PNG beside it; **`image_url` / MQTT `play` always use `.bin`**. Encode failure → **`503`** (no JPEG MQTT).
- `FRAME_PLAY_ALLOW_HTTPS`: set `1` only if `publishPlayImage` must allow `https://` in `PUBLIC_*` URLs (default blocks HTTPS for ESP32 safety).
- `FRAME_API_SECRET` / `FRAME_JWT_SECRET`: `POST /api/frame-cloud/auth/token` and JWT for frame-cloud routes

**`POST /api/photo/upload`**: **`image_url`** ends in **`.bin`**; **`preview_stored_path`** is the JPEG/PNG backup filename when present.

If `FRAME_PAIRING_TOKEN` is empty, upload auth is bypassed (dev mode).  
If `ADMIN_TOKEN` is empty, admin/settings writes return `503 admin_token_not_configured`.

## Frame cloud (your VPS)

- `POST /api/frame-cloud/auth/token` with `{"secret":"<FRAME_API_SECRET>"}` → Bearer JWT
- `GET /api/frame-cloud/frames` — list devices seen on MQTT
- `POST /api/frame-cloud/frames/:mac/play` with `{"imageUrl":"https://.../frame-media/..."}` (prefer `*.bin`)

## Enterprise API (MVP)

Tenant/fleet APIs for company integrations (all under `/api/enterprise`).

- Admin-managed bootstrap (requires `ADMIN_TOKEN`):
  - `GET /api/enterprise/orgs`
  - `POST /api/enterprise/orgs` body: `{ "name": "Acme Inc" }`
  - `POST /api/enterprise/orgs/:orgId/api-keys` body: `{ "name":"Primary", "scopes":["devices:read","images:write","images:read"] }`
  - `GET /api/enterprise/orgs/:orgId/api-keys`
  - `POST /api/enterprise/orgs/:orgId/api-keys/:keyId/revoke`
  - `POST /api/enterprise/orgs/:orgId/devices/:deviceId/assign`

- Enterprise key authenticated (`x-api-key: <token>` or `Authorization: Bearer <token>`):
  - `GET /api/enterprise/orgs/:orgId/devices` (`devices:read`)
  - `GET /api/enterprise/orgs/:orgId/uploads` (`images:read`)
  - `POST /api/enterprise/orgs/:orgId/images/upload` (`images:write`, multipart `file` + `device_ids`)

New API key tokens are returned **only once** at creation. Store securely.

## VPS deploy (PM2)

From the **repository root** (directory that contains `web/`):

```bash
bash web/deploy/vps/deploy-prod.sh
```

See `web/deploy/vps/GO_LIVE.md`. Keep the existing `web/backend/.env` intact on the VPS; do not replace it from any example file.

## Health checks

- `GET /health`
- `GET /api/device/status`

## Reverse proxy

- Serve API behind HTTPS (Nginx/Caddy/Traefik).
- Keep `/etc/nginx/sites-enabled/frame-media` enabled so `/frame-media/` continues to serve `backend/uploads/` on port `80`.
- Back up `backend/data` and `backend/uploads` on the host.
