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
# `Authorization: Bearer $CRON_SECRET` read from the app's .env. A run of the
# same route that is still going is not overlapped (flock).
#
# Env: CRON_BASE_URL (default: http://127.0.0.1:${PORT:-3000}),
#      CRON_LOG (default: /var/log/minberiaksa-cron.log)
set -uo pipefail

ROUTE="${1:?usage: vps-cron-run.sh /api/cron/<name>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${CRON_BASE_URL:-http://127.0.0.1:${PORT:-3000}}"
LOG="${CRON_LOG:-/var/log/minberiaksa-cron.log}"

log() { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ROUTE" "$*" >> "$LOG"; }

# Keep the log bounded (the communication queue runs every minute).
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv -f "$LOG" "$LOG.1"
fi

SECRET="${CRON_SECRET:-}"
if [ -z "$SECRET" ] && [ -f "$APP_DIR/.env" ]; then
  SECRET="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^["'\'']//; s/["'\'']$//')"
fi
if [ -z "$SECRET" ]; then
  log "SKIPPED: CRON_SECRET not found in env or $APP_DIR/.env"
  exit 1
fi

exec 9> "/tmp/minberiaksa-cron$(printf '%s' "$ROUTE" | tr '/' '_').lock"
if ! flock -n 9; then
  log "SKIPPED: previous run still in progress"
  exit 0
fi

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
CODE="$(curl -sS -m 900 -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $SECRET" "$BASE$ROUTE" 2>>"$LOG")" || CODE="000"

if [ "${CODE:0:1}" = "2" ]; then
  log "HTTP $CODE"
else
  log "HTTP $CODE $(head -c 500 "$BODY_FILE" | tr '\n' ' ')"
  exit 1
fi
