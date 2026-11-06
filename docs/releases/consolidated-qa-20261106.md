# Consolidated release QA — 2026-11-06

## Changes since 1869efd

- Bank catalogue failures no longer prevent an independent transaction-ledger read. The failed catalogue remains visibly unavailable, its count is unknown rather than zero, and statement import stays hidden until the catalogue reload succeeds.
- PDF normalization is consistent between browser and server, including application/x-pdf and generic octet-stream files with PDF filenames. Empty MIME on an unrelated extension is rejected.
- Both upload paths check PDF header bytes before requesting a Meta sample. Non-finite, fractional, negative and oversized declared lengths are rejected.
- Added behavioral regression coverage for catalogue failure isolation and media validation.
- Added a read-only server audit for current/legacy bank catalogues, transaction statistics/listing/count. Output contains only stage success and sanitized error codes; no financial rows or credentials.

## Validation and outstanding gates

Combined available content-editor and integration-settings suites: 325 tests passed, zero failures. The standalone release-metadata-runtime test file was excluded from this combined run because its real-module import preflight requires source modules absent from the partial mirror; its other six cases were verified separately.

Targeted donation tests cover exact TRY support amounts, initial/recurring allocations, 3DS callbacks, concurrent/replayed capture protection, scheduling and attribution. Media-provider tests use mocks; no real charge or campaign send was performed.

The local checkout is a partial source mirror. The standalone metadata import check and a full production build must run against a complete source checkout. GitHub Actions run 42259931620 failed before any job steps; its detailed annotations are unavailable through the current connector. This is not evidence of passing CI.

The server audit confirmed P2023 on current/legacy catalogue and transaction findRaw reads while aggregate statistics and raw counts passed. Shared statementRead now uses a bounded aggregateRaw pipeline, retaining match/sort/skip/limit/projection and propagating errors. This is a targeted remediation pending the updated server audit, not a claim that the production defect is already resolved. Run scripts/audit-bank-transfers-readiness.ts against the server environment before approving the consolidated deployment.

After the read-path change: 344 available behavioral tests passed, including 19 bank statement tests covering cursor-safe reads, malformed/oversized results, pagination, duplicate imports and concurrent approval. The standalone metadata import preflight remains outside this run.

Latest edits are not deployed. One consolidated production activation is intended after outstanding gates pass. Real PDF-to-Meta acceptance and a confirmed production deployment require separate evidence. Legacy advertising URLs also require correction in Ads Manager; source validation does not edit existing advertisements.

## Production build attempt and export fixture correction

Release job 2026-11-06T17-47-38-132Z-770f8169-1765276 stopped before runtime activation: 1790 integration tests passed and two export tests failed because their Prisma fixture exposed findRaw rather than aggregateRaw. Updated that fixture and its assertions to inspect the actual match/sort/limit/project stages, retaining the 1200-row completeness check and explicit 10001-row rejection. The read-failure test now also asserts the fixture's intended error reached the handler, preventing a missing mock method from passing it accidentally.

Targeted bank workspace/export tests: 22 passed. No production payment or export implementation was changed for this fixture correction. The complete server build must be rerun before claiming deployment success.
