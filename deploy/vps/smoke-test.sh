#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: bash deploy/vps/smoke-test.sh <app_domain> <api_domain> <admin_token>"
  echo "Example: bash deploy/vps/smoke-test.sh mygram.com api.mygram.com 'YOUR_ADMIN_TOKEN'"
  exit 1
fi

APP_DOMAIN="$1"
API_DOMAIN="$2"
ADMIN_TOKEN="$3"

echo "[1/6] Website HEAD check..."
curl -fsSI "https://${APP_DOMAIN}" >/dev/null
echo "  OK https://${APP_DOMAIN}"

echo "[2/6] API health check..."
curl -fsS "https://${API_DOMAIN}/health" | sed -n '1,3p'

echo "[3/6] Frame-cloud health (MQTT bridge status)..."
curl -fsS "https://${API_DOMAIN}/api/frame-cloud/health" | sed -n '1,5p'

echo "[4/6] Upload endpoint reachability (no file payload test)..."
set +e
UPLOAD_JSON="$(curl -sS -X POST "https://${API_DOMAIN}/api/photo/upload")"
RC=$?
set -e
echo "${UPLOAD_JSON}" | sed -n '1,3p'
if [[ ${RC} -ne 0 ]]; then
  echo "  WARN: /api/photo/upload probe failed (expected without payload/token in many setups)"
fi

echo "[5/6] MDM console (Next.js /mdm)..."
curl -fsSI "https://${APP_DOMAIN}/mdm" >/dev/null
echo "  OK https://${APP_DOMAIN}/mdm"

echo "[6/8] MDM bridge asset..."
curl -fsSI "https://${APP_DOMAIN}/mdm/bridge.js" >/dev/null
echo "  OK https://${APP_DOMAIN}/mdm/bridge.js"

echo "[7/8] Geo location API (https://${APP_DOMAIN}/api/public/location)..."
LOC_JSON="$(curl -fsS "https://${APP_DOMAIN}/api/public/location")"
echo "${LOC_JSON}" | sed -n '1,1p' | head -c 240
echo ""

echo "[8/8] Geo redirect proxy (root → locale prefix)..."
REDIR="$(curl -sSI "https://${APP_DOMAIN}/" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')"
echo "  Location: ${REDIR:-<none>}"

echo "Smoke test complete."
echo "MDM login: open https://${APP_DOMAIN}/mdm and sign in with ADMIN_USER / ADMIN_PASS from repo .env"
echo "Geo (Ethiopia → es): curl -s 'https://${APP_DOMAIN}/api/public/location' -H 'X-Forwarded-For: 196.188.0.1'"
