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

echo "[1/4] Website HEAD check..."
curl -fsSI "https://${APP_DOMAIN}" >/dev/null
echo "  OK https://${APP_DOMAIN}"

echo "[2/4] API health check..."
curl -fsS "https://${API_DOMAIN}/health" | sed -n '1,3p'

echo "[3/4] Frame-cloud health (MQTT bridge status)..."
curl -fsS "https://${API_DOMAIN}/api/frame-cloud/health" | sed -n '1,5p'

echo "[4/4] Upload endpoint reachability (no file payload test)..."
set +e
UPLOAD_JSON="$(curl -sS -X POST "https://${API_DOMAIN}/api/photo/upload")"
RC=$?
set -e
echo "${UPLOAD_JSON}" | sed -n '1,3p'
if [[ ${RC} -ne 0 ]]; then
  echo "  WARN: /api/photo/upload probe failed (expected without payload/token in many setups)"
fi

echo "Smoke test complete."
