#!/usr/bin/env bash
# Full isolated QA, 19-language anonymous live audit, no production writes.
set -uo pipefail
umask 077
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
case "$ROOT" in /tmp/minbar-full-qa.*) ;; *) echo "ERROR: QA must be in disposable /tmp/minbar-full-qa.*"; exit 2;; esac
test "$PWD" = "$ROOT" && test -f package.json || exit 2
test "$(git branch --show-current)" = qa/checkout-phone-field-20261112 || exit 2
OUT="$HOME/minbar-full-qa-$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -p "$OUT"
exec > >(tee "$OUT/summary.txt") 2>&1
PASS=0; FAIL=0; SKIP=0; STEP=0
run(){
  local label="$1" seconds="$2" rc
  shift 2
  STEP=$((STEP+1))
  echo "=== CHECK $STEP: $label ==="
  if timeout --signal=TERM --kill-after=10s "$seconds" nice -n 15 "$@" > "$OUT/test-$STEP.log" 2>&1; then
    PASS=$((PASS+1)); echo "PASS: $label"; tail -n 2 "$OUT/test-$STEP.log"
  else
    rc=$?; FAIL=$((FAIL+1)); echo "FAIL: $label exit=$rc"; tail -n 12 "$OUT/test-$STEP.log"
  fi
}
skip(){ SKIP=$((SKIP+1)); echo "SKIP: $1"; }
export CI=1 NEXT_TELEMETRY_DISABLED=1 CAMPAIGNS_ONLY=1
export NODE_OPTIONS='--max-old-space-size=4096'
export DATABASE_URL='mongodb://127.0.0.1:1/blocked_qa?serverSelectionTimeoutMS=500&connectTimeoutMS=500'
export NEXTAUTH_SECRET='isolated-qa-secret-no-live-provider' NEXTAUTH_URL='http://127.0.0.1:65535'
export GOOGLE_CLIENT_ID='fixture-client' GOOGLE_CLIENT_SECRET='fixture-secret'
export STRIPE_SECRET_KEY='sk_test_fixture_no_network' SITE_INDEXING=off
export PRISMA_GENERATE_SKIP_AUTOINSTALL=1
export CONTENT_EDITOR_ARTIFACTS="$OUT/browser-artifacts"
export PLAYWRIGHT_BROWSERS_PATH="$ROOT/.qa-playwright-browsers"

echo "FULL SITE PRE-RELEASE QA / anonymous GET + isolated fixtures"
echo "UTC: $(date -u +%FT%TZ)"
echo "SHA: $(git rev-parse HEAD)"
echo "NODE: $(node -v) expected package engine 24.x"
echo "REPORT: $OUT/summary.txt"
df -h "$ROOT" | tail -n 1
if test -e .env || test -e .env.local || test -e .env.production; then
  echo "BLOCKED: environment files in QA clone"; exit 3
fi
if test "$(df -Pk "$ROOT" | awk 'NR==2{print $4}')" -lt 6000000; then
  echo "BLOCKED: less than 6 GB available"; exit 3
fi
if command -v nginx >/dev/null; then run "Nginx syntax" 20 nginx -t; else skip "Nginx missing"; fi

run "Public 19-language, sitemap, SEO, URLs, security/privacy GET audit" 900 \
  env QA_LIVE_REPORT="$OUT/public-audit.json" node scripts/qa-vps-public-site-readonly.mjs

run "Install isolated dependencies" 900 npm ci --ignore-scripts --no-audit --no-fund
if ! test -f node_modules/typescript/package.json; then echo "BLOCKED: node_modules missing"; exit 3; fi
run "Generate Prisma client in QA clone" 240 npx --no-install prisma generate
run "Generate integration Prisma client in QA clone" 240 npx --no-install prisma generate --schema prisma/integration-settings.schema.prisma
run "Content-editor contract tests" 450 npm run test:content-editors
run "Complete integration regression tests" 1200 npm run test:integration-settings
run "Phone/IP trusted-proxy contract tests" 240 node --import tsx --test tests/integration-settings/checkout-phone-ip-default.test.ts
run "Strict i18n audit" 400 npm run i18n:audit:strict
run "Strict locale audit" 400 npm run locale:audit:strict
run "Content localization audit" 400 npm run content:audit
run "Communication runtime typecheck" 600 npm run typecheck:communication-runtime
run "Integration release typecheck" 600 npm run typecheck:integration-release
run "Content editor typecheck" 600 npm run typecheck:content-editor-service
run "Full TypeScript check" 900 npm run typecheck:baseline
run "ESLint check" 700 npm run lint:ci
run "Release metadata preflight" 300 npm run preflight:release-metadata
run "Isolated production build with blocked DB" 1500 npx --no-install next build
run "Download isolated browser" 600 npx --no-install playwright install chromium

CHROME="$(find "$PLAYWRIGHT_BROWSERS_PATH" -type f -name chrome-headless-shell -print -quit 2>/dev/null || true)"
READY=0
if test -f "$CHROME"; then
  MISSING="$(ldd "$CHROME" 2>/dev/null | grep 'not found' || true)"
  if test -n "$MISSING" && command -v apt-get >/dev/null && command -v dpkg-deb >/dev/null; then
    mkdir -p "$ROOT/.qa-browser-libs" "$ROOT/.qa-browser-cache"
    sed "s#/root/minber-media-recovery/translation-seo-browser-qa/#$ROOT/#g" \
      scripts/qa-playwright-isolated-libs.sh > "$ROOT/.qa-libs-helper.sh"
    run "Download and extract Chromium libraries (no system install)" 800 \
      bash "$ROOT/.qa-libs-helper.sh" "$CHROME" "$ROOT/.qa-browser-libs" "$ROOT/.qa-browser-cache"
    export LD_LIBRARY_PATH="$ROOT/.qa-browser-libs/usr/lib/x86_64-linux-gnu:$ROOT/.qa-browser-libs/lib/x86_64-linux-gnu:$ROOT/.qa-browser-libs/usr/lib"
  fi
  if test -z "$(LD_LIBRARY_PATH="$LD_LIBRARY_PATH" ldd "$CHROME" 2>/dev/null | grep 'not found' || true)"; then READY=1; fi
fi

# Existing CI fixture scripts, each bound to localhost, using mock bank/auth.
# They are run sequentially and with CPU priority reduced.
BROWSER_SPECS=(
 content-editor-browser-test.mjs major-projects-browser-test.mjs
 inbox-media-browser-test.mjs whatsapp-language-browser-test.mjs
 inbox-permissions-browser-test.mjs public-media-browser-test.mjs
 dashboard-followup-browser-test.mjs operations-review-browser-test.mjs
 saudi-mobile-browser-test.mjs project-profile-requests-browser-test.mjs
 donor-management-browser-test.mjs donor-lifecycle-browser-test.mjs
 subscription-management-browser-test.mjs certificates-saved-cards-browser-test.mjs
 bank-operations-browser-test.mjs donation-experience-browser-test.mjs
 brand-campaign-browser-test.mjs campaign-recovery-browser-test.mjs
 google-search-recovery-browser-test.mjs subscription-card-browser-test.mjs
 checkout-readiness-browser-test.mjs
)
if test "$READY" = 1; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROME"
  export CHROMIUM_EXECUTABLE_PATH="$CHROME"
  for fixture in "${BROWSER_SPECS[@]}"; do
    run "Browser fixture: $fixture" 650 node --import tsx "scripts/$fixture"
  done
else
  skip "21 browser fixtures: unresolved Chromium system dependencies; GitHub CI browser matrix remains evidence"
fi

echo "=== FINAL STATUS ==="
echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
echo "REPORT: $OUT/summary.txt"
echo "PUBLIC_AUDIT: $OUT/public-audit.json"
echo "LOGS: $OUT/test-*.log"
echo "STILL UNVERIFIED: authenticated donor DB persistence; real overseas visitor IP;"
echo "STILL UNVERIFIED: genuine bank payment/capture/refund/reconciliation, provider callbacks,"
echo "STILL UNVERIFIED: actual WhatsApp/email sends, cron writes, admin role testing with test accounts."
echo "No production modification, financial transaction or live outbound message performed."
test "$FAIL" -eq 0
