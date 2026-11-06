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

The production bank catalogue currently fails. The UI isolation fix does not prove the underlying catalogue/database issue is resolved. Run scripts/audit-bank-transfers-readiness.ts against the server environment before approving the consolidated deployment.

Latest edits are not deployed. One consolidated production activation is intended after outstanding gates pass. Real PDF-to-Meta acceptance and a confirmed production deployment require separate evidence. Legacy advertising URLs also require correction in Ads Manager; source validation does not edit existing advertisements.
