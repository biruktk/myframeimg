#!/usr/bin/env bash
# Full rolling deploy after git pull — Next.js (port 3000) + Express API (port 3001).
# Run from repo root: bash deploy/vps/deploy-after-pull.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

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

echo "==> MDM smoke (local)"
curl -s -o /dev/null -w "GET /mdm → HTTP %{http_code}\n" http://127.0.0.1:3000/mdm || true
curl -s -o /dev/null -w "GET /mdm/bridge.js → HTTP %{http_code}\n" http://127.0.0.1:3000/mdm/bridge.js || true

echo "Done. Open https://YOUR_APP_DOMAIN/mdm and sign in with ADMIN_USER / ADMIN_PASS from ${ROOT}/.env"
