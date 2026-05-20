#!/usr/bin/env bash
# Run on YOUR LAPTOP (not the VPS). Downloads VPS backend source into ./_vps_import/
# then copies into web/backend/src (or repo backend/ if you use that layout).
#
# Usage:
#   export VPS_HOST=root@128.241.231.234   # your VPS SSH user@host
#   bash web/backend/scripts/sync-from-vps.sh
#
# Optional: VPS_REPO=/var/www/myframe  LOCAL_REPO=/path/to/myframe
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@128.241.231.234}"
VPS_REPO="${VPS_REPO:-/var/www/myframe}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_BACKEND="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_REPO="${LOCAL_REPO:-$(cd "$WEB_BACKEND/../.." && pwd)}"
IMPORT_DIR="$LOCAL_REPO/_vps_import"
STAMP="$(date +%Y%m%d_%H%M%S)"

echo "VPS:      $VPS_HOST:$VPS_REPO/backend"
echo "Import:   $IMPORT_DIR"
echo "Apply to: $WEB_BACKEND/src"

mkdir -p "$IMPORT_DIR/backend/src/routes" "$IMPORT_DIR/backups" "$IMPORT_DIR/deploy"

echo "==> Download modified + new API source files"
mkdir -p "$IMPORT_DIR/backend/src/routes"
scp "$VPS_HOST:$VPS_REPO/backend/src/index.ts" "$IMPORT_DIR/backend/src/index.ts"
scp "$VPS_HOST:$VPS_REPO/backend/src/routes/device.ts" "$IMPORT_DIR/backend/src/routes/device.ts"
scp "$VPS_HOST:$VPS_REPO/backend/src/routes/wechat_phone.ts" "$IMPORT_DIR/backend/src/routes/wechat_phone.ts" 2>/dev/null \
  || echo "  (wechat_phone.ts not on VPS — ok if only in git)"

echo "==> Download VPS backups (for diff reference only)"
rsync -avz \
  "$VPS_HOST:$VPS_REPO/backend/src/*.backup*" \
  "$VPS_HOST:$VPS_REPO/backend/src/routes/*.backup*" \
  "$VPS_HOST:$VPS_REPO/backend/src/routes/*.bak*" \
  "$IMPORT_DIR/backups/" 2>/dev/null || true

echo "==> Optional: deploy helper from VPS"
rsync -avz "$VPS_HOST:$VPS_REPO/deploy/vps/i.sh" "$IMPORT_DIR/deploy/" 2>/dev/null || true

echo "==> Copy into project (backs up current files first)"
for f in index.ts routes/device.ts routes/wechat_phone.ts; do
  src="$IMPORT_DIR/backend/src/$f"
  dst="$WEB_BACKEND/src/$f"
  if [[ -f "$src" ]]; then
    if [[ -f "$dst" ]]; then
      cp "$dst" "$dst.before_vps_$STAMP"
    fi
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "  applied $f"
  else
    echo "  skip (missing on VPS): $f"
  fi
done

echo ""
echo "Done. Review diffs before commit:"
echo "  cd $WEB_BACKEND && diff -u src/index.ts.before_vps_* src/index.ts 2>/dev/null | head -80"
echo ""
echo "If your GitHub repo uses backend/ at root (not web/backend), also run:"
echo "  rsync -av $WEB_BACKEND/src/ $LOCAL_REPO/backend/src/"
echo "  rsync -av $WEB_BACKEND/scripts/ $LOCAL_REPO/backend/scripts/"
