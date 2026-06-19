#!/usr/bin/env bash
# Build and start Next.js on the VPS (port 3000). Run API deploy separately.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f "${ROOT}/.env" ]]; then
  echo "ERROR: missing ${ROOT}/.env — create from .env.example (ADMIN_TOKEN must match backend/.env)"
  exit 1
fi

echo "==> npm ci"
npm ci
echo "==> npm run build"
npm run build
if pm2 describe myframe-web &>/dev/null; then
  pm2 restart myframe-web --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "==> smoke: homepage + MDM"
curl -s -o /dev/null -w "GET /en → HTTP %{http_code}\n" http://127.0.0.1:3000/en || true
curl -s -o /dev/null -w "GET /mdm → HTTP %{http_code}\n" http://127.0.0.1:3000/mdm || true
curl -s -o /dev/null -w "GET /mdm/bridge.js → HTTP %{http_code}\n" http://127.0.0.1:3000/mdm/bridge.js || true
