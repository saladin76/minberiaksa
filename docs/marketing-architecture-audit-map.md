# Marketing Architecture Audit Map

## Purpose

This document maps the current Marketing system before changing navigation, removing files, or rebuilding UI.

The project already has many Marketing pages and services. The next step is organization and cleanup, not a full rebuild.

## Current sidebar state

`lib/dashboard/nav-config.ts` currently exposes Marketing as one dashboard item:

- `/dashboard/marketing` — نظام التسويق

This is too small for the actual Marketing surface area that already exists in the repository.

## Existing Marketing pages discovered

### Main Marketing group

- `/dashboard/marketing`
- `/dashboard/marketing/google-ads`
- `/dashboard/marketing/sync-log`
- `/dashboard/marketing/insights`
- `/dashboard/marketing/tracking-hub`
- `/dashboard/marketing/ai-assistant`

### Marketing Intelligence group

- `/dashboard/marketing-intelligence`
- `/dashboard/marketing-intelligence/decisions`
- `/dashboard/marketing-intelligence/platform-status`

### Related operational marketing pages

- `/dashboard/link-generator`
- `/dashboard/referrals`
- `/dashboard/ads`
- `/dashboard/pixels`
- `/dashboard/conversion-events`

## Existing foundations

### Shared Provider Foundation

- `docs/integrations/official-provider-standards.md`
- `lib/marketing/integrations/provider-types.ts`
- `lib/marketing/integrations/provider-catalog.ts`

### Existing connection system

- `/dashboard/marketing/connections`
- `app/(dashboard)/dashboard/marketing/connections/_components/platform-meta.ts`
- `lib/marketing/platform-connection-requirements.ts`
- `lib/marketing/connection-serializer.ts`

### Existing sync system

- `app/api/admin/marketing-platform-sync/route.ts`
- `lib/marketing/sync/*`

## Initial classification

| Area | Current state | Recommendation |
| --- | --- | --- |
| Sidebar | Marketing appears as one item only | Expand into a clear Marketing & Growth group |
| Provider metadata | Split between old UI metadata and new provider catalog | Keep UI metadata temporarily; migrate gradually to provider catalog |
| Connections | Existing functional UI/API | Do not rebuild; improve by reading provider catalog in a later PR |
| Marketing Intelligence | Multiple pages exist | Group under Marketing & Growth instead of leaving scattered |
| Link Generator | Currently under General Admin/referrals area | Move conceptually under Campaign Builder / Marketing |
| Ads/Pixels/Conversion Events | Related to Marketing | Group conceptually under Marketing, but avoid route changes until navigation plan is stable |

## Cleanup rules

Do not delete files only because they look old.

A file can be removed only when:

1. It is not imported or linked from active routes.
2. It is not part of tracking, sync, webhook, payment, or integration runtime.
3. It is not required for permission/nav mapping.
4. A replacement source exists and is already wired.

## Recommended navigation target

```text
Marketing & Growth
├─ Overview                  /dashboard/marketing
├─ Connections               /dashboard/marketing/connections
├─ Tracking Hub              /dashboard/marketing/tracking-hub
├─ Insights                  /dashboard/marketing/insights
├─ Platform Status           /dashboard/marketing-intelligence/platform-status
├─ Decisions                 /dashboard/marketing-intelligence/decisions
├─ Google Ads                /dashboard/marketing/google-ads
├─ Sync Log                  /dashboard/marketing/sync-log
├─ AI Assistant              /dashboard/marketing/ai-assistant
├─ Campaign Builder          /dashboard/link-generator
├─ Pixels & Tracking         /dashboard/pixels
├─ Conversion Events         /dashboard/conversion-events
└─ Ads Management            /dashboard/ads
```

## Next implementation steps

1. Create a navigation-only PR that groups existing pages without moving routes.
2. Add provider catalog overview to `/dashboard/marketing/connections` in a separate safe PR.
3. Audit duplicated platform metadata after the navigation is stable.
4. Remove only verified-unused files in small cleanup PRs.
