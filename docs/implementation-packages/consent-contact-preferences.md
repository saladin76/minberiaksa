# Package 4 — Consent & Contact Preferences

## Goal

Add the consent and contact preference layer before any real communication sending is introduced.

## Completed

- Added foundation contact preference data:
  - `lib/communication/contact-preferences-data.ts`
- Added consent eligibility rules:
  - `lib/communication/consent-eligibility.ts`
- Added audit-backed contact preferences repository:
  - `lib/communication/contact-preferences-repository.ts`
- Added contact preferences API:
  - `/api/dashboard/operations/communication/preferences`
- Added contact preferences dashboard page:
  - `/dashboard/operations/communication/preferences`
- Added dashboard components:
  - `components/communication/ContactPreferenceCreate.tsx`
  - `components/communication/ContactPreferenceActions.tsx`
- Linked the preferences page from the Communication Center overview.

## Covered preference fields

- Contact identifier
- Email opt-in
- SMS opt-in
- WhatsApp opt-in
- Preferred language
- Country code
- Do-not-contact flag
- Consent source
- Last consent timestamp

## Safety rules preserved

- No real sending.
- No provider calls.
- No automatic message execution.
- Preferences are stored internally through AuditLog.
- Sample preference records remain removable.
- The eligibility rules are advisory and do not trigger any outbound action.

## Next package

Package 5: Transactional Flows.

It should define internal communication flows for donation success, failed payment, receipt issued, monthly payment failure, and large donation thank-you. The first version should be simulation-only.
