# MyFrame API Server

Express + TypeScript API for MyFrame app/web uploads and device status.

## Local run

```bash
cp .env.example .env
npm install
npm run dev
```

API listens on `http://127.0.0.1:3001` by default.

## Production security knobs

Set these in `.env`:

- `FRAME_PAIRING_TOKEN`: required for `POST /api/photo/upload` (send as `x-pairing-token` or Bearer token)
- `ADMIN_TOKEN`: required for admin/settings write routes
- `CORS_ORIGINS`: comma-separated allowlist, example `https://app.example.com,https://admin.example.com`
- `UPLOADS_PER_MINUTE`: per-IP upload limit for `/api/photo/upload`

If `FRAME_PAIRING_TOKEN` is empty, upload auth is bypassed (dev mode).  
If `ADMIN_TOKEN` is empty, admin/settings writes return `503 admin_token_not_configured`.

## InkJoy compatibility layer

This server can bridge uploads to InkJoy OpenAPI.

Set in `.env`:

- `INKJOY_ENABLE=true`
- `INKJOY_SERVER=global` (or `china`)
- `INKJOY_EMAIL=...`
- `INKJOY_PASSWORD=...`
- `INKJOY_DEVICE_ID=...` (optional default target)
- `INKJOY_AUTO_PUBLISH=true` to auto-forward `POST /api/photo/upload` images

Manual admin routes (require `ADMIN_TOKEN`):

- `GET /api/inkjoy/status`
- `GET /api/inkjoy/devices`
- `POST /api/inkjoy/publish` with `{ "device_id": "...", "image_base64": "...", "filename": "x.jpg" }`

When auto-publish is enabled, upload responses include an `inkjoy` object with forward status/result.

## VPS deploy (Docker)

```bash
cp .env.example .env
# edit .env (tokens, origins)
docker compose -f ../deploy/docker-compose.server.yml up -d --build
```

## Health checks

- `GET /health`
- `GET /api/device/status`

## Reverse proxy notes

- Keep API behind HTTPS (Nginx/Caddy/Traefik).
- Restrict firewall to `80/443` and SSH.
- Back up `backend/data` and `backend/uploads` volumes.
# myframe
# myframe
# myframe
# myframe
# myframe
