#!/usr/bin/env bash
# Deploy on the VPS without serving a half-built site.
#
#   bash scripts/deploy-vps.sh            (from the app folder, e.g. /root/minberiaksa)
#
# `next build` straight into `.next` rewrites the folder the running server
# reads. Until pm2 restarts, the old process mixes both builds: "Failed to load
# external module @prisma/client-<hash>", "client reference manifest ... does
# not exist", missing 500.html. So the build goes to `.next-build`
# (NEXT_DIST_DIR, see next.config.ts); only when it succeeds is it swapped in
# and pm2 reloaded. A failed build leaves the live site untouched.
#
# Env: PM2_APP (default: minberiaksa), BRANCH (default: main).
set -euo pipefail

APP="${PM2_APP:-minberiaksa}"
BRANCH="${BRANCH:-main}"
cd "$(dirname "$0")/.."

lock_before="$(sha1sum package-lock.json | cut -d' ' -f1)"
git pull --ff-only origin "$BRANCH"
lock_after="$(sha1sum package-lock.json | cut -d' ' -f1)"

# `npm ci` deletes node_modules, which the live server still loads from, so it
# only runs when the dependencies actually changed.
if [ "$lock_before" != "$lock_after" ] || [ ! -d node_modules ]; then
  echo "▶ dependencies changed  npm ci"
  npm ci
fi

echo "▶ building into .next-build"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

echo "▶ swapping builds"
rm -rf .next-previous
if [ -d .next ]; then mv .next .next-previous; fi
mv .next-build .next

echo "▶ reloading pm2 app '$APP'"
pm2 reload "$APP" --update-env || pm2 restart "$APP" --update-env

echo "✓ deployed $(git rev-parse --short HEAD). Roll back: mv .next .next-broken && mv .next-previous .next && pm2 reload $APP"
