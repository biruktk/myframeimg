#!/usr/bin/env bash
# Run on VPS from the backend folder (e.g. /var/www/myframe/backend or web/backend).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> npm ci (installs google-auth-library and all deps)"
npm ci
echo "==> npm run build"
npm run build
if ! grep -rq "mobile/google-signin" dist/; then
  echo "ERROR: dist/ missing mobile/google-signin — build did not include mobile auth routes"
  exit 1
fi
echo "==> pm2 restart myframe-api (or start ecosystem.config.cjs)"
if pm2 describe myframe-api &>/dev/null; then
  pm2 restart myframe-api
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "==> smoke test (wait for API to bind)"
sleep 2
if ! curl -sS --max-time 5 "http://127.0.0.1:${PORT:-3001}/health" | head -c 300; then
  echo ""
  echo "ERROR: API not responding on :${PORT:-3001}. Check: pm2 logs myframe-api --lines 40"
  exit 1
fi
echo ""
curl -sS -o /dev/null -w "GET /mobile/google-signin -> HTTP %{http_code}\n" \
  "http://127.0.0.1:${PORT:-3001}/mobile/google-signin" || echo "GET /mobile/google-signin FAILED"
curl -sf "http://127.0.0.1:${PORT:-3001}/health" | grep -q '"googleOAuthRedirect":true' && \
  echo "googleOAuthRedirect: enabled" || \
  echo "WARN: set GOOGLE_OAUTH_CLIENT_SECRET + PUBLIC_BASE_URL for mobile Google redirect"
curl -sf -o /dev/null -w "POST /mobile/google-auth (no token) -> HTTP %{http_code}\n" \
  -X POST -H "content-type: application/json" \
  -d '{"idToken":""}' \
  "http://127.0.0.1:${PORT:-3001}/mobile/google-auth"
echo "(expect 400 for empty token — 404 means old build still running)"
curl -sf -o /dev/null -w "POST /api/auth/wechat/login (no code) -> HTTP %{http_code}\n" \
  -X POST -H "content-type: application/json" \
  -d '{"code":""}' \
  "http://127.0.0.1:${PORT:-3001}/api/auth/wechat/login" || true
echo "(expect 400 — 404 means wechat routes missing)"
echo ""
echo "Docs: docs/API.md, docs/DATABASE.md, docs/openapi.yaml"
