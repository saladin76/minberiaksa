# Dashboard QA report: evidence and follow-up

Source reviewed: the supplied 17-page Arabic dashboard QA report dated 2 November 2026 (47 administrative routes). This branch is based on the subsequently deployed `1ba27fb4663fdd5d46d580a590b91c4f674cb0b0`. Historical counts in the report are observations at its recorded time, not current totals.

| Finding | Confirmed evidence | Status in this branch |
|---|---|---|
| ADM-001: two daily renewals on 2 November, 03:00 and 19:30 | Report pages 4-5 describe distinct successful orders. | Parent release implements a latest-confirmed-ledger guard under the billing lease. Its exact 03:00/19:30 regression scenario, timezone/DST, concurrency and unresolved-outcome tests pass. User-supplied VPS output proves deployment and a complete 46-plan schedule audit. A subsequent natural live renewal remains separate evidence; the audit did not capture money or rewrite historical payments/consent. |
| ADM-002: Oct31 recovery diagnosis failed | Report pages 6 and 17 provide a visible failure, without HTTP response or server trace. | Remains open for production cause identification. A bounded-selection read-only CLI now captures coverage/control checks, duration, safe failure categories and phase timing. No recovery is queued and no message/provider/cron operation is performed. |
| ADM-004: wording promises collection in the donor currency | The deployed payment settings explicitly claimed that donor display currency always equals collection currency. | Corrected Arabic/English/Turkish wording distinguishes the site minimum, selected display currency, actual bank request and accounting equivalent. Gateway routing, conversion, minimum enforcement and stored amounts are unchanged. |
| ADM-005: GA4 pages show no title | The path report requested only `pagePath`, while its mapper read a nonexistent second dimension as `pageTitle`. | Added a separate `pagePath,pageTitle` lookup, retaining the path-only users/sessions/views report. The most-viewed recorded meaningful title labels each exact path; missing titles remain explicitly unavailable. No live page fetching or invented SEO titles. |

## Why GA4 titles are separate

Adding title as a dimension to the existing page totals would split a path when its title changed. Summing those rows could double-count users or sessions. A ninth report in the existing two API batches retrieves up to 500 path/title pairs using only views; it is used only for labels. The top 25 path metrics retain their original grain. Tests simulate API output from the dimensions actually requested and cover multiple/empty/not-set titles without altering totals. API reference: https://developers.google.com/analytics/devguides/reporting/data/v1/basics

## Read-only campaign diagnosis

From the production project with Node 24:

```bash
timeout --signal=TERM --kill-after=5s 120s node --conditions=react-server --import tsx scripts/audit-campaign-recovery-readonly.mjs --name=Oct31
```

The script can also be fetched alone from this reviewed commit into a temporary `.mjs` in the deployed `scripts` directory and run before deploying the UI fixes. It loads the **deployed** campaign reader, coverage gate and send-control reader through the existing release loader. CAMPAIGN/COVERAGE/CONTROLS timings are emitted independently. It deliberately does not call the full recovery inspector or send planner: the legacy recipient loader can initialize communication profiles while constructing a plan. No production recovery/queue logic is changed in this branch.

Selection uses a bounded case-insensitive name substring (maximum ten matches, an eleventh rejects an overly broad filter). It prints campaign ordinal, status and language counts; no contacts, campaign identifiers, message bodies, keys or raw errors. No matches does not certify readiness. A timeout may leave phase progress without a complete report; it is not a successful diagnosis. `exceedsBrowserDeadline` identifies completed checks taking at least the UI's 30-second budget, without asserting the historical failure cause. Unknown errors remain READ_FAILED. Scope is explicitly `CAMPAIGN_COVERAGE_CONTROLS_ONLY`, `fullRecoveryChecked:false` and `providerReadiness:NOT_EVALUATED`; successful partial checks do not establish resumability.
Do not resume Oct31 based on the audit alone. A recovery action still rechecks coverage, provider configuration, controls, leases and saved progress through the existing explicit operator action. The diagnosis has no queue/capture/send operation.

## Boundaries

The report explicitly separates untested acceptance items from confirmed defects. SMS/optional tracking configuration, Search Console access, content publishing/sorting, transfer approval, financial reconciliation, actual delivery and role-specific live flows are not declared broken or complete merely from page visibility. The report's four waiting-first-payment cases cannot be made billable by setting ACTIVE alone. Existing recipient stops, language coverage, bank safety and Saudi routing remain enforced.

The supplied PDF is unchanged. This branch does not modify production data, historical transactions, donor consent, campaigns, audience lists or configuration. CI and synthetic tests do not prove bank acceptance or provider delivery.
