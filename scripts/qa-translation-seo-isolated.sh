#!/usr/bin/env bash
# Isolated QA for integration PR #149. NO merge/deployment, migration, cron,
# payments, database write, or inherited production secrets.
set -Eeuo pipefail
ROOT=/root/minberiaksa
BRANCH=integration/translation-seo-20261107
QA_ROOT=/root/minber-media-recovery/translation-seo-qa
die(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
test -d "$ROOT/.git" || test -f "$ROOT/.git" || die "Missing production Git checkout."
test -d "$ROOT/node_modules" || die "Dependencies missing; do not install on production."
if test -r /root/.nvm/nvm.sh; then
  export NVM_DIR=/root/.nvm
  . "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null || die "Node 24 unavailable."
fi
node -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1)' || die "Node 24 required."
cd "$ROOT"
git fetch --no-tags origin "$BRANCH" || die "Cannot fetch integration."
sha=$(git rev-parse FETCH_HEAD)
short=$(printf "%s" "$sha" | cut -c1-12)
current=$(git rev-parse HEAD)
work="$QA_ROOT/worktrees/$short"
logs="$QA_ROOT/reports/$short"
mkdir -p "$QA_ROOT/worktrees" "$logs"
if [ ! -d "$work" ]; then
  git worktree add --detach "$work" "$sha" || die "Cannot create isolated QA worktree."
fi
test "$(git -C "$work" rev-parse HEAD)" = "$sha" || die "Wrong worktree SHA."
test ! -e "$work/.env" && test ! -e "$work/.env.local" && test ! -e "$work/.env.production" || die "QA worktree unexpectedly has environment files."
if [ ! -e "$work/node_modules" ]; then ln -s "$ROOT/node_modules" "$work/node_modules"; fi
printf 'QA_SHA=%s\nWORKTREE=%s\nREPORTS=%s\n' "$sha" "$work" "$logs"
failures=0
run(){
  name="$1"; shift
  printf '\nRUN %s\n' "$name"
  if (cd "$work" && env -i \
    HOME=/root PATH="$PATH" \
    NODE_ENV=production NODE_OPTIONS=--max-old-space-size=8192 \
    DATABASE_URL='mongodb://127.0.0.1:27018/minberi_fixture?serverSelectionTimeoutMS=500&connectTimeoutMS=500' \
    GOOGLE_CLIENT_ID=fixture-client GOOGLE_CLIENT_SECRET=fixture-secret \
    NEXTAUTH_SECRET=fixture-auth-build-secret NEXTAUTH_URL=http://127.0.0.1:3106 \
    STRIPE_SECRET_KEY=sk_test_fixture_no_network \
    CONTENT_EDITOR_ARTIFACTS=.artifacts/public-build \
    "$@" > "$logs/$name.log" 2>&1); then
    printf 'PASS %s\n' "$name"
  else
    printf 'FAIL %s — %s\n' "$name" "$logs/$name.log"
    tail -n 10 "$logs/$name.log" || true
    failures=$((failures+1))
  fi
}
run diff-check git diff --check origin/main..."$sha"
run content-editors npm run test:content-editors
run integration-settings npm run test:integration-settings
run typecheck-content npm run typecheck:content-editor-service
run typecheck-communication npm run typecheck:communication-runtime
run typecheck-integration npm run typecheck:integration-release
run typecheck-baseline npm run typecheck:baseline
run lint npm run lint:ci
run i18n npm run i18n:audit:strict
run locales npm run locale:audit:strict
run release-preflight npm run preflight:release-metadata
# Never use npm run build; its scripts can update production indexes.
run isolated-next-build ./node_modules/.bin/next build
test "$(git -C "$ROOT" rev-parse HEAD)" = "$current" || die "Production checkout moved during QA."
printf '\nQA_SHA=%s\nFAILURES=%s\nREPORTS=%s\nPRODUCTION_UNCHANGED=YES\n' "$sha" "$failures" "$logs"
if [ "$failures" -ne 0 ]; then
  printf 'QA_RESULT=FAILED_NO_MERGE_NO_DEPLOY\n'
  exit 1
fi
printf 'QA_RESULT=PASSED_SOURCE_CHECKS_BUT_BROWSER_AND_STAGING_QA_STILL_REQUIRED\n'
