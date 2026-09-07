# Package 2 — Provider Connections

## Goal

Add a safe provider connections layer for the Communication Center without enabling real sending or exposing secrets.

## Completed

- Added server-side provider readiness service:
  - `lib/communication/provider-connections.ts`
- Added official provider connections page:
  - `/dashboard/operations/communication/providers`
- Added provider connections API:
  - `/api/dashboard/operations/communication/providers`
- Replaced the official Communication Center route with a real overview page:
  - `/dashboard/operations/communication`
- Kept the older messaging page active for templates and campaigns:
  - `/dashboard/operations/messaging`

## Providers covered

- Meta WhatsApp Cloud API
- Brevo Email
- Brevo SMS
- SMS fallback provider

## Safety rules preserved

- No real sending.
- No provider calls.
- No test send yet.
- No secrets or API keys returned to the frontend.
- Provider readiness is calculated on the server.
- Missing settings are shown as safe checklist items only.

## Environment readiness checks

The server checks whether expected environment values exist, but never returns their values to the frontend.

## Next package

Package 3: Templates & Variables.

It should move templates from the legacy messaging model into the official Communication Template structure, add variables, preview, review states, and provider template IDs.
