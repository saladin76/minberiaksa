# Dashboard DB Contracts Foundation

Last updated: 2026-06-21

This document records the dashboard model contracts that are ready to become Prisma models in a small, safe migration package. The current package does not change runtime persistence and does not add a large schema migration.

## What this adds

- A central contract registry: `lib/dashboard/db-contracts.ts`.
- A read-only status endpoint: `/api/admin/dashboard-system/db-contracts`.
- A dashboard status page: `/dashboard/operations/system/db-contracts`.

## Contract states

- `FOUNDATION`: data is still mock/foundation-backed and needs workflow review before DB cutover.
- `PRISMA_READY`: the model shape is stable enough to add to Prisma safely.
- `DB_BACKED`: the runtime repository reads/writes real DB records.

## Ready model groups

### Operations

- `OperationSeason`
- `MonthlyContentPlan`
- `ContentItem`
- `OperationTask`
- `ContentPublication`
- `MessageSchedule`
- `DonorReactivationReminder`
- `MarketingLearning`
- `ContentAdLink`

### Smart Archive

- `ArchiveCollection`
- `ArchiveProject`
- `ArchiveDriveLink`
- `ArchiveAsset`
- `ArchiveVideoFrame`

### Brand Center

- `BrandProfile`
- `BrandAsset`
- `BrandColor`
- `BrandFont`
- `BrandGuideline`
- `BrandMessageFramework`

### Shared AI Core

- `AiOperationRun`

## Safety boundaries

- No payment changes.
- No tracking runtime changes.
- No external platform calls.
- No frontend secrets.
- No automatic sending.
- No automatic publishing.
- No automatic AI approval.
- Archive assets remain separate from Brand assets.
- Content performance reads from Marketing snapshots and does not create duplicate ad performance tables.

## Next package

`Prisma Model Migration and Repository Cutover`

Recommended first slice:

- `BrandProfile`
- `BrandColor`
- `BrandGuideline`
- `ArchiveCollection`
- `ArchiveProject`
- `OperationTask`

After the first slice passes `prisma generate` and build, move one repository at a time from foundation data to DB-backed data.
