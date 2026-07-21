#!/usr/bin/env bash
# =============================================================================
# Run on the VPS (SSH as root or deploy user). Collects MyFrame API + MQTT +
# image-download checks so we can see why the frame does not refresh.
#
# Usage:
#   sudo bash diagnose-frame-on-vps.sh
#   BACKEND_DIR=/var/www/myframe/backend bash diagnose-frame-on-vps.sh
#   bash diagnose-frame-on-vps.sh --mqtt    # 15s sniff (upload from phone while it runs)
#
# Optional env:
#   API_URL=http://127.0.0.1:3001
#   MQTT_PASS   (default framepass2026)
# =============================================================================
set +e
set -u

API_URL="${API_URL:-http://127.0.0.1:3001}"
MQTT_USER="${MQTT_USER:-device}"
MQTT_PASS="${MQTT_PASS:-framepass2026}"
MQTT_HOST="${MQTT_HOST:-127.0.0.1}"
MQTT_PORT="${MQTT_PORT:-1883}"

hr() { printf '\n%s\n' "----------------------------------------"; }

# --- locate backend (where .env + uploads live) ----------------------------
BACKEND_DIR="${BACKEND_DIR:-}"
if [[ -z "${BACKEND_DIR}" ]]; then
  for d in /var/www/myframe/backend /var/www/myframe/web/backend "$(pwd)"; do
    if [[ -f "${d}/package.json" ]] && grep -q '"name".*myframe-server' "${d}/package.json" 2>/dev/null; then
      BACKEND_DIR="${d}"
      break
    fi
  done
fi

if [[ -z "${BACKEND_DIR}" || ! -f "${BACKEND_DIR}/package.json" ]]; then
  echo "Could not find backend (myframe-server package.json). Set BACKEND_DIR=/path/to/backend"
  exit 1
fi

ENV_FILE="${BACKEND_DIR}/.env"
UPLOADS_DIR="${BACKEND_DIR}/uploads"

redact_url_creds() {
  # mqtt://user:pass@host → mqtt://user:***@host
  sed -E 's#(//[^/]*:)[^@]{1,120}@#\1***@#g' <<<"$1"
}

get_env_kv() {
  local key="$1"
  [[ -f "${ENV_FILE}" ]] || return 0
  grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | tail -1 | sed "s/^${key}=//" | tr -d '"' | tr -d "'"
}

PUBLIC_BASE_URL="$(get_env_kv PUBLIC_BASE_URL)"

hr
echo "MyFrame VPS diagnosis  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "BACKEND_DIR=${BACKEND_DIR}"
echo "ENV_FILE=${ENV_FILE}  (exists: $([[ -f "${ENV_FILE}" ]] && echo yes || echo no))"

hr
echo "=== 1) Listener: who owns :3001 (should be ONE node) ==="
if command -v ss >/dev/null; then
  ss -ltnp 2>/dev/null | grep ':3001' || echo "(nothing on 3001?)"
else
  netstat -ltnp 2>/dev/null | grep 3001 || true
fi

hr
echo "=== 2) PM2 (if installed) ==="
if command -v pm2 >/dev/null; then
  pm2 ls 2>/dev/null || true
  echo "--- last 30 lines myframe-api ---"
  pm2 logs myframe-api --lines 30 --nostream 2>/dev/null || echo "(no app named myframe-api)"
else
  echo "pm2 not in PATH"
fi

hr
echo "=== 3) API health (local) ==="
curl -sS -m 8 "${API_URL}/health" && echo "" || echo "curl health failed"

echo "=== 4) Frame-cloud health (mqttConnected, publicBaseUrl) ==="
curl -sS -m 8 "${API_URL}/api/frame-cloud/health" && echo "" || echo "curl failed"

hr
echo "=== 5) Mosquitto ==="
if command -v systemctl >/dev/null; then
  systemctl is-active mosquitto 2>/dev/null || systemctl is-active mosquitto.service 2>/dev/null || true
fi
if command -v ss >/dev/null; then
  ss -ltnp 2>/dev/null | grep ":${MQTT_PORT}\\b" || echo "(no broker on ${MQTT_PORT}?)"
fi

hr
echo "=== 6) .env summary (no secrets printed raw) ==="
if [[ -f "${ENV_FILE}" ]]; then
  MURL="$(get_env_kv MQTT_URL)"
  echo "PUBLIC_BASE_URL=$(get_env_kv PUBLIC_BASE_URL)"
  echo "MQTT_URL=$(redact_url_creds "${MURL}")"
  echo "MQTT_PLAY_FULL_IMGURL=$(get_env_kv MQTT_PLAY_FULL_IMGURL)"
  echo "FRAME_MQTT_DEBUG=$(get_env_kv FRAME_MQTT_DEBUG)"
else
  echo "No .env — API may be using shell env only."
fi

hr
echo "=== 7) Recent uploads (newest first) ==="
if [[ -d "${UPLOADS_DIR}" ]]; then
  ls -lt "${UPLOADS_DIR}" 2>/dev/null | head -12
else
  echo "No uploads dir: ${UPLOADS_DIR}"
fi

LATEST=""
LATEST=$(find "${UPLOADS_DIR}" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' -o -name '*.webp' -o -name '*.bin' \) -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [[ -z "${LATEST}" ]]; then
  LATEST=$(ls -t "${UPLOADS_DIR}"/* 2>/dev/null | head -1)
fi

hr
echo "=== 8) HTTP GET test: /frame-media/<latest> ==="
if [[ -n "${LATEST}" && -f "${LATEST}" ]]; then
  FN="$(basename "${LATEST}")"
  echo "Latest file: ${FN}"
  ENC_PATH="/frame-media/$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "${FN}" 2>/dev/null || echo "${FN}")"
  echo "Path: ${ENC_PATH}"
  echo "--- curl via 127.0.0.1 (server local) ---"
  curl -sS -m 15 -o /dev/null -w "HTTP %{http_code}  bytes=%{size_download}\n" "${API_URL}${ENC_PATH}" || echo "curl failed"
  if [[ -n "${PUBLIC_BASE_URL}" ]]; then
    BASE_TR="${PUBLIC_BASE_URL%/}"
    echo "--- curl via PUBLIC_BASE_URL (${BASE_TR}) ---"
    curl -sS -m 15 -o /dev/null -w "HTTP %{http_code}  bytes=%{size_download}\n" "${BASE_TR}${ENC_PATH}" || echo "curl failed"
  fi
else
  echo "No upload file found to test."
fi

hr
echo "=== 9) Example MQTT play payload (path-style imgurl — match backend frame_mqtt.ts) ==="
if [[ -n "${LATEST}" && -n "${PUBLIC_BASE_URL}" ]]; then
  FN="$(basename "${LATEST}")"
  PUB_TR="${PUBLIC_BASE_URL%/}"
  if [[ "${PUB_TR}" == https://* ]]; then PPORT_DEF=443; else PPORT_DEF=80; fi
  REST="${PUB_TR#*://}"
  HOSTPORT="${REST%%/*}"
  if [[ "${HOSTPORT}" == *:* ]]; then
    PUBHOST="${HOSTPORT%%:*}"
    PPORT_FINAL="${HOSTPORT##*:}"
  else
    PUBHOST="${HOSTPORT}"
    PPORT_FINAL="${PPORT_DEF}"
  fi
  SAFE_FN="$(FN="${FN}" python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['FN'], safe=''))" 2>/dev/null)"
  [[ -n "${SAFE_FN}" ]] || SAFE_FN="${FN}"
  echo "{\"action\":\"play\",\"msgid\":\"…\",\"stamac\":\"YOUR_MAC\",\"data\":{\"host\":\"${PUBHOST}\",\"port\":${PPORT_FINAL},\"imgs\":[{\"imgid\":\"…\",\"imgurl\":\"/frame-media/${SAFE_FN}\"}]}}"
  echo "If firmware still fails, try HTTPS:443 + reverse proxy (some devices block http:3001)."
else
  echo "Need PUBLIC_BASE_URL and a file in uploads to synthesize payload."
fi

hr
echo "=== 10) Optional: mosquitto publish test (harmless ping topic) ==="
if command -v mosquitto_pub >/dev/null; then
  mosquitto_pub -h "${MQTT_HOST}" -p "${MQTT_PORT}" -u "${MQTT_USER}" -P "${MQTT_PASS}" \
    -t '/inkjoyap/MQTT_TEST_PING_SHOULD_IGNORE' \
    -m '{"action":"diag","msgid":"0"}' 2>&1 && echo "(publish OK — broker accepts this user/pass)" \
    || echo "mosquitto_pub failed — check passwd / acl / listener"
else
  echo "apt install -y mosquitto-clients"
fi

hr
echo "DONE."
echo ""
echo "Next:"
echo "  • If step 8 is not HTTP 200, Express static or PUBLIC_BASE_URL is wrong."
echo "  • Upload from phone WHILE running:  bash $0 --mqtt"
echo "  • play_ack result 113/107 = good; 104 after 106 = download/format issue on firmware."

if [[ "${1:-}" == "--mqtt" ]]; then
  hr
  echo "=== LIVE MQTT sniff (15s) — START AN UPLOAD NOW ==="
  if ! command -v mosquitto_sub >/dev/null; then
    echo "apt install -y mosquitto-clients"; exit 0
  fi
  if command -v timeout >/dev/null; then
    timeout 15 mosquitto_sub -h "${MQTT_HOST}" -p "${MQTT_PORT}" -u "${MQTT_USER}" -P "${MQTT_PASS}" \
      -t '/device/report/#' -t '/inkjoyap/#' -v 2>/dev/null || true
  else
    mosquitto_sub -h "${MQTT_HOST}" -p "${MQTT_PORT}" -u "${MQTT_USER}" -P "${MQTT_PASS}" \
      -t '/device/report/#' -t '/inkjoyap/#' -v -C 25 2>/dev/null || true
  fi
  echo "(sniff ended)"
fi
