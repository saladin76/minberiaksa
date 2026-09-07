# Package — Provider Live QA Readiness & Test Tools

Status: **done.**
Date: 2026-07-06

Scope was strictly QA/readiness for the communication providers: safe, single-shot test sends and a
webhook readiness view. No campaign UX changes, no payments/tracking changes, no secrets exposed, no
bulk send.

## What was added

### APIs (operations/admin-guarded, `no-store`)
1. **WhatsApp health** — `POST /api/dashboard/operations/communication/providers/whatsapp/health`
   Body: `{ senderId }` or `{ phoneNumberId }`. Resolves the sender's `phoneNumberId` and asks Meta for
   `verified_name` / `quality_rating` / `display_phone_number`. Returns
   `{ ok, displayPhoneNumber, qualityRating, verifiedName }` or `{ ok: false, reason }`. **Never returns
   any token.**
2. **WhatsApp test template** — `POST .../providers/whatsapp/test-template`
   Body: `{ confirm: true, senderId, to, templateName, languageCode? }` (`languageCode` default `ar`).
   Requires `confirm: true`. Archives a `CommunicationDelivery` (`origin: TEST`) **before** sending,
   sends ONE approved template via the Meta adapter, and marks **SENT only if Meta accepted** (stores the
   `wamid`). Missing config / sender-without-number → **SKIPPED**; provider failure → **FAILED**, always
   with a safe reason code. No bulk, no free text — approved template only.
3. **Email test** — `POST .../providers/email/test`
   Body: `{ confirm: true, to, subject?, html?/body? }`. Requires `confirm: true`. Archives a
   `CommunicationDelivery` (`origin: TEST`) **before** sending, sends ONE email via the SendGrid wrapper.
   SendGrid returns no external message id, so on acceptance the delivery advances to **SENT via
   `internalAccepted`** (never a fabricated external id). Missing config → **SKIPPED**; failure →
   **FAILED**.

### UI — `/dashboard/operations/communication/settings`
New **"اختبار المزوّدين مباشرة"** section (client component `_components/ProviderTestPanel.tsx`):
- **WhatsApp test** — sender dropdown (fetched from the senders API, WhatsApp senders that have a number
  only), test recipient, template name, language, **"إرسال اختبار واتساب"**, plus a **"فحص الجاهزية"**
  (health) button. Shows the last result (تم الإرسال / لم يُرسل — سبب / فشل).
- **Email test** — recipient email, optional subject, **"إرسال اختبار إيميل"**, last result.
- **Webhook** — copyable webhook URL (`<origin>/api/webhooks/meta/whatsapp`), التحقق بالتوقيع (mُعد؟),
  آمن للإنتاج؟, آخر حدث مستلم.

## Safety behavior
- Every test route requires `confirm: true`; nothing sends on a stray GET/POST.
- The delivery is archived **before** the send, so even a crash mid-send leaves an auditable record.
- **Never fake SENT**: WhatsApp needs a real `wamid`; Email needs `internalAccepted` acceptance from the
  provider. Anything else is SKIPPED (missing config) or FAILED (real error).
- Test recipient is **never** saved as a donor — `recipientUserId` stays null on TEST deliveries.
- No secrets or tokens are ever returned or logged; failures surface **safe reason codes** only.
- Single recipient only — there is no bulk path in any of these routes.
- Webhook status updates (SENT → DELIVERED/READ) naturally update the TEST delivery by its
  `providerMessageId` through the existing webhook service.

## What needs real credentials
- **WhatsApp health / test** needs `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID`,
  a `CommunicationSender` with a real `phoneNumberId`, and an **approved** template name in the target
  language. Without them the health check reports "غير جاهز" and the test send returns SKIPPED
  (`META_WHATSAPP_NOT_CONFIGURED`).
- **Email test** needs the SendGrid credentials the email wrapper reads. Without them the test returns
  SKIPPED (`EMAIL_PROVIDER_NOT_CONFIGURED`).
- **Webhook "آمن للإنتاج"** requires `META_WHATSAPP_APP_SECRET` (signature verification). Without it the
  panel shows "يحتاج رمزًا سريًا" and the production webhook rejects unverifiable events (401).

## Build result
- `npx tsc --noEmit` — no new errors. `npx next build` — green (see final response).
