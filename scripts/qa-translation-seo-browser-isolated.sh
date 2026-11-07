#!/usr/bin/env bash
# Isolated, fixture-only browser QA for translation/SEO integration.
# No production database or provider credentials, no deploy, no migrations.
set -Eeuo pipefail
ROOT=/root/minberiaksa
QA_ROOT=/root/minber-media-recovery/translation-seo-browser-qa
BRANCH=${QA_BRANCH:-fix/translation-seo-release-gates-20261107}
die(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
test -d "$ROOT/.git" || die "Production checkout missing"
test -d "$ROOT/node_modules" && test ! -L "$ROOT/node_modules" || die "Production node_modules unavailable"
if test -r /root/.nvm/nvm.sh; then
  export NVM_DIR=/root/.nvm
  . "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null || die "Node 24 unavailable"
fi
node -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1)' || die "Node 24 required"
cd "$ROOT"
original=$(git rev-parse HEAD)
git fetch --no-tags origin "$BRANCH" || die "Cannot fetch browser QA branch"
sha=$(git rev-parse FETCH_HEAD)
short=${sha:0:12}
work="$QA_ROOT/worktrees/$short"
reports="$QA_ROOT/reports/$short"
mkdir -p "$QA_ROOT/worktrees" "$reports"
if [ ! -d "$work" ]; then
  git worktree add --detach "$work" "$sha" || die "Cannot add detached QA worktree"
fi
test "$(git -C "$work" rev-parse HEAD)" = "$sha" || die "Wrong worktree revision"
for secret in .env .env.local .env.production .env.production.local; do
  test ! -e "$work/$secret" || die "Unexpected environment file in QA worktree: $secret"
done
if [ -L "$work/node_modules" ]; then rm -- "$work/node_modules"; fi
if [ ! -d "$work/node_modules" ]; then
  cp -a --reflink=auto -- "$ROOT/node_modules" "$work/node_modules" || die "Cannot isolate dependencies"
fi
test ! -L "$work/node_modules" || die "Dependencies linked to production"
printf 'BROWSER_QA_SHA=%s\nWORKTREE=%s\nREPORTS=%s\n' "$sha" "$work" "$reports"
failures=0
run() {
  name="$1"
  file="$2"
  printf '\nRUN %s\n' "$name"
  if (cd "$work" && env -i \
    HOME=/root PATH="$PATH" \
    NODE_ENV=test NODE_OPTIONS=--max-old-space-size=8192 \
    DATABASE_URL='mongodb://127.0.0.1:27018/minberi_fixture?serverSelectionTimeoutMS=500&connectTimeoutMS=500' \
    NEXTAUTH_SECRET=fixture-auth-test-secret NEXTAUTH_URL=http://127.0.0.1:3106 \
    GOOGLE_CLIENT_ID=fixture-client GOOGLE_CLIENT_SECRET=fixture-secret \
    STRIPE_SECRET_KEY=sk_test_fixture_no_network \
    CONTENT_EDITOR_ARTIFACTS="$reports/artifacts/$name" \
    node --import tsx "$file" > "$reports/$name.log" 2>&1); then
    printf 'PASS %s\n' "$name"
  else
    printf 'FAIL %s - %s\n' "$name" "$reports/$name.log"
    tail -n 28 "$reports/$name.log" || true
    failures=$((failures+1))
  fi
}
run editors scripts/content-editor-browser-test.mjs
run dashboard-seo scripts/dashboard-followup-browser-test.mjs
run major-projects scripts/major-projects-browser-test.mjs
test "$(git -C "$ROOT" rev-parse HEAD)" = "$original" || die "Production Git checkout moved"
printf '\nBROWSER_QA_SHA=%s\nFAILURES=%s\nPRODUCTION_CHECKOUT_UNCHANGED=YES\nREPORTS=%s\n' "$sha" "$failures" "$reports"
if [ "$failures" -gt 0 ]; then
  echo 'BROWSER_QA_RESULT=FAILED_NO_MERGE_NO_DEPLOY'
  exit 1
fi
echo 'BROWSER_QA_RESULT=PASSED_FIXTURE_BROWSER_CHECKS_STAGING_CMS_AND_19_LOCALE_QA_STILL_REQUIRED'
