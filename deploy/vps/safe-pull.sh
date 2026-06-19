#!/usr/bin/env bash
# Safe git pull on the VPS — keeps secrets, data, and server-only edits recoverable.
#
# Usage (from repo root on VPS):
#   bash deploy/vps/safe-pull.sh              # audit → backup → pull → deploy
#   bash deploy/vps/safe-pull.sh --dry-run    # show what would happen, no changes
#   bash deploy/vps/safe-pull.sh --pull-only  # skip npm build / PM2 restart
#   bash deploy/vps/safe-pull.sh --no-deploy  # pull + backup only
#
# Git rebase on VPS is possible but NOT recommended for production (rewrites history,
# conflicts are harder to undo). This script uses `git pull --no-rebase` (merge).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${ROOT}/backups/vps-pull-${TS}"
DRY_RUN=0
PULL_ONLY=0
NO_DEPLOY=0

for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=1 ;;
    --pull-only) PULL_ONLY=1 ;;
    --no-deploy) NO_DEPLOY=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: ${arg}"; exit 1 ;;
  esac
done

cd "${ROOT}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: ${ROOT} is not a git repository."
  exit 1
fi

BRANCH="$(git branch --show-current)"
UPSTREAM="$(git rev-parse --abbrev-ref "@{u}" 2>/dev/null || true)"
REMOTE="${UPSTREAM%%/*}"
REMOTE="${REMOTE:-origin}"
MERGE_BRANCH="${UPSTREAM#*/}"
MERGE_BRANCH="${MERGE_BRANCH:-main}"

run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

section() {
  echo ""
  echo "==> $*"
}

section "Git audit (${BRANCH}, remote ${REMOTE}/${MERGE_BRANCH})"
git status -sb
echo ""

if git diff --quiet && git diff --cached --quiet; then
  echo "Working tree: clean (no uncommitted tracked changes)"
  DIRTY=0
else
  echo "Working tree: DIRTY — you have uncommitted changes to tracked files:"
  git diff --stat
  git diff --cached --stat 2>/dev/null || true
  DIRTY=1
fi

UNTRACKED="$(git ls-files --others --exclude-standard | head -20 || true)"
if [[ -n "${UNTRACKED}" ]]; then
  echo ""
  echo "Untracked files (first 20 — usually safe; .env is gitignored):"
  echo "${UNTRACKED}"
fi

section "Fetch ${REMOTE}"
run git fetch "${REMOTE}"

BEHIND=0
AHEAD=0
if git rev-parse "${REMOTE}/${MERGE_BRANCH}" >/dev/null 2>&1; then
  BEHIND="$(git rev-list --count "HEAD..${REMOTE}/${MERGE_BRANCH}" 2>/dev/null || echo 0)"
  AHEAD="$(git rev-list --count "${REMOTE}/${MERGE_BRANCH}..HEAD" 2>/dev/null || echo 0)"
  echo "Commits behind ${REMOTE}/${MERGE_BRANCH}: ${BEHIND}"
  echo "Commits ahead (local-only, not on GitHub): ${AHEAD}"
  if [[ "${BEHIND}" -gt 0 ]]; then
    echo "Incoming commits:"
    git log --oneline "HEAD..${REMOTE}/${MERGE_BRANCH}" | head -15
  fi
  if [[ "${AHEAD}" -gt 0 ]]; then
    echo ""
    echo "WARNING: VPS has ${AHEAD} commit(s) not pushed to GitHub."
    echo "  Save them before pull:  git format-patch ${REMOTE}/${MERGE_BRANCH}..HEAD -o ${BACKUP_DIR}/local-commits"
    echo "  Or push a branch:       git push ${REMOTE} ${BRANCH}:vps-backup-$(date +%Y%m%d)"
  fi
else
  echo "WARN: ${REMOTE}/${MERGE_BRANCH} not found after fetch."
fi

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo ""
  echo "[dry-run] Would backup → pull → deploy. Re-run without --dry-run to apply."
  exit 0
fi

section "Backup VPS state → ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# Secrets & config (never rely on git for these)
for f in \
  "${ROOT}/.env" \
  "${ROOT}/backend/.env" \
  "${SCRIPT_DIR}/.env.prod" \
  ; do
  if [[ -f "${f}" ]]; then
    cp -a "${f}" "${BACKUP_DIR}/"
    echo "  backed up $(basename "${f}")"
  fi
done

# Live DB + uploads (API runtime data)
for d in "${ROOT}/backend/data" "${ROOT}/backend/uploads" "${ROOT}/server/data" "${ROOT}/server/uploads"; do
  if [[ -d "${d}" ]]; then
    name="$(echo "${d}" | sed "s|${ROOT}/||" | tr '/' '-')"
    tar -czf "${BACKUP_DIR}/${name}.tgz" -C "${d}" . 2>/dev/null || true
    echo "  backed up ${d}"
  fi
done

if [[ "${DIRTY}" -eq 1 ]]; then
  git diff > "${BACKUP_DIR}/uncommitted.patch"
  git diff --cached > "${BACKUP_DIR}/staged.patch" 2>/dev/null || true
  echo "  saved uncommitted.patch (+ staged.patch if any)"
  echo ""
  echo "Stashing tracked changes before pull (pop after deploy if you still need them):"
  git stash push -m "vps-safe-pull-${TS}" --include-untracked=false || true
  STASHED=1
else
  STASHED=0
fi

section "Git pull (merge, not rebase)"
if [[ "${BEHIND}" -eq 0 ]]; then
  echo "Already up to date with ${REMOTE}/${MERGE_BRANCH}."
else
  git pull --no-rebase "${REMOTE}" "${MERGE_BRANCH}"
fi

if [[ "${STASHED}" -eq 1 ]]; then
  section "Restore stashed VPS edits"
  if git stash list | head -1 | grep -q "vps-safe-pull-${TS}"; then
    echo "Attempting: git stash pop"
    if ! git stash pop; then
      echo ""
      echo "CONFLICT after stash pop — your VPS edits conflict with upstream."
      echo "  Your stash is kept. List: git stash list"
      echo "  Your patch backup: ${BACKUP_DIR}/uncommitted.patch"
      echo "  Resolve conflicts, then move changes to a branch and commit locally:"
      echo "    git checkout -b vps/server-fixes"
      echo "    git add -p && git commit -m 'VPS server fixes'"
      echo "  Then cherry-pick or merge that branch on your Mac and push to GitHub."
      exit 1
    fi
  fi
fi

if [[ "${PULL_ONLY}" -eq 1 ]] || [[ "${NO_DEPLOY}" -eq 1 ]]; then
  echo ""
  echo "Pull complete. Skipping deploy (--pull-only / --no-deploy)."
  echo "Backup: ${BACKUP_DIR}"
  exit 0
fi

section "Deploy (deploy-after-pull.sh)"
bash "${SCRIPT_DIR}/deploy-after-pull.sh"

echo ""
echo "Safe pull finished."
echo "  Backup: ${BACKUP_DIR}"
echo "  Smoke:  bash deploy/vps/smoke-test.sh myframe.ink api.myframe.ink \"\$(grep ADMIN_TOKEN backend/.env | cut -d= -f2)\""
