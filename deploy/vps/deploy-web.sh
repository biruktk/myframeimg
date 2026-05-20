#!/usr/bin/env bash
# Build and start Next.js on the VPS (port 3000). Run API deploy separately.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
echo "==> npm ci"
npm ci
echo "==> npm run build"
npm run build
if pm2 describe myframe-web &>/dev/null; then
  pm2 restart myframe-web
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "==> smoke: curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/en"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/en || true
