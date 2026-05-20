#!/usr/bin/env bash
# Run ON THE VPS as root from /var/www/myframe
set -euo pipefail
cd /var/www/myframe

echo "==> Backup VPS copies (optional)"
cp -a backend/src/index.ts /tmp/index.ts.vps.bak 2>/dev/null || true
cp -a backend/src/routes/device.ts /tmp/device.ts.vps.bak 2>/dev/null || true

echo "==> Stash modified tracked files (keeps data/myframe-db.json if not listed)"
git stash push -m "vps-pre-pull-$(date +%Y%m%d%H%M)" -- \
  backend/src/index.ts \
  backend/src/routes/device.ts || true

echo "==> Remove untracked wechat_phone.ts so git can checkout the tracked file"
rm -f backend/src/routes/wechat_phone.ts

echo "==> Pull from GitHub"
git pull origin main

echo "==> Build and restart"
cd backend
npm ci
npm run build
grep -rq "mobile/google-signin" dist/ || { echo "ERROR: no mobile route in dist"; exit 1; }
pm2 restart myframe-api
sleep 2
curl -sS http://127.0.0.1:3001/health | head -c 400
echo ""
curl -sS -o /dev/null -w "signin HTTP %{http_code}\n" http://127.0.0.1:3001/mobile/google-signin
