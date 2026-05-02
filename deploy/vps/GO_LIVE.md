# MyFrame VPS Go-Live (mygram.com)

This describes a **host-native** deploy: Node + PM2 for the API (**no Docker** in this repo).

- Website: `https://mygram.com` (Next.js — run `npm run build && npm start` in `web/` or your process manager)
- API: `https://api.mygram.com` (proxied to Express on `127.0.0.1:3001`)

## DNS first

Create A records:

- `mygram.com` -> your VPS IPv4
- `www.mygram.com` -> your VPS IPv4 (optional)
- `api.mygram.com` -> your VPS IPv4

Wait until DNS resolves before deploy.

## 1) VPS bootstrap

From the repo root (`…/myframe`):

```bash
sudo bash web/deploy/vps/setup-vps.sh
```

## 2) Configure production env

```bash
cp web/deploy/vps/.env.prod.example web/deploy/vps/.env.prod
```

Edit `web/deploy/vps/.env.prod`:

- set `APP_DOMAIN=mygram.com`
- set `API_DOMAIN=api.mygram.com`
- set strong `FRAME_PAIRING_TOKEN`
- set strong `ADMIN_TOKEN`
- set `CORS_ORIGINS=https://mygram.com,https://www.mygram.com`
- set `MQTT_URL` to your Mosquitto (e.g. `mqtt://device:pass@127.0.0.1:1883`)
- set `PUBLIC_BASE_URL` to whatever the **frame** can reach for `/frame-media/` (often `http://VPS_IP:3001` behind nginx later)

Copy the same secrets and `MQTT_URL` / `PUBLIC_BASE_URL` into **`web/backend/.env`** (PM2 reads the API from that directory).

## 3) Deploy API (PM2)

```bash
bash web/deploy/vps/preflight-check.sh
bash web/deploy/vps/deploy-prod.sh
```

### Nginx on host (optional)

When the site and API need separate hostnames:

```bash
sudo bash web/deploy/vps/setup-nginx-myframe.sh mygram.com api.example.com
```

Then terminate TLS with certbot (script runs certbot) and reverse-proxy `api` vhost to `http://127.0.0.1:3001`.

## 4) Verify

```bash
pm2 status
curl -I https://mygram.com
curl https://api.mygram.com/health
```

Expected API health payload includes `{ "ok": true }`.

## 4.1) Frame cloud + MQTT (your VPS)

Ensure `MQTT_URL` is set on the API and Mosquitto accepts the same credentials as the frame’s `mqtt_config`.

```bash
curl https://api.mygram.com/api/frame-cloud/health
curl -X POST https://api.mygram.com/api/frame-cloud/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret":"<FRAME_API_SECRET>"}'
```

## 4.2) One-command smoke test

```bash
bash web/deploy/vps/smoke-test.sh mygram.com api.mygram.com "<ADMIN_TOKEN>"
```

## 4.3) Go-live wrapper

```bash
bash web/deploy/vps/go-live.sh mygram.com api.mygram.com "<ADMIN_TOKEN>"
```

## 5) Optional: scheduled backups

```bash
chmod +x web/deploy/vps/backup-server-data.sh
crontab -e
```

Example nightly backup at 2:30am:

```cron
30 2 * * * /bin/bash /path/to/myframe/web/deploy/vps/backup-server-data.sh >> /path/to/myframe/web/deploy/vps/backup.log 2>&1
```

## 6) Rolling updates

```bash
git pull
bash web/deploy/vps/deploy-prod.sh
```

## Notes

- Keep ports 80/443 open; expose `3001` only on localhost unless you test with the frame over raw IP.
- For app release, point `API_BASE` / pairing URLs to your public API base.
- **`POST /api/photo/upload`** returns `image_url` (MQTT **play** target, usually MYFM `.bin`) and `stored_path` (saved JPEG on disk).
