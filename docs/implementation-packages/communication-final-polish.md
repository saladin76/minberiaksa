# Package — Communication Center final polish (Email/SMS, reactivation, reports, nav, safety)

Status: **done.** Build green. Real external sending stays config-gated. No fake sent.
Date: 2026-07-05

## What was done
### Part 1 — Email behind ProviderRouter
`lib/communication/providers/email/client.ts` wraps the existing SendGrid path (`lib/email.ts`).
ProviderRouter EMAIL: configured when `SENDGRID_API_KEY` present + sender has `senderEmail`; else
`EMAIL_PROVIDER_NOT_CONFIGURED` / `EMAIL_SENDER_MISSING_IDENTITY`. Language variants use `EmailTemplate.translations`
(already via `template-compat`). `lib/email.ts` remains the working legacy path.

### Part 2 — SMS provider abstraction
`lib/communication/providers/sms/client.ts` — TR → Netgsm, otherwise Twilio international; both
config-gated (`NETGSM_*` / `TWILIO_*`). No credentials → `SMS_PROVIDER_NOT_CONFIGURED`. ProviderRouter SMS
is country-routed. SMS campaigns use the same audience/language/coverage/delivery system as WhatsApp/Email.

### Part 3 — Donor Reactivation → drafts
`/dashboard/operations/donor-reactivation` gains a **draft-campaign** action: creates a DRAFT
`CommunicationCampaign` (WhatsApp/Email/SMS + language) via the campaigns API and opens the builder.
No auto-send; the draft goes through the normal review/approval flow. Creation is audited.

### Part 4 — Marketing feed
Communication performance is surfaced via the reports (below) — sent/delivered/read/failed derived from
`CommunicationDelivery`. No fake attribution: with no real sends, sections are empty ("not enough data").

### Part 5 — Reports
`/dashboard/operations/communication/reports` (+ `reports-service`): delivery performance by channel and
by language, sender performance, recent failed/skipped with reason, WhatsApp replies needing action,
WhatsApp missing-consent count, and languages with recipients but no template variant. Read-only, empty states.

### Part 6 — Navigation
Communication overview surfaces Inbox, Audiences, Senders, Routing, Campaigns, Delivery Logs,
Provider Events, Reports, Templates, Providers, Preferences, Flows. Legacy `/dashboard/messages` and
`/dashboard/templates` are **kept** but labelled "الرسائل (قديم)" / "القوالب (قديم)" in the sidebar.

### Part 7 — Safety cleanup (fake-sent removed)
`lib/email.ts` (`sendBulkEmail`) and `lib/whatsapp.ts` (`sendBulkWhatsapp`) no longer count
`sent = recipients.length` when credentials are missing. They now record each recipient as **failed**
with `EMAIL_PROVIDER_NOT_CONFIGURED` / `WHATSAPP_PROVIDER_NOT_CONFIGURED`, so the trigger flow archives
FAILED (never a fake SENT). Previews/renders are separate code paths and unchanged. `sendVerificationEmail`
(registration) is untouched.

## Final checklist
- ✅ Multi-sender WhatsApp (CommunicationSender.phoneNumberId, per-sender send)
- ✅ Sender routing (locale/country/purpose/priority/fallback) + preview
- ✅ Meta provider safe (server-only, tokens scrubbed, mapped errors)
- ✅ Webhooks safe (verify token + HMAC signature + idempotency)
- ✅ Inbox works (derived conversations, phone match, unresolved states)
- ✅ Email campaigns route through Communication Center (ProviderRouter + templates + delivery archive)
- ✅ SMS campaigns route through Communication Center (country-routed, config-gated)
- ✅ Donor profiles update after donation (best-effort, no send)
- ✅ Audiences by language (profile-preferred, legacy fallback)
- ✅ Every outgoing/prepared message archived in CommunicationDelivery
- ✅ Provider events logged (sanitized, idempotent)
- ✅ No fake sent (dev fallbacks fixed; ProviderRouter gates)
- ✅ No frontend secrets
- ✅ Legacy Twilio/SendGrid preserved

## Intentionally disabled / needs real credentials
- Real outbound send (WhatsApp/Email/SMS) is **config-gated** and, in this environment (only
  `SENDGRID_*` set), effectively disabled for WhatsApp/SMS. A bulk campaign send executor is **not**
  wired — campaigns prepare + archive + approve but do not bulk-send. Enabling real sends requires
  provider credentials AND testing against the live providers (Meta WABA, Netgsm, Twilio).
- Webhooks require the app secret + verify token configured and a public URL registered with Meta.

## Not production-ready claim
This is **not** claimed production-ready for real sending: provider credentials and webhooks are not
configured or tested against live providers in this environment. The system is complete and safe as a
prepare/approve/archive operating layer with real sending gated behind configuration.
