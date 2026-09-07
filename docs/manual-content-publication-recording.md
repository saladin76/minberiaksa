# Manual Content Publication Recording

Date: 2026-06-22

## What changed

- Added an audit-backed `ContentPublication` repository for manual Operations publication records.
- Added `/api/dashboard/operations/publications` with guarded no-store `GET` and `POST`.
- Updated `/api/dashboard/operations/items` so changing a saved content item to `PUBLISHED` records a manual publication marker.
- Updated Operations content item actions to show clear feedback after a manual publication record is saved.

## Safety

- Manual publication recording does not publish to any platform.
- No email, WhatsApp, SMS, social, or provider call happens.
- No payment or tracking runtime changes.
- No external platform calls.
- No AI generation.
- No frontend secrets.

## Persistence mode

The first implementation is DB-backed through `AuditLog` with `entityType = ContentPublication` and `action = operations.content-publication.manual-upsert` until a dedicated runtime `ContentPublication` model is appended.
