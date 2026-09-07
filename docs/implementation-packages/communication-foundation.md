# Package 1 — Communication Foundation

## Goal

Establish the Communication Center as the official architecture for WhatsApp, Email, and SMS without enabling external sending yet.

## Completed

- Added official communication domain layer under `lib/communication`.
- Added communication domain types:
  - providers
  - channels
  - templates
  - contact preferences
  - transactional flows
  - delivery logs
- Added provider registry:
  - Meta WhatsApp Cloud API
  - Brevo Email
  - Brevo SMS
  - SMS fallback provider
- Added communication overview service that maps existing safe messaging data into the new communication domain.
- Added official route `/dashboard/operations/communication`.
- Kept existing `/dashboard/operations/messaging` working as the current UI route.
- Updated operations hub to point to the official communication center route.
- Renamed product language from Messaging Center to Communication Center in the UI.
- Documented the architecture audit and build rules.

## Kept from existing system

- Existing messaging templates and campaigns.
- AuditLog-backed temporary persistence.
- Manual review and manual execution workflow.
- Editable/removable sample data.

## Explicitly not included

- No real provider sending.
- No API keys in frontend.
- No bulk campaign send.
- No automatic send.
- No provider webhooks yet.
- No contact consent enforcement yet.

## Next package

Package 2: Provider Connections.

It should add a proper provider connections page, provider configuration status, health placeholders, and safe test connection placeholders without sending real messages.
