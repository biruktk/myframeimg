#!/usr/bin/env bash
# Local dev without Docker — run API and web in two terminals.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "${ROOT}/.." && pwd)"
BACKEND="${WEB_ROOT}/backend"

echo "[local] This repo no longer uses Docker for local_stack."
echo ""
echo "Terminal 1 — API:"
echo "  cd ${BACKEND} && cp -n .env.example .env && npm install && npm run dev"
echo ""
echo "Terminal 2 — Next app:"
echo "  cd ${WEB_ROOT} && cp -n .env.example .env && npm install && npm run dev"
echo ""
echo "Optional: merge env from ${ROOT}/.env.example into web/backend/.env (MQTT, PUBLIC_BASE_URL, tokens)."
