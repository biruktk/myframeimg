#!/usr/bin/env bash
# Run on VPS from the backend folder (e.g. /var/www/myframe/backend or web/backend).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> npm ci (installs google-auth-library and all deps)"
npm ci
echo "==> npm run build"
npm run build
echo "==> pm2 restart myframe-api (or start ecosystem.config.cjs)"
if pm2 describe myframe-api &>/dev/null; then
  pm2 restart myframe-api
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "==> smoke test"
curl -sf "http://127.0.0.1:${PORT:-3001}/health" | head -c 200
echo ""
curl -sf -o /dev/null -w "GET /mobile/google-signin -> HTTP %{http_code}\n" \
  "http://127.0.0.1:${PORT:-3001}/mobile/google-signin"
