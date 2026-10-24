#!/usr/bin/env bash
# Install the `vercel.json` crons into this user's crontab on the VPS.
#
#   bash scripts/vps-cron-install.sh            (from the app folder, e.g. /root/minberiaksa)
#
# Idempotent: the managed block between the BEGIN/END markers is replaced on
# every run, the rest of the crontab is left alone. deploy-vps.sh runs this
# after each deploy, so a cron added to vercel.json is scheduled here too.
# Each line calls scripts/vps-cron-run.sh, which authenticates with CRON_SECRET.
#
# Vercel runs cron schedules in UTC; so does cron when the server clock is UTC.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BEGIN="# BEGIN minberiaksa crons (managed by scripts/vps-cron-install.sh)"
END="# END minberiaksa crons"

# Bash updates LINES to the terminal height after commands in a TTY.
# Keep schedule data in an application-specific variable instead.
CRON_ENTRIES="$(node -e '
  const crons = require(process.argv[1]).crons || [];
  for (const c of crons) {
    if (!/^\/api\/cron\/[\w-]+$/.test(c.path) || !/^[\d*\/,\- ]+$/.test(c.schedule)) {
      console.error("skipping malformed cron entry", JSON.stringify(c));
      continue;
    }
    console.log(`${c.schedule} /bin/bash ${process.argv[2]}/scripts/vps-cron-run.sh ${c.path}`);
  }
' "$APP_DIR/vercel.json" "$APP_DIR")"

if [ -z "$CRON_ENTRIES" ]; then
  echo "✗ no crons found in vercel.json" >&2
  exit 1
fi

{
  crontab -l 2>/dev/null | sed "/^# BEGIN minberiaksa crons/,/^# END minberiaksa crons/d" || true
  echo "$BEGIN"
  [ -n "${CRON_BASE_URL:-}" ] && echo "CRON_BASE_URL=$CRON_BASE_URL"
  echo "$CRON_ENTRIES"
  echo "$END"
} | crontab -

echo "✓ installed $(printf '%s\n' "$CRON_ENTRIES" | wc -l) cron(s):"
printf '%s\n' "$CRON_ENTRIES" | sed 's/^/    /'
if [ "$(date +%Z)" != "UTC" ]; then
  echo "! server timezone is $(date +%Z), not UTC — fixed-hour crons (reminders, reconcile) run on local time"
fi
