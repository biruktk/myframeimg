#!/usr/bin/env bash
# Build Express API on the host and run with PM2 (no Docker).
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
npm ci
npm run build

echo "[myframe] PM2 deploy (app name: myframe-api) ..."
if pm2 describe myframe-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

echo "[myframe] API deploy finished."
echo "Ensure ${BACKEND_DIR}/.env matches your production tokens and PUBLIC_BASE_URL."
echo "Optional: NODE_ENV=production pm2 logs myframe-api --lines 80"
echo "Next.js site (${WEB_ROOT}): npm ci && npm run build && npm start (port 3000), or pm2/ecosystem of your choice."
