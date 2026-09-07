# Package 3 — Templates & Variables

## Goal

Create the official template and variables layer for the Communication Center, while keeping the existing messaging template storage working.

## Completed

- Added standard communication template variables:
  - `lib/communication/template-variables.ts`
- Added safe internal template renderer:
  - `lib/communication/template-renderer.ts`
- Added internal template preview API:
  - `/api/dashboard/operations/communication/templates/preview`
- Added official templates and variables page:
  - `/dashboard/operations/communication/templates`
- Updated Communication Center overview to link to the official templates page.

## Supported variables

- `{{donor_name}}`
- `{{amount}}`
- `{{currency}}`
- `{{campaign_name}}`
- `{{donation_id}}`
- `{{receipt_url}}`
- `{{payment_retry_url}}`
- `{{language}}`

## Safety rules preserved

- Preview only.
- No real sending.
- No provider calls.
- No automatic send.
- Unknown variables are detected and surfaced.
- Existing legacy messaging templates remain editable and removable.

## Current storage approach

The page maps existing messaging templates into the official Communication Template shape using `getCommunicationCenterOverview`.

## Next package

Package 4: Consent & Contact Preferences.

It should add contact preferences, opt-in/opt-out states, do-not-contact flags, preferred language, country code, and consent source/history placeholders before any real sending is added.
