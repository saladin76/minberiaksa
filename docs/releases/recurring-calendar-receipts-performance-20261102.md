# Recurring calendar, one payment receipt and measured public performance

This release builds on `a05007f03f3e12e98a8cb53f1bcdcfa3ad72772e` (PR #133). Its pinned head includes the earlier schedule safety, campaign/template and profile/navigation fixes. Activation still requires the VPS release job; GitHub publication alone is not a production deployment.

## Friday and calendar

The initial checkout payment remains immediate. Ordinary Friday renewals are scheduled for the next Friday after signup in the subscription's stored IANA timezone and chosen hour/minute (default Friday hour 09:00). Friday signup renews the following Friday. The shared recurrence engine converts the instant to the plan's local weekday, where Friday is 5, and stores the resolved instant in UTC. The worker independently checks that weekday before provider submission; late retries never authorize a Saturday debit. See the parent release for daily/monthly period safety and conservative repair of existing plans.

The dashboard now displays seven weekday columns, leading blanks, a highlighted Friday heading and full localized weekday dates in details and accessible labels. It projects occurrences with the collector's recurrence engine, correcting a stale non-Friday pointer for reporting without changing the subscription. The report itself uses Istanbul dates: a late Friday debit in another timezone may honestly appear on Saturday in Istanbul. The interface explains that distinction. Expected revenue remains a forecast, not a promise of collection.

## Payment receipts

Generic paid, subscription signup and subscription renewal callbacks previously had separate delivery claims and could send two success confirmations for the same donation. The actual donation now determines the appropriate receipt, and all three callback families share `PAYMENT_RECEIPT:<donationId>`. Each enabled channel receives at most one chosen receipt, even when callbacks race or duplicate triggers exist. Historical event-specific claims remain respected, including older rows without a state field. A claim database failure defers the receipt without consuming a claim or risking a duplicate; a subsequent normal event replay can retry it.

The cadence-aware template is preferred, with one generic fallback only for a missing template or definite pre-send template refusal. Failed/unknown delivery, recipient opt-out and existing deduplication never fall through to another confirmation. Unsettled payments cannot announce success. A late first payment on a paused/cancelled/failed plan does not announce a new activation. Documents, email attachments, donor gifts, conversion tracking and site events retain their separate behavior. A first-donation welcome is still a distinct lifecycle event.

No real donor messages or new bank charges were sent during these checks. The automated messaging tests use synthetic recipients, providers and database boundaries.

## Performance

The baseline checks cover all 19 locale homepages on mobile and desktop: 38 attempts, 25 scored and 13 failed document loads. All 19 routes independently returned HTTP 200. Raw results and the Arabic comparison table are in [the baseline report](../performance/pagespeed-baseline-20261102.md). Failed audits are unscored; they are not zeroes or successes.

The public shell now serializes only its required namespaces; legacy page/account/auth translations remain in their relevant nested layouts. Arabic shell JSON falls from 92,477 to 36,210 bytes (gzip 26,553 to 11,625). New budget tests cover all 19 languages. Japanese/Chinese/Hindi font stylesheets are served locally with content-hashed paths and modern Unicode subsets; font binaries still come from Google's font CDN. Optional font display avoids a late face swap. The public layout and homepage share one request-scoped session read, without caching sessions across visitors. Advertising attribution and conversion scripts are preserved.

These are source and payload improvements, not a fabricated post-deployment PageSpeed score. Repeat PageSpeed after the VPS activates the new source; 100 is not yet established.

## Validation and activation

Local checks: 1,731 integration cases; 443 content cases; production build; public production HTTP checks for 19 locales and browser checks for six locales at phone/desktop widths; 21 focused calendar browser checks in Arabic/English/Turkish; type, lint, localization and runtime-import gates. GitHub Actions runs the complete browser fixtures against its supported Chromium version before release.

Deploy the reviewed full head using `release-job.mjs start <SHA> --publish --activate-approved --wait`. After successful activation run the parent's schedule repair first read-only, then `--apply`, then read-only again:

```bash
node --conditions=react-server --import tsx scripts/repair-recurring-schedule-safety.mjs
node --conditions=react-server --import tsx scripts/repair-recurring-schedule-safety.mjs --apply
node --conditions=react-server --import tsx scripts/repair-recurring-schedule-safety.mjs
```

This repair never captures money, calls banks, sends recipient messages, activates plans or advances a date earlier. Review incomplete scans, busy leases and paused unresolved plans from the aggregate output. The ordinary scheduler remains a separate production process; issuer approval still depends on the bank.
