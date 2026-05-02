#!/usr/bin/env bash
# RUN ON THE VPS. Watch MQTT traffic between the frames and Mosquitto in real time.
#
# Architecture:
# - Frames normally publish telemetry to Mosquitto.
# - This API listens on: /device/report/+ (see backend src/services/frame_mqtt.ts).
# - The API sends remote image commands on: /inkjoyap/<12-hex-MAC_UPPERCASE>.
#
# Usage:
#   bash watch-frame-mqtt.sh
# Or override broker user/pass/host:
#   MQTT_HOST=127.0.0.1 MQTT_USER=device MQTT_PASS=framepass2026 bash watch-frame-mqtt.sh

set -euo pipefail

HOST="${MQTT_HOST:-127.0.0.1}"
PORT="${MQTT_PORT:-1883}"
USER="${MQTT_USER:-device}"
PASS="${MQTT_PASS:-framepass2026}"

command -v mosquitto_sub >/dev/null || {
  echo "Install: sudo apt install -y mosquitto-clients"
  exit 1
}

echo "--- MyFrame MQTT watch (Ctrl+C stops) ---"
echo "broker: mqtt://${HOST}:${PORT} user=${USER}"
echo ""
echo "Most useful topics for this codebase:"
echo "  • Frame → broker (login, heart, play_ack):            /device/report/#"
echo "  • VPS → frame (upload/cast emits play HERE):           /inkjoyap/#"
echo ""
echo 'If you only watched /inkjoyap/<MAC>, note: messages with action "play" are usually published'
echo 'BY your API (commands to the frame), not proof the frame acknowledged.'
echo 'Frame login / play_ack / heart appear under /device/report/# (see files/9_API_DOCUMENTATION.md).'
echo ""
echo "--- Subscribing to both patterns (verbose topic + payload) ---"
exec mosquitto_sub -h "${HOST}" -p "${PORT}" -u "${USER}" -P "${PASS}" \
  -t '/device/report/#' \
  -t '/inkjoyap/#' \
  -v \
  --keepalive 120
