#!/usr/bin/env bash
# Read-only VPS checks and isolated phone / IP / checkout tests.
set -uo pipefail
umask 077

SOURCE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$SOURCE" || "$PWD" != "$SOURCE" || ! -f package.json ]]; then
  echo 'ERROR: run from the root of an isolated minberiaksa QA clone.'
  exit 2
fi
if [[ "$(git branch --show-current 2>/dev/null)" != 'qa/checkout-phone-field-20261112' ]]; then
  echo 'ERROR: refusing to run outside the QA branch.'
  exit 2
fi

OUT="$HOME/minbar-phone-qa-$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -p "$OUT"
exec > >(tee "$OUT/report.txt") 2>&1

PASS=0; FAIL=0; SKIP=0; STEP=0
pass() { printf 'PASS: %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=$((FAIL+1)); }
skip() { printf 'SKIP: %s\n' "$1"; SKIP=$((SKIP+1)); }
run() {
  local label="$1" duration="$2" rc
  shift 2
  STEP=$((STEP+1))
  printf '\n[%s] %s (limit %ss)\n' "$STEP" "$label" "$duration"
  if timeout --signal=TERM --kill-after=10s "$duration" nice -n 15 "$@" > "$OUT/test-${STEP}.log" 2>&1; then
    pass "$label"
    tail -n 3 "$OUT/test-${STEP}.log" || true
  else
    rc=$?
    fail "$label [exit=$rc]"
    tail -n 20 "$OUT/test-${STEP}.log" || true
  fi
}

printf 'MINBER QA (READ-ONLY / ISOLATED)\n'
printf 'UTC: %s\n' "$(date -u +%FT%TZ)"
printf 'QA HEAD: %s\n' "$(git rev-parse HEAD)"
printf 'QA branch: %s\n' "$(git branch --show-current)"
printf 'Node: %s\n' "$(node -v 2>/dev/null || echo missing)"
printf 'npm: %s\n' "$(npm -v 2>/dev/null || echo missing)"
printf 'Report: %s\n' "$OUT/report.txt"
df -h "$PWD" | tail -n 1 || true

printf '\n=== PRODUCTION HEALTH: READ-ONLY ===\n'
if command -v pm2 >/dev/null 2>&1; then
  if pm2 jlist > "$OUT/pm2-raw-private.json" 2>/dev/null; then
    if PM2_JSON="$OUT/pm2-raw-private.json" node - <<'NODE'
const fs=require('node:fs');
try {
 const list=JSON.parse(fs.readFileSync(process.env.PM2_JSON,'utf8'));
 for (const p of list) console.log('PM2:',JSON.stringify({
   name:p.name,status:p.pm2_env?.status,cwd:p.pm2_env?.pm_cwd,
   script:p.pm2_env?.pm_exec_path,restarts:p.pm2_env?.restart_time
 }));
} catch(e) { console.log('PM2 inventory failed:',e.message);process.exitCode=1; }
NODE
    then pass 'PM2 process inventory (no environment secrets)';
    else fail 'PM2 status inspection'; fi
    rm -f -- "$OUT/pm2-raw-private.json"
  else
    rm -f -- "$OUT/pm2-raw-private.json"
    skip 'PM2 read unavailable'
  fi
else
  skip 'PM2 not in PATH'
fi

if command -v nginx >/dev/null 2>&1; then
  if nginx -t > "$OUT/nginx-test.log" 2>&1; then pass 'Nginx configuration syntax';
  else fail 'Nginx syntax or permission check'; tail -n 5 "$OUT/nginx-test.log" || true; fi
  echo 'Nginx proxy IP directives (no full configuration):'
  nginx -T 2>/dev/null | grep -Ei '^[[:space:]]*(proxy_set_header[[:space:]]+(X-Real-IP|X-Forwarded-For)|real_ip_header|set_real_ip_from|real_ip_recursive)[[:space:]]' | head -n 35 || true
else
  skip 'Nginx not in PATH'
fi

SITE='https://minberiaksa.org'
for locale in ar tr en fr; do
  code="$(curl -sS -L --max-time 25 -o /dev/null -w '%{http_code}' "$SITE/$locale/checkout" 2> "$OUT/curl-$locale.log" || true)"
  if [[ "$code" == '200' ]]; then pass "Public /$locale/checkout HTTP 200";
  else fail "Public /$locale/checkout HTTP ${code:-unavailable}"; fi
done

code="$(curl -sS --max-time 25 -D "$OUT/geo.headers" -o "$OUT/geo.json" -w '%{http_code}' "$SITE/api/geo/client" 2> "$OUT/geo-curl.log" || true)"
if [[ "$code" == '200' ]]; then
  if GEO_PATH="$OUT/geo.json" GEO_HEADERS="$OUT/geo.headers" node - <<'NODE'
const fs=require('node:fs');
try {
 const geo=JSON.parse(fs.readFileSync(process.env.GEO_PATH,'utf8'));
 const h=fs.readFileSync(process.env.GEO_HEADERS,'utf8');
 const cache=(h.match(/^cache-control:\s*(.*)$/im)||[])[1]||'missing';
 const valid=geo.ok===false || (geo.ok===true && /^[A-Z]{2}$/.test(geo.country_code||''));
 console.log('Geo status:',geo.ok===true?'country='+geo.country_code:'not resolved');
 console.log('Geo cache:',cache);
 if (!valid || !/private|no-store/i.test(cache)) process.exitCode=1;
} catch(e) { console.log('Invalid geo API response:',e.message);process.exitCode=1; }
NODE
  then pass 'Public geo API response and private cache policy';
  else fail 'Public geo API response or cache policy'; fi
else
  fail "Public geo API HTTP ${code:-unavailable}"
fi

printf '\n=== ISOLATED BRANCH CHECKS (NO PRODUCTION DB) ===\n'
# The clone must contain no production environment files.
export CI=1 NEXT_TELEMETRY_DISABLED=1 CAMPAIGNS_ONLY=1
# Production data access is intentionally blocked. Use a short MongoDB server
# selection timeout: sitemap static prerender invokes read queries and catches DB
# failures, but the default ~30s timeout trips Next.js's 60s prerender watchdog.
# This mirrors the successful GitHub CI fixture-build connection timeout.
export DATABASE_URL='mongodb://127.0.0.1:1/minbar_qa_blocked_db?serverSelectionTimeoutMS=500&connectTimeoutMS=500'
export NEXTAUTH_URL='http://127.0.0.1:65535'
export NEXTAUTH_SECRET='isolated-qa-only-not-production-2026'
# Match the successful GitHub fixture-build environment. All strings here are
# deliberately invalid QA placeholders, not secrets or live provider credentials.
# Auth options validate these variables at module import during next build.
export GOOGLE_CLIENT_ID='fixture-client'
export GOOGLE_CLIENT_SECRET='fixture-secret'
export STRIPE_SECRET_KEY='sk_test_fixture_no_network'
export SITE_INDEXING='off'
export CONTENT_EDITOR_ARTIFACTS="$OUT/artifacts"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.qa-playwright-browsers"
export NODE_OPTIONS='--max-old-space-size=4096'
export PRISMA_GENERATE_SKIP_AUTOINSTALL=1

if [[ -e .env || -e .env.production || -e .env.local ]]; then
  fail 'Unexpected environment file in temporary clone: tests cancelled'
else
  run 'npm ci (isolated dependencies)' 900 npm ci --ignore-scripts --no-audit --no-fund
  if [[ ! -f node_modules/typescript/package.json ]]; then
    fail 'Dependencies missing: no further isolated tests'
  else
    run 'Generate Prisma client (schema only)' 240 npx --no-install prisma generate
    run 'Generate integration Prisma client' 240 npx --no-install prisma generate --schema prisma/integration-settings.schema.prisma
    run 'ESLint release gate' 600 npm run lint:ci
    run 'Full TypeScript baseline' 900 npm run typecheck:baseline
    run 'IP country and trusted proxy unit tests' 240 node --import tsx --test tests/integration-settings/checkout-phone-ip-default.test.ts
    run 'Integration regression suite' 1200 npm run test:integration-settings
    run 'Playwright Chromium installation in clone' 600 npx --no-install playwright install chromium
    # Installing Chromium alone does not provide Linux shared libraries. Explicit
    # SKIP keeps the host immutable and avoids mistaking a missing libatk for a
    # failed donation flow. Use GitHub CI as independent browser evidence.
    CHROME_BIN="$(find "$PLAYWRIGHT_BROWSERS_PATH" -type f -name chrome-headless-shell -print -quit 2>/dev/null || true)"
    if [[ -z "$CHROME_BIN" ]]; then
      skip 'VPS Chromium browser test: browser executable unavailable'
    else
      MISSING_LIBS="$(ldd "$CHROME_BIN" 2>/dev/null | grep 'not found' || true)"
      if [[ -n "$MISSING_LIBS" ]]; then
        printf 'VPS browser dependencies absent (install separately with approval):\n%s\n' "$MISSING_LIBS"
        skip 'VPS Chromium browser test: missing system libraries; GitHub CI browser test is independent'
      else
        run 'Checkout phone/IP browser fixtures' 900 node --import tsx scripts/checkout-readiness-browser-test.mjs
      fi
    fi
    run 'Isolated Next.js production build (no DB write)' 1500 npx --no-install next build
  fi
fi

printf '\n=== FINAL STATUS ===\n'
printf 'PASS: %s | FAIL: %s | SKIP: %s\n' "$PASS" "$FAIL" "$SKIP"
printf 'Report: %s\n' "$OUT/report.txt"
printf 'Detailed logs: %s\n' "$OUT/"
printf 'NOT TESTED: real bank/payment, donor DB persistence, real overseas visitor IP traffic.\n'
printf 'No production deploy, PM2 restart, migration or donor database writes.\n'
if (( FAIL > 0 )); then exit 1; fi
exit 0
