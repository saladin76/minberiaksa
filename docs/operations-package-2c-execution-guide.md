# Operations Package 2C — Prisma Activation Guide

## Purpose

Package 2C activates the first Operations data models in `prisma/schema.prisma`.

Because `schema.prisma` is large and critical, this package must be executed in a full code environment where validation and build commands can run before merge.

## Models to Add

Append the following section after the current Platform Sync models in `prisma/schema.prisma`.

```prisma
/* ===================== OPERATIONS CONTENT HUB ===================== */

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

## Safety Rules

- Do not replace the whole schema file.
- Append the models only once.
- Do not add relations to User, Marketing, Campaign, or Donation in this package.
- Keep all foreign references as scalar ObjectId fields for now.
- Do not add UI, APIs, sidebar links, or permissions in this package.

## Validation Commands

Run these before opening or merging the PR:

```bash
npx prisma validate
npx prisma generate
npm run build
```

## Acceptance Criteria

- `prisma/schema.prisma` remains intact.
- Only `ContentPlan` and `ContentItem` are added.
- Prisma validation passes.
- Prisma client generation passes.
- Application build passes.
- No runtime or UI behavior changes are introduced.

## Next Package

After Package 2C is active and validated, continue with Package 3A:

- `/dashboard/operations/content`
- UI shell only
- static sample data
- no API writes yet
