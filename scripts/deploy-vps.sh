#!/usr/bin/env bash
# Deploy on the VPS without changing the live build or dependencies while it builds.
#
#   bash scripts/deploy-vps.sh            (from the app folder, e.g. /root/minberiaksa)
#
# Next builds into `.next-build`; only a successful build is swapped into `.next`.
# If the installed direct dependencies differ from package-lock.json, a detached
# worktree gets a clean `npm ci` so the running app's node_modules stay untouched
# until the build is ready to activate.
#
# Env: PM2_APP (default: minberiaksa), BRANCH (default: main).
set -euo pipefail

APP="${PM2_APP:-minberiaksa}"
BRANCH="${BRANCH:-main}"
cd "$(dirname "$0")/.."
ROOT="$PWD"

lock_before="$(sha1sum package-lock.json | cut -d' ' -f1)"
git pull --ff-only origin "$BRANCH"
lock_after="$(sha1sum package-lock.json | cut -d' ' -f1)"
DEPLOY_SHA="$(git rev-parse HEAD)"

# A local npm install can rewrite package-lock.json on the VPS. Comparing the
# installed modules only to that working-tree lock would then bless the drift.
# The deploy must use the package manifest and lockfile committed at DEPLOY_SHA.
PACKAGE_FILES_DIRTY=0
if ! git diff --quiet "$DEPLOY_SHA" -- package.json package-lock.json; then
  PACKAGE_FILES_DIRTY=1
  echo "⚠ package.json or package-lock.json differs from the release commit; the build will use the committed dependency set"
fi

dependencies_match_lock() {
  node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const names = [...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.devDependencies || {})];
let mismatches = 0;
for (const name of names) {
  const expected = lock.packages?.[`node_modules/${name}`]?.version;
  let actual = '<missing>';
  try {
    actual = JSON.parse(fs.readFileSync(path.join('node_modules', name, 'package.json'), 'utf8')).version;
  } catch {}
  if (!expected || actual !== expected) {
    console.error(`  ${name}: installed ${actual}, lockfile ${expected || '<missing>'}`);
    mismatches++;
  }
}
process.exitCode = mismatches ? 1 : 0;
NODE
}

STAGE_ROOT=""
STAGE_APP=""
cleanup() {
  if [[ -n "$STAGE_APP" && -d "$STAGE_APP" ]]; then
    git -C "$ROOT" worktree remove --force "$STAGE_APP" >/dev/null 2>&1 || true
  fi
  if [[ -n "$STAGE_ROOT" && -d "$STAGE_ROOT" ]]; then
    rm -rf "$STAGE_ROOT"
  fi
}
trap cleanup EXIT

BUILD_ROOT="$ROOT"
STAGED_DEPENDENCIES=0
if [[ "$lock_before" != "$lock_after" || ! -d "$ROOT/node_modules" || "$PACKAGE_FILES_DIRTY" == "1" ]] || ! (cd "$ROOT" && dependencies_match_lock); then
  STAGED_DEPENDENCIES=1
  STAGE_ROOT="$(mktemp -d "$(dirname "$ROOT")/.$(basename "$ROOT").deploy.XXXXXX")"
  STAGE_APP="$STAGE_ROOT/app"
  echo "▶ dependency versions differ from package-lock.json; preparing an isolated clean install"
  git worktree add --detach "$STAGE_APP" "$DEPLOY_SHA"
  for env_file in .env .env.local .env.production .env.production.local; do
    if [[ -f "$ROOT/$env_file" ]]; then cp -p "$ROOT/$env_file" "$STAGE_APP/$env_file"; fi
  done
  echo "▶ npm ci in the isolated release worktree"
  (cd "$STAGE_APP" && npm ci)
  BUILD_ROOT="$STAGE_APP"
fi

echo "▶ building into .next-build"
rm -rf "$BUILD_ROOT/.next-build"
(
  cd "$BUILD_ROOT"
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144" NEXT_DIST_DIR=.next-build npm run build
)

if [[ "$STAGED_DEPENDENCIES" == "1" ]]; then
  echo "▶ activating lockfile-matched dependencies"
  rm -rf "$ROOT/.node_modules-previous"
  if [[ -d "$ROOT/node_modules" ]]; then mv "$ROOT/node_modules" "$ROOT/.node_modules-previous"; fi
  if ! mv "$STAGE_APP/node_modules" "$ROOT/node_modules"; then
    if [[ -d "$ROOT/.node_modules-previous" ]]; then mv "$ROOT/.node_modules-previous" "$ROOT/node_modules"; fi
    exit 1
  fi
fi

echo "▶ swapping builds"
rm -rf "$ROOT/.next-previous"
if [[ -d "$ROOT/.next" ]]; then mv "$ROOT/.next" "$ROOT/.next-previous"; fi
if ! mv "$BUILD_ROOT/.next-build" "$ROOT/.next"; then
  if [[ -d "$ROOT/.next-previous" ]]; then mv "$ROOT/.next-previous" "$ROOT/.next"; fi
  if [[ "$STAGED_DEPENDENCIES" == "1" && -d "$ROOT/.node_modules-previous" ]]; then
    rm -rf "$ROOT/node_modules"
    mv "$ROOT/.node_modules-previous" "$ROOT/node_modules"
  fi
  exit 1
fi

echo "▶ reloading pm2 app '$APP'"
if ! pm2 reload "$APP" --update-env && ! pm2 restart "$APP" --update-env; then
  echo "✗ PM2 reload failed; restoring the previous build and dependencies"
  rm -rf "$ROOT/.next"
  if [[ -d "$ROOT/.next-previous" ]]; then mv "$ROOT/.next-previous" "$ROOT/.next"; fi
  if [[ "$STAGED_DEPENDENCIES" == "1" && -d "$ROOT/.node_modules-previous" ]]; then
    rm -rf "$ROOT/node_modules"
    mv "$ROOT/.node_modules-previous" "$ROOT/node_modules"
  fi
  pm2 restart "$APP" --update-env || true
  exit 1
fi

# vercel.json crons never fire off Vercel; schedule them in this crontab.
bash "$ROOT/scripts/vps-cron-install.sh"

if [[ "$STAGED_DEPENDENCIES" == "1" ]]; then
  echo "✓ deployed ${DEPLOY_SHA:0:7}. Previous dependencies: .node_modules-previous; previous build: .next-previous"
else
  echo "✓ deployed ${DEPLOY_SHA:0:7}. Previous build: .next-previous"
fi
