#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/deploy/vps/.env.prod"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  echo "Create it from web/deploy/vps/.env.prod.example"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

fail() {
  echo "ERROR: $1"
  exit 1
}

warn() {
  echo "WARN: $1"
}

ok() {
  echo "OK: $1"
}

required_non_empty() {
  local name="$1"
  local value="${!name-}"
  [[ -n "${value}" ]] || fail "${name} is required and cannot be empty"
  ok "${name} is set"
}

check_domain_like() {
  local name="$1"
  local value="${!name-}"
  [[ "${value}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "${name} must look like a domain (got: ${value})"
  ok "${name} format looks valid"
}

check_not_placeholder() {
  local name="$1"
  local value="${!name-}"
  [[ "${value}" != CHANGE_ME* ]] || fail "${name} still uses placeholder value"
  [[ "${value}" != "changeme" ]] || fail "${name} uses weak placeholder"
  ok "${name} is not placeholder"
}

check_token_strength() {
  local name="$1"
  local value="${!name-}"
  (( ${#value} >= 24 )) || fail "${name} should be at least 24 characters"
  ok "${name} length looks good"
}

echo "[myframe] Running preflight check..."

required_non_empty APP_DOMAIN
required_non_empty API_DOMAIN
required_non_empty CORS_ORIGINS
required_non_empty FRAME_PAIRING_TOKEN
required_non_empty ADMIN_TOKEN

check_domain_like APP_DOMAIN
check_domain_like API_DOMAIN
check_not_placeholder FRAME_PAIRING_TOKEN
check_not_placeholder ADMIN_TOKEN
check_token_strength FRAME_PAIRING_TOKEN
check_token_strength ADMIN_TOKEN

if [[ "${CORS_ORIGINS}" != *"${APP_DOMAIN}"* ]]; then
  warn "CORS_ORIGINS does not include APP_DOMAIN (${APP_DOMAIN})"
else
  ok "CORS_ORIGINS includes APP_DOMAIN"
fi

if [[ -n "${MQTT_URL:-}" ]]; then
  required_non_empty PUBLIC_BASE_URL
  required_non_empty FRAME_API_SECRET
  ok "MQTT_URL set (broker bridge enabled)"
fi

if [[ "${UPLOADS_PER_MINUTE:-}" =~ ^[0-9]+$ ]]; then
  ok "UPLOADS_PER_MINUTE is numeric"
else
  fail "UPLOADS_PER_MINUTE must be numeric"
fi

echo "[myframe] Preflight passed."
