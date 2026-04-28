# MyFrame VPS Go-Live (mygram.com)

This deploys:

- Website on `https://mygram.com`
- API on `https://api.mygram.com`

## DNS first

Create A records:

- `mygram.com` -> your VPS IPv4
- `www.mygram.com` -> your VPS IPv4 (optional)
- `api.mygram.com` -> your VPS IPv4

Wait until DNS resolves before deploy.

## 1) VPS bootstrap

```bash
cd /path/to/myframe
sudo bash deploy/vps/setup-vps.sh
```

## 2) Configure production env

```bash
cp deploy/vps/.env.prod.example deploy/vps/.env.prod
```

Edit `deploy/vps/.env.prod`:

- set `APP_DOMAIN=mygram.com`
- set `API_DOMAIN=api.mygram.com`
- set strong `FRAME_PAIRING_TOKEN`
- set strong `ADMIN_TOKEN`
- set `CORS_ORIGINS=https://mygram.com,https://www.mygram.com`

## 3) Deploy

```bash
bash deploy/vps/preflight-check.sh
bash deploy/vps/deploy-prod.sh
```

### Alternative: Nginx on host (if VPS has multiple apps)

Use this mode when you want domain-based routing without Caddy:

```bash
sudo bash deploy/vps/setup-nginx-myframe.sh myframe.ink api.myframe.ink
docker compose --env-file deploy/vps/.env.prod -f deploy/vps/docker-compose.nginx.yml up -d --build
```

This keeps the landing page/app on `https://myframe.ink` and backend on `https://api.myframe.ink`.

## 4) Verify

```bash
docker compose --env-file deploy/vps/.env.prod -f deploy/vps/docker-compose.prod.yml ps
curl -I https://mygram.com
curl https://api.mygram.com/health
```

Expected API health payload includes `{ "ok": true }`.

## 4.1) InkJoy bridge verify (if enabled)

Use your `ADMIN_TOKEN`:

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://api.mygram.com/api/inkjoy/status
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://api.mygram.com/api/inkjoy/devices
```

If `INKJOY_AUTO_PUBLISH=true`, each `POST /api/photo/upload` response includes an `inkjoy` object with forward status.

## 4.2) One-command smoke test

```bash
bash deploy/vps/smoke-test.sh mygram.com api.mygram.com "<ADMIN_TOKEN>"
```

## 4.3) One-command go-live wrapper

Runs preflight -> deploy -> smoke test:

```bash
bash deploy/vps/go-live.sh mygram.com api.mygram.com "<ADMIN_TOKEN>"
```

## 5) Optional: scheduled backups

```bash
chmod +x deploy/vps/backup-server-data.sh
crontab -e
```

Example nightly backup at 2:30am:

```cron
30 2 * * * /bin/bash /path/to/myframe/deploy/vps/backup-server-data.sh >> /path/to/myframe/deploy/vps/backup.log 2>&1
```

## 6) Rolling updates

```bash
git pull
bash deploy/vps/deploy-prod.sh
```

## Notes

- TLS certs are auto-managed by Caddy.
- Keep ports 80/443 open and do not expose 3000/3001 directly.
- For app release, point `API_BASE`/pairing URLs to `https://api.mygram.com`.
