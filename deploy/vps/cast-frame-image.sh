#!/usr/bin/env bash
# Push one MQTT play to the frame (same payload as API). Runs from repo root paths.
set -euo pipefail

BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../backend" && pwd)"
exec node "${BACKEND}/scripts/cast-to-frame.cjs" "$@"
