# Package — Communication Senders, Routing & Donor Profiles (UI + automation)

Status: **done.** No sending, no provider calls, no webhooks, no Inbox. Legacy untouched.
Date: 2026-07-05

## Goal
Real dashboard UI + APIs for Communication senders and routing rules, automatic
DonorCommunicationProfile updates on paid donations, and profile-aware language audiences —
all configuration/read only, built on Package 1's models and services.

## Pages added
- **`/dashboard/operations/communication/senders`** — list WhatsApp/Email/SMS senders (provider,
  channel, display name, supported locales/countries/purposes, status, default, priority);
  create/edit; enable/disable; **set one default per channel**. No secret/token fields. Empty +
  error states + a no-send/no-secrets safety notice.
- **`/dashboard/operations/communication/routing`** — list routing rules; create by
  channel/locale/country/purpose with primary + fallback sender + priority; enable/disable; and a
  **live routing preview** (input → selected sender or skip reason) that runs the pure `sender-router`
  on real senders/rules. Warns when no senders exist yet; "configuration only until provider send is enabled" notice.
- **`/dashboard/operations/communication/preferences`** — upgraded: keeps the existing audit-backed
  contact-preferences (compatibility) and adds a read-only **runtime DonorCommunicationProfile** panel
  (auto-created from paid donations: locale, channel opt-ins, WhatsApp needs-review state).
- Communication overview + Audiences page updated to surface the new sections and the WhatsApp-eligible count.

## APIs added (server-side, operations-guarded, no-store)
- `GET/POST/PATCH /api/dashboard/operations/communication/senders` (PATCH also `makeDefault`).
- `GET/POST/PATCH /api/dashboard/operations/communication/routing` (GET returns rules + senders).
- `POST /api/dashboard/operations/communication/routing/preview` — configuration-only routing result.
- `GET/PATCH /api/dashboard/operations/communication/profiles` — list + consent update.
- New `_auth` helper `requireOperationsApiSession()` so handlers can attribute audit actions.

## How donor profiles update (automation)
`lib/events/dispatch.ts → dispatchDonationPaid` now calls `upsertProfileForUser(donorId, { donationLocale })`
**best-effort** (wrapped in try/catch, never blocks donation success, no sends). It:
1. resolves the donor, 2. resolves locale (`User.preferredLang` → `Donation.locale` → country-to-locale →
default), 3. normalizes via `lib/locales.ts`, 4. upserts the profile, 5. sets `lastDonationAt`,
6. recomputes `totalDonations`, 7. copies phone/email/countryCode from User. Email/SMS opt-ins mirror
`emailNotifications`/`smsNotifications`; **WhatsApp opt-in is never assumed** (stays false → NEEDS_REVIEW).
No payment logic changed.

## How audiences now work
`lib/communication/audience-service.ts` prefers the runtime profile:
- **WhatsApp**: eligible only when a profile has `whatsappOptIn: true` (counted from
  `DonorCommunicationProfile`); phone contacts without it are NEEDS_REVIEW.
- **Email/SMS**: use profile opt-ins when a profile exists, else fall back to
  `User.emailNotifications`/`smsNotifications` (the profile mirrors these, so counts stay consistent).
- `donorChannelEligibility(donor, channel, profile?)` applies the same prefer-profile-then-fallback
  logic per donor and honours `doNotContact`.

## Safety guarantees
- No frontend secrets; sender forms have no token fields and the API returns no secrets.
- No provider calls, no message sends, no fake success anywhere.
- Create/update/transition/consent/routing changes write `AuditLog` (`communication.*`, `externalCall:false`).
- Legacy untouched: `SentMessage`, `WhatsappTemplate`, `EmailTemplate`, `MessageTrigger`, Twilio
  (`lib/whatsapp.ts`), SendGrid (`lib/email.ts`). Donation flow unchanged except a best-effort,
  non-throwing profile sync. No payment or tracking changes.

## Validation
- `npx tsc --noEmit` — new files add **0 errors** (pre-existing `d.type` baseline errors in dispatch.ts unchanged).
- `npx next build` — green (see final response).

## Remaining next package
Meta WhatsApp Cloud API adapter skeleton (`lib/communication/providers/meta-whatsapp/`, server-only,
gated on `META_WHATSAPP_NOT_CONFIGURED`), sender health checks, and webhook verification — still no
production sends. Then templates + language coverage, campaign send-with-approval + delivery archive, and Inbox.
