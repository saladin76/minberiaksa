# Package — Communication Campaigns & Delivery Archive (send-disabled)

Status: **done.** No real sending, no webhooks, no Inbox. Legacy untouched.
Date: 2026-07-05

## Goal
The full campaign workflow (draft → audience → template → language coverage → sender routing →
review → approval) plus the delivery archive and provider-events views — with **real external
sending disabled** behind a ProviderRouter that has safe no-provider behavior.

## Campaign workflow implemented
Step-based builder at `/dashboard/operations/communication/campaigns` (list + create) and
`/campaigns/[id]` (detail):
1. **Basics** — name, channel (WHATSAPP/EMAIL/SMS), purpose (MARKETING/UTILITY/TRANSACTIONAL/AUTHENTICATION).
2. **Audience** — pick a language segment (or all); shows per-locale eligibility breakdown
   (eligible / needs-review / missing contact / opted-out / do-not-contact) from `campaign-recipient-service`.
3. **Template** — pick a WhatsApp/Email template (SMS reuses WhatsApp text templates via `template-compat`).
4. **Language coverage** — per-locale EXISTS / FALLBACK / MISSING against the template's `translations`;
   missing-with-recipients languages require an explicit **FALLBACK or EXCLUDE** decision (stored in
   `campaign.metadata.coverageDecisions`).
5. **Sender routing** — AUTO (by rules) or FIXED; links to the routing preview.
6. **Preview** — per-locale rendered preview (sample variables, no PII).
7. **Test + Approval** — create a test delivery record; submit for review; approve (gated); cancel.
   Schedule/send controls are **disabled** with a clear "until provider send is enabled" note.

Status lifecycle: DRAFT → REVIEW → APPROVED → SCHEDULED (SENDING/SENT remain unreachable until a
provider adapter exists). Never auto-sends.

## Delivery archive implemented
- **CommunicationDelivery** is written for every prepared/test recipient via `delivery-log-service`
  (`createDeliveryRecord` before send, `recordSkippedDelivery(reason)`, `markDeliveryStatus`).
- `/dashboard/operations/communication/delivery-logs` — filter by channel/status (+ provider/locale/
  campaign/sender/date via API), rendered snapshot, providerMessageId, error reason, links to donor/campaign.
- `/dashboard/operations/communication/provider-events` — lists `CommunicationProviderEvent` with the
  **sanitized payload only** (never secrets/raw). No writer yet (webhooks are a later package).
- Legacy `SentMessage` is **not** used for this — it remains the legacy archive, untouched.

## What is still send-disabled
`lib/communication/provider-router.ts` — `resolveProviderForSend(channel)` always returns
`{ canSend: false, reason }` (`META_WHATSAPP_NOT_CONFIGURED` / `EMAIL_PROVIDER_NOT_CONFIGURED` /
`SMS_PROVIDER_NOT_CONFIGURED`). So every test/campaign recipient is recorded **SKIPPED** with that
reason — never SENT, never faked. Schedule/Send UI is disabled. Real sending arrives only when the
Meta WhatsApp (and Email/SMS) adapters are wired in a later package.

## How language coverage works
`computeLanguageCoverage(recipientLocaleCounts, availableTemplateLocales)` compares the campaign's
per-locale eligible recipients against the template's available locales (base `ar` + `translations`
keys). Any MISSING locale that has recipients must be resolved (FALLBACK or EXCLUDE) before approval —
`campaign-approval-service.evaluateCoverageGate` blocks approval while any missing language is undecided.

## How approval works
`campaign-approval-service`: `submitForReview` (DRAFT→REVIEW), `approveCampaign` (REVIEW→APPROVED,
**blocked** by the coverage gate), `transitionCampaignSafe` for schedule/cancel. Approval records
`approvedBy`/`approvedAt`; every transition writes `AuditLog` (`communication.campaign.*`). No send.

## Services
New: `provider-router.ts`, `template-compat.ts`, `campaign-recipient-service.ts`,
`campaign-render-service.ts`, `campaign-approval-service.ts`. Extended: `campaign-service.ts`
(`updateCampaign`), `delivery-log-service.ts` (broader filters + `listProviderEvents`).

## Safety
- No payment, tracking, Twilio, or SendGrid changes. Legacy `/dashboard/templates` + `/dashboard/messages`
  and `SentMessage`/`WhatsappTemplate`/`EmailTemplate`/`MessageTrigger` untouched.
- No provider calls, no sends, no fake SENT, no secrets to the frontend. All mutations audited.

## Validation
- `npx tsc --noEmit` — new files add **0 errors**.
- `npx next build` — green (see final response).
- Manual: create a draft campaign, pick audience+template, resolve coverage, run a test → a SKIPPED
  CommunicationDelivery appears in Delivery Logs with reason `*_NOT_CONFIGURED`.

## Remaining next package
Meta WhatsApp Cloud API adapter (`lib/communication/providers/meta-whatsapp/`) + webhook receiver
(idempotent `CommunicationProviderEvent`) → flips ProviderRouter to real sends behind approval; then Inbox.
