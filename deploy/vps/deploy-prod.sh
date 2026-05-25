#!/usr/bin/env bash
# Build Express API on the host and restart the existing PM2 app (no Docker).
# Deploy rule: do not touch backend/.env on the VPS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${WEB_ROOT}/backend"

bash "${SCRIPT_DIR}/preflight-check.sh"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 not found. Install: sudo npm i -g pm2"
  exit 1
fi

echo "[myframe] Building API in ${BACKEND_DIR} ..."
cd "${BACKEND_DIR}"
if [[ ! -f .env ]]; then
  echo "ERROR: missing ${BACKEND_DIR}/.env; do not recreate it from .env.example"
  exit 1
fi
npm run build

echo "[myframe] PM2 deploy (app name: myframe-api) ..."
if ! pm2 describe myframe-api >/dev/null 2>&1; then
  echo "ERROR: PM2 app myframe-api is missing. Use initial server setup, not deploy-prod.sh."
  exit 1
fi
pm2 restart myframe-api

echo "[myframe] API deploy finished."
echo "Kept ${BACKEND_DIR}/.env unchanged. VPS .env remains the source of truth."
echo "Optional: NODE_ENV=production pm2 logs myframe-api --lines 80"
echo "Next.js site (${WEB_ROOT}): npm ci && npm run build && npm start (port 3000), or pm2/ecosystem of your choice."
