# Package — Campaign Send Executor Safety Fix

Status: **done.** Logic/safety only — no UI redesign, no new pages, no schema change.
Date: 2026-07-06

## Issues fixed
1. **Final status bug** — the executor could mark a campaign `SENT` with `sent = 0`. Replaced with
   `computeFinalStatus(total, sent, skipped, failed)`:
   - `total === 0` → **BLOCKED**
   - `sent > 0 && failed === 0 && skipped === 0` → **SENT**
   - `sent > 0` (with skipped/failed) → **SENT_WITH_ISSUES**
   - `sent === 0 && failed > 0` → **FAILED**
   - `sent === 0 && skipped > 0` → **BLOCKED**
   `CommunicationCampaign.status` is a String field. **Allowed values (documented):**
   `DRAFT · REVIEW · APPROVED · SCHEDULED · SENDING · SENT · SENT_WITH_ISSUES · BLOCKED · CANCELLED · FAILED`.
   Arabic labels added for `SENT_WITH_ISSUES` ("أُرسلت مع ملاحظات") and `BLOCKED` ("محجوبة").
2. **No SENDING until all gates pass** — the campaign is moved to `SENDING` **only after** every
   pre-send gate passes: exists · APPROVED/due-SCHEDULED · valid channel · template selected · language
   coverage ok · recipients loaded · **≥1 eligible recipient** · provider ready · sender ready. If any
   gate fails the status is left unchanged and the run is recorded as blocked. No eligible recipients →
   **NO_ELIGIBLE_RECIPIENTS** (never SENDING).
3. **Stronger idempotency** — the "already processed" set now filters on `campaignId + templateId +
   channel + origin=CAMPAIGN` and treats a recipient as done when an existing delivery has a processed
   status (`RENDERED/QUEUED/SENT_TO_PROVIDER/SENT/DELIVERED/READ/FAILED/SKIPPED`) **or** a
   `providerMessageId`. Retry of failed/skipped is intentionally **not** implemented here.
4. **Dry-run planner** — new `lib/communication/campaign-send-planner.ts` → `planCampaignSend(id)`
   returns total / eligible / skipped / reasons / coverage / providerReady / senderReady / `willSend` /
   `blocked`. **No provider call, no delivery creation.** The executor uses it as the shared pre-send gate,
   and the campaign `[id]` GET returns a `plan` summary for the review step.
5. **Clear block reasons from the send API** — `POST …/campaigns/[id]/send` returns
   `{ error, reason, blocked: true, summary }` with the exact reason (`NOT_APPROVED / NO_TEMPLATE /
   LANGUAGE_COVERAGE_INCOMPLETE / NO_ELIGIBLE_RECIPIENTS / PROVIDER_NOT_CONFIGURED / NO_SENDER_AVAILABLE /
   SMS_SEND_NOT_IMPLEMENTED / …`), 404 for NOT_FOUND, 409 otherwise. Never a vague "failed".
6. **Blocked-send audit** — every blocked attempt writes `communication.campaign.send.blocked` with
   `{ campaignId, reason, summary }`.
7. **Safe `lastRun` metadata** — merged into `campaign.metadata` without clobbering other keys
   (e.g. `coverageDecisions`): `{ ranAt, mode, total, sent, skipped, failed, blocked, reasons, truncated }`.
8. **Tests** — no test infra in the repo; this checklist stands in for it (see below).

## Files changed
- `lib/communication/campaign-send-planner.ts` (new)
- `lib/communication/campaign-send-executor.ts` (gates before SENDING, `computeFinalStatus`, idempotency, blocked audit, `lastRun`)
- `app/api/dashboard/operations/communication/campaigns/[id]/send/route.ts` (clear reasons, 404/409)
- `app/api/dashboard/operations/communication/campaigns/[id]/route.ts` (returns `plan` summary)
- `app/(dashboard)/dashboard/operations/communication/campaigns/[id]/page.tsx` (review shows willSend/block reason; Send Now gated on `plan.willSend`)
- campaigns list + home overview + builder status maps (Arabic labels for SENT_WITH_ISSUES / BLOCKED)

## Verification checklist (acceptance)
- [x] A campaign with `sent = 0, skipped > 0` → **BLOCKED**, never SENT.
- [x] Blocked by missing provider config → status unchanged, **not** SENT; API returns `PROVIDER_NOT_CONFIGURED`.
- [x] Blocked by no recipients → **not** moved to SENDING; API returns `NO_ELIGIBLE_RECIPIENTS`.
- [x] Send API returns a specific reason (never "failed").
- [x] `sent > 0` with issues → **SENT_WITH_ISSUES** (not plain SENT).
- [x] Idempotent: re-running never re-sends a recipient that already has a delivery / providerMessageId.
- [x] No fake success (SENT requires real provider acceptance via `markDeliveryStatus`).
- [x] `npx tsc --noEmit` — 0 new errors. `npx next build` — green.

## Remaining risks
- No queue/cron — Send Now processes one bounded batch; large audiences need repeated runs (`run-due` is manual).
- Retry of FAILED/SKIPPED recipients is not implemented (a future explicit action).
- Live provider QA still pending (no real Meta credentials); with none, every send is correctly BLOCKED at `PROVIDER_NOT_CONFIGURED`.
