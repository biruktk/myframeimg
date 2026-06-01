#!/usr/bin/env bash
# Install Nginx site that serves /frame-media/ from backend/uploads on port 80.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0 [uploads_dir]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPLOADS_DIR="${1:-/var/www/myframe/backend/uploads}"
VPS_IP="${2:-128.241.231.234}"

if [[ ! -d "${UPLOADS_DIR}" ]]; then
  echo "ERROR: uploads dir not found: ${UPLOADS_DIR}"
  exit 1
fi

apt-get update
apt-get install -y nginx

CONF="/etc/nginx/sites-available/frame-media"
cat >"${CONF}" <<EOF
server {
    listen 80;
    server_name ${VPS_IP};

    location /frame-media/ {
        alias ${UPLOADS_DIR}/;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "public, max-age=3600";
        types {
            application/octet-stream bin;
        }
        default_type application/octet-stream;
    }
}
EOF

ln -sf "${CONF}" /etc/nginx/sites-enabled/frame-media
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "[myframe] frame-media site enabled."
echo "Test: curl -I http://${VPS_IP}/frame-media/\$(ls -t ${UPLOADS_DIR}/*.bin | head -1 | xargs basename)"
