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

cd "$(dirname "$0")/.."
ROOT="$PWD"

# SSH commands usually start a non-interactive shell, so NVM is not loaded and
# `node` may be visible while the matching `npm` is not. Select an installed
# NVM version that matches package.json, installing the required major if needed.
ensure_node_toolchain() {
  local nvm_home candidate version required_engine required_major active_version

  # First load any usable NVM runtime so this still works when a non-interactive
  # SSH shell exposes neither node nor npm. The loaded version may not match the
  # project yet; it is only used to read package.json and bootstrap the switch.
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    for candidate in "${NVM_DIR:-}" /root/.nvm; do
      [[ -n "$candidate" && -s "$candidate/nvm.sh" ]] || continue
      NVM_DIR="$candidate"
      export NVM_DIR
      # shellcheck disable=SC1090
      . "$NVM_DIR/nvm.sh"
      if nvm use --silent default >/dev/null 2>&1; then
        hash -r
        if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then break; fi
      fi

      version="$(find "$NVM_DIR/versions/node" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -V | tail -n 1)"
      if [[ -n "$version" ]] && nvm use --silent "$version" >/dev/null 2>&1; then
        hash -r
        if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then break; fi
      fi
    done
  fi

  required_engine="$(node -e 'process.stdout.write(require("./package.json").engines?.node ?? "")' 2>/dev/null || true)"
  if [[ "$required_engine" =~ ^([0-9]+)\.x$ ]]; then
    required_major="${BASH_REMATCH[1]}"
  else
    echo "✗ Cannot verify the project's Node.js engine requirement: ${required_engine:-missing} (expected an exact major such as 24.x)." >&2
    return 1
  fi

  toolchain_matches_project() {
    command -v node >/dev/null 2>&1 \
      && command -v npm >/dev/null 2>&1 \
      && [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" == "$required_major" ]]
  }

  if toolchain_matches_project; then return 0; fi

  for candidate in "${NVM_DIR:-}" /root/.nvm; do
    [[ -n "$candidate" && -s "$candidate/nvm.sh" ]] || continue
    nvm_home="$candidate"
    export NVM_DIR="$nvm_home"
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    if nvm use --silent default >/dev/null 2>&1; then
      hash -r
      if toolchain_matches_project; then return 0; fi
    fi

    version="$(find "$NVM_DIR/versions/node" -mindepth 1 -maxdepth 1 -type d -name "v${required_major}.*" -printf '%f\n' 2>/dev/null | sort -V | tail -n 1)"
    if [[ -z "$version" ]]; then
      echo "▶ Node.js ${required_engine} is not installed in NVM; installing the required runtime"
      if nvm install "$required_major" >/dev/null 2>&1; then
        version="$(nvm version "$required_major" 2>/dev/null || true)"
        [[ "$version" == "N/A" ]] && version=""
      fi
    fi
    if [[ -n "$version" ]] && nvm use --silent "$version" >/dev/null 2>&1; then
      hash -r
      if toolchain_matches_project; then return 0; fi
    fi
  done

  active_version="$(node -v 2>/dev/null || printf 'not installed')"
  echo "✗ This project requires Node.js ${required_engine} with npm; the active version is ${active_version}. Install Node.js ${required_major} (for NVM: nvm install ${required_major}) and rerun the deploy." >&2
  return 1
}

ensure_node_toolchain

APP="${PM2_APP:-minberiaksa}"
BRANCH="${BRANCH:-main}"

lock_before="$(sha1sum package-lock.json | cut -d' ' -f1)"
git pull --ff-only origin "$BRANCH"
lock_after="$(sha1sum package-lock.json | cut -d' ' -f1)"
DEPLOY_SHA="$(git rev-parse HEAD)"

if [[ -f scripts/ensure-inbox-media-tools.sh ]]; then bash scripts/ensure-inbox-media-tools.sh; fi

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

NODE_INTERPRETER="$(command -v node)"
echo "▶ reloading pm2 app '$APP' with $NODE_INTERPRETER"
if ! pm2 reload "$APP" --interpreter "$NODE_INTERPRETER" --update-env && ! pm2 restart "$APP" --interpreter "$NODE_INTERPRETER" --update-env; then
  echo "✗ PM2 reload failed; restoring the previous build and dependencies"
  rm -rf "$ROOT/.next"
  if [[ -d "$ROOT/.next-previous" ]]; then mv "$ROOT/.next-previous" "$ROOT/.next"; fi
  if [[ "$STAGED_DEPENDENCIES" == "1" && -d "$ROOT/.node_modules-previous" ]]; then
    rm -rf "$ROOT/node_modules"
    mv "$ROOT/.node_modules-previous" "$ROOT/node_modules"
  fi
  pm2 restart "$APP" --interpreter "$NODE_INTERPRETER" --update-env || true
  exit 1
fi

# vercel.json crons never fire off Vercel; schedule them in this crontab.
bash "$ROOT/scripts/vps-cron-install.sh"

if [[ "$STAGED_DEPENDENCIES" == "1" ]]; then
  echo "✓ deployed ${DEPLOY_SHA:0:7}. Previous dependencies: .node_modules-previous; previous build: .next-previous"
else
  echo "✓ deployed ${DEPLOY_SHA:0:7}. Previous build: .next-previous"
fi
