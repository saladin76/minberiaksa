# Package — Send Execution + Dashboard UX Finalization

Status: **done (this slice).** Live provider QA still pending (no real credentials configured).
Date: 2026-07-06

## Current UX problems addressed
- Sidebar too long / advanced pages exposed as primary nav → **simplified** to 7 concise groups with
  Communication as a first-class section; legacy `messages`/`templates` and low-value pages (badges,
  slides, ticker, system-overview, team-support-defaults) removed from the sidebar (routes preserved).
- Communication Center overview too card-heavy/technical → **rebuilt as a command center**: four action
  cards (بانتظار المراجعة / تحتاج رد / فشلت / قوالب ناقصة), "ابدأ بسرعة" shortcuts, compact "حالة الإرسال",
  and "آخر الحملات". No provider internals on the overview.
- Advanced technical pages surfaced everywhere → **moved under** `/communication/settings`
  (أرقام واتساب, قواعد اختيار رقم الإرسال, سجل الرسائل, أحداث المزود) with a WhatsApp readiness checklist.

## Pages simplified / moved
- Simplified: `lib/dashboard/nav-config.ts`, `/operations/communication` (overview).
- New: `/operations/communication/settings` (advanced hub + readiness checklist).
- Advanced (now under settings, not primary): senders, routing, delivery-logs, provider-events.

## Send execution architecture (functional gap)
- **`lib/communication/campaign-send-executor.ts`** — `executeCampaignSend(id, {mode})` and
  `runDueCampaigns()`. Status gate (APPROVED for Send Now; SCHEDULED + due for scheduler), language
  coverage gate, per-recipient eligibility, idempotency per (campaign+recipient+template), batching
  (default 200), archives a `CommunicationDelivery` **before** any provider call, sends via ProviderRouter,
  marks SENT only on provider acceptance (else SKIPPED/FAILED with reason), updates campaign counters + audit.
- **`lib/communication/provider-router.ts`** — new `sendPreparedDelivery(input)`:
  - WhatsApp → Meta approved-template send (returns wamid). Email → SendGrid wrapper; SendGrid returns no
    external id → `internalAccepted` (delivery advances to SENT with null providerMessageId, documented,
    never a fake external id). SMS → `SMS_SEND_NOT_IMPLEMENTED`.
  - `resolveProviderForSend` gates on config + sender; `isSendEnabled(channel)` for UI readiness.
- **`campaign-recipient-service.loadCampaignRecipients`** — individual eligible recipients (prefers profile,
  legacy fallback) + skip reasons.
- **`delivery-log-service.markDeliveryStatus`** — accepts `internalAccepted` for provider-accepted-without-id
  (email); still rejects any success status without acceptance (no fake SENT).
- APIs: `POST …/campaigns/[id]/send` (requires `{confirm:true}` + APPROVED), `…/[id]/schedule`,
  `…/campaigns/run-due` (admin; manual until a cron hits it).
- Campaign builder wires **Send Now** (confirm) / **Schedule** when APPROVED, gated on `sendEnabled`;
  shows "الإرسال غير مفعّل بعد" otherwise.

## Production webhook security
`/api/webhooks/meta/whatsapp` POST: rejects invalid `X-Hub-Signature-256` (401); if the app secret is
**missing in production** → 401 (unverifiable rejected). In development, unconfigured secret is accepted
with a console warning so the flow can be exercised.

## What remains disabled / pending
- **SMS send** — not implemented (`SMS_SEND_NOT_IMPLEMENTED`); UI shows "غير مفعّل".
- **WhatsApp/Email live send** — code path implemented but **config-gated**: with no Meta credentials,
  every recipient is SKIPPED with `META_WHATSAPP_NOT_CONFIGURED`; email sends only if `SENDGRID_API_KEY`
  is set. No live provider QA has been run (no real credentials).
- **Scheduler** — no cron infra; `run-due` is manual/admin until an external cron calls it.
- **Further UX** — full 4-step wizard, Inbox CRM 3-pane redesign, Marketing/Operations home redesigns,
  Templates grouping — the biggest structural redesigns are **not** in this slice (documented as next work).

## Testing checklist
- `npx tsc --noEmit` — touched files add 0 new errors.
- `npx next build` — green (see final response).
- Manual: create campaign → audience/template → coverage decisions → approve → (no creds) Send Now →
  all SKIPPED with reason, campaign SENT with 0 sent, delivery-logs show SKIPPED. Webhook GET verify /
  POST signature behavior. Inbox empty/unresolved states.
