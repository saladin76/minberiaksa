# Operations Data Model - Package 2

## Goal

Define the Operations data model before changing Prisma models.

This package intentionally starts with documentation only so the schema can be added in small safe follow-up commits.

## Operations Responsibilities

Operations owns planning and execution:

- content plans
- content items
- production tasks
- operational calendar events

Marketing remains responsible for:

- campaign links
- tracking
- conversion quality
- ad platform data
- performance analytics

## Proposed Models

### ContentPlan

Represents a focused campaign or monthly plan.

Examples:

- Ramadan content plan
- Gaza weekly plan
- Jerusalem awareness plan
- Zakat campaign plan

Important fields:

- title
- description
- status
- startDate
- endDate
- theme
- ownerId
- metadata

### ContentItem

Represents one publishable content asset.

Examples:

- video
- design
- carousel
- story
- reel
- article

Important fields:

- planId
- title
- brief
- type
- status
- channel
- language
- publishAt
- assetUrl
- campaignLinkId
- assignedToId
- metadata

### ContentTask

Represents a production task related to a content item.

Examples:

- write copy
- design post
- edit video
- translate
- review
- publish

Important fields:

- contentId
- title
- description
- type
- status
- priority
- dueAt
- assignedToId
- completedAt
- metadata

### OperationsCalendarEvent

Represents operational dates and campaign moments.

Examples:

- religious occasion
- campaign launch
- content deadline
- review day
- publishing day

Important fields:

- title
- description
- type
- status
- startsAt
- endsAt
- allDay
- planId
- contentId
- source
- metadata

## Package 2 Execution Plan

To keep GitHub and Vercel safe, schema changes will be split:

1. Documentation only.
2. Add ContentPlan and ContentItem.
3. Add ContentTask and OperationsCalendarEvent.
4. Add dashboard permission/nav only after models are stable.

## Explicitly Not Included

- no UI board
- no APIs
- no AI automation
- no messaging scheduler
- no Google Drive sync
- no automatic publishing
- no changes to Marketing core

## Safety Rule

Every Prisma schema change must preserve the full existing schema and must be reviewed through a small PR before merge.
