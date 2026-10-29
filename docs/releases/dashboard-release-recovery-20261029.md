# Dashboard source recovery — 29 October 2026

The owner explicitly approved source upload to `saladin76/minberiaksa` on 29 October. Production deployment remains held for the owner to execute from their SSH terminal. The earlier sandbox checkout and its `1a0f0c1` release bundle are unavailable in the current environment and absent from the remote. That earlier snapshot and its test results are not being represented as this recovery's source or validation.

Recovery starts from remote production-source base `1af576bb4edf10cea2075b6c2ff1d0ed5bb10a87` on an isolated branch. Source checkpoints are retained remotely, without merging main or deploying.

## Recovery checklist

- [x] Confirmed-only recurring payment table/export; monthly staff permission boundaries.
- [x] Multiple Google Ads paid/Ad Grants accounts, management permissions, credential preservation and account-scoped plans.
- [x] Manual donation Cash/country, validation before writes, atomic creation and retry idempotency; optional-email uniqueness.
- [x] Donation currency/provider corrections and accurate USD/project/category accounting.
- [x] Direct draft translation versus researched SEO, bounded language concurrency and retained proposals/errors.
- [x] Complete campaign recipient selection beyond 5,000; explicit recipient STOPs and provider suppressions retained; optional operator caps.
- [x] Category counts from actual published membership, separate archived totals and complete category pagination.
- [x] CMS-driven public category/major-project filters and one saved numeric ordering interface.
- [x] Historical archived-email attribution recovery, ambiguity protection and marketing touch replacement.
- [x] Public/dashboard CSS separation, early shared hero hint, deferred lower media with no-script fallback.
- [x] Retired numeric project-link fallback; supported Next route parameter types.
- [ ] Fresh integration/content/type/lint/translation checks, meaningful browser checks and clean production build.
- [ ] Publish tested source reference and prepare direct SSH deployment commands with guarded rollback.

No bank charge, provider campaign execution, donor send, financial record repair or production cron invocation is part of source recovery. PageSpeed 100 and successful live 2D settlement remain unverified operational goals; earlier Clarity observations are historical, not new evidence.

## Fresh validation checkpoint

The restored implementation is retained on `fix/dashboard-release-recovery-20261029`. A WIP checkpoint is commit `928463f60b03228317e62b4846242d9585081d11`; it is not the final deployment target.

Fresh tests so far: 1,128 integration tests, 187 content/route tests, 86 new dashboard browser checks in Arabic/English/Turkish at 390 and 1440 pixels, 339 existing dashboard browser checks, 128 major-project/preview/ticker checks, 112 checkout checks and 7 media checks. These are isolated fixtures, not live provider or database settlement evidence. Production Next/Turbopack compilation and route generation succeeded with dummy build credentials; a final build is running after the remaining UI refinements. Translation catalogue has no missing entries; lint has no new findings.

Financial route tests cover atomic donor/donation/ledger creation, failed validation/FX/write rollback, exact-request replay, conflicting reuse, provider-only historical FX preservation, and repricing project/category/waqf USD amounts when the currency changes. Optional-email index tests verify replacement creation and validation before legacy index removal; the production database migration has not been run here.

The reviewed deployment wrapper pins the full commit, refuses changed remote heads or tracked local edits, preserves the old running build during compilation, and probes public global settings with IPv6/localhost support. If the new runtime fails the probe, it restores the previous build, dependencies when staged, and clean prior source. Its behavior is exercised with local shell fixtures before release. No deployment has been executed.
