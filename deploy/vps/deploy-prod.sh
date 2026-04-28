#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VPS_DIR="${ROOT_DIR}/deploy/vps"
ENV_FILE="${VPS_DIR}/.env.prod"
COMPOSE_FILE="${VPS_DIR}/docker-compose.prod.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Create it from web/deploy/vps/.env.prod.example"
  exit 1
fi

bash "${VPS_DIR}/preflight-check.sh"

echo "[myframe] Building and deploying production containers..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build

echo "[myframe] Deployment complete."
echo "Check status:"
echo "  docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} ps"
echo "  docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} logs -f --tail=100"
