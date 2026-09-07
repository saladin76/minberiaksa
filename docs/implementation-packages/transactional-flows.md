# Package 5 — Transactional Flows

## Goal

Add internal transactional communication flows for donation platform events without executing any real outbound communication.

## Completed

- Added foundation transactional flows:
  - `lib/communication/transactional-flows-data.ts`
- Added audit-backed transactional flow repository:
  - `lib/communication/transactional-flows-repository.ts`
- Added transactional flows API:
  - `/api/dashboard/operations/communication/flows`
- Added transactional flows page:
  - `/dashboard/operations/communication/flows`
- Linked the flows page from the Communication Center overview.

## Covered events

- Donation success
- Payment failed
- Receipt issued
- Monthly donation failed
- Large donation thank-you

## Safety rules preserved

- Simulation-only.
- No real sending.
- No provider calls.
- No automatic execution.
- No queue yet.
- No webhook handling yet.
- Flow data is stored internally through AuditLog.

## Notes

Status actions were intentionally not added in this package's first pass to keep the flow page read-only and reduce operational risk. The API supports safe internal updates for later dashboard controls.

## Next package

Package 6: Delivery Logs, Webhooks & Test Send.

It should add delivery log structure, provider message id placeholders, webhook receiver placeholders, status updates, failure reasons, cost estimate, and test-send-only guardrails.
