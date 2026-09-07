# Official Provider Integration Standards

This document is the required foundation and checklist before adding any external provider integration.

The goal is to keep Marketing, Content Scheduling, Archive, Brand Center, and AI features connected through one safe shared provider layer instead of scattered one-off integrations.

## Purpose

External integrations must be based on official platform documentation, not memory, guesses, or copied snippets.

This protects the project from:

- unsupported fields,
- unsafe OAuth assumptions,
- leaked secrets,
- duplicate tracking,
- fake sync implementations,
- and UI states that claim a platform is connected when it is not ready.

## Core rule

Every provider integration must start with official documentation and a small internal contract before implementation.

```text
Official docs first
↓
Required permissions and APIs
↓
Provider schema
↓
Connection health
↓
Sync, events, and webhooks
↓
Safe implementation
↓
Repository documentation
```

## Required implementation order

1. Read the official provider documentation.
2. Identify the supported API product and version.
3. Identify required scopes, permissions, account ids, and tokens.
4. Define the provider capabilities in the provider catalog.
5. Define readiness checks before creating UI or sync jobs.
6. Keep secrets server-side only.
7. Add sync, events, or webhook code only after the provider contract is clear.
8. Add short internal comments explaining why the structure exists.

## Provider categories

Providers must be classified before they are displayed or implemented.

### Pixels and APIs

Used for browser pixels, server conversion APIs, event APIs, tags, and internal API keys.

Examples:

- Meta Pixel and Conversions API
- Google Tag, GA4, and Google Ads conversions
- TikTok Pixel and Events API
- X Pixel
- OpenAI API
- Internal webhooks

### Ad and analytics accounts

Used for reporting, ad spend, campaign data, attribution comparison, and platform sync.

Examples:

- Meta Ads accounts
- Google Ads accounts
- GA4 properties
- TikTok advertiser accounts
- X Ads accounts

### Messaging providers

Used for scheduled messages, campaign sending, delivery status, and click tracking.

Routing rule:

- Turkey SMS should use Netgsm.
- International SMS should use Twilio.
- WhatsApp and email providers must be represented as separate capabilities.

### Email providers

Used for newsletters, donor journeys, transactional messages, and campaign email delivery.

### AI providers

Used for shared assistant infrastructure, analysis, content support, and recommendations.

### Internal APIs

Used for internal webhooks, server events, dashboard automation, and trusted backend-to-backend actions.

## Required provider contract

Each provider entry must define:

- Stable provider key
- Display name
- Category
- Supported capabilities
- Required official docs
- Required credentials shape
- Public browser fields, if any
- Secret server fields, if any
- Readiness checks
- Supported environments
- Sync lifecycle
- Webhook or event lifecycle
- Security notes

## Readiness model

Every provider should expose readiness in three layers when applicable:

1. Browser readiness: pixel, tag, or client-side event support.
2. Server readiness: conversion API, Events API, webhook, or secure server-side calls.
3. Reporting readiness: ads, analytics, messages, delivery, or campaign data pull.

A provider can be configured but not ready. UI must show the difference.

## Security rules

- Never expose access tokens, refresh tokens, client secrets, developer tokens, private keys, or API secrets in client components.
- Store secrets only in server-side models, environment variables, or encrypted storage.
- Public runtime config may include only safe ids, such as pixel ids or public measurement ids.
- UI should show masked credentials and health states, not raw secrets.
- OAuth scopes and permissions must be documented before implementation.
- Provider health must be separated from account performance.
- Do not mark conversions or sync as successful before the real provider call succeeds.

## Data ownership

The dashboard must keep separate layers for:

- Site truth: donations and payment state.
- Tracking truth: conversion events and delivery status.
- Platform truth: synced ad platform reports.
- Campaign truth: generated links, campaign IDs, ad IDs, and UTM parameters.
- Content truth: archive assets and production state.

Recommendations and AI assistants must read from these contracts instead of guessing from raw UI state.

## Foundation providers

Initial provider coverage should include:

- Meta
- Google Ads
- GA4
- TikTok
- X
- Twilio
- Netgsm
- Email provider
- WhatsApp provider
- OpenAI
- Internal API

Adding a provider to the catalog does not mean that a runtime integration exists. The catalog describes intended support, required docs, and capability boundaries.

## Coding rules

- Use a catalog entry before building provider UI.
- Keep provider metadata separate from API clients.
- Keep API clients separate from pages and components.
- Avoid duplicated hardcoded provider names across pages.
- Keep comments short and useful.
- Add links to official documentation in the catalog where possible.

## AI Core rule

The project should use one shared AI core API layer, with separate assistant contexts for:

- marketing,
- content and operations,
- archive,
- brand.

The UI may show different assistants, but the infrastructure should not duplicate AI provider logic.

## Implementation rule

Runtime implementation must be added in small PRs:

1. Provider contract and docs.
2. Connection UI.
3. Health checks.
4. Read-only sync.
5. Event or webhook handling.
6. Write actions, only when needed.

Avoid large PRs that mix UI, credentials, sync, events, recommendations, and AI prompts at once.
