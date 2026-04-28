#!/usr/bin/env bash
set -euo pipefail

echo "[myframe] Starting VPS bootstrap..."

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash web/deploy/vps/setup-vps.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable docker
systemctl start docker

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[myframe] VPS bootstrap complete."
echo "Next:"
echo "  1) cp web/deploy/vps/.env.prod.example web/deploy/vps/.env.prod"
echo "  2) edit web/deploy/vps/.env.prod tokens/domains"
echo "  3) bash web/deploy/vps/preflight-check.sh"
echo "  4) bash web/deploy/vps/deploy-prod.sh"
echo "  5) bash web/deploy/vps/smoke-test.sh mygram.com api.mygram.com <ADMIN_TOKEN>"
