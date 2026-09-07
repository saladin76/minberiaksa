# Operations Package 2B — Official Content Models Plan

## Purpose

This package defines the first official Operations content-planning models before adding any Prisma schema changes.

The goal is to support the operating system requested for religious seasons, campaign planning, monthly production, publishing follow-up, ad handoff, performance review, and future recommendations.

This document is intentionally documentation-only.

## Scope

Package 2B focuses on two core entities:

1. `ContentPlan`
2. `ContentItem`

These two models form the first backbone of the Operations and Content Hub.

## Operating Flow

The long-term flow is:

```txt
Season / Occasion
→ Content Plan
→ Content Items
→ Assets / Links
→ Publishing
→ Ads Handoff
→ Results
→ Recommendation
```

Package 2B covers only:

```txt
Content Plan
→ Content Items
```

## ContentPlan

A `ContentPlan` represents a planned campaign, season, month, or operational content theme.

Examples:

- Ramadan 2027
- Dhul Hijjah / Qurban season
- Gaza emergency week
- Al-Quds Waqf campaign
- Zakat education month
- Friday giving sprint

### Proposed Fields

```prisma
model ContentPlan {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  title       String
  description String?
  status      String   @default("PLANNING")
  theme       String?
  startDate   DateTime?
  endDate     DateTime?
  ownerId     String?  @db.ObjectId
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
  @@index([startDate])
  @@index([ownerId])
}
```

### Status Values

```ts
export const CONTENT_PLAN_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
] as const;
```

### Responsibilities

A `ContentPlan` answers:

- What are we preparing for?
- Which campaign or season does this belong to?
- Who owns it?
- When does it start and end?
- Is it still planning, active, completed, or archived?

## ContentItem

A `ContentItem` represents one piece of content inside a plan.

Examples:

- Video script for Gaza week
- Instagram design for Friday giving
- Carousel about zakat
- WhatsApp message for recurring donation
- Email campaign for waqf supporters
- SMS reminder before Ramadan
- Reels concept for Al-Quds impact

### Proposed Fields

```prisma
model ContentItem {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  planId         String?  @db.ObjectId
  title          String
  brief          String?
  type           String
  status         String   @default("IDEA")
  channel        String?
  language       String?
  publishAt      DateTime?
  assetUrl       String?
  campaignLinkId String?  @db.ObjectId
  marketingNotes String?
  createdById    String?  @db.ObjectId
  assignedToId   String?  @db.ObjectId
  metadata       Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([planId])
  @@index([status])
  @@index([type])
  @@index([publishAt])
  @@index([assignedToId])
}
```

### Type Values

Initial `type` values:

```ts
export const CONTENT_ITEM_TYPES = [
  "VIDEO",
  "DESIGN",
  "CAROUSEL",
  "REEL",
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "BLOG",
  "LANDING_PAGE",
  "AD_COPY",
] as const;
```

### Status Values

```ts
export const CONTENT_ITEM_STATUSES = [
  "IDEA",
  "WRITING",
  "DESIGN",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
] as const;
```

### Responsibilities

A `ContentItem` answers:

- What content should be produced?
- Which plan does it belong to?
- What type is it?
- Which channel is it for?
- Which language is it in?
- Who is assigned?
- Has it been approved?
- Has it been published?
- Is there an asset or campaign link attached?

## Relationship to Marketing

This package does not rebuild Marketing.

Marketing remains responsible for:

- `/dashboard/marketing`
- `/dashboard/marketing/connections`
- `/dashboard/marketing/ai-assistant`
- `/dashboard/marketing/data-sync`
- `/dashboard/marketing-intelligence`
- `/dashboard/ads`
- `/dashboard/conversion-events`
- `/dashboard/link-generator`

Operations will later hand approved content and campaign links to Marketing, but it must not duplicate the marketing connection or ads systems.

## Relationship to Future Packages

Future packages can extend this foundation as follows:

### Package 2C — Active Prisma Schema

Add `ContentPlan` and `ContentItem` to `prisma/schema.prisma` in a controlled schema PR.

### Package 3 — Operations Content Board

Create a dashboard UI to list plans and items.

### Package 4 — Operations Calendar

Add calendar views for publish dates, religious seasons, and production deadlines.

### Package 5 — Production Workflow

Add tasks, assignments, review states, and approvals.

### Package 6 — Marketing Handoff

Connect approved content items to campaign links and ads handoff without duplicating Marketing.

## Not Included in This Package

- No Prisma schema change.
- No database migration.
- No API routes.
- No UI.
- No sidebar changes.
- No permissions.
- No changes to Marketing.
- No changes to payment, donation, or attribution systems.

## Acceptance Criteria

- The official model plan is documented.
- The package stays documentation-only.
- The planned models are small and reviewable.
- The next step is clear: add the two models to the active Prisma schema in a separate PR.

## Safety Rule

Do not modify `prisma/schema.prisma` in this package.

Schema activation must be handled in the next package after this plan is reviewed.
