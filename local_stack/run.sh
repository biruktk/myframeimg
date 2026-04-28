#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f ".env" ]]; then
  echo "Missing web/local_stack/.env"
  echo "Create it from web/local_stack/.env.example first:"
  echo "  cp web/local_stack/.env.example web/local_stack/.env"
  exit 1
fi

docker compose --env-file .env up -d --build
docker compose ps
