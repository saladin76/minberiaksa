# Minber al-Aqsa — PR #197 final release acceptance

**Release candidate:** PR #197 (`release/minber-clean-finance-tracking-20261111`).
**Code state at preparation:** `8ea8e136bf2b5a8d40ecda883f11a8b194915fa2` passed the four GitHub PR workflows. If this document adds a commit, re-check CI against the NEW SHA before approval.
**Decision:** NO-GO for production until every independent gate below has dated evidence and sign-off.
**Never merge #191 (QA-only) or #196 (synthetic integration) into production.**

## Code integration evidence (automated)

- [x] Finance #187 + attribution/Meta CAPI #188 + Clarity/GTM #194 are on one clean release branch.
- [x] GitHub PR mergeable against main (re-check after every base/head change).
- [x] Isolated financial Playwright, tracking Chromium, translation SEO on reviewed SHA.
- [x] Release Gates: TypeScript, lint, fixture Next build, i18n, integration and browser component jobs passed.
- [x] Old automatically triggered *connected* E2E on main disabled. The connected E2E job is intentionally **skipped**, not passed.
- [x] Production build rejects staging runtime before Prisma/index side effects.
- [ ] Reconfirm all above on FINAL HEAD and current main immediately before merge.

## A. Operator read-only VPS evidence — deployment is NOT authorized by this checklist

Use an independently authorized VPS operator; do not print full PM2 env, .env, nginx secrets, Mongo URI, PII or payment/provider logs. The QA-only #191 scripts can be reviewed and run from an isolated read-only audit directory, **never git pull production** merely to obtain them.

- [ ] PM2 process: app name, status, PID, process cwd, node interpreter/version, port, restart count; compare with authenticated `/api/admin/build-info` build SHA, and checked-out source SHA actually loaded by the running process.
- [ ] Nginx: `nginx -t` passes and a sanitized domain -> upstream port map matches running PM2 listeners; production/staging hosts and ports are strictly different.
- [ ] Data separation: compare redacted SHA-256 identity fingerprints for Mongo production and staging; independent accounts and readWrite on staging DB only. Confirm **effective running connection**, not just dotenv.
- [ ] Redis/cache/queues: distinct namespace/DB/lock keys and workers, or independent instance. Prove no shared session or financial/notification worker.
- [ ] Cron: separate schedule; staging renewals, refunds, message triggers and background receipt jobs are disabled at application AND host levels.
- [ ] Outbound policy: firewall/network denial of real bank/Meta/email/WhatsApp callbacks from staging; verify with controlled synthetic tests only.
- [ ] Backup and rollback: operator demonstrates recoverable backups, approved pre-deploy snapshot, reversible code rollout and a documented point-of-no-return for schema/index changes.

## B. Independent Staging + sandbox financial acceptance

- [ ] Staging runs exactly reviewed candidate SHA under a separate instance, port, database, session/cache and synthetic donors, without real provider credentials or production donor copies.
- [ ] Reviewed GitHub `staging-acceptance` Environment has an independent required reviewer and exact branch/SHA restrictions; an environment merely existing is not evidence.
- [ ] Generic E2E runs against attested, egress-blocked staging, never production. Receipt/certificate and return-to-cart success/failure UI work in Arabic, Turkish, English and French.
- [ ] Authorized **bank sandbox-only** run separately tests Albaraka 2D/3DS, PayFor routing, cards and failed/declined/delayed/replayed callbacks, with signed provider references. Do not use live tokens, accounts, cards or donor profiles.
- [ ] Verify exact amounts, currency, cart allocation, optional staff-support and fee totals; no duplicate project rows/charges.
- [ ] Reconcile ledger/PAID/FAILED/paidAt and raw provider references against project counters, reports and receipts; failed attempts visually linked for overview must remain unchanged in the raw financial ledger.
- [ ] Daily, Friday-weekly and monthly subscriptions, mixed one-time+recurring carts, renewal retries, webhook idempotency and parallel callbacks have separate captured assertions.
- [ ] Confirm no guest/other-donor access to private donations, tokens or financial receipts.

## C. Tracking / privacy acceptance

- [ ] Browser network capture before consent, after denial, after grant and after withdrawal on approved staging, with entirely fabricated identities. Ensure Clarity/GTM/GA4/Meta/TikTok/X do not send PII, receipt/guest token, bank transaction ID or sensitive URL.
- [ ] Public -> cart/checkout/account -> public, fast pushState/back/forward and query-only URL changes do not leak a Clarity recording of sensitive screens.
- [ ] GTM Tag Assistant container inventory proves no duplicate GA4/Google Ads loading, pageviews or `purchase` from container plus site scripts.
- [ ] Meta Test Events and GA4 DebugView with fabricated donors prove one server-verified paid conversion per donation, correct event_id dedup, never on visit/refresh of success page, and no purchase for failed/pending.
- [ ] Verify only non-secret tracking configuration reaches public API; admin-only mutation remains authorized.

## D. Approval matrix

| Gate | Status | Evidence URL / signed record | Reviewer / date |
|---|---|---|---|
| Latest HEAD GitHub CI | RECHECK AFTER LAST COMMIT | | |
| Production VPS/PM2/Nginx | BLOCKED — external evidence | | |
| Mongo/Redis/Cron separation | BLOCKED — external evidence | | |
| Staging E2E (connected) | BLOCKED — deliberately skipped in CI | | |
| Bank sandbox and reconciliation | BLOCKED — provider QA evidence | | |
| Clarity/GTM privacy network | BLOCKED — staging capture | | |
| Backup/rollback rehearsal | BLOCKED — operator evidence | | |
| Financial authorization | BLOCKED — named reviewer | | |
| Security/privacy authorization | BLOCKED — named reviewer | | |
| Production release approval | NO-GO | | |

**Production procedure once all checks are signed:** independent operator verifies the final SHA and current main, preserves backup and rollback target, merges only reviewed clean RC by authorized GitHub workflow, deploys to Radore by its approved release method, rechecks Nginx/PM2/build-info and performs safe read-only postdeploy monitoring. Any paid probe requires explicit finance authorization and controlled test credentials. Stop and rollback on financial mismatch, duplicate conversion or PII transmission.

This is a release acceptance record, not permission to execute production actions.
