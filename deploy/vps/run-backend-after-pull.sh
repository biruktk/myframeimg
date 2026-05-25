#!/usr/bin/env bash
# After: git pull … && cd myframe/web/backend   (use repo path as arg or \$PWD)
# Run as a normal user (not root): bash ../../deploy/vps/run-backend-after-pull.sh
# This helper never overwrites backend/.env on the VPS.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../backend" && pwd)"
if [[ -n "${1:-}" ]]; then
  BACKEND_DIR="$(cd "$1" && pwd)"
fi

cd "${BACKEND_DIR}"
if [[ ! -f package.json ]]; then
  echo "Not backend dir: ${BACKEND_DIR}"
  exit 1
fi

command -v node >/dev/null && [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -ge 20 ]] || {
  echo "Need Node >= 20. On VPS run: sudo bash web/deploy/vps/bootstrap-mqtt-firewall-node.sh"
  exit 1
}

if [[ ! -f .env ]]; then
  echo "ERROR: missing backend/.env on VPS; do not recreate it from .env.example"
  exit 1
fi

npm run build
if ! pm2 describe myframe-api >/dev/null 2>&1; then
  echo "ERROR: PM2 app myframe-api is missing. Use initial server setup, not this post-pull helper."
  exit 1
fi
echo "Restarting API via PM2 using the existing .env values."
pm2 restart myframe-api
