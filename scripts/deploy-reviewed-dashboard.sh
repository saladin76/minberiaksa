#!/usr/bin/env bash
# Run on the VPS: bash scripts/deploy-reviewed-dashboard.sh <reviewed 40-character commit>
# Builds with the existing isolated deploy, then probes only public settings.
set -euo pipefail
cd "${APP_DIR:-$(dirname "$0")/..}"
ROOT="$PWD"
# APP_DIR selects this wrapper's working directory only. Keeping it exported
# would redirect nested deployment fixtures into the live repository during build.
unset APP_DIR
TARGET="${1:-}"
# The same runner is used for releases from different branches. Fetch the
# immutable reviewed commit by default, never an unrelated legacy branch.
# An explicit SOURCE_BRANCH still requires its remote head to match TARGET.
SOURCE_BRANCH="${SOURCE_BRANCH:-$TARGET}"
APP="${PM2_APP:-minberiaksa}"
if [[ ! "$TARGET" =~ ^[a-f0-9]{40}$ ]]; then echo "Pass the reviewed full commit SHA." >&2; exit 1; fi
# Manual invocations share the detached runner's lock. The runner already holds
# it for deployment AND provider setup, so only its child skips reacquisition.
if [[ "${MINBER_RELEASE_JOB_LOCK_HELD:-}" != "1" ]]; then
  LOCK_ROOT="${RELEASE_JOBS_DIR:-$(dirname "$ROOT")/minberi-release-jobs}"
  mkdir -p "$LOCK_ROOT"
  exec 9>"$LOCK_ROOT/release.lock"
  if ! flock --nonblock 9; then echo "Another reviewed release is running; nothing deployed." >&2; exit 75; fi
fi
unset MINBER_RELEASE_JOB_LOCK_HELD
if ! git diff --quiet || ! git diff --cached --quiet; then echo "Tracked local edits need to be preserved before deployment." >&2; exit 1; fi
echo "▶ verifying reviewed source $TARGET from origin ($SOURCE_BRANCH)"
git fetch origin "$SOURCE_BRANCH"
if [[ "$(git rev-parse FETCH_HEAD)" != "$TARGET" ]]; then echo "Remote head differs from the reviewed commit; nothing deployed." >&2; exit 1; fi
if ! git merge-base --is-ancestor HEAD "$TARGET"; then echo "Current source is not an ancestor; no merge or reset performed." >&2; exit 1; fi
PREVIOUS="$(git rev-parse HEAD)"
BACKUP_ROOT="${RELEASE_BACKUPS_DIR:-$(dirname "$ROOT")/minberi-release-backups}"
BACKUP="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-${TARGET:0:8}"
mkdir -p "$BACKUP"
printf '%s\n' "$PREVIOUS" > "$BACKUP/previous-source.txt"
printf '%s\n' "$TARGET" > "$BACKUP/target-source.txt"
git merge --ff-only "$TARGET"
set +e
BRANCH="$TARGET" PM2_APP="$APP" bash scripts/deploy-vps.sh 2>&1 | tee "$BACKUP/deploy.log"
DEPLOY_STATUS=${PIPESTATUS[0]}
set -e
if [[ "$DEPLOY_STATUS" != "0" ]]; then echo "Deployment stopped; inspect $BACKUP/deploy.log" >&2; exit "$DEPLOY_STATUS"; fi

healthy() {
  local attempt base
  for attempt in 1 2 3 4 5 6; do
    for base in http://localhost:3000 'http://[::1]:3000' http://127.0.0.1:3000; do
      if curl --noproxy '*' --fail --silent --show-error --max-time 3 "$base/api/global-settings" --output /dev/null 2>/dev/null; then return 0; fi
    done
    [[ "$attempt" == "6" ]] || sleep 2
  done
  return 1
}
if healthy; then echo "Reviewed release $TARGET responds. Deployment record: $BACKUP"; exit 0; fi

echo "Public settings did not respond; restoring the previous runtime." >&2
if [[ ! -d "$ROOT/.next-previous" ]]; then echo "No previous build found. Inspect PM2 and $BACKUP/deploy.log." >&2; exit 1; fi
mv "$ROOT/.next" "$BACKUP/failed-build"
mv "$ROOT/.next-previous" "$ROOT/.next"
if grep -q -F 'activating lockfile-matched dependencies' "$BACKUP/deploy.log"; then
  if [[ ! -d "$ROOT/.node_modules-previous" ]]; then echo "Previous dependencies missing; inspect $BACKUP." >&2; exit 1; fi
  mv "$ROOT/node_modules" "$BACKUP/failed-node_modules"
  mv "$ROOT/.node_modules-previous" "$ROOT/node_modules"
fi
if git diff --quiet && git diff --cached --quiet; then git switch --detach "$PREVIOUS"; fi
if ! command -v pm2 >/dev/null 2>&1; then
  for NVM_PATH in "${NVM_DIR:-/root/.nvm}" /root/.nvm; do
    if [[ -s "$NVM_PATH/nvm.sh" ]]; then
      export NVM_DIR="$NVM_PATH"
      # shellcheck disable=SC1090
      . "$NVM_DIR/nvm.sh"
      nvm use --silent default >/dev/null 2>&1 || true
      command -v pm2 >/dev/null 2>&1 && break
    fi
  done
fi
pm2 restart "$APP" --update-env
echo "Previous runtime restored. Inspect $BACKUP before retrying." >&2
exit 1
