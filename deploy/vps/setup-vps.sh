#!/usr/bin/env bash
# Host bootstrap without Docker — Node 20 + PM2 + firewall.
set -euo pipefail

echo "[myframe] Starting VPS bootstrap..."

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash web/deploy/vps/setup-vps.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git ufw

_node_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
_node_major="${_node_major:-0}"
if ! command -v node >/dev/null 2>&1 || [[ "${_node_major}" -lt 20 ]]; then
  echo "[myframe] Installing Node.js 20 (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 1883/tcp
ufw allow 3001/tcp
ufw --force enable

echo "[myframe] VPS bootstrap complete."
echo "Next:"
echo "  1) cp web/deploy/vps/.env.prod.example web/deploy/vps/.env.prod"
echo "  2) edit tokens / PUBLIC_BASE_URL / MQTT_URL; copy merged values into web/backend/.env for PM2"
echo "  3) bash web/deploy/vps/preflight-check.sh"
echo "  4) bash web/deploy/vps/deploy-prod.sh"
echo "  5) bash web/deploy/vps/smoke-test.sh mygram.com api.example.com <ADMIN_TOKEN>"
