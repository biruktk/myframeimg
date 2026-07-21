# MyFrame API Server

Express + TypeScript API for MyFrame app/web uploads, device status, and self-hosted MQTT frame control (`/api/frame-cloud/*`).

## Local run

```bash
npm install
npm run dev
```

`backend/.env` is tracked for your VPS workflow (same values as `.env.example`). For a private fork you can still override locally; use `127.0.0.1` in `MQTT_URL` when Node runs on the same host as Mosquitto.

API listens on `http://127.0.0.1:3001` unless `PORT` is set.

## Production knobs

Set in `.env`:

- `FRAME_PAIRING_TOKEN`: required for `POST /api/photo/upload` (`x-pairing-token` or Bearer)
- `ADMIN_TOKEN`: required for admin/settings write routes
- `CORS_ORIGINS`: comma-separated allowlist
- `UPLOADS_PER_MINUTE`: per-IP limit for `/api/photo/upload`
- `MQTT_URL`: backend connects to your Mosquitto (e.g. `mqtt://device:pass@127.0.0.1:1883`)
- `PUBLIC_BASE_URL` / `PUBLIC_MEDIA_BASE_URL`: **HTTP** base for frame `GET` (e.g. `http://VPS_IP:3001`). XT/ESP32 typically does not use TLS in `play`; avoid `https`/`443` unless you know your firmware does.
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

See `web/deploy/vps/GO_LIVE.md`. Ensure `web/backend/.env` is populated (mirror `web/deploy/vps/.env.prod` as needed).

## Health checks

- `GET /health`
- `GET /api/device/status`

## Reverse proxy

- Serve API behind HTTPS (Nginx/Caddy/Traefik).
- Back up `backend/data` and `backend/uploads` on the host.
