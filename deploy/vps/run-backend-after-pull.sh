#!/usr/bin/env bash
# After: git clone … && cd myframe/web/backend   (use repo path as arg or \$PWD)
# Run as a normal user (not root):  bash ../../deploy/vps/run-backend-after-pull.sh
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
  echo "Copy env: cp .env.example .env   (committed .env may already exist after pull)"
fi

npm ci
npm run build
echo "Starting API on PORT from .env (default 3001). Ctrl+C stops."
NODE_ENV=production npm start
