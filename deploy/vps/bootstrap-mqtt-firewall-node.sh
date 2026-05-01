#!/usr/bin/env bash
# One-shot VPS prep: Node 20, Mosquitto (device broker), UFW ports.
# Run ON THE VPS:  curl -fsSL … | sudo bash   OR   sudo bash bootstrap-mqtt-firewall-node.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw mosquitto mosquitto-clients

MQTT_USER="${MQTT_USER:-device}"
MQTT_PASS="${MQTT_PASS:-framepass2026}"

# Node.js 20+ (backend expects >=20)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

install -d -m 755 /etc/mosquitto/conf.d
# Do not duplicate persistence_* — stock mosquitto.conf sets them.
cat >/etc/mosquitto/conf.d/myframe.conf <<EOF
listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd
EOF

# Ubuntu/Debian default mosquitto.conf already has "listener 1883" → duplicate port with conf.d → service fails.
MAIN_CFG=/etc/mosquitto/mosquitto.conf
if [[ -f "${MAIN_CFG}" ]] && grep -qE '^[[:space:]]*listener[[:space:]]+1883' "${MAIN_CFG}"; then
  cp -a "${MAIN_CFG}" "${MAIN_CFG}.bak.$(date +%s)"
  sed -i -E '/^[[:space:]]*listener[[:space:]]+1883/s/^/# myframe-managed (duplicate listener disabled): /' "${MAIN_CFG}"
fi

if [[ ! -f /etc/mosquitto/passwd ]] || [[ ! -s /etc/mosquitto/passwd ]]; then
  mosquitto_passwd -c -b /etc/mosquitto/passwd "${MQTT_USER}" "${MQTT_PASS}"
else
  mosquitto_passwd -b /etc/mosquitto/passwd "${MQTT_USER}" "${MQTT_PASS}"
fi
chown root:mosquitto /etc/mosquitto/passwd
chmod 640 /etc/mosquitto/passwd

systemctl enable mosquitto
systemctl reset-failed mosquitto 2>/dev/null || true
systemctl restart mosquitto

ufw status >/dev/null 2>&1 || true
ufw allow OpenSSH
ufw allow 1883/tcp comment 'MQTT frames'
ufw allow 3001/tcp comment 'MyFrame API PUBLIC_BASE_URL'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
yes | ufw enable || true
ufw status verbose

echo ""
echo "--- OK ---"
echo "Node: $(node -v)  mosquitto: $(systemctl is-active mosquitto)"
echo "MQTT login: ${MQTT_USER} / (password from MQTT_PASS or framepass2026)"
echo ""
echo "Also open THE SAME TCP ports (1883, 3001) in your cloud provider security group / firewall if any."
