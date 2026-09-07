# Operations Architecture Audit Map

## Purpose

This document maps the current Operations system before changing routes, deleting code, or splitting UI into smaller pages.

The current Operations work should be treated as a real foundation. The next step is organization and modularization, not a rebuild.

## Existing Operations routes discovered

- `/dashboard/operations`
- `/dashboard/operations/content`
- `/dashboard/operations/system`

## Existing Operations documentation

- `docs/operations-foundation-package-1.md`
- `docs/operations-data-model-package-2.md`
- `docs/operations-official-models-package-2b.md`
- `docs/operations-package-2c-execution-guide.md`

## Current page responsibilities

### `/dashboard/operations`

Acts as the Operations home page.

Current responsibilities:

- Explain Operations boundaries.
- Link to the content board.
- Introduce pillars: calendar, content plan, team tasks, handoff to marketing.
- Clarify that Operations does not replace Marketing.

### `/dashboard/operations/content`

Currently behaves as a combined Content Operations board.

Current responsibilities mixed into one page:

- KPIs.
- Seasons.
- Weekly themes.
- Content plans.
- Content items.
- Production tasks.
- Status board.
- Ready-for-marketing handoff.

This is useful, but it is too broad for one long-term page.

### `/dashboard/operations/system`

Appears to be a system/roadmap/status page for the Operations buildout.

Keep it for now until a separate roadmap or system health section is defined.

## Data and API observations

The content page attempts to read:

- `/api/dashboard/operations/overview`

but repository search did not clearly surface a matching route file. The page has fallback data, which protects the UI but can hide missing API wiring.

Do not remove fallback data until the API source is confirmed and stable.

## Target information architecture

```text
Content & Operations
├─ Overview                  /dashboard/operations
├─ Calendar & Alerts          future route
├─ Content Plans              future route or section
├─ Content Items              /dashboard/operations/content initially
├─ Production Tasks           future route or section
├─ Scheduler                  future route
├─ Archive                    future route
├─ AI Assistant               future route
└─ System Map                 /dashboard/operations/system
```

## Recommended transition plan

### Phase 1 — Navigation only

Expose existing Operations routes clearly:

- Overview
- Content Board
- System Map

No route changes.
No data changes.
No deletions.

### Phase 2 — Extract shared data/types

Move duplicated/fallback Operations types and mock data out of page files into:

```text
lib/operations/types.ts
lib/operations/mock-data.ts
lib/operations/service.ts
```

This keeps UI pages lightweight and prepares the code for Prisma-backed data later.

### Phase 3 — Split UX gradually

Once data is centralized, split the current combined content board into focused pages:

- Calendar & Alerts
- Content Plans
- Content Items
- Production Tasks
- Scheduler
- Archive

Do not split routes before the data source is centralized.

## Cleanup rules

A file can be deleted only if:

1. It is not imported by active pages, APIs, or services.
2. It is not part of a planned data migration path.
3. It is not referenced in dashboard navigation or permissions.
4. There is a replacement source already wired.

Do not delete Operations docs yet. They are currently useful as project history and architecture references.

## Immediate next steps

1. Add Operations routes to the dashboard navigation under `المحتوى والتشغيل`.
2. Keep existing routes unchanged.
3. Create `lib/operations/*` in a later PR.
4. Only after that, refactor `/dashboard/operations/content` to read from shared operations data/service.
