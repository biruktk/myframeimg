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

echo "[1/5] Website HEAD check..."
curl -fsSI "https://${APP_DOMAIN}" >/dev/null
echo "  OK https://${APP_DOMAIN}"

echo "[2/5] API health check..."
curl -fsS "https://${API_DOMAIN}/health" | sed -n '1,3p'

echo "[3/5] InkJoy status check..."
curl -fsS \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "https://${API_DOMAIN}/api/inkjoy/status" | sed -n '1,5p'

echo "[4/5] InkJoy devices check (may fail if not configured)..."
set +e
DEVICES_JSON="$(curl -sS -H "Authorization: Bearer ${ADMIN_TOKEN}" "https://${API_DOMAIN}/api/inkjoy/devices")"
RC=$?
set -e
echo "${DEVICES_JSON}" | sed -n '1,8p'
if [[ ${RC} -ne 0 ]]; then
  echo "  WARN: /api/inkjoy/devices request failed"
fi

echo "[5/5] Upload endpoint reachability (no file payload test)..."
set +e
UPLOAD_JSON="$(curl -sS -X POST "https://${API_DOMAIN}/api/photo/upload")"
RC=$?
set -e
echo "${UPLOAD_JSON}" | sed -n '1,3p'
if [[ ${RC} -ne 0 ]]; then
  echo "  WARN: /api/photo/upload probe failed (expected without payload/token in many setups)"
fi

echo "Smoke test complete."
