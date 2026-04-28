#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: sudo bash web/deploy/vps/setup-nginx-myframe.sh <app_domain> <api_domain>"
  echo "Example: sudo bash web/deploy/vps/setup-nginx-myframe.sh myframe.ink api.myframe.ink"
  exit 1
fi

APP_DOMAIN="$1"
API_DOMAIN="$2"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo/root."
  exit 1
fi

echo "[myframe] Installing nginx + certbot..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

cat >/etc/nginx/sites-available/myframe.ink.conf <<EOF
server {
    listen 80;
    server_name ${APP_DOMAIN} www.${APP_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name ${API_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/myframe.ink.conf /etc/nginx/sites-enabled/myframe.ink.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[myframe] Requesting Let's Encrypt certificates..."
certbot --nginx -d "${APP_DOMAIN}" -d "www.${APP_DOMAIN}" -d "${API_DOMAIN}" --non-interactive --agree-tos -m "admin@${APP_DOMAIN}" --redirect

echo "[myframe] Nginx setup complete."
echo "Now deploy containers with:"
echo "  docker compose --env-file web/deploy/vps/.env.prod -f web/deploy/vps/docker-compose.nginx.yml up -d --build"
