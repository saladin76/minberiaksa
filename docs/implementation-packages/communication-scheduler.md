# Package — Communication Scheduler (Vercel Cron)

Status: **done.** Path A (Vercel Cron) — automatic execution of due scheduled campaigns.
Date: 2026-07-06

## Path chosen
**Path A — Vercel Cron.** The project already runs Vercel Cron (`vercel.json`) with `CRON_SECRET`,
so scheduled communication campaigns now execute automatically via a secure cron route. The UI is
explicit either way: it says "automatic" only when cron is actually configured.

## What was added
- **Cron route** `app/api/cron/communication-run-due/route.ts` (GET) — executes due scheduled
  campaigns via `runDueCampaigns({ mode: "DUE", max: 20 })`. **Fail-closed security**: it rejects the
  request unless `Authorization: Bearer $CRON_SECRET` matches; with **no `CRON_SECRET` set it rejects
  everything** (401), so it can never be a public send endpoint. Writes a `communication.scheduler.run`
  audit heartbeat each run (for "last run").
- **`vercel.json`** — added `{ "path": "/api/cron/communication-run-due", "schedule": "*/10 * * * *" }`
  (every 10 minutes). Vercel Cron automatically sends the `Authorization: Bearer $CRON_SECRET` header.
- **`lib/communication/scheduler-status.ts`** — `isSchedulerConfigured()` (= `CRON_SECRET` present) and
  `getSchedulerStatus()` (configured / scheduledCount / dueCount / lastRunAt).
- **Manual/admin route unchanged** — `POST /api/dashboard/operations/communication/campaigns/run-due`
  stays operations-guarded for manual runs; the executor (idempotent, one batch per campaign, safe final
  status, audit) is unchanged.

## Security details
- Cron route is **fail-closed**: no `CRON_SECRET` → 401 (never a public send). Match required otherwise.
- Runs as actor `SYSTEM`; every send/blocked is audited by the executor, plus a scheduler heartbeat.
- No payments/tracking touched; no external service added beyond the existing Vercel Cron mechanism.

## UI text changed (no ambiguity)
- **Campaign Builder** — when APPROVED: "الجدولة تعمل تلقائيًا…" if cron configured, else
  **"سيتم حفظ الموعد، لكن التنفيذ التلقائي يحتاج تفعيل Cron."** When SCHEDULED: same distinction + a
  manual "تشغيل يدوي" link. (`schedulerConfigured` comes from the campaign GET.)
- **Settings** — new "جاهزية الجدولة" card: Cron مُفعّل/غير مُفعّل · آخر تشغيل · حملات مجدولة · مستحقة الآن.
- **Reports** — a card when scheduled campaigns are past due: auto-run note if configured, else an
  amber warning to enable Cron / run manually.

## How to activate cron (steps)
1. In Vercel → Project → **Settings → Environment Variables**, set **`CRON_SECRET`** to a long random
   string (all environments).
2. Ensure `vercel.json` `crons` includes `/api/cron/communication-run-due` (already added).
3. Redeploy. Vercel registers the cron and calls the route every 10 minutes with
   `Authorization: Bearer $CRON_SECRET`.
4. Verify: Settings → جاهزية الجدولة shows "Cron مُفعّل" and "آخر تشغيل" updates within ~10 minutes.
   Manual test: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/communication-run-due`.

## Env var
- **`CRON_SECRET`** — shared secret for all cron routes; required for the scheduler to run and to
  authorize the endpoint. Without it the scheduler route is disabled (401) and the UI says scheduling
  needs Cron activation.

## Build result
- `npx tsc --noEmit` — 0 new errors. `npx next build` — green (see final response).
