#!/usr/bin/env bash
# Run on VPS from repo root OR backend folder.
# Example: cd /var/www/myframe && bash backend/scripts/vps-pull-and-deploy.sh
set -euo pipefail

if [[ -d "$(pwd)/backend/src" ]]; then
  ROOT="$(pwd)"
  BACKEND="$ROOT/backend"
elif [[ -d "$(pwd)/src" && -f "$(pwd)/package.json" ]]; then
  BACKEND="$(pwd)"
  ROOT="$(cd .. && pwd)"
else
  echo "Run from /var/www/myframe or /var/www/myframe/backend"
  exit 1
fi

cd "$ROOT"
echo "==> Git root: $ROOT"
echo "==> Backend: $BACKEND"

echo "==> Stash local edits to API source (keeps data/myframe-db.json)"
git stash push -m "vps-pre-deploy-$(date +%Y%m%d%H%M)" -- \
  backend/src/index.ts \
  backend/src/routes/device.ts 2>/dev/null || true

if [[ -f backend/src/routes/wechat_phone.ts ]] && ! git ls-files --error-unmatch backend/src/routes/wechat_phone.ts &>/dev/null 2>&1; then
  echo "==> Moving untracked wechat_phone.ts aside (git will provide the tracked copy)"
  mv backend/src/routes/wechat_phone.ts "/tmp/wechat_phone.vps.bak.$(date +%s)"
fi

echo "==> git pull"
git pull origin main

cd "$BACKEND"
exec bash scripts/deploy.sh
