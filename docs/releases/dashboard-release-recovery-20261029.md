# Dashboard source recovery — 29 October 2026

## Deployment environment correction — 29 October 2026

The production attempt at `61b10d9e574d4109c61ce72d25cd226c9e817209` stopped with three deployment-fixture failures during the content tests. The supplied terminal log contains no runtime activation message for that attempt. Its previous local validation did not exercise the exported `APP_DIR` used by the real invocation.

That variable selected the live directory inside the child test wrapper, overriding its temporary fixture directory. The wrapper now consumes and unsets `APP_DIR` before starting the build. Fixture subprocesses use an explicit environment with their own directory and mock executables, rather than inheriting production configuration. They reject Git calls outside the fixture, reject an unexpected npm call, check for leaked build variables and have a 10-second timeout.

Regression evidence: the previous script fails immediately with the explicit APP_DIR-leak guard, without invoking a real deployment. The corrected script passes all six scenarios with production-like APP_DIR/NEXT_DIST_DIR/PM2/SOURCE_BRANCH/DATABASE_URL values in the parent process. The complete content suite also passes **193/193** under the APP_DIR and NEXT_DIST_DIR used by the server build, in approximately six seconds. Focused ESLint, Bash syntax and patch-whitespace checks pass.

This correction changes the deployment wrapper and its tests. The application source and dependencies remain those of the previously built release. Production deployment of the correction is still for the owner to execute using the new full reviewed commit; do not repeat the `61b10d9` command.

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
- [x] Fresh integration/content/type/lint/translation checks, meaningful browser checks and clean production build.
- [x] Retain source checkpoints and prepare the reviewed source upload plus direct SSH deployment commands with guarded rollback.

No bank charge, provider campaign execution, donor send, financial record repair or production cron invocation is part of source recovery. PageSpeed 100 and successful live 2D settlement remain unverified operational goals; earlier Clarity observations are historical, not new evidence.

## Final validation

Release source is on `fix/dashboard-release-recovery-20261029`. Deploy only the full reviewed commit supplied with this report; earlier WIP checkpoints are not release targets. The final source was built locally, not deployed to production.

| Check | Fresh result |
| --- | --- |
| Integration settings and communication suites | 1,128 passed |
| Content, financial route, permissions and deployment tests | 193 passed |
| New dashboard browser checks | 116 passed: Arabic/English/Turkish, 390px and 1440px |
| Existing dashboard browser checks | 339 passed |
| Major projects, public previews and ticker | 128 passed |
| Checkout browser checks | 112 passed |
| Public media browser checks | 7 passed |
| Production Next 16.4.3 Turbopack build | Passed, including TypeScript and route generation |
| Type baseline | 0 errors |
| Content-editor, communication-runtime and integration-release type checks | Passed |
| Dashboard translations | 7,564 phrases; 0 missing translations |
| Lint baseline | No new findings; 0 critical |

Browser checks used Chromium 153 with isolated HTTP fixtures. Build credentials were dummy values. No live donor message, bank charge, advertising mutation, production cron call or database migration was executed. Tests using mocked transactions do not prove production database/provider access.

Financial tests cover validation and FX failure before donor creation, atomic donor/donation/ledger writes, transaction failure rollback, exact-request replay and conflicting request IDs. Currency corrections reprice campaign, category and waqf USD amounts; changing only the provider preserves historical exchange values. The UI now explains currency reinterpretation and sends the new currency/provider from the actual form.

Google Ads tests cover independent read-test/manage permissions, blank-secret preservation, no credential disclosure, concurrent configuration changes, paid/Ad Grants labels without guessing unlabeled legacy accounts, customer-scoped history before pagination, and late responses after rapid account switches. The connection test is read-only and does not verify grant eligibility.

Audience tests cover selection of all 14,842 matching donors in bounded pages, optional operator daily caps and explicit unsubscribe protection. Email campaign retries and audience counts use the same policy. Historical email revenue recovery uses explicit, unambiguous archived donation links; it does not infer attribution from a donor/time coincidence.

The generated public route CSS manifest excludes the dashboard-only utility asset (211,914 raw bytes / 30,038 gzip bytes). This verifies asset isolation, not a measured PageSpeed score or an equivalent reduction from a production baseline. Hero hints share their responsive image descriptor with the displayed poster; lower photos wait for proximity to the viewport and retain a no-script fallback.

## Deployment from the server terminal

The owner has authorized source upload and will execute deployment. Use the exact 40-character commit supplied in the conversation:

```bash
cd /root/minberiaksa
git fetch origin fix/dashboard-release-recovery-20261029
# Set RELEASE_SHA to the exact reviewed commit provided with this report.
DEPLOY_SCRIPT="$(mktemp /tmp/minberi-reviewed.XXXXXX.sh)"
git show "$RELEASE_SHA:scripts/deploy-reviewed-dashboard.sh" > "$DEPLOY_SCRIPT"
APP_DIR="$PWD" PM2_APP=minberiaksa bash "$DEPLOY_SCRIPT" "$RELEASE_SHA"
node --import tsx scripts/audit-production-readiness.mjs --check-providers
```

The wrapper refuses changed remote heads, tracked local edits and non-fast-forward source changes. It records the previous source outside the repository, delegates compilation to the existing isolated VPS deploy, then probes only public global settings over localhost/IPv6/IPv4. Failed runtime health restores the previous build and, when staged, dependencies and clean prior source. Six shell fixtures cover successful deploy, changed remote head, local tracked edits, build failure, runtime rollback and dependency rollback.

The production index installer creates and verifies unique string-email indexing before removing recognized legacy full-email indexes, allowing several donors without an email while keeping real addresses unique. It stops on custom collations/filters or a failed replacement. This migration has not been applied by this recovery session.

## Checks still required on the live service

Actual recurring bank settlement, live 2D/3D outcomes, current Clarity sessions, provider/account permissions and a fresh public PageSpeed result require production observation after deployment. No 100 performance score or successful live renewal is claimed. The readiness audit is read-only and does not activate or repair historical subscriptions, collect money, send a campaign or invoke a cron endpoint.
