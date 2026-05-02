#!/usr/bin/env bash
# Run on the VPS (SSH) after deploy. Checks API, MQTT bridge, broker port, sample URLs.
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3001}"
MAC="${TEST_MAC:-D0CF13F0161C}"

echo "=== 1) API health ==="
curl -fsS "${API_URL}/health" | head -c 200 || true
echo ""

echo "=== 2) Frame-cloud health (needs no admin token; mqttConnected = API linked to broker) ==="
curl -fsS "${API_URL}/api/frame-cloud/health" 2>&1 | head -c 400 || true
echo ""

echo "=== 3) MQTT broker listening (host) ==="
if command -v ss >/dev/null; then
  ss -ltnp 2>/dev/null | grep -E ':1883\b|:8883\b' || echo "  (no :1883/:8883 in ss output)"
elif command -v netstat >/dev/null; then
  netstat -ltnp 2>/dev/null | grep -E ':1883|:8883' || echo "  (no listener lines)"
else
  echo "  install ss or netstat"
fi

echo "=== 4) Mosquitto service (if installed) ==="
if command -v systemctl >/dev/null; then
  systemctl is-active mosquitto 2>/dev/null || systemctl is-active mosquitto.service 2>/dev/null || echo "  mosquitto unit not active or not installed"
else
  echo "  no systemctl"
fi

echo "=== 5) PM2 API logs (last 40 lines; look for [frame-mqtt] connected) ==="
if command -v pm2 >/dev/null; then
  pm2 logs myframe-api --lines 40 --nostream 2>/dev/null || pm2 logs --lines 40 --nostream 2>/dev/null || echo "  pm2 logs failed"
else
  echo "  pm2 not in PATH"
fi

echo "=== 6) Publish probe (optional; needs mosquitto-clients) ==="
if command -v mosquitto_pub >/dev/null; then
  echo "  Topic /inkjoyap/${MAC} — if broker rejects auth, check MQTT_URL creds in API .env"
  mosquitto_pub -h 127.0.0.1 -p 1883 -u device -P "${MQTT_PASS:-framepass2026}" \
    -t "/inkjoyap/${MAC}" -m '{"action":"ping","msgid":"diag"}' 2>&1 || true
else
  echo "  apt install mosquitto-clients to test publish"
fi

echo "=== 7) Frame image URL (PUBLIC_BASE_URL + /frame-media/...) ==="
echo "  Ensure the frame can HTTP GET that host from Wi‑Fi (same URL you put in PUBLIC_BASE_URL)."

echo ""
echo "Done."
