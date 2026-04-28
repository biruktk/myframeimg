#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DATA="${ROOT_DIR}/server/data"
SRC_UPLOADS="${ROOT_DIR}/server/uploads"
DST_BASE="${ROOT_DIR}/backups"
TS="$(date +%Y%m%d-%H%M%S)"
DST="${DST_BASE}/${TS}"

mkdir -p "${DST}"
mkdir -p "${SRC_DATA}" "${SRC_UPLOADS}"

tar -czf "${DST}/server-data.tgz" -C "${ROOT_DIR}/server" data uploads

echo "Backup created: ${DST}/server-data.tgz"
