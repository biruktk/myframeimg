#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 3 ]]; then
  echo "Usage: bash web/deploy/vps/go-live.sh <app_domain> <api_domain> <admin_token>"
  echo "Example: bash web/deploy/vps/go-live.sh mygram.com api.example.com 'YOUR_ADMIN_TOKEN'"
  exit 1
fi

APP_DOMAIN="$1"
API_DOMAIN="$2"
ADMIN_TOKEN="$3"

echo "[myframe] Step 1/3: preflight"
bash "${SCRIPT_DIR}/preflight-check.sh"

echo "[myframe] Step 2/3: deploy"
bash "${SCRIPT_DIR}/deploy-prod.sh"

echo "[myframe] Step 3/3: smoke test"
bash "${SCRIPT_DIR}/smoke-test.sh" "${APP_DOMAIN}" "${API_DOMAIN}" "${ADMIN_TOKEN}"

echo "[myframe] Go-live sequence completed."
