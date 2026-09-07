#!/usr/bin/env bash
# Controlled Vercel bootstrap for Integration Settings.
set -Eeuo pipefail

TMP_DIR="$(mktemp -d)"
PREVIEW_ENV="$TMP_DIR/preview.env"
PRODUCTION_ENV="$TMP_DIR/production.env"
ENVS_JSON="$TMP_DIR/envs.json"
PARSER="$TMP_DIR/env-reader.cjs"
PREVIEW_URL=""
BUILD_RESULT="NOT_RUN"
PREFLIGHT_RESULT="NOT_RUN"
MIGRATION_RESULT="NOT_RUN"
TRANSACTIONS_RESULT="TRANSACTIONS_UNVERIFIED"
DATABASE_RELATION="UNABLE_TO_VERIFY"
PREVIEW_KEY_STATUS="MISSING"
PRODUCTION_KEY_STATUS="MISSING"
DATABASE_STATUS="MISSING"
CRON_STATUS="MISSING"
CANONICAL_STATUS="MISSING"
OVERALL_RESULT="BLOCKED"
BLOCKER=""
SUMMARY_WRITTEN=0

save_report() {
  {
    echo "## Vercel Integration Settings Bootstrap"
    echo
    echo "| Check | Result |"
    echo "|---|---|"
    echo "| Project | $VERCEL_PROJECT_NAME |"
    echo "| Team | $VERCEL_TEAM_SCOPE |"
    echo "| Database relation | $DATABASE_RELATION |"
    echo "| Preview encryption key | $PREVIEW_KEY_STATUS |"
    echo "| Production encryption key | $PRODUCTION_KEY_STATUS |"
    echo "| DATABASE_URL | $DATABASE_STATUS |"
    echo "| CRON_SECRET | $CRON_STATUS |"
    echo "| Canonical URL | $CANONICAL_STATUS |"
    echo "| Preview deployment | ${PREVIEW_URL:-NOT_CREATED} |"
    echo "| Build | $BUILD_RESULT |"
    echo "| Preflight | $PREFLIGHT_RESULT |"
    echo "| Migration verify | $MIGRATION_RESULT |"
    echo "| MongoDB transactions | $TRANSACTIONS_RESULT |"
    echo "| Overall | $OVERALL_RESULT |"
    if [[ -n "$BLOCKER" ]]; then echo "| Blocker | $BLOCKER |"; fi
  } > "$SAFE_REPORT"
  cat "$SAFE_REPORT" >> "$GITHUB_STEP_SUMMARY"
  SUMMARY_WRITTEN=1
}

cleanup() {
  if [[ $SUMMARY_WRITTEN -eq 0 ]]; then
    BLOCKER="UNEXPECTED_WORKFLOW_FAILURE"
    OVERALL_RESULT="BLOCKED"
    save_report
  fi
  unset PREVIEW_KEY PRODUCTION_KEY GENERATED_KEY PREVIEW_DB PRODUCTION_DB PREVIEW_CRON PRODUCTION_CRON
  rm -rf "$TMP_DIR" "$GITHUB_WORKSPACE/.vercel"
}
trap cleanup EXIT

block() {
  BLOCKER="$1"
  OVERALL_RESULT="BLOCKED"
  save_report
  exit 1
}

[[ -n "${VERCEL_TOKEN:-}" ]] || block "VERCEL_TOKEN_UNAVAILABLE"

cat > "$PARSER" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function parse(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function writeEnv(file, values) {
  const lines = Object.entries(values)
    .filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
}

function targets(item) {
  if (Array.isArray(item.target)) return item.target;
  return item.target ? [item.target] : [];
}

function materialize(data, target, branch) {
  const envs = Array.isArray(data) ? data : (Array.isArray(data.envs) ? data.envs : []);
  const selected = new Map();
  for (const item of envs) {
    if (!item || typeof item.key !== 'string' || !targets(item).includes(target)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.key)) continue;

    const itemBranch = typeof item.gitBranch === 'string' ? item.gitBranch : '';
    let specificity = 1;
    if (target === 'preview') {
      if (itemBranch && itemBranch !== branch) continue;
      specificity = itemBranch === branch ? 2 : 1;
    } else if (itemBranch) {
      continue;
    }

    const value = typeof item.value === 'string' ? item.value : null;
    if (value === null) continue;
    const timestamp = Number(item.updatedAt || item.createdAt || 0);
    const score = specificity * 10 ** 15 + timestamp;
    const current = selected.get(item.key);
    if (!current || score >= current.score) selected.set(item.key, { value, score });
  }
  return Object.fromEntries([...selected.entries()].map(([key, entry]) => [key, entry.value]));
}

const command = process.argv[2];
if (command === 'get') {
  process.stdout.write(parse(process.argv[3])[process.argv[4]] || '');
}
if (command === 'db-relation') {
  const a = parse(process.argv[3]).DATABASE_URL || '';
  const b = parse(process.argv[4]).DATABASE_URL || '';
  if (!a || !b) process.stdout.write('UNABLE_TO_VERIFY');
  else {
    const ah = crypto.createHash('sha256').update(a).digest();
    const bh = crypto.createHash('sha256').update(b).digest();
    process.stdout.write(crypto.timingSafeEqual(ah, bh) ? 'SAME_DATABASE' : 'DIFFERENT_DATABASE');
  }
}
if (command === 'key-valid') {
  const value = fs.readFileSync(0, 'utf8').trim();
  let valid = /^[a-fA-F0-9]{64}$/.test(value) && Buffer.from(value, 'hex').length === 32;
  if (!valid) try { valid = Buffer.from(value, 'base64url').length === 32; } catch {}
  if (!valid) try { valid = Buffer.from(value, 'base64').length === 32; } catch {}
  process.stdout.write(valid ? 'VALID' : 'INVALID');
}
if (command === 'cron-valid') {
  const value = fs.readFileSync(0, 'utf8').trim();
  process.stdout.write(value.length >= 32 && !/[\r\n]/.test(value) ? 'VALID' : 'INVALID');
}
if (command === 'canonical') {
  const env = parse(process.argv[3]);
  const raw = env.APP_URL || env.NEXTAUTH_URL || env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || '';
  if (!raw) process.stdout.write('MISSING');
  else try {
    const url = new URL(raw);
    process.stdout.write(process.argv[4] === 'production' && url.protocol !== 'https:' ? 'INVALID' : 'PRESENT');
  } catch { process.stdout.write('INVALID'); }
}
if (command === 'materialize') {
  const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  if (data.pagination && data.pagination.next != null) {
    console.error('VERCEL_ENV_API_PAGINATION_REQUIRES_REVIEW');
    process.exit(2);
  }
  writeEnv(process.argv[4], materialize(data, 'preview', process.argv[6]));
  writeEnv(process.argv[5], materialize(data, 'production', process.argv[6]));
}
if (command === 'set') {
  const file = process.argv[3];
  const key = process.argv[4];
  const values = parse(file);
  values[key] = fs.readFileSync(0, 'utf8');
  writeEnv(file, values);
}
if (command === 'run') {
  const env = { ...process.env, ...parse(process.argv[3]) };
  const result = spawnSync(process.argv[4], process.argv.slice(5), { env, stdio: 'inherit' });
  process.exit(result.status == null ? 1 : result.status);
}
NODE

vercel link --yes --project "$VERCEL_PROJECT_NAME" --scope "$VERCEL_TEAM_SCOPE" --token "$VERCEL_TOKEN" > "$TMP_DIR/link.log" 2>&1 || block "VERCEL_PROJECT_LINK_FAILED"
vercel project inspect "$VERCEL_PROJECT_NAME" --scope "$VERCEL_TEAM_SCOPE" --token "$VERCEL_TOKEN" > "$TMP_DIR/project.log" 2>&1 || block "VERCEL_PROJECT_INSPECTION_FAILED"

if ! node - <<'NODE'
const fs = require('node:fs');
const project = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
if (project.projectId !== process.env.VERCEL_PROJECT_ID || project.orgId !== process.env.VERCEL_TEAM_ID) process.exit(1);
NODE
then block "VERCEL_PROJECT_IDENTITY_MISMATCH"; fi

ENV_HTTP="$({ curl -sS \
  -o "$ENVS_JSON" \
  -w '%{http_code}' \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H 'Accept: application/json' \
  --get "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env" \
  --data-urlencode "teamId=$VERCEL_TEAM_ID" \
  --data-urlencode 'decrypt=true' \
  --data-urlencode 'source=vercel-cli:pull' \
  --data-urlencode 'limit=1000'; } 2>"$TMP_DIR/env-api-curl.log")" || block "VERCEL_ENV_API_REQUEST_FAILED"

if [[ "$ENV_HTTP" != "200" ]]; then
  ENV_API_CODE="$(node - "$ENVS_JSON" <<'NODE'
const fs = require('node:fs');
try {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const value = String(data?.error?.code || data?.code || 'UNKNOWN');
  process.stdout.write(value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80));
} catch {
  process.stdout.write('NON_JSON_RESPONSE');
}
NODE
  )"
  echo "VERCEL_ENV_API_ERROR http=$ENV_HTTP code=$ENV_API_CODE"
  case "$ENV_HTTP" in
    401) block "VERCEL_ENV_API_UNAUTHORIZED" ;;
    403) block "VERCEL_ENV_API_FORBIDDEN" ;;
    *) block "VERCEL_ENV_API_HTTP_$ENV_HTTP" ;;
  esac
fi

node "$PARSER" materialize "$ENVS_JSON" "$PREVIEW_ENV" "$PRODUCTION_ENV" "$TARGET_BRANCH" || block "VERCEL_ENV_MATERIALIZATION_FAILED"

PREVIEW_DB="$(node "$PARSER" get "$PREVIEW_ENV" DATABASE_URL)"
PRODUCTION_DB="$(node "$PARSER" get "$PRODUCTION_ENV" DATABASE_URL)"
[[ -n "$PREVIEW_DB" && -n "$PRODUCTION_DB" ]] || block "DATABASE_URL_MISSING"
DATABASE_STATUS="PRESENT"
DATABASE_RELATION="$(node "$PARSER" db-relation "$PREVIEW_ENV" "$PRODUCTION_ENV")"
[[ "$DATABASE_RELATION" != "UNABLE_TO_VERIFY" ]] || block "DATABASE_RELATION_UNVERIFIED"
unset PREVIEW_DB PRODUCTION_DB

PREVIEW_CRON="$(node "$PARSER" get "$PREVIEW_ENV" CRON_SECRET)"
PRODUCTION_CRON="$(node "$PARSER" get "$PRODUCTION_ENV" CRON_SECRET)"
[[ -n "$PREVIEW_CRON" && -n "$PRODUCTION_CRON" ]] || block "CRON_SECRET_MISSING"
[[ "$(printf '%s' "$PREVIEW_CRON" | node "$PARSER" cron-valid)" == "VALID" ]] || block "PREVIEW_CRON_SECRET_INVALID"
[[ "$(printf '%s' "$PRODUCTION_CRON" | node "$PARSER" cron-valid)" == "VALID" ]] || block "PRODUCTION_CRON_SECRET_INVALID"
CRON_STATUS="PRESENT"
unset PREVIEW_CRON PRODUCTION_CRON

PREVIEW_CANONICAL="$(node "$PARSER" canonical "$PREVIEW_ENV" preview)"
PRODUCTION_CANONICAL="$(node "$PARSER" canonical "$PRODUCTION_ENV" production)"
[[ "$PREVIEW_CANONICAL" != "MISSING" && "$PRODUCTION_CANONICAL" != "MISSING" ]] || block "CANONICAL_URL_MISSING"
[[ "$PREVIEW_CANONICAL" != "INVALID" && "$PRODUCTION_CANONICAL" != "INVALID" ]] || block "CANONICAL_URL_INVALID"
CANONICAL_STATUS="PRESENT"

PREVIEW_KEY="$(node "$PARSER" get "$PREVIEW_ENV" INTEGRATION_SETTINGS_ENCRYPTION_KEY)"
PRODUCTION_KEY="$(node "$PARSER" get "$PRODUCTION_ENV" INTEGRATION_SETTINGS_ENCRYPTION_KEY)"
if [[ -n "$PREVIEW_KEY" ]]; then
  PREVIEW_KEY_STATUS="$(printf '%s' "$PREVIEW_KEY" | node "$PARSER" key-valid)"
  [[ "$PREVIEW_KEY_STATUS" == "VALID" ]] || block "PREVIEW_ENCRYPTION_KEY_INVALID"
fi
if [[ -n "$PRODUCTION_KEY" ]]; then
  PRODUCTION_KEY_STATUS="$(printf '%s' "$PRODUCTION_KEY" | node "$PARSER" key-valid)"
  [[ "$PRODUCTION_KEY_STATUS" == "VALID" ]] || block "PRODUCTION_ENCRYPTION_KEY_INVALID"
fi

add_preview_key() {
  printf '%s' "$1" | vercel env add INTEGRATION_SETTINGS_ENCRYPTION_KEY preview --git-branch="$TARGET_BRANCH" --sensitive --scope "$VERCEL_TEAM_SCOPE" --token "$VERCEL_TOKEN" > "$TMP_DIR/add-preview-key.log" 2>&1 || block "PREVIEW_ENCRYPTION_KEY_ADD_FAILED"
  printf '%s' "$1" | node "$PARSER" set "$PREVIEW_ENV" INTEGRATION_SETTINGS_ENCRYPTION_KEY
  PREVIEW_KEY_STATUS="ADDED"
}
add_production_key() {
  printf '%s' "$1" | vercel env add INTEGRATION_SETTINGS_ENCRYPTION_KEY production --sensitive --scope "$VERCEL_TEAM_SCOPE" --token "$VERCEL_TOKEN" > "$TMP_DIR/add-production-key.log" 2>&1 || block "PRODUCTION_ENCRYPTION_KEY_ADD_FAILED"
  printf '%s' "$1" | node "$PARSER" set "$PRODUCTION_ENV" INTEGRATION_SETTINGS_ENCRYPTION_KEY
  PRODUCTION_KEY_STATUS="ADDED"
}
new_key() { node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"; }

if [[ "$DATABASE_RELATION" == "SAME_DATABASE" ]]; then
  if [[ -n "$PREVIEW_KEY" && -n "$PRODUCTION_KEY" ]]; then
    [[ "$PREVIEW_KEY" == "$PRODUCTION_KEY" ]] || block "ENCRYPTION_KEYS_DIFFER_FOR_SHARED_DATABASE"
  elif [[ -n "$PREVIEW_KEY" ]]; then
    add_production_key "$PREVIEW_KEY"
  elif [[ -n "$PRODUCTION_KEY" ]]; then
    add_preview_key "$PRODUCTION_KEY"
  else
    GENERATED_KEY="$(new_key)"
    add_preview_key "$GENERATED_KEY"
    add_production_key "$GENERATED_KEY"
    unset GENERATED_KEY
  fi
else
  if [[ -z "$PREVIEW_KEY" ]]; then GENERATED_KEY="$(new_key)"; add_preview_key "$GENERATED_KEY"; unset GENERATED_KEY; fi
  if [[ -z "$PRODUCTION_KEY" ]]; then GENERATED_KEY="$(new_key)"; add_production_key "$GENERATED_KEY"; unset GENERATED_KEY; fi
fi
unset PREVIEW_KEY PRODUCTION_KEY

set +e
vercel deploy --yes --scope "$VERCEL_TEAM_SCOPE" --token "$VERCEL_TOKEN" > "$TMP_DIR/deploy.log" 2>&1
DEPLOY_EXIT=$?
set -e
[[ $DEPLOY_EXIT -eq 0 ]] || { BUILD_RESULT="FAILED"; block "PREVIEW_DEPLOYMENT_FAILED"; }
PREVIEW_URL="$(grep -Eo 'https://[^[:space:]]+\.vercel\.app' "$TMP_DIR/deploy.log" | tail -n 1 || true)"
[[ -n "$PREVIEW_URL" ]] || block "PREVIEW_URL_NOT_FOUND"
vercel inspect "$PREVIEW_URL" --wait --timeout 20m --scope "$VERCEL_TEAM_SCOPE" --token "$VERCEL_TOKEN" > "$TMP_DIR/inspect.log" 2>&1 || block "PREVIEW_NOT_READY"
BUILD_RESULT="READY"

set +e
node "$PARSER" run "$PREVIEW_ENV" npm run preflight:integration-settings > "$TMP_DIR/preflight.log" 2>&1
PREFLIGHT_EXIT=$?
node "$PARSER" run "$PREVIEW_ENV" npm run verify:integration-settings-migration > "$TMP_DIR/migration-verify.log" 2>&1
MIGRATION_EXIT=$?
set -e

PREFLIGHT_RESULT="$(grep -Eo 'INTEGRATION SETTINGS PREFLIGHT: (PASS|WARNING|BLOCKED)' "$TMP_DIR/preflight.log" | tail -n 1 | awk '{print $4}' || true)"
[[ -n "$PREFLIGHT_RESULT" ]] || PREFLIGHT_RESULT="BLOCKED"
MIGRATION_RESULT="$(grep -Eo 'MIGRATION STATUS: (FULLY_APPLIED|PARTIALLY_APPLIED|NOT_APPLIED|UNKNOWN)' "$TMP_DIR/migration-verify.log" | tail -n 1 | awk '{print $3}' || true)"
[[ -n "$MIGRATION_RESULT" ]] || MIGRATION_RESULT="UNKNOWN"
if grep -q '^\[PASS\] transactions:' "$TMP_DIR/preflight.log"; then TRANSACTIONS_RESULT="SUPPORTED"; fi

[[ $PREFLIGHT_EXIT -eq 0 && "$PREFLIGHT_RESULT" != "BLOCKED" ]] || block "PREFLIGHT_BLOCKED"
[[ $MIGRATION_EXIT -eq 0 && "$MIGRATION_RESULT" != "UNKNOWN" ]] || block "MIGRATION_VERIFY_BLOCKED"

if [[ "$PREFLIGHT_RESULT" == "WARNING" || "$TRANSACTIONS_RESULT" == "TRANSACTIONS_UNVERIFIED" || "$MIGRATION_RESULT" != "FULLY_APPLIED" ]]; then
  OVERALL_RESULT="WARNING"
else
  OVERALL_RESULT="PASS"
fi
save_report
