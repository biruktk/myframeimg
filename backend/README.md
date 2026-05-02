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
- `PUBLIC_BASE_URL`: public base for `frame-media` URLs in MQTT play commands  
- `FRAME_MYFM_ENCODE` (default on): JPEG/PNG/WebP uploads get a sibling **MYFM** `.bin` (same layout as `app/lib/services/image_processor_service.dart`); MQTT `play` uses that `.bin`. Set `FRAME_MYFM_ENCODE=0` to revert to JPEG-only (usually not usable on OEM e‑ink firmware).
- `FRAME_API_SECRET` / `FRAME_JWT_SECRET`: `POST /api/frame-cloud/auth/token` and JWT for frame-cloud routes

**`POST /api/photo/upload` response** includes **`stored_path`** (saved JPEG), **`frame_play_basename`**, and **`image_url`** (full public URL the frame should fetch for MQTT `play` — usually `*.bin`).

If `FRAME_PAIRING_TOKEN` is empty, upload auth is bypassed (dev mode).  
If `ADMIN_TOKEN` is empty, admin/settings writes return `503 admin_token_not_configured`.

## Frame cloud (your VPS)

- `POST /api/frame-cloud/auth/token` with `{"secret":"<FRAME_API_SECRET>"}` → Bearer JWT
- `GET /api/frame-cloud/frames` — list devices seen on MQTT
- `POST /api/frame-cloud/frames/:mac/play` with `{"imageUrl":"https://.../frame-media/..."}` (prefer `*.bin`)

## VPS deploy (PM2)

```bash
bash ../deploy/vps/deploy-prod.sh
```

See `web/deploy/vps/GO_LIVE.md`.

## Health checks

- `GET /health`
- `GET /api/device/status`

## Reverse proxy

- Serve API behind HTTPS (Nginx/Caddy/Traefik).
- Back up `backend/data` and `backend/uploads` on the host.
