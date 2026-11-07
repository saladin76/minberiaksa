# Mobile dashboard, inbox and project visibility — 2026-10-29

## Implemented

- Compact, single-row dashboard top bar on phones. Language and display currency remain available in a touch-accessible popover. Breadcrumbs show the current page on small screens.
- Mobile navigation hides closed drawer links from focus, moves focus into an open drawer, prevents background interaction/scroll, handles Escape, and restores focus. Navigation and desktop resizing close the drawer.
- Compact metric cards, a two-column secondary summary on phones, and press-to-open summary notes. Dashboard-only 16px form controls and safe-area spacing avoid applying these rules to the public site.
- WhatsApp uses one pane at a time on phones, with explicit Back, separate text/attachment drafts, viewport-aware height and a contained composer/timeline. Phone numbers remain left-to-right; timestamps follow dashboard language. Recording prevents changing threads until it is stopped.
- Opening the inbox no longer opens and marks the first conversation as read. A silent unread-list refresh no longer closes the thread that was just read, preserving an in-progress reply.
- Public campaign/CMS queries include both explicit-null and unset legacy priority fields. Ranked zero is preserved; inactive and deleted projects remain excluded. No campaign was reactivated or modified in the production database.
- Dashboard projects have an all-status view, a notice for search matches in other statuses, and mobile cards with edit, order and selection. Bulk publishing/archiving remains tied to an explicit status tab.
- Recurring health is read-only and reports upcoming/due/missing/invalid dates, the nearest future date, the next 24 hours, missing confirmed billing history, and stale/failed scheduler evidence. Invalid or reversed dates are not labelled scheduled. The diagnostic CLI uses the same snapshot and a legacy-safe frequency lookup.

## Evidence and limits

Ten additional content-editor regression tests cover the real inbox component's loading, explicit read acknowledgements, Back, separate drafts and unread polling; public API/CMS priority grouping and both pagination paths; schedule classification and the real permission-gated health endpoint. No test sends a donor message or requests a payment.

Final validation: 224 content-editor tests and 1,332 integration tests (1,556 total), specialized editor/communication/integration type checks, baseline type check, lint ratchet, metadata import preflight, dashboard translation coverage and production build. Build/runtime checks use dummy local credentials, without a production database.

A successful build is not manual acceptance. The browser tool timed out even during reset. No new live dashboard test or production subscription read was possible. The source workspace has no production database connection or SSH agent. Existing past subscription/cron snapshots do not prove today's schedule or bank acceptance.

**Publishing remains on hold.** The per-section manual register and complete source page inventory are in `manual-dashboard-acceptance-20261029.md`. Previously unfinished external integrations and the wider autonomous Google Ads requirement remain explicitly open there.

## Obtain current production evidence without deployment

This command runs the already-installed read-only audit. It does not fetch/checkout new code, trigger cron, send messages or request charges. It reads current subscriptions and recent cron logs; the report states its environment source and limits.

```bash
ssh -o ServerAliveInterval=30 root@176.53.96.235 'bash -s' <<'REMOTE'
set -e
export NVM_DIR=/root/.nvm
. "$NVM_DIR/nvm.sh"
nvm use --silent 24
cd /root/minberiaksa
node --import tsx scripts/audit-production-readiness.mjs
REMOTE
```

Review active/confirmed plans, missing dates or authorization, due counts and the recurring-cron timestamps together. Do not turn a scheduled date or HTTP 200 into a claim of successful bank collection. No repair, reactivation or charge is part of this audit.
