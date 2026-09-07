# Package 1: Content Runtime Core

Goal: move Operations content from audit/foundation-backed records toward a real runtime ContentItem model without breaking the current dashboard.

## Scope

- Keep current audit-backed content items working.
- Add runtime-ready read and write adapters.
- Prepare ContentItem model and cutover steps.
- Keep publishing, messaging, ads linking, and AI actions manual/read-only until later packages.

## Completion criteria

- Operations content create has runtime-first fallback behavior.
- Runtime read adapter exists and safely returns null when Prisma delegate is unavailable.
- Runtime update helper exists for future PATCH cutover.
- OperationsContentItem type can carry asset, copy, and campaign references.
- Vercel build is green after every change.

## Already completed

- Optional runtime content item repository exists.
- Runtime create helper exists.
- Runtime update helper exists.
- POST /api/dashboard/operations/items tries runtime create first, then audit fallback.
- OperationsContentItem has extended optional fields for copy, assets, and campaign references.

## Remaining in this package

- Add ContentItem model to prisma/schema.prisma, or keep it staged if direct schema replacement is unsafe.
- Connect PATCH to runtime update once GitHub allows a small route update.
- Map runtime asset fields back into OperationsContentItem when the runtime model is available.
