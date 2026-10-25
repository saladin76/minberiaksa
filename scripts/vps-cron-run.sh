#!/usr/bin/env bash
# Run one cron route on the VPS, the way Vercel Cron would.
#
#   bash scripts/vps-cron-run.sh /api/cron/recurring-charges
#
# `vercel.json` "crons" only fire on Vercel. Production runs `next start` under
# pm2, so without this nothing ever called /api/cron/* — recurring plans paid
# their first instalment at checkout and were never charged again. The crontab
# lines that call this script are written by scripts/vps-cron-install.sh.
#
# Calls the local server directly (not through nginx), authenticated with
# `Authorization: Bearer $CRON_SECRET` read with the app's production environment-file precedence. A run of the
# same route that is still going is not overlapped (flock).
#
# Env: CRON_BASE_URL (default: http://localhost:${PORT:-3000}),
#      CRON_LOG (default: /var/log/minberiaksa-cron.log)
set -uo pipefail

ROUTE="${1:?usage: vps-cron-run.sh /api/cron/<name>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Keep scheduled work paused across code/build swaps during a reviewed release.
# Removing this local marker resumes the normal schedules; it never runs catch-up.
if [ -f "$APP_DIR/.cron-maintenance-hold" ]; then
  printf '%s\n' 'SKIPPED: cron maintenance hold is active'
  exit 0
fi
BASE="${CRON_BASE_URL:-http://localhost:${PORT:-3000}}"
LOG="${CRON_LOG:-/var/log/minberiaksa-cron.log}"

log() { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ROUTE" "$*" >> "$LOG"; }

# Keep the log bounded (the communication queue runs every minute).
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv -f "$LOG" "$LOG.1"
fi

SECRET="${CRON_SECRET:-}"
if [ -z "$SECRET" ]; then
  # Use Next's parser and production precedence, including .env.production.local.
  # Never source dotenv as shell code or print credentials into the cron log.
  if ! SECRET="$(cd "$APP_DIR" && env -u CRON_SECRET NODE_ENV=production node <<'NODE'
try {
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  process.stdout.write(process.env.CRON_SECRET || "");
} catch { process.exitCode = 1; }
NODE
)"; then
    log "SKIPPED: unable to load production environment"
    exit 1
  fi
fi
if [ -z "$SECRET" ] || [[ "$SECRET" == *$'\r'* || "$SECRET" == *$'\n'* ]]; then
  log "SKIPPED: CRON_SECRET missing or invalid in production environment"
  exit 1
fi

exec 9> "/tmp/minberiaksa-cron$(printf '%s' "$ROUTE" | tr '/' '_').lock"
if ! flock -n 9; then
  log "SKIPPED: previous run still in progress"
  exit 0
fi

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
# localhost lets curl connect to either loopback family before sending. Do not
# retry cron requests: a financial job may already have been accepted.
CODE="$(curl -sS --connect-timeout 10 --noproxy "localhost,127.0.0.1,::1" -m 900 -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $SECRET" "$BASE$ROUTE" 2>>"$LOG")" || CODE="000"

if [ "${CODE:0:1}" = "2" ]; then
  log "HTTP $CODE"
else
  log "HTTP $CODE $(head -c 500 "$BODY_FILE" | tr '\n' ' ')"
  exit 1
fi
