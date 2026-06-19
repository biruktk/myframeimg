#!/usr/bin/env bash
# Full rolling deploy after git pull — Next.js (port 3000) + Express API (port 3001).
# Run from repo root: bash deploy/vps/deploy-after-pull.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DOMAIN="myframe.ink"

if [[ -f "${SCRIPT_DIR}/.env.prod" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${SCRIPT_DIR}/.env.prod"
  set +a
fi
APP_DOMAIN="${APP_DOMAIN:-myframe.ink}"

cd "${ROOT}"

if [[ ! -f "${ROOT}/.env" ]]; then
  echo "ERROR: missing ${ROOT}/.env (Next.js needs ADMIN_TOKEN, ADMIN_USER, ADMIN_PASS, MYFRAME_API_URL)"
  echo "Copy from .env.example and align ADMIN_TOKEN with backend/.env"
  exit 1
fi

if [[ ! -f "${ROOT}/backend/.env" ]]; then
  echo "ERROR: missing ${ROOT}/backend/.env"
  exit 1
fi

echo "==> Deploy Next.js (myframe-web, serves /mdm and /api proxy)"
bash "${SCRIPT_DIR}/deploy-web.sh"

echo "==> Deploy Express API (myframe-api, frames + MQTT logs for MDM)"
bash "${SCRIPT_DIR}/deploy-prod.sh"

echo "==> Local smoke (127.0.0.1)"
curl -s -o /dev/null -w "GET /mdm → HTTP %{http_code}\n" http://127.0.0.1:3000/mdm || true
curl -s -o /dev/null -w "GET /mdm/bridge.js → HTTP %{http_code}\n" http://127.0.0.1:3000/mdm/bridge.js || true
curl -sS http://127.0.0.1:3000/api/public/location -H "X-Forwarded-For: 196.188.0.1" | head -c 220 || true
echo ""

echo "==> Production smoke (https://${APP_DOMAIN})"
curl -fsSI "https://${APP_DOMAIN}/" >/dev/null && echo "  OK https://${APP_DOMAIN}/"
curl -fsS "https://${APP_DOMAIN}/api/public/location" | head -c 220 || echo "  WARN: location API check failed"
echo ""
curl -s -o /dev/null -w "GET /mdm → HTTP %{http_code}\n" "https://${APP_DOMAIN}/mdm" || true

echo "Done. MDM: https://${APP_DOMAIN}/mdm — sign in with ADMIN_USER / ADMIN_PASS from ${ROOT}/.env"
echo "Geo test (Ethiopia → es): curl -s 'https://${APP_DOMAIN}/api/public/location' -H 'X-Forwarded-For: 196.188.0.1'"
